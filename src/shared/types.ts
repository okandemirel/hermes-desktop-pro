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
}

export interface SessionSearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

// ─── Profile types ──────────────────────────────────────────────
export interface ProfileInfo {
  name: string;
  isActive: boolean;
  configPath: string;
  envPath: string;
  stateDbPath: string;
  gatewayRunning: boolean;
  port: number;
}

// ─── Config types ───────────────────────────────────────────────
export interface ModelConfig {
  model: string;
  provider: string;
  baseUrl: string;
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
