import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, ProviderId, TokenUsage } from "@shared/types";

interface UseChatStreamOptions {
  providerId: ProviderId;
  modelId: string;
  conversationKey?: string;
  sessionId?: string;
  initialMessages?: ChatMessage[];
  onTokenUsage?: (usage: TokenUsage) => void;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
  abortStream: () => void;
}

interface ConversationState {
  messages: ChatMessage[];
  isStreaming: boolean;
  sessionId?: string;
  activeAssistantId: string | null;
}

function createConversationState(options: UseChatStreamOptions): ConversationState {
  return {
    messages: options.initialMessages || [],
    isStreaming: false,
    sessionId: options.sessionId,
    activeAssistantId: null,
  };
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
      if (options.sessionId && existing.sessionId !== options.sessionId) {
        return { ...prev, [conversationKey]: { ...existing, sessionId: options.sessionId } };
      }
      return prev;
    });
  }, [conversationKey, options.sessionId]);

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

  // Subscribe to the 6 stream events ONCE; tear them down on unmount.
  // The preload subscribers each return an unsubscribe fn, used for cleanup.
  useEffect(() => {
    const unsubChunk = window.hermes.onStreamChunk((text: string) => {
      patchActive(activeConversationKey.current, m => ({ ...m, content: m.content + text }));
    });
    const unsubReasoning = window.hermes.onReasoningChunk((text: string) => {
      patchActive(activeConversationKey.current, m => ({ ...m, reasoning: (m.reasoning || "") + text }));
    });
    const unsubTool = window.hermes.onToolProgress(() => {
      // Tool progress is surfaced elsewhere; no-op here for now.
    });
    const unsubUsage = window.hermes.onUsage((usage: TokenUsage) => {
      onTokenUsageRef.current?.(usage);
    });
    const unsubError = window.hermes.onStreamError((error: string) => {
      const key = activeConversationKey.current;
      patchActive(key, m => ({ ...m, content: m.content || `Error: ${error}` }));
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

  const sendMessage = useCallback(async (text: string) => {
    const key = conversationKey;
    const currentState = stateByKeyRef.current[key] || createConversationState(options);
    const userMsg: ChatMessage = { id: `${key}-msg-${++msgIdCounter.current}`, role: "user", content: text, timestamp: Date.now() };
    const assistantId = `${key}-msg-${++msgIdCounter.current}`;
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };

    // Build history from prior messages (before this turn) — user/assistant only.
    // currentState.messages reflects the last-rendered messages, captured before
    // the setMessages push below, so history never includes the new bubbles.
    const history = currentState.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    setStateByKey(prev => {
      const state = prev[key] || currentState;
      return {
        ...prev,
        [key]: {
          ...state,
          messages: [...state.messages, userMsg, assistantMsg],
          activeAssistantId: assistantId,
          isStreaming: true,
        },
      };
    });
    activeConversationKey.current = key;

    try {
      const result = await window.hermes.sendMessage(text, {
        resumeSessionId: currentState.sessionId,
        history,
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
        return {
          ...prev,
          [key]: {
            ...state,
            messages: state.messages.map(m => (m.id === assistantId && !m.content ? { ...m, content: `Error: ${message}` } : m)),
            activeAssistantId: null,
            isStreaming: false,
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
      return { ...prev, [key]: { ...state, activeAssistantId: null, isStreaming: false } };
    });
  }, [conversationKey]);

  const currentState = stateByKey[conversationKey] || createConversationState(options);
  return { messages: currentState.messages, isStreaming: currentState.isStreaming, sendMessage, abortStream };
}
