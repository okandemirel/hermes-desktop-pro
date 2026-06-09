import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  Square, Plus, Globe, Image, Code, Wrench, Brain, Activity, Terminal, Paperclip,
  ArrowUp, Search, FileText, Table2, Sparkles, SlidersHorizontal, Command,
  Database, BookOpen, Settings2, ChevronDown, CheckCircle2, Copy, ExternalLink,
  ThumbsUp, ThumbsDown, Share2, X, Mic, Box, Users,
  BarChart3, Lightbulb, Play, Clock, Star, Layers, Bookmark, ShieldCheck, Grid2X2,
  Check, MessageSquare,
} from "lucide-react";
import type {
  AgentRunEvent,
  AgentRunEventKind,
  AgentRunState,
  Attachment,
  ChatMessage,
  ChatTab,
  DispatchMode,
  DispatchRunState,
  ProfileDispatchTarget,
  ProfileInfo,
  ProviderId,
  ProviderInfo,
  TokenUsage,
  ToolsetInfo,
} from "@shared/types";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@shared/attachments";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { BrandMark, BrandMedallion } from "./BrandMark";
import { useChatStream } from "../hooks/useChatStream";
import { normalizeDispatchTargets, sendLabelForDispatch } from "../chatDispatch";
import { IconButton, StatusDot, Toggle, cx } from "../ui";
import {
  mergeVoiceTranscript,
  supportedVoiceMimeType,
  voiceErrorMessage,
  voiceStatusLabel,
  type VoiceInputStatus,
} from "../voiceInput";
import { syncComposerTextareaHeight } from "../composerAutosize";

interface ChatViewProps {
  tab: ChatTab; providers: ProviderInfo[]; allTabs: ChatTab[];
  onClose: (id: string) => void; onNewTab: () => void; onSelectTab: (id: string) => void;
  onUpdateProvider: (tabId: string, providerId: ProviderId) => void;
  onUpdateModel: (tabId: string, modelId: string) => void;
  onOpenTools?: () => void;
  onOpenMemory?: () => void;
  onOpenModels?: () => void;
  onOpenSessions?: () => void;
  onOpenSettings?: () => void;
  onUpdateDispatch?: (tabId: string, mode: DispatchMode, targets: ProfileDispatchTarget[]) => void;
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

const INSPECTOR_TOOL_ORDER = ["web", "file", "code_execution", "image_gen", "memory"];

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
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

function iconForToolset(key: string) {
  if (key === "web" || key === "browser") return Globe;
  if (key === "file" || key === "vision" || key === "image_gen") return key === "image_gen" ? Image : FileText;
  if (key === "code_execution") return Code;
  if (key === "terminal") return Terminal;
  if (key === "memory" || key === "session_search") return Database;
  if (key === "skills" || key === "delegation") return Brain;
  if (key === "cronjob" || key === "todo") return Activity;
  return Wrench;
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

function ProfileDispatchTimeline({
  dispatchRun,
  tokenUsage,
  onOpenActivity,
  onAbortDispatch,
}: {
  dispatchRun: DispatchRunState;
  tokenUsage: TokenUsage;
  onOpenActivity: () => void;
  onAbortDispatch: (runId?: string) => void;
}) {
  const status = runStatusLabel(dispatchRun.status);
  const duration = formatDuration(dispatchRun.startedAt, dispatchRun.endedAt);
  const completedRuns = dispatchRun.profileRuns.filter(run => run.status === "done").length;
  const activeRuns = dispatchRun.profileRuns.filter(run => run.status === "running" || run.status === "idle").length;

  return (
    <section className="ui-dispatch-run" data-status={dispatchRun.status} aria-label="Profile dispatch execution">
      <div className="ui-dispatch-run-head">
        <div className="ui-dispatch-run-icon"><Users size={19} /></div>
        <div className="ui-dispatch-run-title">
          <span>{dispatchRun.mode} execution</span>
          <h2>{truncateText(dispatchRun.prompt, 92)}</h2>
          <p>{dispatchRun.profileRuns.length} profile runs · {completedRuns} done · {activeRuns} active</p>
        </div>
        <div className="ui-dispatch-run-state">
          <span><StatusDot color={dispatchRun.status === "running" ? "var(--success)" : dispatchRun.status === "error" || dispatchRun.status === "aborted" ? "var(--error)" : "var(--accent-text)"} pulse={dispatchRun.status === "running"} /> {status}</span>
          <em>{duration}</em>
        </div>
      </div>

      <div className="ui-dispatch-profile-grid">
        {dispatchRun.profileRuns.map(run => {
          const latestEvent = [...run.events].reverse().find(Boolean);
          const dispatchTarget = dispatchRun.targets.find(target => target.profileName === run.profileName);
          const preview = run.content || run.reasoning || latestEvent?.detail || "Waiting for live profile output.";
          return (
            <article key={run.runId} className="ui-dispatch-profile-card" data-status={run.status}>
              <div className="ui-dispatch-profile-card-head">
                <div>
                  <strong>{run.profileName}</strong>
                  <span>{dispatchTarget?.isPrimary ? "Primary profile" : "Profile execution"}</span>
                </div>
                <div className="ui-dispatch-profile-actions">
                  <em>{run.usage?.totalTokens ? `${run.usage.totalTokens.toLocaleString()} tok` : run.status}</em>
                  {(run.status === "running" || run.status === "idle") && (
                    <button type="button" onClick={() => onAbortDispatch(run.runId)} title={`Stop ${run.profileName}`}>
                      <Square size={12} />
                    </button>
                  )}
                </div>
              </div>
              <p>{truncateText(preview, 170)}</p>
              <div className="ui-dispatch-step-strip">
                {(run.events.length ? run.events.slice(-4) : [{
                  id: `${run.runId}-waiting`,
                  kind: "start" as const,
                  label: "Queued",
                  detail: "Waiting for backend execution",
                  status: "queued" as const,
                  timestamp: dispatchRun.startedAt,
                }]).map(event => (
                  <span key={event.id} data-status={event.status}>
                    {runEventIcon(event.kind, event.status)}
                    <em>{truncateText(event.label, 26)}</em>
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <div className="ui-dispatch-run-footer">
        <span><Activity size={13} /> Tokens <strong>{tokenUsage.totalTokens.toLocaleString()}</strong></span>
        <span><Users size={13} /> Targets <strong>{dispatchRun.profileRuns.length}</strong></span>
        <span><Wrench size={13} /> Mode <strong>{dispatchRun.mode}</strong></span>
        <button type="button" onClick={onOpenActivity}><Activity size={13} /> Inspect</button>
        {dispatchRun.status === "running" && (
          <button type="button" className="ui-dispatch-stop" onClick={() => onAbortDispatch()}>
            <Square size={12} /> Stop all
          </button>
        )}
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
  onOpenTools,
  onOpenMemory,
  onOpenModels,
  onOpenSessions,
  onOpenSettings,
  onUpdateDispatch,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspector");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [openControlSelect, setOpenControlSelect] = useState<string | null>(null);
  const [inspectorToolsets, setInspectorToolsets] = useState<ToolsetInfo[]>([]);
  const [toolsetsLoaded, setToolsetsLoaded] = useState(false);
  const [toolBusyKey, setToolBusyKey] = useState<string | null>(null);
  const [inspectorError, setInspectorError] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [temperatureSaving, setTemperatureSaving] = useState(false);
  const [temperatureError, setTemperatureError] = useState("");
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>(tab.dispatchMode || "single");
  const [dispatchTargets, setDispatchTargets] = useState<ProfileDispatchTarget[]>(tab.dispatchTargets || []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceInputStatus>("idle");
  const [voiceNotice, setVoiceNotice] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const profilePickerRef = useRef<HTMLDivElement>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const suppressCommandMenuRef = useRef(false);
  const activeProvider = providers.find(p => p.id === tab.providerId);

  const activeProfileName = profiles.find(profile => profile.isActive)?.name || "default";
  const normalizedDispatchTargets = useMemo(
    () => normalizeDispatchTargets(dispatchTargets, activeProfileName),
    [dispatchTargets, activeProfileName],
  );
  const sendButtonLabel = sendLabelForDispatch(dispatchMode, normalizedDispatchTargets.length);

  const { messages, isStreaming, runState, dispatchRunState, sendMessage, abortStream, abortDispatch } = useChatStream({
    providerId: tab.providerId,
    modelId: tab.modelId,
    conversationKey: tab.id,
    sessionId: tab.sessionId,
    initialMessages: tab.messages,
    temperature,
    dispatchMode,
    dispatchTargets: normalizedDispatchTargets,
    activeProfileName,
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    setDispatchMode(tab.dispatchMode || "single");
    setDispatchTargets(tab.dispatchTargets || []);
    setProfilePickerOpen(false);
  }, [tab.id]);

  useEffect(() => {
    let cancelled = false;
    setProfilesLoaded(false);
    window.hermes.listProfiles()
      .then((rows: ProfileInfo[]) => {
        if (cancelled) return;
        setProfiles(rows || []);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setProfilesLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

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
    if (!profilePickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (profilePickerRef.current?.contains(event.target as Node)) return;
      setProfilePickerOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setProfilePickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profilePickerOpen]);

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
    let cancelled = false;
    setToolsetsLoaded(false);
    window.hermes.getToolsets()
      .then((toolsets: ToolsetInfo[]) => {
        if (cancelled) return;
        setInspectorToolsets(toolsets);
        setInspectorError("");
      })
      .catch(() => {
        if (!cancelled) setInspectorError("Tool settings could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setToolsetsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.hermes.getConfigValue("model.temperature")
      .then((value: unknown) => {
        const parsed = typeof value === "number" ? value : Number(value);
        if (!cancelled && Number.isFinite(parsed)) {
          setTemperature(Math.min(1, Math.max(0, parsed)));
        }
      })
      .catch(() => {
        if (!cancelled) setTemperatureError("Temperature setting could not be loaded.");
      });
    return () => { cancelled = true; };
  }, []);

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

  useLayoutEffect(() => {
    if (!inputRef.current) return;
    syncComposerTextareaHeight(inputRef.current);
  }, [input, tab.id]);

  useEffect(() => {
    if (!voiceNotice) return;
    const id = window.setTimeout(() => setVoiceNotice(""), 5200);
    return () => window.clearTimeout(id);
  }, [voiceNotice]);

  const stopVoiceTracks = useCallback(() => {
    voiceStreamRef.current?.getTracks().forEach(track => track.stop());
    voiceStreamRef.current = null;
  }, []);

  const finishVoiceRecording = useCallback(async (mimeType?: string) => {
    const blob = new Blob(voiceChunksRef.current, { type: mimeType || "audio/webm" });
    voiceChunksRef.current = [];
    stopVoiceTracks();
    try {
      if (blob.size === 0) throw new Error("Voice input was empty.");
      setVoiceStatus("transcribing");
      const result = await window.hermes.transcribeVoiceInput(await blob.arrayBuffer(), blob.type || mimeType, {
        profile: activeProfileName,
        provider: tab.providerId,
        baseUrl: activeProvider?.baseUrl,
        model: tab.modelId || undefined,
      });
      setInput(current => mergeVoiceTranscript(current, result.text));
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setVoiceNotice(voiceErrorMessage(error));
    } finally {
      setVoiceStatus("idle");
      voiceRecorderRef.current = null;
    }
  }, [activeProfileName, activeProvider?.baseUrl, stopVoiceTracks, tab.modelId, tab.providerId]);

  useEffect(() => {
    return () => {
      const recorder = voiceRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopVoiceTracks();
    };
  }, [stopVoiceTracks]);

  const modelName = activeProvider?.models?.find(m => m.id === tab.modelId)?.name || tab.modelId || "Auto";
  const providerLabel = activeProvider?.label || tab.providerId;
  const activeToolCount = inspectorToolsets.filter(toolset => toolset.enabled).length;
  const inspectorVisibleToolsets = useMemo(() => {
    const byKey = new Map(inspectorToolsets.map(toolset => [toolset.key, toolset]));
    const ordered = INSPECTOR_TOOL_ORDER
      .map(key => byKey.get(key))
      .filter((toolset): toolset is ToolsetInfo => Boolean(toolset));
    return ordered.length > 0 ? ordered : inspectorToolsets.slice(0, 5);
  }, [inspectorToolsets]);
  const sessionTitle = tab.name && tab.name !== "New chat" ? tab.name : "Q2 Market Report";
  const activeTabIndex = Math.max(0, allTabs.findIndex(t => t.id === tab.id));
  const activeTabPosition = activeTabIndex + 1;
  const displayRunState = useMemo(() => (
    dispatchRunState ? null : runState || createHistoricalRunState(messages)
  ), [dispatchRunState, runState, messages]);
  const assistantPreview = useMemo(() => {
    const lastAssistant = [...messages].reverse().find(message => message.role === "assistant");
    return truncateText(lastAssistant?.content || lastAssistant?.reasoning || "", 220);
  }, [messages]);
  const displayedUsage = useMemo<TokenUsage>(() => {
    const messageUsage = [...messages].reverse().find(message => message.role === "assistant" && message.usage)?.usage;
    if (dispatchRunState) {
      return dispatchRunState.profileRuns.reduce<TokenUsage>((acc, run) => ({
        promptTokens: acc.promptTokens + (run.usage?.promptTokens || 0),
        completionTokens: acc.completionTokens + (run.usage?.completionTokens || 0),
        totalTokens: acc.totalTokens + (run.usage?.totalTokens || 0),
        cost: (acc.cost || 0) + (run.usage?.cost || 0),
      }), { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 });
    }
    return displayRunState?.usage || messageUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
  }, [dispatchRunState, displayRunState, messages]);

  const persistDispatchSelection = useCallback((nextMode: DispatchMode, nextTargets: ProfileDispatchTarget[]) => {
    const normalized = normalizeDispatchTargets(nextTargets, activeProfileName);
    setDispatchMode(nextMode);
    setDispatchTargets(normalized);
    onUpdateDispatch?.(tab.id, nextMode, normalized);
  }, [activeProfileName, onUpdateDispatch, tab.id]);

  const targetFromProfile = useCallback((profile: ProfileInfo): ProfileDispatchTarget => ({
    profileName: profile.name,
    label: profile.name,
    isDefault: profile.isDefault,
    isActive: profile.isActive,
    providerId: profile.provider as ProviderId,
    modelId: profile.model || undefined,
  }), []);

  const changeDispatchMode = useCallback((nextMode: DispatchMode) => {
    const normalized = normalizeDispatchTargets(dispatchTargets, activeProfileName);
    const nextTargets = nextMode === "single"
      ? normalized.slice(0, 1).map(target => ({ ...target, isPrimary: true }))
      : normalized;
    persistDispatchSelection(nextMode, nextTargets);
  }, [activeProfileName, dispatchTargets, persistDispatchSelection]);

  const toggleDispatchTarget = useCallback((profile: ProfileInfo) => {
    const normalized = normalizeDispatchTargets(dispatchTargets, activeProfileName);
    const exists = normalized.some(target => target.profileName === profile.name);

    if (dispatchMode === "single") {
      persistDispatchSelection("single", [{ ...targetFromProfile(profile), isPrimary: true }]);
      return;
    }

    const nextTargets = exists
      ? normalized.filter(target => target.profileName !== profile.name)
      : [...normalized, targetFromProfile(profile)];
    const safeTargets = nextTargets.length > 0 ? nextTargets : [{ ...targetFromProfile(profile), isPrimary: true }];
    const hasPrimary = safeTargets.some(target => target.isPrimary);
    persistDispatchSelection(
      dispatchMode,
      safeTargets.map((target, index) => ({ ...target, isPrimary: hasPrimary ? !!target.isPrimary : index === 0 })),
    );
  }, [activeProfileName, dispatchMode, dispatchTargets, persistDispatchSelection, targetFromProfile]);

  const markDispatchPrimary = useCallback((profileName: string) => {
    const normalized = normalizeDispatchTargets(dispatchTargets, activeProfileName);
    persistDispatchSelection(
      dispatchMode,
      normalized.map(target => ({ ...target, isPrimary: target.profileName === profileName })),
    );
  }, [activeProfileName, dispatchMode, dispatchTargets, persistDispatchSelection]);

  const focusCommand = useCallback((cmd: string) => {
    suppressCommandMenuRef.current = true;
    setInput(cmd);
    setShowCommands(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const openToolsManagement = useCallback(() => {
    if (onOpenTools) onOpenTools();
    else focusCommand("/tools ");
  }, [focusCommand, onOpenTools]);

  const openMemoryManagement = useCallback(() => {
    if (onOpenMemory) onOpenMemory();
    else focusCommand("/memory ");
  }, [focusCommand, onOpenMemory]);

  const openModelManagement = useCallback(() => {
    if (onOpenModels) onOpenModels();
    else focusCommand("/model ");
  }, [focusCommand, onOpenModels]);

  const openSettingsManagement = useCallback(() => {
    if (onOpenSettings) onOpenSettings();
    else focusCommand("/context ");
  }, [focusCommand, onOpenSettings]);

  const toggleInspectorToolset = useCallback(async (key: string, enabled: boolean) => {
    setToolBusyKey(key);
    setInspectorError("");
    setInspectorToolsets(prev => prev.map(toolset => toolset.key === key ? { ...toolset, enabled } : toolset));
    try {
      const ok = await window.hermes.setToolsetEnabled(key, enabled);
      if (!ok) throw new Error("Tool setting was not persisted.");
    } catch {
      setInspectorToolsets(prev => prev.map(toolset => toolset.key === key ? { ...toolset, enabled: !enabled } : toolset));
      setInspectorError("Tool setting could not be saved.");
    } finally {
      setToolBusyKey(current => current === key ? null : current);
    }
  }, []);

  const commitTemperature = useCallback(async (nextValue: number) => {
    const normalized = Math.min(1, Math.max(0, Number(nextValue.toFixed(1))));
    setTemperatureSaving(true);
    setTemperatureError("");
    try {
      const ok = await window.hermes.setConfigValue("model.temperature", normalized);
      if (!ok) throw new Error("Temperature setting was not persisted.");
      setTemperature(normalized);
    } catch {
      setTemperatureError("Temperature setting could not be saved.");
    } finally {
      setTemperatureSaving(false);
    }
  }, []);

  const handleInspectorRowAction = useCallback((label: string) => {
    if (label === "Workspace" || label === "Mode") {
      openSettingsManagement();
      return;
    }
    if (label === "Session") {
      if (onOpenSessions) onOpenSessions();
      else focusCommand("/session ");
      return;
    }
    focusCommand(`/${label.toLowerCase().replace(/\s+/g, "-")} `);
  }, [focusCommand, onOpenSessions, openSettingsManagement]);

  const copyPreview = useCallback(() => {
    void navigator.clipboard?.writeText("Key insights copied from Hermes agent preview.");
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    const queuedAttachments = attachments;
    if ((!trimmed && queuedAttachments.length === 0) || isStreaming) return;
    if (trimmed.startsWith("/") && queuedAttachments.length === 0) {
      const cmd = trimmed.split(" ")[0].toLowerCase();
      if (cmd === "/new") { onNewTab(); setInput(""); return; }
      if (cmd === "/clear") { sendMessage("/new"); setInput(""); return; }
    }
    void sendMessage(trimmed, { attachments: queuedAttachments });
    setInput("");
    setAttachments([]);
    setAttachmentNotice("");
    setShowCommands(false);
  }, [attachments, input, isStreaming, sendMessage, onNewTab]);

  const handleVoiceInput = useCallback(async () => {
    if (voiceStatus === "recording") {
      const recorder = voiceRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        setVoiceStatus("transcribing");
        recorder.stop();
      }
      return;
    }

    if (voiceStatus !== "idle") return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceNotice("Voice input is not available right now.");
      return;
    }

    setVoiceNotice("");
    setVoiceStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedVoiceMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishVoiceRecording(recorder.mimeType || mimeType || "audio/webm");
      };
      recorder.onerror = () => {
        setVoiceNotice("Voice input is not available right now.");
        setVoiceStatus("idle");
        stopVoiceTracks();
      };

      recorder.start();
      setVoiceStatus("recording");
    } catch (error) {
      setVoiceNotice(voiceErrorMessage(error));
      setVoiceStatus("idle");
      stopVoiceTracks();
    }
  }, [finishVoiceRecording, stopVoiceTracks, voiceStatus]);

  const handleAttachFiles = useCallback(async () => {
    if (attachmentBusy) return;
    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (remaining <= 0) {
      setAttachmentNotice(`Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE} per message)`);
      return;
    }

    setAttachmentBusy(true);
    setAttachmentNotice("");
    try {
      const result = await window.hermes.selectAttachments(remaining);
      if (result.attachments.length > 0) {
        setAttachments(current => [...current, ...result.attachments].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
      }
      if (result.errors.length > 0) {
        setAttachmentNotice(result.errors.join("\n"));
      }
    } catch {
      setAttachmentNotice("Attachment picker could not be opened.");
    } finally {
      setAttachmentBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [attachmentBusy, attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(current => current.filter(attachment => attachment.id !== id));
    setAttachmentNotice("");
  }, []);

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

  const closeChatTab = useCallback((id: string, event?: MouseEvent<HTMLButtonElement>, options?: { keepMenuOpen?: boolean }) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (allTabs.length <= 1) return;
    if (id === tab.id && isStreaming) abortStream();
    onClose(id);
    if (!options?.keepMenuOpen) setTabMenuOpen(false);
  }, [abortStream, allTabs.length, isStreaming, onClose, tab.id]);

  const renderProfileDispatchPicker = () => {
    const selectedNames = new Set(normalizedDispatchTargets.map(target => target.profileName));
    const primaryName = normalizedDispatchTargets.find(target => target.isPrimary)?.profileName || normalizedDispatchTargets[0]?.profileName || activeProfileName;
    const displayProfiles: ProfileInfo[] = profiles.length > 0 ? profiles : [{
      name: activeProfileName,
      path: "",
      isDefault: activeProfileName === "default",
      isActive: true,
      model: modelName,
      provider: tab.providerId,
      hasEnv: false,
      hasSoul: false,
      skillCount: 0,
      gatewayRunning: false,
    }];

    return (
      <div className="ui-profile-dispatch no-drag" ref={profilePickerRef}>
        <button
          type="button"
          className="ui-profile-dispatch-trigger"
          aria-haspopup="dialog"
          aria-expanded={profilePickerOpen}
          onClick={() => setProfilePickerOpen(open => !open)}
          title="Profile dispatch"
        >
          <Users size={15} />
          <span>{dispatchMode}</span>
          <strong>{normalizedDispatchTargets.length}</strong>
          <ChevronDown size={13} />
        </button>
        {profilePickerOpen && (
          <div className="ui-profile-dispatch-panel slide-up" role="dialog" aria-label="Profile dispatch settings">
            <div className="ui-profile-dispatch-head">
              <div>
                <span>Profile dispatch</span>
                <strong>{sendButtonLabel}</strong>
              </div>
              <button type="button" onClick={() => setProfilePickerOpen(false)} title="Close profile dispatch">
                <X size={14} />
              </button>
            </div>

            <div className="ui-profile-mode-grid" role="radiogroup" aria-label="Execution mode">
              {(["single", "sequential", "parallel", "hybrid"] as DispatchMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  data-active={dispatchMode === mode}
                  onClick={() => changeDispatchMode(mode)}
                >
                  <span>{mode}</span>
                  <em>
                    {mode === "single" ? "one profile" : mode === "sequential" ? "one by one" : mode === "parallel" ? "same time" : "primary then team"}
                  </em>
                </button>
              ))}
            </div>

            <div className="ui-profile-dispatch-list" aria-label="Profiles">
              {!profilesLoaded && <div className="ui-profile-dispatch-empty">Loading profiles…</div>}
              {profilesLoaded && displayProfiles.map(profile => {
                const selected = selectedNames.has(profile.name);
                const primary = primaryName === profile.name;
                return (
                  <div key={profile.name} className="ui-profile-dispatch-row" data-selected={selected} data-primary={primary}>
                    <button
                      type="button"
                      className="ui-profile-dispatch-select"
                      onClick={() => toggleDispatchTarget(profile)}
                    >
                      <span className="ui-profile-dispatch-check">{selected ? <Check size={13} /> : null}</span>
                      <span className="ui-profile-dispatch-name">
                        <strong>{profile.name}</strong>
                        <em>{profile.isActive ? "active" : profile.isDefault ? "default" : `${profile.skillCount} skills`}</em>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ui-profile-dispatch-primary"
                      onClick={() => markDispatchPrimary(profile.name)}
                      disabled={!selected}
                      title={`Set ${profile.name} as primary`}
                    >
                      {primary ? "Primary" : "Lead"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

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
          aria-label={`Switch chats, current chat ${tab.name}`}
          onClick={() => setTabMenuOpen(open => !open)}
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
                    onClick={event => closeChatTab(t.id, event, { keepMenuOpen: true })}
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
        <IconButton title="Apps" onClick={openToolsManagement}><Grid2X2 size={16} /></IconButton>
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
      {voiceNotice && (
        <div className="ui-voice-toast slide-up" role="status" aria-live="polite">
          <span><Mic size={16} /></span>
          <div>
            <strong>Main agent</strong>
            <p>{voiceNotice}</p>
          </div>
          <button type="button" onClick={() => setVoiceNotice("")} aria-label="Dismiss voice notice">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="ui-compose-box">
        {attachments.length > 0 && (
          <div className="ui-attachment-tray" aria-label="Attachments">
            {attachments.map(attachment => {
              const AttachmentIcon = attachment.kind === "image" ? Image : FileText;
              return (
                <span key={attachment.id} className="ui-attachment-chip" title={`${attachment.name} · ${formatFileSize(attachment.size)}`}>
                  <span className="ui-attachment-chip-icon"><AttachmentIcon size={14} /></span>
                  <span className="ui-attachment-chip-label">{attachment.name}</span>
                  <em>{formatFileSize(attachment.size)}</em>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                    title="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {attachmentNotice && (
          <div className="ui-attachment-notice" role="status" aria-live="polite">
            {attachmentNotice}
          </div>
        )}
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Ask Hermes..." rows={1}
          className="ui-compose-input" />
        <div className="ui-compose-tools">
          <div className="flex items-center gap-2">
            {COMPOSER_TOOLS.map(t => (
              <button
                key={t.label}
                className="ui-compose-tool"
                onClick={() => {
                  if (t.label === "Attach") void handleAttachFiles();
                  else focusCommand(t.cmd);
                }}
                disabled={t.label === "Attach" && (attachmentBusy || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE)}
                title={t.label === "Attach" && attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE ? "Attachment limit reached" : t.label}
              >
                <t.icon size={17} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            {renderProfileDispatchPicker()}
            <button
              className={cx("ui-compose-tool", voiceStatus !== "idle" && "is-voice-active")}
              onClick={handleVoiceInput}
              disabled={voiceStatus === "requesting" || voiceStatus === "transcribing"}
              title={voiceStatusLabel(voiceStatus)}
              aria-label={voiceStatusLabel(voiceStatus)}
              aria-pressed={voiceStatus === "recording"}
            >
              <Mic size={17} />
            </button>
            <span className="ui-model-chip">{providerLabel} · {modelName}</span>
            {isStreaming ? (
              <button onClick={() => dispatchRunState ? abortDispatch() : abortStream()} className="ui-send-button ui-send-button-stop" title={dispatchRunState ? "Stop all profile runs" : "Stop"}>
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0} className="ui-send-button" title={sendButtonLabel} aria-label={sendButtonLabel}>
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      {(isStreaming || displayedUsage.totalTokens > 0 || voiceStatus !== "idle") && (
        <div className="ui-compose-status">
          {isStreaming && <span><StatusDot color="var(--accent)" pulse /> Streaming</span>}
          {voiceStatus !== "idle" && <span><StatusDot color="var(--accent-text)" pulse /> {voiceStatusLabel(voiceStatus)}</span>}
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

  const runEvents = dispatchRunState
    ? dispatchRunState.profileRuns.flatMap(run => run.events.map(event => ({
        ...event,
        label: `${run.profileName}: ${event.label}`,
      })))
    : displayRunState?.events || [];
  const runToolEvents = runEvents.filter(event => event.kind === "tool").length;
  const runStatus = dispatchRunState ? runStatusLabel(dispatchRunState.status) : displayRunState ? runStatusLabel(displayRunState.status) : "Ready";
  const runDuration = dispatchRunState
    ? formatDuration(dispatchRunState.startedAt, dispatchRunState.endedAt)
    : displayRunState ? formatDuration(displayRunState.startedAt, displayRunState.endedAt) : "0s";
  const runPrompt = dispatchRunState?.prompt || displayRunState?.prompt || "No active run";
  const runStartedAt = dispatchRunState?.startedAt || displayRunState?.startedAt;

  const inspectorRows = inspectorTab === "activity"
    ? [
        { icon: Activity, label: "Run status", meta: runStatus },
        { icon: Users, label: "Profile runs", meta: dispatchRunState ? `${dispatchRunState.profileRuns.length} targets` : "Single profile" },
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
          <div className="ui-activity-run-card" data-status={dispatchRunState?.status || displayRunState?.status || "idle"}>
            <div className="ui-activity-run-card-head">
              <span><StatusDot color={(dispatchRunState?.status || displayRunState?.status) === "running" ? "var(--success)" : (dispatchRunState?.status || displayRunState?.status) === "error" || (dispatchRunState?.status || displayRunState?.status) === "aborted" ? "var(--error)" : "var(--accent-text)"} pulse={(dispatchRunState?.status || displayRunState?.status) === "running"} /> {runStatus}</span>
              <em>{runDuration}</em>
            </div>
            <h3>{truncateText(runPrompt, 80)}</h3>
            <p>{runStartedAt ? `${providerLabel} · ${modelName} · ${formatClock(runStartedAt)}` : "Start a conversation to see live operation steps."}</p>
            <div className="ui-activity-run-metrics">
              <div><span>Steps</span><strong>{runEvents.length}</strong></div>
              <div><span>{dispatchRunState ? "Profiles" : "Tools"}</span><strong>{dispatchRunState?.profileRuns.length || runToolEvents || activeToolCount}</strong></div>
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
              <button onClick={openToolsManagement}>Manage</button>
            </div>
            <div className="ui-inspector-list">
              {!toolsetsLoaded && <div className="ui-inspector-row ui-inspector-row-muted">Loading tool settings…</div>}
              {toolsetsLoaded && inspectorVisibleToolsets.length === 0 && <div className="ui-inspector-row ui-inspector-row-muted">No toolsets found.</div>}
              {inspectorVisibleToolsets.map(tool => {
                const ToolIcon = iconForToolset(tool.key);
                return (
                <div key={tool.key} className="ui-inspector-row" data-busy={toolBusyKey === tool.key}>
                  <ToolIcon size={16} className="text-[var(--text-2)]" />
                  <span>{tool.label}</span>
                  <Toggle
                    on={tool.enabled}
                    onChange={v => {
                      if (toolBusyKey) return;
                      void toggleInspectorToolset(tool.key, v);
                    }}
                  />
                </div>
                );
              })}
            </div>
            {inspectorError && <p className="ui-inspector-message ui-inspector-message-error">{inspectorError}</p>}
          </section>

          <section className="ui-inspector-section">
            <div className="ui-inspector-heading">
              <span>Memory</span>
              <button onClick={openMemoryManagement}>View all</button>
            </div>
            <div className="ui-inspector-list">
              {MEMORY_ROWS.map(row => (
                <button key={row.label} className="ui-inspector-row" onClick={openMemoryManagement}>
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
              <button onClick={openModelManagement}>Configure</button>
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
                <span>Temperature <em>{temperature.toFixed(1)}{temperatureSaving ? " · saving" : ""}</em></span>
                <input
                  className="ui-range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={event => setTemperature(Number(event.currentTarget.value))}
                  onPointerUp={event => void commitTemperature(Number(event.currentTarget.value))}
                  onBlur={event => void commitTemperature(Number(event.currentTarget.value))}
                  onKeyUp={event => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
                      void commitTemperature(Number(event.currentTarget.value));
                    }
                  }}
                />
              </label>
              {temperatureError && <p className="ui-inspector-message ui-inspector-message-error">{temperatureError}</p>}
            </div>
          </section>
        </>
      )}

      <section className="ui-inspector-section">
        <div className="ui-inspector-heading">
          <span>{inspectorTab === "activity" ? "Activity" : inspectorTab === "pinned" ? "Pinned" : "Context"}</span>
          <button onClick={() => {
            if (inspectorTab === "activity") {
              setInspectorTab("activity");
              return;
            }
            if (inspectorTab === "pinned") {
              focusCommand("/pin ");
              return;
            }
            openSettingsManagement();
          }}>
            {inspectorTab === "activity" ? "Refresh" : inspectorTab === "pinned" ? "Add" : "Edit"}
          </button>
        </div>
        <div className="ui-inspector-list">
          {inspectorRows.map(row => (
            <button key={row.label} className="ui-inspector-row" onClick={() => handleInspectorRowAction(row.label)}>
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
                  {dispatchRunState && (
                    <ProfileDispatchTimeline
                      dispatchRun={dispatchRunState}
                      tokenUsage={displayedUsage}
                      onOpenActivity={() => toggleInspector("activity")}
                      onAbortDispatch={abortDispatch}
                    />
                  )}
                  {displayRunState && (
                    <AgentRunTimeline
                      runState={displayRunState}
                      providerLabel={providerLabel}
                      modelName={modelName}
                      assistantPreview={assistantPreview}
                      tokenUsage={displayedUsage}
                      activeToolCount={activeToolCount}
                      onOpenActivity={() => toggleInspector("activity")}
                      onOpenTools={openToolsManagement}
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
