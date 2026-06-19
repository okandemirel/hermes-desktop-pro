// ─── Attachment types ───────────────────────────────────────────
export interface Attachment {
  id: string;
  kind: "image" | "text-file" | "path-ref";
  name: string;
  mime?: string;
  size: number;
  dataUrl?: string;
  text?: string;
  path?: string;
}

// ─── Provider types ─────────────────────────────────────────────
export type ProviderId =
  | "opencode-zen"
  | "opencode-go"
  | "openrouter"
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "deepseek"
  | "nous"
  | "qwen"
  | "minimax"
  | "groq"
  | "huggingface"
  | "custom";

export interface ProviderCapabilities {
  streaming: boolean;
  reasoning: boolean;
  vision: boolean;
  toolUse: boolean;
  maxContextTokens: number;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: { input: number; output: number };
  capabilities?: Partial<ProviderCapabilities>;
  isReasoning?: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  name?: string;
  description?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  capabilities: ProviderCapabilities;
  models: ProviderModel[];
  icon?: string;
  color?: string;
}

// ─── Chat types ─────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp?: number;
  attachments?: Attachment[];
  reasoning?: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  /** Final agent-run snapshot for this turn, persisted when the run ends so the
   *  message can show a collapsible inline "Activity" disclosure (the steps that
   *  produced it) instead of a single global timeline pinned to the bottom. */
  run?: AgentRunState;
}

export type AgentRunEventKind = "start" | "context" | "reasoning" | "tool" | "output" | "usage" | "done" | "error" | "abort";
export type AgentRunEventStatus = "queued" | "running" | "done" | "error";
export type AgentRunStatus = "idle" | "running" | "done" | "error" | "aborted";

export interface AgentRunEvent {
  id: string;
  kind: AgentRunEventKind;
  label: string;
  detail?: string;
  status: AgentRunEventStatus;
  timestamp: number;
  durationMs?: number;
  tokens?: number;
}

export interface AgentRunState {
  id: string;
  assistantMessageId: string | null;
  prompt: string;
  startedAt: number;
  endedAt?: number;
  status: AgentRunStatus;
  events: AgentRunEvent[];
  usage?: TokenUsage;
}

export interface ToolCall {
  callId: string;
  name: string;
  args: string;
  result?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

// ─── Profile dispatch types ────────────────────────────────────
export type DispatchMode = "single" | "sequential" | "parallel" | "hybrid";

export interface ProfileDispatchTarget {
  profileName: string;
  isPrimary?: boolean;
  providerId?: ProviderId;
  modelId?: string;
  label?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface DispatchMessageOptions {
  dispatchId?: string;
  mode: DispatchMode;
  targets: ProfileDispatchTarget[];
  resumeSessionByProfile?: Record<string, string | undefined>;
  history?: Array<{ role: string; content: string }>;
  attachments?: Attachment[];
  contextFolder?: string;
  temperature?: number;
}

export interface DispatchMessageResult {
  dispatchId: string;
  sessionIdsByProfile: Record<string, string | undefined>;
}

export type DispatchEventKind =
  | "queued"
  | "started"
  | "chunk"
  | "reasoning"
  | "tool"
  | "usage"
  | "done"
  | "error"
  | "aborted";

export interface DispatchStreamEvent {
  dispatchId: string;
  runId: string;
  profileName: string;
  kind: DispatchEventKind;
  text?: string;
  tool?: string;
  usage?: TokenUsage;
  sessionId?: string;
  error?: string;
  timestamp: number;
}

export interface ProfileRunState {
  runId: string;
  profileName: string;
  assistantMessageId: string;
  sessionId?: string;
  status: AgentRunStatus;
  content: string;
  reasoning?: string;
  events: AgentRunEvent[];
  usage?: TokenUsage;
  startedAt?: number;
  endedAt?: number;
  error?: string;
}

export interface DispatchRunState {
  dispatchId: string;
  mode: DispatchMode;
  prompt: string;
  targets: ProfileDispatchTarget[];
  status: AgentRunStatus;
  startedAt: number;
  endedAt?: number;
  profileRuns: ProfileRunState[];
}

// ─── Chat tab types ─────────────────────────────────────────────
export interface ChatTab {
  id: string;
  name: string;
  title?: string;
  providerId: ProviderId;
  modelId: string;
  sessionId?: string;
  baseUrl?: string;
  messages?: ChatMessage[];
  dispatchMode?: DispatchMode;
  dispatchTargets?: ProfileDispatchTarget[];
  isStreaming?: boolean;
  createdAt?: number;
  dirty?: boolean;
}

// ─── Session types ──────────────────────────────────────────────
export interface SessionSummary {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
  profileName: string;
  profileNames: string[];
  dispatchMode?: DispatchMode;
  primaryProfile?: string;
}

export interface SessionSearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
  profileName: string;
  profileNames: string[];
  dispatchMode?: DispatchMode;
  primaryProfile?: string;
}

// ─── Profile types ──────────────────────────────────────────────
export interface ProfileInfo {
  name: string;
  path: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
}

// ─── Config types ───────────────────────────────────────────────
export interface ModelConfig {
  model: string;
  provider: string;
  baseUrl: string;
}

// ─── Application update types ──────────────────────────────────
export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error"
  | "unsupported";

export interface AppUpdateStatus {
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  percent?: number;
  message?: string;
  canCheck: boolean;
  canInstall: boolean;
}

// ─── Native app menu commands ──────────────────────────────────
export type AppMenuCommand =
  | "new-chat"
  | "show-chat"
  | "show-sessions"
  | "show-profiles"
  | "show-tools"
  | "show-skills"
  | "show-soul"
  | "show-memory"
  | "show-models"
  | "show-providers"
  | "show-gateway"
  | "show-office"
  | "show-schedules"
  | "show-cron-jobs"
  | "show-kanban"
  | "show-settings"
  | "show-settings-general"
  | "show-settings-network"
  | "show-settings-providers"
  | "show-settings-appearance"
  | "show-settings-backup"
  | "show-settings-diagnostics"
  | "toggle-sidebar"
  | "set-theme-dark"
  | "set-theme-light"
  | "set-theme-system"
  | "set-accent-gold"
  | "set-accent-green"
  | "set-accent-blue"
  | "set-accent-purple";

// ─── Memory types ───────────────────────────────────────────────
export interface MemoryEntry {
  index: number;
  content: string;
}

export interface MemoryInfo {
  memory: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    entries: MemoryEntry[];
    charCount: number;
    charLimit: number;
  };
  user: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    charCount: number;
    charLimit: number;
  };
  stats: { totalSessions: number; totalMessages: number };
}

// ─── Skills types ───────────────────────────────────────────────
export interface InstalledSkill {
  name: string;
  category: string;
  description: string;
  path: string;
}

export interface SkillSearchResult {
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
}

// ─── Tools types ────────────────────────────────────────────────
export interface ToolsetInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

// ─── Cron types ─────────────────────────────────────────────────
export interface CronJob {
  id: string;
  name: string;
  profile: string | null;
  sourceProfile?: string | null;
  schedule: string;
  prompt: string;
  state: "active" | "paused" | "completed";
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  repeat: { times: number | null; completed: number } | null;
  deliver: string[];
  skills: string[];
  script: string | null;
}

export interface CronJobUpdateInput {
  name?: string;
  schedule?: string;
  prompt?: string;
  deliver?: string | string[];
}

// ─── Kanban types ───────────────────────────────────────────────
export interface KanbanTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: string;
  priority: number;
  tenant: string | null;
  workspace_kind: string;
  workspace_path: string | null;
  created_by: string | null;
  created_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  result: string | null;
  skills: string[];
  max_retries: number | null;
}

export interface KanbanBoard {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_current: boolean;
  archived?: boolean;
  total: number;
  counts: Record<string, number>;
  db_path?: string;
}

export interface KanbanTaskDetail {
  task: KanbanTask;
  comments: KanbanComment[];
  events: KanbanEvent[];
  parents: string[];
  children: string[];
  runs: KanbanRun[];
  latest_summary: string | null;
}

export interface KanbanResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  stdout?: string;
  unsupportedMode?: boolean;
}

interface KanbanRun {
  id: number;
  task_id: string;
  profile: string | null;
  status: string | null;
  outcome: string | null;
  summary: string | null;
  error: string | null;
  started_at: number | null;
  ended_at: number | null;
  last_heartbeat_at: number | null;
}

interface KanbanComment {
  id: number;
  task_id: string;
  author: string | null;
  body: string;
  created_at: number;
}

interface KanbanEvent {
  id: number;
  task_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: number;
  run_id: number | null;
}

// ─── Models types ───────────────────────────────────────────────
export interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiMode?: string | null;
  createdAt: number;
}

// ─── Streaming callbacks ────────────────────────────────────────
export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onReasoningChunk?: (text: string) => void;
  onDone: (sessionId?: string) => void;
  onError: (error: string) => void;
  onToolProgress?: (tool: string) => void;
  onUsage?: (usage: TokenUsage) => void;
}
