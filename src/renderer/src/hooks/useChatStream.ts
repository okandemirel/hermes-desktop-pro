import { useState, useCallback, useRef, useEffect } from "react";
import type {
  AgentRunEvent,
  AgentRunEventKind,
  AgentRunEventStatus,
  AgentRunState,
  Attachment,
  ChatMessage,
  DispatchMode,
  DispatchRunState,
  DispatchStreamEvent,
  ProfileDispatchTarget,
  ProviderId,
  TokenUsage,
} from "@shared/types";
import {
  applyDispatchEvent,
  createDispatchRunState,
  normalizeDispatchTargets,
} from "../chatDispatch";

interface UseChatStreamOptions {
  providerId: ProviderId;
  modelId: string;
  conversationKey?: string;
  sessionId?: string;
  initialMessages?: ChatMessage[];
  temperature?: number;
  dispatchMode?: DispatchMode;
  dispatchTargets?: ProfileDispatchTarget[];
  activeProfileName?: string;
  onTokenUsage?: (usage: TokenUsage) => void;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  runState: AgentRunState | null;
  dispatchRunState: DispatchRunState | null;
  sendMessage: (text: string, options?: { attachments?: Attachment[] }) => Promise<void>;
  abortStream: () => void;
  abortDispatch: (runId?: string) => void;
}

interface ConversationState {
  messages: ChatMessage[];
  isStreaming: boolean;
  sessionId?: string;
  activeAssistantId: string | null;
  runState: AgentRunState | null;
  dispatchRunState: DispatchRunState | null;
}

function createConversationState(options: UseChatStreamOptions): ConversationState {
  return {
    messages: options.initialMessages || [],
    isStreaming: false,
    sessionId: options.sessionId,
    activeAssistantId: null,
    runState: null,
    dispatchRunState: null,
  };
}

function createRunEvent(
  id: string,
  kind: AgentRunEventKind,
  label: string,
  status: AgentRunEventStatus,
  detail?: string,
  tokens?: number,
): AgentRunEvent {
  return {
    id,
    kind,
    label,
    status,
    detail,
    tokens,
    timestamp: Date.now(),
  };
}

function completeRunningEvents(events: AgentRunEvent[], completedAt = Date.now()): AgentRunEvent[] {
  return events.map(event => (
    event.status === "running" || event.status === "queued"
      ? { ...event, status: "done", durationMs: Math.max(0, completedAt - event.timestamp) }
      : event
  ));
}

function cleanToolLabel(tool: string): string {
  return tool
    .replace(/^[^\p{L}\p{N}/._-]+/u, "")
    .replace(/\s+/g, " ")
    .trim() || "Tool progress";
}

function createDispatchId(): string {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `dispatch-${Date.now()}-${random}`;
}

export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturn {
  const conversationKey = options.conversationKey || "__default";
  const [stateByKey, setStateByKey] = useState<Record<string, ConversationState>>(
    () => ({ [conversationKey]: createConversationState(options) }),
  );
  const msgIdCounter = useRef(0);

  // Incoming IPC chunks do not carry tab metadata. Track the tab that started
  // the active stream so switching the visible tab cannot leak chunks into it.
  const activeConversationKey = useRef<string | null>(null);

  const onTokenUsageRef = useRef(options.onTokenUsage);
  useEffect(() => { onTokenUsageRef.current = options.onTokenUsage; }, [options.onTokenUsage]);

  const stateByKeyRef = useRef(stateByKey);
  useEffect(() => { stateByKeyRef.current = stateByKey; }, [stateByKey]);

  useEffect(() => {
    setStateByKey(prev => {
      const existing = prev[conversationKey];
      if (!existing) return { ...prev, [conversationKey]: createConversationState(options) };
      const initialMessages = options.initialMessages || [];
      if (
        (options.sessionId && existing.sessionId !== options.sessionId) ||
        (initialMessages.length > 0 && existing.messages.length === 0)
      ) {
        return {
          ...prev,
          [conversationKey]: {
            ...existing,
            sessionId: options.sessionId || existing.sessionId,
            messages: initialMessages.length > 0 ? initialMessages : existing.messages,
          },
        };
      }
      return prev;
    });
  }, [conversationKey, options.sessionId, options.initialMessages]);

  const patchActive = useCallback((key: string | null, patch: (m: ChatMessage) => ChatMessage) => {
    if (!key) return;
    setStateByKey(prev => {
      const state = prev[key];
      const id = state?.activeAssistantId;
      if (!state || !id) return prev;
      return {
        ...prev,
        [key]: {
          ...state,
          messages: state.messages.map(m => (m.id === id ? patch(m) : m)),
        },
      };
    });
  }, []);

  const patchRunState = useCallback((key: string | null, patch: (run: AgentRunState | null) => AgentRunState | null) => {
    if (!key) return;
    setStateByKey(prev => {
      const state = prev[key];
      if (!state) return prev;
      return {
        ...prev,
        [key]: {
          ...state,
          runState: patch(state.runState),
        },
      };
    });
  }, []);

  // Subscribe to the 6 stream events ONCE; tear them down on unmount.
  // The preload subscribers each return an unsubscribe fn, used for cleanup.
  useEffect(() => {
    const unsubChunk = window.hermes.onStreamChunk((text: string) => {
      const key = activeConversationKey.current;
      patchActive(key, m => ({ ...m, content: m.content + text }));
      patchRunState(key, run => {
        if (!run) return run;
        const hasOutput = run.events.some(event => event.kind === "output");
        const events: AgentRunEvent[] = hasOutput
          ? run.events.map(event => event.kind === "output" && event.status === "queued"
            ? { ...event, status: "running" as const, detail: "Streaming assistant response" }
            : event)
          : [...run.events, createRunEvent(`${run.id}-output`, "output", "Generating response", "running", "Streaming assistant response")];
        return { ...run, events };
      });
    });
    const unsubReasoning = window.hermes.onReasoningChunk((text: string) => {
      const key = activeConversationKey.current;
      patchActive(key, m => ({ ...m, reasoning: (m.reasoning || "") + text }));
      patchRunState(key, run => {
        if (!run || run.events.some(event => event.kind === "reasoning")) return run;
        return {
          ...run,
          events: [...run.events, createRunEvent(`${run.id}-reasoning`, "reasoning", "Reasoning trace", "running", "Hermes is exposing intermediate reasoning")],
        };
      });
    });
    const unsubTool = window.hermes.onToolProgress((tool: string) => {
      const key = activeConversationKey.current;
      patchRunState(key, run => {
        if (!run) return run;
        const label = cleanToolLabel(tool);
        const completed: AgentRunEvent[] = run.events.map(event => event.kind === "tool" && event.status === "running"
          ? { ...event, status: "done" as const, durationMs: Math.max(0, Date.now() - event.timestamp) }
          : event);
        return {
          ...run,
          events: [
            ...completed,
            createRunEvent(`${run.id}-tool-${Date.now()}`, "tool", label, "running", "Tool progress reported by the active run"),
          ],
        };
      });
    });
    const unsubUsage = window.hermes.onUsage((usage: TokenUsage) => {
      onTokenUsageRef.current?.(usage);
      const key = activeConversationKey.current;
      patchActive(key, m => ({ ...m, usage }));
      patchRunState(key, run => {
        if (!run) return run;
        const usageEvent = createRunEvent(`${run.id}-usage`, "usage", "Token usage recorded", "done", "Prompt and completion accounting updated", usage.totalTokens);
        const events = run.events.some(event => event.kind === "usage")
          ? run.events.map(event => event.kind === "usage" ? usageEvent : event)
          : [...run.events, usageEvent];
        return { ...run, usage, events };
      });
    });
    const unsubError = window.hermes.onStreamError((error: string) => {
      const key = activeConversationKey.current;
      patchActive(key, m => ({ ...m, content: m.content || `Error: ${error}` }));
      patchRunState(key, run => {
        if (!run) return run;
        const endedAt = Date.now();
        return {
          ...run,
          status: "error",
          endedAt,
          events: [
            ...completeRunningEvents(run.events, endedAt),
            createRunEvent(`${run.id}-error`, "error", "Run stopped with error", "error", error),
          ],
        };
      });
      if (key) {
        setStateByKey(prev => {
          const state = prev[key];
          if (!state) return prev;
          return { ...prev, [key]: { ...state, activeAssistantId: null, isStreaming: false } };
        });
      }
      activeConversationKey.current = null;
    });
    const unsubDone = window.hermes.onStreamDone((sessionId?: string) => {
      const key = activeConversationKey.current;
      if (key) {
        patchRunState(key, run => {
          if (!run) return run;
          const endedAt = Date.now();
          return {
            ...run,
            status: "done",
            endedAt,
            events: [
              ...completeRunningEvents(run.events, endedAt),
              createRunEvent(`${run.id}-done`, "done", "Run complete", "done", "Final response delivered"),
            ],
          };
        });
        setStateByKey(prev => {
          const state = prev[key];
          if (!state) return prev;
          return {
            ...prev,
            [key]: {
              ...state,
              sessionId: sessionId || state.sessionId,
              activeAssistantId: null,
              isStreaming: false,
            },
          };
        });
      }
      activeConversationKey.current = null;
    });

    return () => {
      unsubChunk();
      unsubReasoning();
      unsubTool();
      unsubUsage();
      unsubError();
      unsubDone();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.hermes.onDispatchEvent((event: DispatchStreamEvent) => {
      setStateByKey(prev => {
        for (const [key, state] of Object.entries(prev)) {
          if (state.dispatchRunState?.dispatchId !== event.dispatchId) continue;
          const nextDispatch = applyDispatchEvent(state.dispatchRunState, event);
          const stillStreaming = nextDispatch.status === "running" &&
            nextDispatch.profileRuns.some(run => run.status === "idle" || run.status === "running");
          return {
            ...prev,
            [key]: {
              ...state,
              dispatchRunState: nextDispatch,
              isStreaming: stillStreaming,
            },
          };
        }
        return prev;
      });
    });
    return unsubscribe;
  }, []);

  const sendMessage = useCallback(async (text: string, messageOptions: { attachments?: Attachment[] } = {}) => {
    const key = conversationKey;
    const currentState = stateByKeyRef.current[key] || createConversationState(options);
    const attachments = messageOptions.attachments?.length ? messageOptions.attachments : undefined;
    const userMsg: ChatMessage = {
      id: `${key}-msg-${++msgIdCounter.current}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      ...(attachments ? { attachments } : {}),
    };
    const assistantId = `${key}-msg-${++msgIdCounter.current}`;
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };
    const runId = `${assistantId}-run`;

    // Build history from prior messages (before this turn) — user/assistant only.
    // currentState.messages reflects the last-rendered messages, captured before
    // the setMessages push below, so history never includes the new bubbles.
    const history = currentState.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    const dispatchMode = options.dispatchMode || "single";
    const targets = normalizeDispatchTargets(options.dispatchTargets || [], options.activeProfileName || "default");
    const selectedProfileName = targets[0]?.profileName || options.activeProfileName || "default";
    const shouldUseDispatch = dispatchMode !== "single" && targets.length > 1;

    if (shouldUseDispatch) {
      const dispatchId = createDispatchId();
      const dispatchRunState = createDispatchRunState(dispatchId, dispatchMode, text, targets, userMsg.timestamp || Date.now());
      setStateByKey(prev => {
        const state = prev[key] || currentState;
        return {
          ...prev,
          [key]: {
            ...state,
            messages: [...state.messages, userMsg],
            activeAssistantId: null,
            isStreaming: true,
            runState: null,
            dispatchRunState,
          },
        };
      });

      try {
        await window.hermes.dispatchMessage(text, {
          dispatchId,
          mode: dispatchMode,
          targets,
          resumeSessionByProfile: currentState.sessionId ? { [selectedProfileName]: currentState.sessionId } : {},
          history,
          attachments,
          temperature: options.temperature,
        });
      } catch (err: any) {
        const message = err?.message ? String(err.message) : "Failed to dispatch message.";
        setStateByKey(prev => {
          const state = prev[key];
          if (!state?.dispatchRunState) return prev;
          const endedAt = Date.now();
          return {
            ...prev,
            [key]: {
              ...state,
              isStreaming: false,
              dispatchRunState: {
                ...state.dispatchRunState,
                status: "error",
                endedAt,
                profileRuns: state.dispatchRunState.profileRuns.map(run => ({
                  ...run,
                  status: "error" as const,
                  endedAt,
                  error: message,
                })),
              },
            },
          };
        });
      }
      return;
    }

    setStateByKey(prev => {
      const state = prev[key] || currentState;
      return {
        ...prev,
        [key]: {
          ...state,
          messages: [...state.messages, userMsg, assistantMsg],
          activeAssistantId: assistantId,
          isStreaming: true,
          dispatchRunState: null,
          runState: {
            id: runId,
            assistantMessageId: assistantId,
            prompt: text,
            startedAt: userMsg.timestamp || Date.now(),
            status: "running",
            events: [
              createRunEvent(`${runId}-start`, "start", "Run started", "done", "Hermes accepted the prompt"),
              createRunEvent(`${runId}-context`, "context", "Context prepared", "done", `${history.length} prior messages included`),
              createRunEvent(`${runId}-output`, "output", "Generating response", "queued", "Waiting for the first assistant token"),
            ],
          },
        },
      };
    });
    activeConversationKey.current = key;

    try {
      const result = await window.hermes.sendMessage(text, {
        profile: selectedProfileName,
        resumeSessionId: currentState.sessionId,
        history,
        attachments,
        temperature: options.temperature,
      });
      if (result?.sessionId) {
        setStateByKey(prev => {
          const state = prev[key];
          if (!state) return prev;
          return { ...prev, [key]: { ...state, sessionId: result.sessionId } };
        });
      }
    } catch (err: any) {
      // Honest error — no simulated fallback. onStreamError may have already
      // fired; only set a message if the bubble is still empty.
      const message = err?.message ? String(err.message) : "Failed to send message.";
      setStateByKey(prev => {
        const state = prev[key];
        if (!state) return prev;
        const endedAt = Date.now();
        return {
          ...prev,
          [key]: {
            ...state,
            messages: state.messages.map(m => (m.id === assistantId && !m.content ? { ...m, content: `Error: ${message}` } : m)),
            activeAssistantId: null,
            isStreaming: false,
            runState: state.runState ? {
              ...state.runState,
              status: "error",
              endedAt,
              events: [
                ...completeRunningEvents(state.runState.events, endedAt),
                createRunEvent(`${state.runState.id}-error-local`, "error", "Send failed", "error", message),
              ],
            } : state.runState,
          },
        };
      });
      activeConversationKey.current = null;
    }
  }, [conversationKey, options]);

  const abortStream = useCallback(() => {
    const key = activeConversationKey.current || conversationKey;
    window.hermes.abortChat();
    activeConversationKey.current = null;
    setStateByKey(prev => {
      const state = prev[key];
      if (!state) return prev;
      const endedAt = Date.now();
      return {
        ...prev,
        [key]: {
          ...state,
          activeAssistantId: null,
          isStreaming: false,
          runState: state.runState ? {
            ...state.runState,
            status: "aborted",
            endedAt,
            events: [
              ...completeRunningEvents(state.runState.events, endedAt),
              createRunEvent(`${state.runState.id}-abort`, "abort", "Run aborted", "error", "Stopped by the user"),
            ],
          } : state.runState,
        },
      };
    });
  }, [conversationKey]);

  const abortDispatch = useCallback((runId?: string) => {
    const state = stateByKeyRef.current[conversationKey];
    const dispatchId = state?.dispatchRunState?.dispatchId;
    if (!dispatchId) return;
    window.hermes.abortDispatch(dispatchId, runId);
  }, [conversationKey]);

  const currentState = stateByKey[conversationKey] || createConversationState(options);
  return {
    messages: currentState.messages,
    isStreaming: currentState.isStreaming,
    runState: currentState.runState,
    dispatchRunState: currentState.dispatchRunState,
    sendMessage,
    abortStream,
    abortDispatch,
  };
}
