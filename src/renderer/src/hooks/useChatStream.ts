import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, ProviderId, TokenUsage } from "@shared/types";

interface UseChatStreamOptions {
  providerId: ProviderId;
  modelId: string;
  sessionId?: string;
  onTokenUsage?: (usage: TokenUsage) => void;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
  abortStream: () => void;
}

export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const msgIdCounter = useRef(0);

  // Id of the assistant bubble currently being streamed into. Incoming IPC
  // chunks are routed to it via this ref so the listeners can stay stable
  // (subscribed once) without closing over per-send state.
  const activeAssistantId = useRef<string | null>(null);
  const sessionIdRef = useRef<string | undefined>(options.sessionId);
  useEffect(() => { sessionIdRef.current = options.sessionId; }, [options.sessionId]);

  const onTokenUsageRef = useRef(options.onTokenUsage);
  useEffect(() => { onTokenUsageRef.current = options.onTokenUsage; }, [options.onTokenUsage]);

  const patchActive = useCallback((patch: (m: ChatMessage) => ChatMessage) => {
    const id = activeAssistantId.current;
    if (!id) return;
    setMessages(prev => prev.map(m => (m.id === id ? patch(m) : m)));
  }, []);

  // Subscribe to the 6 stream events ONCE; tear them down on unmount.
  // The preload subscribers each return an unsubscribe fn, used for cleanup.
  useEffect(() => {
    const unsubChunk = window.hermes.onStreamChunk((text: string) => {
      patchActive(m => ({ ...m, content: m.content + text }));
    });
    const unsubReasoning = window.hermes.onReasoningChunk((text: string) => {
      patchActive(m => ({ ...m, reasoning: (m.reasoning || "") + text }));
    });
    const unsubTool = window.hermes.onToolProgress(() => {
      // Tool progress is surfaced elsewhere; no-op here for now.
    });
    const unsubUsage = window.hermes.onUsage((usage: TokenUsage) => {
      onTokenUsageRef.current?.(usage);
    });
    const unsubError = window.hermes.onStreamError((error: string) => {
      patchActive(m => ({ ...m, content: m.content || `Error: ${error}` }));
      activeAssistantId.current = null;
      setIsStreaming(false);
    });
    const unsubDone = window.hermes.onStreamDone((sessionId?: string) => {
      if (sessionId) sessionIdRef.current = sessionId;
      activeAssistantId.current = null;
      setIsStreaming(false);
    });

    return () => {
      unsubChunk();
      unsubReasoning();
      unsubTool();
      unsubUsage();
      unsubError();
      unsubDone();
    };
  }, [patchActive]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: `msg-${++msgIdCounter.current}`, role: "user", content: text, timestamp: Date.now() };
    const assistantId = `msg-${++msgIdCounter.current}`;
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };

    // Build history from prior messages (before this turn) — user/assistant only.
    const history = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    activeAssistantId.current = assistantId;
    setIsStreaming(true);

    try {
      const result = await window.hermes.sendMessage(text, {
        resumeSessionId: sessionIdRef.current,
        history,
      });
      if (result?.sessionId) sessionIdRef.current = result.sessionId;
    } catch (err: any) {
      // Honest error — no simulated fallback. onStreamError may have already
      // fired; only set a message if the bubble is still empty.
      const message = err?.message ? String(err.message) : "Failed to send message.";
      setMessages(prev => prev.map(m => (m.id === assistantId && !m.content ? { ...m, content: `Error: ${message}` } : m)));
      activeAssistantId.current = null;
      setIsStreaming(false);
    }
  }, [messages]);

  const abortStream = useCallback(() => {
    window.hermes.abortChat();
    activeAssistantId.current = null;
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, sendMessage, abortStream };
}
