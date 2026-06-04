import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChatMessage } from "@shared/types";

interface Props { message: ChatMessage; isStreaming?: boolean }

export function ChatMessageBubble({ message }: Props) {
  const [showReasoning, setShowReasoning] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const isUser = message.role === "user";

  return (
    <div className="ui-chat-row">
      <div className={`ui-chat-avatar ${isUser ? "ui-chat-avatar-user" : "ui-chat-avatar-agent"}`}>{isUser ? "U" : "H"}</div>

      <div className="flex-1 min-w-0">
        {!isUser && message.reasoning && (
          <div className="mb-2">
            <button onClick={() => setShowReasoning(v => !v)} className="ui-btn ui-btn-ghost ui-btn-sm mb-1.5">
              {showReasoning ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Reasoning
            </button>
            {showReasoning && <div className="reasoning-block">{message.reasoning}</div>}
          </div>
        )}

        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            <button onClick={() => setShowTools(v => !v)} className="ui-btn ui-btn-ghost ui-btn-sm mb-1.5">
              {showTools ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? "s" : ""}
            </button>
            {showTools && message.toolCalls.map(tc => (
              <div key={tc.callId} className="tool-call-block">
                <div className="tool-call-name">{tc.name}</div>
                <div className="tool-call-args">{tc.args}</div>
                {tc.result && (
                  <>
                    <div className="ui-divider my-1.5" />
                    <div className="text-[11px] font-semibold text-[var(--success)] mb-0.5">Result</div>
                    <div className="tool-call-args">{tc.result.slice(0, 400)}{tc.result.length > 400 ? "…" : ""}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {message.content && (
          <div className={`ui-bubble ${isUser ? "ui-bubble-user" : "ui-bubble-agent"} ${isUser ? "" : "markdown-content"}`}>
            {isUser ? message.content : <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>}
          </div>
        )}

        {!isUser && message.usage && (
          <div className="text-[11px] text-[var(--text-3)] mt-1.5 font-mono">
            ↑{message.usage.promptTokens.toLocaleString()} ↓{message.usage.completionTokens.toLocaleString()}
            {message.usage.cost != null && ` · $${message.usage.cost.toFixed(4)}`}
          </div>
        )}
      </div>
    </div>
  );
}
