import type { ProviderInfo, ProviderId } from "./types";

/**
 * Provider Registry — maps every supported LLM provider to its config.
 *
 * OpenCode Zen and OpenCode Go are first-class providers here,
 * unlike the original hermes-desktop which didn't include them.
 */

const ALL_PROVIDERS: Record<ProviderId, Omit<ProviderInfo, "models">> = {
  "opencode-zen": {
    id: "opencode-zen",
    name: "OpenCode Zen",
    label: "OpenCode Zen",
    description:
      "OpenCode Zen API — access to Gemini, Claude, and more through a unified endpoint",
    baseUrl: "https://opencode.ai/zen/v1",
    apiKeyEnv: "OPENCODE_ZEN_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 1048576,
    },
    color: "#6366f1", // Indigo
  },
  "opencode-go": {
    id: "opencode-go",
    name: "OpenCode Go",
    label: "OpenCode Go",
    description:
      "OpenCode Go API — access to DeepSeek, Qwen, GLM, and more",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKeyEnv: "OPENCODE_GO_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 1048576,
    },
    color: "#8b5cf6", // Violet
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    label: "OpenRouter",
    description: "200+ models via unified API",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 1048576,
    },
    color: "#f97316", // Orange
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    label: "Anthropic",
    description: "Claude models — direct access",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 200000,
    },
    color: "#d4a574", // Warm sand
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    label: "OpenAI",
    description: "GPT-4o, o-series reasoning models",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 128000,
    },
    color: "#10a37f", // OpenAI green
  },
  google: {
    id: "google",
    name: "Google Gemini",
    label: "Google Gemini",
    description: "Gemini models via AI Studio",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GEMINI_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 1048576,
    },
    color: "#4285f4", // Google blue
  },
  xai: {
    id: "xai",
    name: "xAI Grok",
    label: "xAI Grok",
    description: "Grok models from xAI",
    baseUrl: "https://api.x.ai/v1",
    apiKeyEnv: "XAI_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      toolUse: true,
      maxContextTokens: 131072,
    },
    color: "#ffffff", // White (xAI brand)
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    label: "DeepSeek",
    description: "DeepSeek-V3, R1 reasoning models",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: false,
      toolUse: true,
      maxContextTokens: 131072,
    },
    color: "#4d6bfe", // DeepSeek blue
  },
  nous: {
    id: "nous",
    name: "Nous Portal",
    label: "Nous Portal",
    description: "Nous Research models — free tier available",
    baseUrl: "https://portal.nousresearch.com/api/v1",
    apiKeyEnv: "NOUS_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: false,
      vision: false,
      toolUse: true,
      maxContextTokens: 32768,
    },
    color: "#ffd700", // Gold
  },
  qwen: {
    id: "qwen",
    name: "QwenAI",
    label: "QwenAI",
    description: "Alibaba Qwen models",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: false,
      vision: true,
      toolUse: true,
      maxContextTokens: 131072,
    },
    color: "#ff6a00", // Alibaba orange
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    label: "MiniMax",
    description: "MiniMax models (Global + China endpoints)",
    baseUrl: "https://api.minimax.chat/v1",
    apiKeyEnv: "MINIMAX_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: false,
      vision: false,
      toolUse: true,
      maxContextTokens: 245760,
    },
    color: "#7c3aed", // Purple
  },
  groq: {
    id: "groq",
    name: "Groq",
    label: "Groq",
    description: "Fast inference — LPU accelerated",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: false,
      vision: false,
      toolUse: true,
      maxContextTokens: 128000,
    },
    color: "#f97316", // Orange
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    label: "Hugging Face",
    description: "20+ open models via HF Inference API",
    baseUrl: "https://api-inference.huggingface.co/v1",
    apiKeyEnv: "HF_TOKEN",
    capabilities: {
      streaming: true,
      reasoning: false,
      vision: false,
      toolUse: true,
      maxContextTokens: 32768,
    },
    color: "#ffd21e", // HF yellow
  },
  custom: {
    id: "custom",
    name: "Custom / Local",
    label: "Custom / Local",
    description: "Any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, etc.)",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "CUSTOM_API_KEY",
    capabilities: {
      streaming: true,
      reasoning: false,
      vision: false,
      toolUse: true,
      maxContextTokens: 32768,
    },
    color: "#6b7280", // Gray
  },
};

/**
 * Get all registered providers.
 */
export function getAllProviders(): ProviderInfo[] {
  return Object.values(ALL_PROVIDERS).map((p) => ({
    ...p,
    models: getDefaultModels(p.id),
  }));
}

/**
 * Get a single provider by ID.
 */
export function getProvider(id: ProviderId): ProviderInfo | undefined {
  const p = ALL_PROVIDERS[id];
  if (!p) return undefined;
  return { ...p, models: getDefaultModels(id) };
}

/**
 * Get default models for a provider.
 * These are the recommended/well-known models for each provider.
 */
function getDefaultModels(id: ProviderId) {
  const defaults: Record<string, Array<{ id: string; name: string; contextLength: number; isReasoning?: boolean }>> = {
    "opencode-zen": [
      { id: "gemini-3-pro", name: "Gemini 3 Pro", contextLength: 1048576 },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", contextLength: 1048576 },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextLength: 200000 },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4", contextLength: 200000 },
      { id: "gpt-5", name: "GPT-5", contextLength: 128000 },
    ],
    "opencode-go": [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextLength: 131072, isReasoning: true },
      { id: "deepseek-r1-0528", name: "DeepSeek R1", contextLength: 131072, isReasoning: true },
      { id: "qwen3-coder-plus", name: "Qwen 3 Coder Plus", contextLength: 131072 },
      { id: "glm-5", name: "GLM-5", contextLength: 131072 },
      { id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro", contextLength: 131072 },
    ],
    openrouter: [
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", contextLength: 200000 },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", contextLength: 1048576 },
      { id: "openai/gpt-5", name: "GPT-5", contextLength: 128000 },
    ],
    anthropic: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextLength: 200000 },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4", contextLength: 200000 },
      { id: "claude-haiku-3-5-20241022", name: "Claude 3.5 Haiku", contextLength: 200000 },
    ],
    openai: [
      { id: "gpt-5", name: "GPT-5", contextLength: 128000 },
      { id: "gpt-4o", name: "GPT-4o", contextLength: 128000 },
      { id: "o3", name: "o3 (reasoning)", contextLength: 200000, isReasoning: true },
    ],
    google: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextLength: 1048576 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextLength: 1048576 },
    ],
    xai: [
      { id: "grok-4", name: "Grok 4", contextLength: 131072 },
      { id: "grok-3", name: "Grok 3", contextLength: 131072 },
    ],
    deepseek: [
      { id: "deepseek-chat", name: "DeepSeek-V3", contextLength: 131072 },
      { id: "deepseek-reasoner", name: "DeepSeek-R1", contextLength: 131072, isReasoning: true },
    ],
    nous: [
      { id: "hermes-3-70b", name: "Hermes 3 70B", contextLength: 32768 },
    ],
    qwen: [
      { id: "qwen-max", name: "Qwen Max", contextLength: 32768 },
      { id: "qwen-plus", name: "Qwen Plus", contextLength: 131072 },
    ],
    minimax: [
      { id: "minimax-m1", name: "MiniMax M1", contextLength: 245760 },
    ],
    groq: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextLength: 128000 },
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 70B", contextLength: 128000 },
    ],
    huggingface: [
      { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B", contextLength: 128000 },
    ],
    custom: [],
  };

  return (defaults[id] || []).map((m) => ({
    ...m,
    pricing: undefined,
  }));
}

/**
 * Get the API key env var name for a provider.
 */
export function providerApiKeyEnv(id: ProviderId): string {
  return ALL_PROVIDERS[id]?.apiKeyEnv || "";
}

/**
 * Check if a provider needs an API key.
 */
export function providerNeedsApiKey(id: ProviderId): boolean {
  return id !== "custom" && id !== "nous";
}

/**
 * Get the default base URL for a provider.
 */
export function providerBaseUrl(id: ProviderId): string {
  return ALL_PROVIDERS[id]?.baseUrl || "";
}

/**
 * OpenCode providers that the original hermes-desktop missed.
 * These are the new additions we're bringing.
 */
export const OPENCODE_PROVIDERS: ProviderId[] = ["opencode-zen", "opencode-go"];
