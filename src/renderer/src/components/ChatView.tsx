import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  Square, Plus, Globe, Image, Code, Wrench, Brain, Activity, Terminal, Paperclip,
  ArrowUp, Search, FileText, Table2, Sparkles, SlidersHorizontal, Command,
  Database, BookOpen, Settings2, ChevronDown, CheckCircle2, Copy, ExternalLink,
  ThumbsUp, ThumbsDown, Share2, X, Mic, Box,
  BarChart3, Lightbulb, Play, Clock, Star, Layers, Bookmark, ShieldCheck, Grid2X2,
  Check, MessageSquare,
} from "lucide-react";
import type { AgentRunEvent, AgentRunEventKind, AgentRunState, ChatMessage, ChatTab, ProviderId, ProviderInfo, TokenUsage } from "@shared/types";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { BrandMark, BrandMedallion } from "./BrandMark";
import { useChatStream } from "../hooks/useChatStream";
import { IconButton, StatusDot, Toggle } from "../ui";

interface ChatViewProps {
  tab: ChatTab; providers: ProviderInfo[]; allTabs: ChatTab[];
  onClose: (id: string) => void; onNewTab: () => void; onSelectTab: (id: string) => void;
  onUpdateProvider: (tabId: string, providerId: ProviderId) => void;
  onUpdateModel: (tabId: string, modelId: string) => void;
}

type InspectorTab = "inspector" | "context" | "activity" | "pinned";

const SLASH_COMMANDS = [
  { cmd: "/new", desc: "New conversation", icon: Plus },
  { cmd: "/clear", desc: "Clear and new session", icon: Plus },
  { cmd: "/web", desc: "Web search", icon: Globe },
  { cmd: "/image", desc: "Generate image", icon: Image },
  { cmd: "/code", desc: "Code execution", icon: Code },
  { cmd: "/shell", desc: "Terminal command", icon: Terminal },
  { cmd: "/usage", desc: "Token usage", icon: Activity },
  { cmd: "/tools", desc: "Manage tools", icon: Wrench },
  { cmd: "/skills", desc: "Browse skills", icon: Brain },
  { cmd: "/model", desc: "Change model", icon: Brain },
];

const COMPOSER_TOOLS = [
  { icon: Paperclip, label: "Attach", cmd: "/attach " },
  { icon: Box, label: "Tools", cmd: "/tools " },
  { icon: SlidersHorizontal, label: "Context", cmd: "/context " },
];

const QUICK_ACTIONS = [
  { icon: Code, label: "Write Code", cmd: "/code " },
  { icon: BarChart3, label: "Analyze Data", cmd: "/data " },
  { icon: FileText, label: "Summarize", cmd: "Summarize " },
  { icon: Search, label: "Research", cmd: "/web " },
  { icon: Lightbulb, label: "Get Insights", cmd: "Get insights from " },
  { icon: Play, label: "Create Plan", cmd: "Create a plan for " },
];

const INSPECTOR_TOOLS = [
  { id: "web", icon: Globe, label: "Web Search", enabled: true },
  { id: "docs", icon: FileText, label: "Document Analysis", enabled: true },
  { id: "data", icon: Table2, label: "Data Extraction", enabled: true },
  { id: "code", icon: Code, label: "Code Interpreter", enabled: false },
  { id: "image", icon: Image, label: "Image Generation", enabled: false },
];

const MEMORY_ROWS = [
  { icon: Database, label: "Project Knowledge", meta: "120 items", active: true },
  { icon: Sparkles, label: "User Preferences", meta: "24 items", active: true },
  { icon: Activity, label: "Conversation History", meta: "85 items", active: true },
];

function truncateText(value: string, max = 130): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function formatClock(ts?: number): string {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startedAt?: number, endedAt?: number): string {
  if (!startedAt) return "0s";
  const end = endedAt || Date.now();
  const seconds = Math.max(0, Math.round((end - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function runStatusLabel(status: AgentRunState["status"]): string {
  if (status === "running") return "Running";
  if (status === "done") return "Complete";
  if (status === "error") return "Needs attention";
  if (status === "aborted") return "Stopped";
  return "Ready";
}

function runEventIcon(kind: AgentRunEventKind, status: AgentRunEvent["status"]): ReactNode {
  if (status === "error") return <X size={17} />;
  if (kind === "start") return <Play size={17} />;
  if (kind === "context") return <BookOpen size={17} />;
  if (kind === "reasoning") return <Brain size={17} />;
  if (kind === "tool") return <Wrench size={17} />;
  if (kind === "usage") return <Activity size={17} />;
  if (kind === "done") return <CheckCircle2 size={17} />;
  if (kind === "abort") return <Square size={15} />;
  return <Sparkles size={17} />;
}

function createHistoricalRunState(messages: ChatMessage[]): AgentRunState | null {
  const lastUser = [...messages].reverse().find(message => message.role === "user");
  const lastAssistant = [...messages].reverse().find(message => message.role === "assistant");
  if (!lastUser && !lastAssistant) return null;

  const startedAt = lastUser?.timestamp || lastAssistant?.timestamp || Date.now();
  const endedAt = lastAssistant?.timestamp && lastAssistant.timestamp >= startedAt ? lastAssistant.timestamp : undefined;
  const prompt = lastUser?.content || "Session activity";
  const assistantHasError = !!lastAssistant?.content?.toLowerCase().startsWith("error:");
  const baseId = lastAssistant?.id || lastUser?.id || `run-${startedAt}`;
  const events: AgentRunEvent[] = [
    {
      id: `${baseId}-historical-start`,
      kind: "start",
      label: "Run started",
      detail: "Loaded from this chat session",
      status: "done",
      timestamp: startedAt,
    },
    {
      id: `${baseId}-historical-context`,
      kind: "context",
      label: "Context restored",
      detail: `${messages.length} messages available`,
      status: "done",
      timestamp: startedAt,
    },
    {
      id: `${baseId}-historical-output`,
      kind: assistantHasError ? "error" : "done",
      label: assistantHasError ? "Run stopped with error" : "Response available",
      detail: lastAssistant?.content ? truncateText(lastAssistant.content, 96) : "No assistant output yet",
      status: assistantHasError ? "error" : "done",
      timestamp: endedAt || startedAt,
    },
  ];

  return {
    id: `${baseId}-historical-run`,
    assistantMessageId: lastAssistant?.id || null,
    prompt,
    startedAt,
    endedAt,
    status: assistantHasError ? "error" : "done",
    events,
    usage: lastAssistant?.usage,
  };
}

function AgentRunTimeline({
  runState,
  providerLabel,
  modelName,
  assistantPreview,
  tokenUsage,
  activeToolCount,
  onOpenActivity,
  onOpenTools,
}: {
  runState: AgentRunState;
  providerLabel: string;
  modelName: string;
  assistantPreview: string;
  tokenUsage: TokenUsage;
  activeToolCount: number;
  onOpenActivity: () => void;
  onOpenTools: () => void;
}) {
  const status = runStatusLabel(runState.status);
  const duration = formatDuration(runState.startedAt, runState.endedAt);
  const toolEvents = runState.events.filter(event => event.kind === "tool").length;
  const latestEvents = runState.events.slice(-6);
  const preview = assistantPreview || (runState.status === "running" ? "Hermes is preparing the first visible output." : "No assistant output captured for this run yet.");

  return (
    <section className="ui-agent-run-timeline" data-status={runState.status} aria-label="Agent run timeline">
      <div className="ui-agent-run-head">
        <BrandMedallion size={38} className="ui-agent-run-brand" />
        <div className="ui-agent-run-title">
          <span>Agent Run</span>
          <h2>{truncateText(runState.prompt || "Hermes run", 92)}</h2>
          <p>{providerLabel} · {modelName} · started {formatClock(runState.startedAt)}</p>
        </div>
        <div className="ui-agent-run-state">
          <span><StatusDot color={runState.status === "running" ? "var(--success)" : runState.status === "error" || runState.status === "aborted" ? "var(--error)" : "var(--accent-text)"} pulse={runState.status === "running"} /> {status}</span>
          <em>{duration}</em>
        </div>
      </div>

      <div className="ui-agent-run-steps">
        {latestEvents.map((event, index) => (
          <div key={event.id} className="ui-agent-run-step" data-status={event.status}>
            <div className="ui-agent-run-node">
              <span>{runEventIcon(event.kind, event.status)}</span>
              {index < latestEvents.length - 1 && <i />}
            </div>
            <div className="ui-agent-run-step-card">
              <div className="ui-agent-run-step-main">
                <strong>{event.label}</strong>
                <small>{formatClock(event.timestamp)}{event.durationMs ? ` · ${formatDuration(event.timestamp, event.timestamp + event.durationMs)}` : ""}{event.tokens ? ` · ${event.tokens.toLocaleString()} tokens` : ""}</small>
              </div>
              {event.detail && <p>{truncateText(event.detail, 118)}</p>}
              <span className="ui-agent-run-step-badge">{event.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="ui-agent-run-output">
        <div>
          <span>Partial output</span>
          <p>{truncateText(preview, 170)}</p>
        </div>
        <button type="button" onClick={onOpenActivity}>
          <Activity size={14} /> Inspect
        </button>
      </div>

      <div className="ui-agent-run-footer">
        <span><Activity size={13} /> Tokens <strong>{tokenUsage.totalTokens.toLocaleString()}</strong></span>
        <span><Wrench size={13} /> Tools <strong>{toolEvents || activeToolCount}</strong></span>
        <span><BookOpen size={13} /> Context <strong>128K</strong></span>
        <button type="button" onClick={onOpenTools}>Manage tools</button>
      </div>
    </section>
  );
}

export default function ChatView({
  tab,
  providers,
  allTabs,
  onClose,
  onNewTab,
  onSelectTab,
  onUpdateProvider,
  onUpdateModel,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspector");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [openControlSelect, setOpenControlSelect] = useState<string | null>(null);
  const [toolToggles, setToolToggles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(INSPECTOR_TOOLS.map(t => [t.id, t.enabled])),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const suppressCommandMenuRef = useRef(false);
  const activeProvider = providers.find(p => p.id === tab.providerId);

  const { messages, isStreaming, runState, sendMessage, abortStream } = useChatStream({
    providerId: tab.providerId, modelId: tab.modelId, conversationKey: tab.id, sessionId: tab.sessionId, initialMessages: tab.messages,
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!tabMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (tabMenuRef.current?.contains(event.target as Node)) return;
      setTabMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setTabMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tabMenuOpen]);

  useEffect(() => {
    if (!openControlSelect) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".ui-command-select")) return;
      setOpenControlSelect(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenControlSelect(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openControlSelect]);

  useEffect(() => {
    if (suppressCommandMenuRef.current) {
      suppressCommandMenuRef.current = false;
      setShowCommands(false);
      return;
    }
    if (input.startsWith("/")) {
      const q = input.slice(1).toLowerCase();
      const matches = q ? SLASH_COMMANDS.filter(c => c.cmd.toLowerCase().includes(q)) : SLASH_COMMANDS;
      setFilteredCommands(matches);
      setShowCommands(matches.length > 0);
      setSelectedCmdIdx(0);
    } else {
      setShowCommands(false);
    }
  }, [input]);

  const modelName = activeProvider?.models?.find(m => m.id === tab.modelId)?.name || tab.modelId || "Auto";
  const providerLabel = activeProvider?.label || tab.providerId;
  const activeToolCount = Object.values(toolToggles).filter(Boolean).length;
  const sessionTitle = tab.name && tab.name !== "New chat" ? tab.name : "Q2 Market Report";
  const activeTabIndex = Math.max(0, allTabs.findIndex(t => t.id === tab.id));
  const activeTabPosition = activeTabIndex + 1;
  const displayRunState = useMemo(() => runState || createHistoricalRunState(messages), [runState, messages]);
  const assistantPreview = useMemo(() => {
    const lastAssistant = [...messages].reverse().find(message => message.role === "assistant");
    return truncateText(lastAssistant?.content || lastAssistant?.reasoning || "", 220);
  }, [messages]);
  const displayedUsage = useMemo<TokenUsage>(() => {
    const messageUsage = [...messages].reverse().find(message => message.role === "assistant" && message.usage)?.usage;
    return displayRunState?.usage || messageUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
  }, [displayRunState, messages]);

  const focusCommand = useCallback((cmd: string) => {
    suppressCommandMenuRef.current = true;
    setInput(cmd);
    setShowCommands(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const copyPreview = useCallback(() => {
    void navigator.clipboard?.writeText("Key insights copied from Hermes agent preview.");
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    if (trimmed.startsWith("/")) {
      const cmd = trimmed.split(" ")[0].toLowerCase();
      if (cmd === "/new") { onNewTab(); setInput(""); return; }
      if (cmd === "/clear") { sendMessage("/new"); setInput(""); return; }
    }
    sendMessage(trimmed);
    setInput("");
    setShowCommands(false);
  }, [input, isStreaming, sendMessage, onNewTab]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showCommands && filteredCommands.length > 0) {
        suppressCommandMenuRef.current = true;
        setInput(filteredCommands[selectedCmdIdx].cmd + " ");
        setShowCommands(false);
        inputRef.current?.focus();
        return;
      }
      handleSend();
    }
    if (showCommands) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedCmdIdx(i => Math.min(i + 1, filteredCommands.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedCmdIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Escape") setShowCommands(false);
    }
  };

  const renderControlSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { value: string; label: string }[],
    icon?: ReactNode,
  ) => {
    const controlId = label.toLowerCase();
    const open = openControlSelect === controlId;
    const selected = options.find(option => option.value === value) || options[0];
    return (
      <div className="ui-command-select no-drag" data-open={open}>
        <span>{label}</span>
        <div className="ui-command-select-control">
          {icon}
          <button
            type="button"
            className="ui-command-select-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpenControlSelect(current => current === controlId ? null : controlId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
                event.preventDefault();
                setOpenControlSelect(controlId);
              }
            }}
          >
            <strong>{selected?.label || "Auto"}</strong>
            <ChevronDown size={14} />
          </button>
        </div>
        {open && (
          <div className="ui-command-select-menu slide-up" role="listbox" aria-label={`${label} options`}>
            {options.map(option => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__auto"}
                  type="button"
                  className="ui-command-select-option"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpenControlSelect(null);
                  }}
                >
                  <span>{option.label}</span>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const toggleInspector = useCallback((tabName: InspectorTab) => {
    if (inspectorOpen && inspectorTab === tabName) {
      setInspectorOpen(false);
      return;
    }
    setInspectorTab(tabName);
    setInspectorOpen(true);
  }, [inspectorOpen, inspectorTab]);

  const handleNewChat = useCallback((event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    setTabMenuOpen(false);
    onNewTab();
  }, [onNewTab]);

  const selectChatTab = useCallback((id: string) => {
    onSelectTab(id);
    setTabMenuOpen(false);
  }, [onSelectTab]);

  const closeChatTab = useCallback((id: string, event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (allTabs.length <= 1) return;
    if (id === tab.id && isStreaming) abortStream();
    onClose(id);
    setTabMenuOpen(false);
  }, [abortStream, allTabs.length, isStreaming, onClose, tab.id]);

  const topbarEl = (
    <header className="ui-commandbar drag">
      <div className="ui-commandbar-left no-drag">
        {renderControlSelect(
          "Provider",
          tab.providerId,
          value => onUpdateProvider(tab.id, value as ProviderId),
          providers.map(p => ({ value: p.id, label: p.label })),
          <Brain size={16} className="text-[var(--accent-text)]" />,
        )}
        {renderControlSelect(
          "Model",
          tab.modelId,
          value => onUpdateModel(tab.id, value),
          [{ value: "", label: "Auto" }, ...(activeProvider?.models?.map(m => ({ value: m.id, label: m.name })) || [])],
          <BrandMark size={17} glow={false} />,
        )}
      </div>

      <div className="ui-chat-switcher no-drag" aria-label="Open chats" ref={tabMenuRef}>
        <button
          type="button"
          className="ui-chat-switcher-current"
          aria-expanded={tabMenuOpen}
          aria-haspopup="menu"
          onClick={() => setTabMenuOpen(open => !open)}
          title={`Switch chats · ${tab.name}`}
        >
          <MessageSquare size={14} />
          <span className="ui-chat-switcher-label">Chats</span>
          <strong>{tab.name}</strong>
          <em>{activeTabPosition}/{allTabs.length}</em>
          <ChevronDown size={13} />
        </button>
        <button
          type="button"
          className="ui-chat-switcher-close"
          onClick={event => closeChatTab(tab.id, event)}
          disabled={allTabs.length <= 1}
          title={allTabs.length <= 1 ? "Keep at least one chat open" : `Close ${tab.name}`}
          aria-label={`Close ${tab.name}`}
        >
          <X size={13} />
        </button>
        <button
          type="button"
          className="ui-chat-switcher-add"
          onClick={event => handleNewChat(event)}
          title="New chat"
          aria-label="New chat"
        >
          <Plus size={15} />
        </button>
        {tabMenuOpen && (
          <div className="ui-chat-tab-menu slide-up no-drag" role="menu" aria-label="Open chats">
            <div className="ui-chat-tab-menu-head">
              <span>Open chats</span>
              <button type="button" onClick={event => handleNewChat(event)}>
                <Plus size={13} /> New
              </button>
            </div>
            <div className="ui-chat-tab-menu-list">
              {allTabs.map((t, index) => (
                <div key={t.id} className="ui-chat-tab-menu-row" data-active={t.id === tab.id}>
                  <button
                    type="button"
                    className="ui-chat-tab-menu-select"
                    role="menuitem"
                    onClick={() => {
                      selectChatTab(t.id);
                    }}
                    title={t.name}
                  >
                    <span className="truncate">{t.name}</span>
                    <em>{t.id === tab.id ? "Active" : `#${index + 1}`}</em>
                  </button>
                  <button
                    type="button"
                    className="ui-chat-tab-menu-close"
                    onClick={event => closeChatTab(t.id, event)}
                    disabled={allTabs.length <= 1}
                    title={allTabs.length <= 1 ? "Keep at least one chat open" : `Close ${t.name}`}
                    aria-label={`Close ${t.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ui-commandbar-right no-drag">
        <button className="ui-agent-chip" onClick={() => focusCommand("/status ")} title="Connection status">
          <StatusDot color="var(--success)" pulse />
          <span><strong>Connected</strong></span>
          <ChevronDown size={14} />
        </button>
        <IconButton title="Activity" onClick={() => toggleInspector("activity")}><Activity size={16} /></IconButton>
        <IconButton title="Security" onClick={() => focusCommand("/security ")}><ShieldCheck size={16} /></IconButton>
        <IconButton title="Apps" onClick={() => focusCommand("/tools ")}><Grid2X2 size={16} /></IconButton>
        <IconButton title="Settings" onClick={() => toggleInspector("context")}><Settings2 size={16} /></IconButton>
        <button className="ui-run-button" onClick={handleNewChat}>
          <Plus size={18} /> <span className="ui-run-label">New</span>
        </button>
      </div>
    </header>
  );

  const composerEl = (
    <div className="ui-compose-wrap no-drag">
      {showCommands && (
        <div className="ui-command-menu slide-up">
          {filteredCommands.map((c, i) => (
            <button key={c.cmd} className="ui-menu-item" data-active={i === selectedCmdIdx}
              onClick={() => { suppressCommandMenuRef.current = true; setInput(c.cmd + " "); setShowCommands(false); inputRef.current?.focus(); }}>
              <c.icon size={14} className="shrink-0" />
              <span className="font-medium">{c.cmd}</span>
              <span className="ml-auto text-[12px] text-[var(--text-3)]">{c.desc}</span>
            </button>
          ))}
          {filteredCommands.length === 0 && <div className="px-3 py-3 text-[12.5px] text-[var(--text-3)] text-center">No commands</div>}
        </div>
      )}
      <div className="ui-compose-box">
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Ask Hermes..." rows={1}
          className="ui-compose-input" />
        <div className="ui-compose-tools">
          <div className="flex items-center gap-2">
            {COMPOSER_TOOLS.map(t => (
              <button key={t.label} className="ui-compose-tool" onClick={() => focusCommand(t.cmd)} title={t.label}>
                <t.icon size={17} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <button className="ui-compose-tool" onClick={() => focusCommand("/voice ")} title="Voice">
              <Mic size={17} />
            </button>
            <span className="ui-model-chip">{providerLabel} · {modelName}</span>
            {isStreaming ? (
              <button onClick={abortStream} className="ui-send-button ui-send-button-stop" title="Stop">
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className="ui-send-button" title="Send">
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      {(isStreaming || displayedUsage.totalTokens > 0) && (
        <div className="ui-compose-status">
          {isStreaming && <span><StatusDot color="var(--accent)" pulse /> Streaming</span>}
          {displayedUsage.totalTokens > 0 && <em>{displayedUsage.totalTokens.toLocaleString()} tokens{(displayedUsage.cost ?? 0) > 0 ? ` · $${(displayedUsage.cost ?? 0).toFixed(4)}` : ""}</em>}
        </div>
      )}
    </div>
  );

  const emptyCommandCenter = (
    <div className="ui-empty-command-center">
      <div className="ui-hero-glyph"><BrandMark size={120} glow /></div>
      <h1>Ask Hermes</h1>
      <p>Your AI command center</p>
      <div className="ui-empty-composer-slot">{composerEl}</div>
      <div className="ui-quick-actions">
        {QUICK_ACTIONS.map(action => (
          <button key={action.label} className="ui-quick-action-card" onClick={() => focusCommand(action.cmd)}>
            <action.icon size={26} />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const runEvents = displayRunState?.events || [];
  const runToolEvents = runEvents.filter(event => event.kind === "tool").length;
  const runStatus = displayRunState ? runStatusLabel(displayRunState.status) : "Ready";
  const runDuration = displayRunState ? formatDuration(displayRunState.startedAt, displayRunState.endedAt) : "0s";

  const inspectorRows = inspectorTab === "activity"
    ? [
        { icon: Activity, label: "Run status", meta: runStatus },
        { icon: Wrench, label: "Tool events", meta: `${runToolEvents || activeToolCount} active` },
        { icon: Table2, label: "Token usage", meta: displayedUsage.totalTokens ? displayedUsage.totalTokens.toLocaleString() : "Pending" },
      ]
    : inspectorTab === "pinned"
      ? [
          { icon: Star, label: "Pinned notes", meta: "3 saved" },
          { icon: Bookmark, label: "Saved context", meta: "Workspace" },
          { icon: FileText, label: "Recent brief", meta: "Q2 Market" },
        ]
    : [
        { icon: BookOpen, label: "Workspace", meta: "Hermes" },
        { icon: Command, label: "Session", meta: sessionTitle },
        { icon: Settings2, label: "Mode", meta: "Agent Run" },
      ];

  const inspectorEl = (
    <aside className="ui-inspector no-drag">
      <div className="ui-inspector-tabs">
        {[
          ["inspector", "Inspector"],
          ["pinned", "Pinned"],
          ["context", "Context"],
          ["activity", "Activity"],
        ].map(([id, label]) => (
          <button key={id} data-active={inspectorTab === id} onClick={() => setInspectorTab(id as InspectorTab)}>
            {label}
          </button>
        ))}
        <button className="ui-inspector-close" onClick={() => setInspectorOpen(false)} title="Hide inspector"><X size={16} /></button>
      </div>

      {inspectorTab === "activity" && (
        <section className="ui-inspector-section">
          <div className="ui-activity-run-card" data-status={displayRunState?.status || "idle"}>
            <div className="ui-activity-run-card-head">
              <span><StatusDot color={displayRunState?.status === "running" ? "var(--success)" : displayRunState?.status === "error" || displayRunState?.status === "aborted" ? "var(--error)" : "var(--accent-text)"} pulse={displayRunState?.status === "running"} /> {runStatus}</span>
              <em>{runDuration}</em>
            </div>
            <h3>{truncateText(displayRunState?.prompt || "No active run", 80)}</h3>
            <p>{displayRunState ? `${providerLabel} · ${modelName} · ${formatClock(displayRunState.startedAt)}` : "Start a conversation to see live operation steps."}</p>
            <div className="ui-activity-run-metrics">
              <div><span>Steps</span><strong>{runEvents.length}</strong></div>
              <div><span>Tools</span><strong>{runToolEvents || activeToolCount}</strong></div>
              <div><span>Tokens</span><strong>{displayedUsage.totalTokens.toLocaleString()}</strong></div>
            </div>
          </div>
          <div className="ui-activity-step-list">
            {(runEvents.length ? runEvents.slice(-5) : [
              { id: "activity-idle", kind: "start" as const, label: "Waiting for run", detail: "Hermes will show live work here", status: "queued" as const, timestamp: Date.now() },
            ]).map(event => (
              <div key={event.id} className="ui-activity-step" data-status={event.status}>
                <span>{runEventIcon(event.kind, event.status)}</span>
                <div>
                  <strong>{event.label}</strong>
                  <small>{event.detail ? truncateText(event.detail, 74) : formatClock(event.timestamp)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {inspectorTab === "inspector" && (
        <>
          <section className="ui-inspector-section">
            <div className="ui-inspector-heading">
              <span>Tools</span>
              <button onClick={() => focusCommand("/tools ")}>Manage</button>
            </div>
            <div className="ui-inspector-list">
              {INSPECTOR_TOOLS.map(tool => (
                <div key={tool.id} className="ui-inspector-row">
                  <tool.icon size={16} className="text-[var(--text-2)]" />
                  <span>{tool.label}</span>
                  <Toggle
                    on={!!toolToggles[tool.id]}
                    onChange={v => setToolToggles(prev => ({ ...prev, [tool.id]: v }))}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="ui-inspector-section">
            <div className="ui-inspector-heading">
              <span>Memory</span>
              <button onClick={() => focusCommand("/memory ")}>View all</button>
            </div>
            <div className="ui-inspector-list">
              {MEMORY_ROWS.map(row => (
                <button key={row.label} className="ui-inspector-row" onClick={() => focusCommand(`/memory ${row.label} `)}>
                  <row.icon size={16} className="text-[var(--text-2)]" />
                  <span>{row.label}</span>
                  <span className="ml-auto text-[11.5px] text-[var(--text-3)]">{row.meta}</span>
                  <StatusDot color={row.active ? "var(--success)" : "var(--text-3)"} />
                </button>
              ))}
            </div>
          </section>

          <section className="ui-inspector-section">
            <div className="ui-inspector-heading">
              <span>Model</span>
              <button onClick={() => focusCommand("/model ")}>Configure</button>
            </div>
            <div className="ui-model-card">
              <div className="ui-model-card-head">
                <BrandMedallion size={32} className="!shadow-none" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[var(--text)] truncate">{modelName === "Auto" ? "Hermes 4 Pro" : modelName}</div>
                  <div className="text-[11.5px] text-[var(--text-3)]">{providerLabel}</div>
                </div>
                <span className="ui-tag">Default</span>
              </div>
              <div className="ui-model-stats">
                <div><span>Context Window</span><strong>128K</strong></div>
                <div><span>Tools</span><strong>{activeToolCount} enabled</strong></div>
              </div>
              <label className="ui-model-range">
                <span>Temperature <em>0.3</em></span>
                <input className="ui-range" type="range" min="0" max="1" step="0.1" value="0.3" disabled />
              </label>
            </div>
          </section>
        </>
      )}

      <section className="ui-inspector-section">
        <div className="ui-inspector-heading">
          <span>{inspectorTab === "activity" ? "Activity" : inspectorTab === "pinned" ? "Pinned" : "Context"}</span>
          <button onClick={() => focusCommand(inspectorTab === "activity" ? "/usage " : inspectorTab === "pinned" ? "/pin " : "/context ")}>
            {inspectorTab === "activity" ? "Refresh" : inspectorTab === "pinned" ? "Add" : "Edit"}
          </button>
        </div>
        <div className="ui-inspector-list">
          {inspectorRows.map(row => (
            <button key={row.label} className="ui-inspector-row" onClick={() => focusCommand(`/${row.label.toLowerCase().replace(/\s+/g, "-")} `)}>
              <row.icon size={16} className="text-[var(--text-2)]" />
              <span>{row.label}</span>
              <span className="ml-auto text-[11.5px] text-[var(--text-3)] truncate">{row.meta}</span>
              <ChevronDown size={13} className="-rotate-90 text-[var(--text-3)]" />
            </button>
          ))}
        </div>
      </section>
    </aside>
  );

  const rightRailEl = (
    <aside className="ui-right-rail no-drag">
      <button title="Activity" data-active={inspectorOpen && inspectorTab === "activity"} onClick={() => toggleInspector("activity")}><Clock size={20} /></button>
      <button title="Pinned" data-active={inspectorOpen && inspectorTab === "pinned"} onClick={() => toggleInspector("pinned")}><Star size={20} /></button>
      <button title="Knowledge" data-active={inspectorOpen && inspectorTab === "inspector"} onClick={() => toggleInspector("inspector")}><Layers size={20} /></button>
      <button title="Context" data-active={inspectorOpen && inspectorTab === "context"} onClick={() => toggleInspector("context")}><Bookmark size={20} /></button>
    </aside>
  );

  return (
    <div className="ui-chat-root">
      {topbarEl}
      <div className="ui-chat-workbench" data-inspector-open={inspectorOpen}>
        <section className="ui-chat-stage">
          {messages.length > 0 && <div className="ui-sessionbar no-drag">
            <button className="ui-session-title" onClick={() => focusCommand("/session ")}>
              <Command size={18} />
              <span>{sessionTitle}</span>
              <ChevronDown size={15} />
            </button>
            <div className="ui-session-status">
              <span className="ui-status-label ui-status-success"><CheckCircle2 size={12} /> Connected</span>
              <span className="ui-status-label">128K</span>
            </div>
          </div>}

          {messages.length === 0 ? (
            <div className="ui-thread-canvas ui-thread-canvas-empty">
              {emptyCommandCenter}
            </div>
          ) : (
            <>
              <div className="ui-thread-canvas overflow-y-auto">
                <div className="ui-transcript-rail">
                  {messages.map((msg, i) => <ChatMessageBubble key={i} message={msg} isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"} />)}
                  {displayRunState && (
                    <AgentRunTimeline
                      runState={displayRunState}
                      providerLabel={providerLabel}
                      modelName={modelName}
                      assistantPreview={assistantPreview}
                      tokenUsage={displayedUsage}
                      activeToolCount={activeToolCount}
                      onOpenActivity={() => toggleInspector("activity")}
                      onOpenTools={() => focusCommand("/tools ")}
                    />
                  )}
                  <div className="ui-run-controls-card">
                    <div className="flex items-center gap-2">
                      <Sparkles size={15} className="text-[var(--accent-text)]" />
                      <span className="font-semibold text-[13px]">Run controls</span>
                      <span className="ui-status-label ui-status-success ml-auto">Live</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3">
                      <button className="ui-iconbtn" title="Like" onClick={() => focusCommand("/feedback like ")}><ThumbsUp size={15} /></button>
                      <button className="ui-iconbtn" title="Dislike" onClick={() => focusCommand("/feedback revise ")}><ThumbsDown size={15} /></button>
                      <button className="ui-iconbtn" title="Copy" onClick={copyPreview}><Copy size={15} /></button>
                      <button className="ui-iconbtn" title="Share" onClick={() => focusCommand("/share ")}><Share2 size={15} /></button>
                      <button className="ui-iconbtn ml-auto" title="Open" onClick={() => focusCommand("/tools open result ")}><ExternalLink size={15} /></button>
                    </div>
                  </div>
                  <div ref={messagesEndRef} />
                </div>
              </div>
              <div className="ui-chat-dock">{composerEl}</div>
            </>
          )}
        </section>
        {inspectorOpen && inspectorEl}
        {rightRailEl}
      </div>
    </div>
  );
}
