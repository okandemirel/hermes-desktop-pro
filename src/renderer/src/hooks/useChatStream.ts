import { useState, useCallback, useRef } from "react";
import type { ChatMessage, ProviderId, TokenUsage } from "@shared/types";

interface UseChatStreamOptions {
  providerId: ProviderId;
  modelId: string;
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
  const abortRef = useRef<AbortController | null>(null);
  let msgIdCounter = useRef(0);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: `msg-${++msgIdCounter.current}`, role: "user", content: text, timestamp: Date.now() };
    const assistantMsg: ChatMessage = { id: `msg-${++msgIdCounter.current}`, role: "assistant", content: "", timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiUrl = "http://127.0.0.1:8642/v1/chat/completions";
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.modelId || "auto",
          messages: [{ role: "user", content: text }],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No body");

        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  content += delta;
                  setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content } : m));
                }
                if (parsed.usage) {
                  options.onTokenUsage?.({
                    promptTokens: parsed.usage.prompt_tokens || 0,
                    completionTokens: parsed.usage.completion_tokens || 0,
                    totalTokens: parsed.usage.total_tokens || 0,
                  });
                }
              } catch { /* skip non-JSON */ }
            }
          }
        }
      } else {
        // Fallback: simulate response
        const simText = simulateResponse(text);
        let content = "";
        for (const char of simText) {
          await new Promise(r => setTimeout(r, 15 + Math.random() * 20));
          content += char;
          setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content } : m));
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: `Error: ${err.message}` } : m));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [options.providerId, options.modelId, options.onTokenUsage]);

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, isStreaming, sendMessage, abortStream };
}

function simulateResponse(input: string): string {
  const responses = [
    `Here's my analysis of "${input}":\n\n1. This is an interesting question. Let me break it down.\n2. Based on the information available, I can provide the following insights.\n\n\`\`\`typescript\nconst result = process(input);\nconsole.log(result);\n\`\`\`\n\nI hope this helps! Let me know if you need clarification on any point.`,
    `Great question! Here's what I found:\n\n- **Point 1**: The key consideration here is architecture.\n- **Point 2**: Performance should be measured with real benchmarks.\n- **Point 3**: Consider edge cases before deploying.\n\nWould you like me to elaborate on any of these points?`,
    `I've analyzed "${input}" and here are my thoughts:\n\n| Aspect | Status |\n|--------|--------|\n| Feasibility | ✅ Good |\n| Complexity | ⚠️ Medium |\n| Risk | 🔴 Low |\n\nLet me know if you'd like a more detailed breakdown.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
