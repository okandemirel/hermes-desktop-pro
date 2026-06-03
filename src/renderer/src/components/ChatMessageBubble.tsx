import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@shared/types";

interface Props { message: ChatMessage; isStreaming?: boolean }

export function ChatMessageBubble({ message, isStreaming }: Props) {
  const [showReasoning, setShowReasoning] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const isUser = message.role === "user";

  return (
    <div className={`chat-message ${isUser ? "chat-message-user" : "chat-message-agent"}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="chat-avatar chat-avatar-user">U</div>
      ) : (
        <div className="chat-avatar chat-avatar-agent">H</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Reasoning */}
        {!isUser && message.reasoning && (
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => setShowReasoning(!showReasoning)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: "2px 8px", marginBottom: 4 }}>
              💭 Reasoning {showReasoning ? "▾" : "▸"}
            </button>
            {showReasoning && (
              <div className="reasoning-block">{message.reasoning}</div>
            )}
          </div>
        )}

        {/* Tool calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => setShowTools(!showTools)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: "2px 8px", marginBottom: 4 }}>
              🔧 {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? "s" : ""} {showTools ? "▾" : "▸"}
            </button>
            {showTools && message.toolCalls.map(tc => (
              <div key={tc.callId} className="tool-call-block">
                <div className="tool-call-name">{tc.name}</div>
                <div className="tool-call-args">{tc.args}</div>
                {tc.result && (
                  <>
                    <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }}/>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", marginBottom: 2 }}>Result</div>
                    <div className="tool-call-args">{tc.result.slice(0, 400)}{tc.result.length > 400 ? "…" : ""}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bubble */}
        {message.content && (
          <div className={`chat-bubble ${isUser ? "chat-bubble-user" : "chat-bubble-agent"}`}>
            {isUser ? (
              message.content
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            )}
          </div>
        )}

        {/* Usage */}
        {!isUser && message.usage && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
            ↑{message.usage.promptTokens.toLocaleString()} ↓{message.usage.completionTokens.toLocaleString()}
            {message.usage.cost != null && ` · $${message.usage.cost.toFixed(4)}`}
          </div>
        )}
      </div>
    </div>
  );
}
