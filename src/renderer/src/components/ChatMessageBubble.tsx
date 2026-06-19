import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Activity, AtSign } from "lucide-react";
import type { AgentRunState, ChatMessage } from "@shared/types";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  /** Live run for the turn currently streaming into this bubble. When present it
   *  drives the inline Activity disclosure (auto-expanded); once the run ends the
   *  final snapshot lives on message.run and the disclosure collapses. */
  liveRun?: AgentRunState | null;
}

function runStatusWord(status: AgentRunState["status"]): string {
  if (status === "running") return "Working";
  if (status === "error") return "Error";
  if (status === "aborted") return "Stopped";
  return "Done";
}

/**
 * Inline, collapsible "what the agent did" disclosure attached to the assistant
 * message it belongs to — replaces the always-on global run timeline that used
 * to sit pinned at the bottom of every conversation. Auto-expanded while the
 * turn streams, collapsed once it completes.
 */
function ActivityDisclosure({ run, live }: { run: AgentRunState; live: boolean }) {
  // Open while the turn streams; collapse once it completes. A manual toggle
  // survives because `live` only changes on stream start/end, not on click.
  const [open, setOpen] = useState(live);
  useEffect(() => {
    setOpen(live);
  }, [live]);

  const steps = run.events;
  const toolCount = steps.filter((event) => event.kind === "tool").length;

  return (
    <div className="ui-activity-inline" data-status={run.status} data-live={live ? "true" : "false"}>
      <button
        type="button"
        className="ui-activity-inline-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Activity size={13} />
        <span>Activity</span>
        <em>
          {runStatusWord(run.status)} · {steps.length} step{steps.length === 1 ? "" : "s"}
          {toolCount ? ` · ${toolCount} tool${toolCount === 1 ? "" : "s"}` : ""}
        </em>
      </button>
      {open && (
        <div className="ui-activity-inline-steps">
          {steps.map((event) => (
            <div key={event.id} className="ui-activity-inline-step" data-status={event.status}>
              <span className="ui-activity-inline-dot" />
              <div className="ui-activity-inline-step-text">
                <strong>{event.label}</strong>
                {event.detail && <small>{event.detail}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatMessageBubble({ message, isStreaming, liveRun }: Props) {
  const [showReasoning, setShowReasoning] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const isUser = message.role === "user";
  const run = liveRun || message.run || null;

  return (
    <div className="ui-chat-row">
      <div className={`ui-chat-avatar ${isUser ? "ui-chat-avatar-user" : "ui-chat-avatar-agent"}`}>{isUser ? "U" : "H"}</div>

      <div className="flex-1 min-w-0">
        {message.viaProfile && (
          <div className="ui-via-profile-badge"><AtSign size={11} /> via {message.viaProfile}</div>
        )}

        {!isUser && run && run.events.length > 0 && (
          <ActivityDisclosure run={run} live={!!liveRun && !!isStreaming} />
        )}

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
