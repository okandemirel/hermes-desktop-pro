import { ChildProcess, spawn } from "child_process";
import { randomUUID } from "crypto";
import {
  existsSync,
  readFileSync,
  appendFileSync,
  unlinkSync,
  mkdirSync,
  openSync,
  closeSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import http from "http";
import https from "https";
import {
  HERMES_HOME,
  HERMES_REPO,
  HERMES_PYTHON,
  hermesCliArgs,
  getEnhancedPath,
} from "./installer";
import {
  getApiServerKey,
  getConnectionConfig,
  getModelConfig,
} from "./config";
import {
  getSshTunnelUrl,
  isSshTunnelActive,
  isSshTunnelHealthy,
  startSshTunnel,
} from "./ssh-tunnel";
import {
  pidIsAliveAs,
  profileHome,
  profilePaths,
  getActiveProfileNameSync,
  stripAnsi,
} from "./utils";
import { getProfilePort } from "./gateway-ports";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import { type Attachment, escapeXmlAttr } from "../shared/attachments";
import { parseSseBlock, processCustomEvent } from "./sse-parser";
import { readModels } from "./models";
import {
  OPENAI_COMPAT_PROVIDERS,
  URL_KEY_MAP,
  expectedEnvKeyForUrl,
  isLocalBaseUrl,
} from "../shared/url-key-map";
import { providerApiKeyEnv, providerBaseUrl } from "../shared/providers";
import type { ProviderId } from "../shared/types";
import {
  saveDesktopSession,
  type DesktopSessionMessage,
} from "./desktop-sessions";

/**
 * Resolve which profile a gateway call targets. An explicit profile always
 * wins; otherwise we fall back to the file-backed active profile so that
 * callers without a profile argument (health polling, status, app-exit)
 * operate on whatever the desktop is currently showing — not a hardcoded
 * "default". Returns `undefined` for the default profile (matching the
 * profileHome/readEnv/getProfilePort convention).
 *
 * Normalisation (validating + collapsing "default"/"" → undefined) is left to
 * the downstream consumer (getProfilePort / profileHome both call
 * normalizeProfileName themselves), so the raw name flows through unchanged.
 */
function resolveProfile(profile?: string): string | undefined {
  const name = profile ?? getActiveProfileNameSync();
  return name === "default" || name === "" ? undefined : name;
}

/** Map a resolved profile to the key used in the per-profile process maps. */
function profileKey(profile?: string): string {
  return resolveProfile(profile) ?? "default";
}

/**
 * Normalise a remote-mode URL the user typed into the connection
 * settings.  Strips trailing slashes and, importantly, a trailing
 * `/v1` segment — callers append `/v1/<path>` themselves, so leaving
 * the user's `/v1` would produce `http://host/v1/v1/chat/completions`
 * → 404.  Reported as #266 (multiple users entered the URL "with
 * /v1" because the gateway's curl examples show that form).
 *
 * Also tolerates trailing whitespace and the rare `/v1/` (slash-suffixed)
 * form.  Returns the cleaned string.
 */
export function normaliseRemoteUrl(raw: string): string {
  let url = (raw || "").trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, "");
  // Strip trailing `/v1` (callers append /v1/<path> themselves)
  url = url.replace(/\/v1$/i, "");
  return url;
}

export function getApiUrl(profile?: string): string {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    const sshUrl = getSshTunnelUrl();
    if (sshUrl) return normaliseRemoteUrl(sshUrl);
    throw new Error("SSH tunnel is not active");
  }
  if (conn.mode === "remote" && conn.remoteUrl) {
    return normaliseRemoteUrl(conn.remoteUrl);
  }
  // Local mode: each profile's gateway binds its own port so they can run
  // concurrently. Address the active (or explicitly requested) profile's
  // gateway rather than a fixed 8642 — that constant would always resolve to
  // whichever gateway grabbed the port first, regardless of active profile.
  return `http://127.0.0.1:${getProfilePort(resolveProfile(profile))}`;
}

export function isRemoteMode(): boolean {
  const mode = getConnectionConfig().mode;
  return mode === "remote" || mode === "ssh";
}

/** True only for pure remote HTTP — SSH tunnel has full local access via SSH exec */
export function isRemoteOnlyMode(): boolean {
  return getConnectionConfig().mode === "remote";
}

// Cached API key read from the remote .env when SSH tunnel starts
let _sshRemoteApiKey = "";

export function setSshRemoteApiKey(key: string): void {
  _sshRemoteApiKey = key;
}

export function getRemoteAuthHeader(): Record<string, string> {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    if (_sshRemoteApiKey)
      return { Authorization: `Bearer ${_sshRemoteApiKey}` };
    return {};
  }
  if (conn.mode === "remote" && conn.apiKey) {
    return { Authorization: `Bearer ${conn.apiKey}` };
  }
  return {};
}

function resolveRemoteApiKey(url: string, apiKey?: string): string {
  if (apiKey !== undefined) return apiKey;

  const conn = getConnectionConfig();
  if (conn.mode !== "remote" || !conn.apiKey || !conn.remoteUrl) return "";
  if (normaliseRemoteUrl(conn.remoteUrl) !== normaliseRemoteUrl(url)) {
    return "";
  }
  return conn.apiKey;
}

export async function ensureSshTunnelIfNeeded(): Promise<void> {
  const conn = getConnectionConfig();
  if (
    conn.mode === "ssh" &&
    (!isSshTunnelActive() || !(await isSshTunnelHealthy()))
  ) {
    await startSshTunnel(conn.ssh);
  }
}

interface ChatHandle {
  abort: () => void;
}

// ────────────────────────────────────────────────────
//  API Server health check
// ────────────────────────────────────────────────────

function isApiServerReady(profile?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `${getApiUrl(profile)}/health`;
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      { method: "GET", timeout: 1500, headers: getRemoteAuthHeader() },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiServerReady(
  timeoutMs = 8000,
  profile?: string,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isApiServerReady(profile)) return true;
    await delay(250);
  }
  return false;
}

// ────────────────────────────────────────────────────
//  Ensure API server is enabled in config
// ────────────────────────────────────────────────────

function ensureApiServerConfig(profile?: string): void {
  try {
    const { configFile } = profilePaths(resolveProfile(profile));
    if (!existsSync(configFile)) return;
    const content = readFileSync(configFile, "utf-8");
    // If api_server is already configured, skip — the port is then governed
    // by the existing block (reconciled for collisions by getProfilePort) and
    // by the API_SERVER_PORT env we pass at spawn.
    if (/api_server/i.test(content)) return;
    // Bind this profile's gateway to its own allocated port so profiles can
    // run concurrently without fighting over 8642.
    const port = getProfilePort(profile);
    const addition = `
# Desktop app API server (auto-configured)
platforms:
  api_server:
    enabled: true
    extra:
      port: ${port}
      host: "127.0.0.1"
`;
    appendFileSync(configFile, addition, "utf-8");
  } catch {
    /* non-fatal */
  }
}

// ────────────────────────────────────────────────────
//  HTTP API streaming (fast path — no process spawn)
// ────────────────────────────────────────────────────

/**
 * Pull the streaming reasoning / thinking text from one SSE `delta`
 * object, if present. Two shapes seen in the wild:
 *
 *   - DeepSeek (reasoning models): `delta.reasoning_content`
 *   - OpenAI o1/o3-style streams + some OpenRouter routes:
 *     `delta.reasoning` (older OpenAI thinking-mode docs also use this
 *     field name).
 *
 * Returns `""` (falsy) for any other shape, so the caller can skip
 * forwarding without a null check.
 *
 * Exported so we can unit-test the field-extraction without booting
 * the whole HTTP path. (#352)
 */
export function extractReasoningDelta(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const d = delta as Record<string, unknown>;
  if (typeof d.reasoning_content === "string" && d.reasoning_content)
    return d.reasoning_content;
  if (typeof d.reasoning === "string" && d.reasoning) return d.reasoning;
  return "";
}

export interface ChatCallbacks {
  onChunk: (text: string) => void;
  /** Streaming reasoning / thinking tokens, when the provider emits them
   *  alongside `content`. DeepSeek surfaces these as `delta.reasoning_content`;
   *  OpenAI o1/o3-style streams use `delta.reasoning`. Forwarded on a
   *  dedicated channel so the renderer can render the thinking bubble
   *  live instead of waiting for a state-DB refresh on focus change
   *  (issue #352). */
  onReasoningChunk?: (text: string) => void;
  onDone: (sessionId?: string) => void;
  onError: (error: string) => void;
  onToolProgress?: (tool: string) => void;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  }) => void;
}

type ChatRuntimeOptions = {
  temperature?: number;
};

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

/**
 * Build the OpenAI-compatible `content` payload for a user turn.
 *
 * - No attachments → plain string (preserves prompt-cache friendliness for
 *   the all-text path).
 * - Text-file attachments → inlined into the text part as `<file …>…</file>`
 *   wrappers (the gateway rejects `file`/`input_file` content parts, see
 *   gateway/platforms/api_server.py:263).
 * - Image attachments → emitted as `image_url` parts in the OpenAI vision
 *   format, which the gateway accepts and converts for Anthropic providers.
 * - Path-ref attachments → appended as `[Attached file: <abs-path>]` lines
 *   so the agent's existing file-reading skills can pick them up.  Works
 *   for PDFs/docx/binaries the gateway won't pass through inline.
 */
export function buildUserContent(
  text: string,
  attachments?: Attachment[],
): ChatContent {
  if (!attachments || attachments.length === 0) return text;

  const textFiles = attachments.filter((a) => a.kind === "text-file");
  const pathRefs = attachments.filter(
    (a) => a.kind === "path-ref" && typeof a.path === "string" && a.path,
  );
  const images = attachments.filter(
    (a) => a.kind === "image" && typeof a.dataUrl === "string" && a.dataUrl,
  );

  const parts: string[] = [];
  if (text.trim()) parts.push(text);
  for (const f of textFiles) {
    if (typeof f.text !== "string") continue;
    const name = escapeXmlAttr(f.name);
    const mime = escapeXmlAttr(f.mime || "text/plain");
    parts.push(`<file name="${name}" mime="${mime}">\n${f.text}\n</file>`);
  }
  if (pathRefs.length > 0) {
    const lines = pathRefs.map((f) => `[Attached file: ${f.path}]`);
    parts.push(lines.join("\n"));
  }
  const composedText = parts.join("\n\n");

  if (images.length === 0) return composedText;

  const imageParts = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: img.dataUrl! },
  }));

  // Omit the text part entirely when there's nothing to say — some
  // providers (Anthropic via Bedrock, certain vision endpoints) reject an
  // empty-string text part as `invalid_content_part`.
  if (!composedText) return imageParts;

  return [{ type: "text" as const, text: composedText }, ...imageParts];
}

/**
 * Build the system message that scopes a conversation to a working folder
 * (issue #27). Returns null when no folder is set (undefined / empty /
 * whitespace) so callers can skip injection. Exported for unit testing.
 */
export function contextFolderSystemMessage(
  contextFolder?: string,
): { role: "system"; content: string } | null {
  const folder = contextFolder?.trim();
  if (!folder) return null;
  return {
    role: "system",
    content:
      `The working folder for this conversation is ${folder}. ` +
      `When the user asks you to read, create, modify, or run project ` +
      `files, use the file, terminal, and code-execution tools with ` +
      `absolute paths under this folder.`,
  };
}

// ────────────────────────────────────────────────────
//  Direct-to-provider transport (hybrid mode)
// ────────────────────────────────────────────────────

/**
 * A resolved direct-provider endpoint: the OpenAI-compatible base URL to POST
 * to and the bearer key to authenticate with. Built from the active profile's
 * model config + .env when no local gateway is available, so BYO-key users can
 * chat without installing the ~2GB hermes-agent backend.
 */
export interface DirectTarget {
  baseUrl: string;
  apiKey: string;
  protocol: "openai" | "anthropic" | "gemini";
}

/**
 * Anthropic's Messages API and Google's Gemini API are NOT OpenAI
 * `/chat/completions` compatible — only the gateway can translate to them.
 * Everything else in the registry (OpenRouter, OpenAI, Groq, DeepSeek,
 * Together, Fireworks, Cerebras, Mistral, OpenCode, local servers) speaks the
 * OpenAI streaming protocol implemented in sendMessageViaApi.
 */
export function isOpenAiCompatibleEndpoint(baseUrl: string): boolean {
  return !/anthropic\.com|generativelanguage\.googleapis\.com/i.test(baseUrl);
}

/**
 * Resolve the provider API key for a direct base URL from a profile env map.
 * Precedence: the provider's registry env key → the URL-derived env key →
 * generic CUSTOM_API_KEY / OPENAI_API_KEY fallbacks. Pure (no I/O) so it can be
 * unit-tested without touching the filesystem.
 */
export function resolveDirectApiKey(
  baseUrl: string,
  provider: string | undefined,
  env: Record<string, string>,
): string {
  const providerKeyEnv =
    provider && provider !== "auto" && provider !== "custom"
      ? providerApiKeyEnv(provider as ProviderId)
      : "";
  if (providerKeyEnv && env[providerKeyEnv]) return env[providerKeyEnv];
  const urlKeyEnv = expectedEnvKeyForUrl(baseUrl);
  if (env[urlKeyEnv]) return env[urlKeyEnv];
  return env.CUSTOM_API_KEY || env.OPENAI_API_KEY || "";
}

/**
 * Build a DirectTarget from the active profile's model config, or null when a
 * direct path isn't viable (no endpoint, no model id, a non-OpenAI protocol,
 * or a remote endpoint with no key). Used as the hybrid fallback in
 * sendMessage() when no local gateway is reachable.
 */
/** Pick the wire protocol for a direct endpoint from its base URL. */
function directProtocol(baseUrl: string): DirectTarget["protocol"] {
  if (/anthropic\.com/i.test(baseUrl)) return "anthropic";
  if (/generativelanguage\.googleapis\.com/i.test(baseUrl)) return "gemini";
  return "openai";
}

function resolveDirectTarget(profile?: string): DirectTarget | null {
  const mc = getModelConfig(profile);
  let baseUrl = (mc.baseUrl || "").trim();
  if (!baseUrl && mc.provider && mc.provider !== "auto") {
    baseUrl = providerBaseUrl(mc.provider as ProviderId);
  }
  if (!baseUrl) return null;
  baseUrl = baseUrl.replace(/\/+$/, "");
  if (!mc.model) return null;
  const apiKey = resolveDirectApiKey(
    baseUrl,
    mc.provider,
    readProfileEnvFile(profile),
  );
  if (!apiKey && !isLocalBaseUrl(baseUrl)) return null;
  return { baseUrl, apiKey, protocol: directProtocol(baseUrl) };
}

export interface ChatReadiness {
  ready: boolean;
  via: "gateway" | "direct" | "remote" | "none";
  reason: string;
}

/**
 * Can the active profile chat right now, and through which transport? Mirrors
 * the routing in sendMessage() so the renderer can show an honest connection
 * status and an actionable setup prompt instead of letting a send hang or fail
 * cryptically. `ready` means a path is configured — live reachability of a
 * remote/gateway endpoint is a separate testConnection() concern.
 */
export function getChatReadiness(profile?: string): ChatReadiness {
  const conn = getConnectionConfig();
  if (conn.mode === "remote") {
    return conn.remoteUrl
      ? { ready: true, via: "remote", reason: "" }
      : {
          ready: false,
          via: "none",
          reason: "Remote mode is selected but no server URL is configured.",
        };
  }
  if (conn.mode === "ssh") {
    return conn.ssh.host
      ? { ready: true, via: "remote", reason: "" }
      : {
          ready: false,
          via: "none",
          reason: "SSH mode is selected but no host is configured.",
        };
  }
  // Local mode: prefer a local gateway install/process, else a direct provider.
  if (
    (existsSync(HERMES_PYTHON) && existsSync(HERMES_REPO)) ||
    isGatewayRunning(profile)
  ) {
    return { ready: true, via: "gateway", reason: "" };
  }
  if (resolveDirectTarget(profile)) {
    return { ready: true, via: "direct", reason: "" };
  }
  return {
    ready: false,
    via: "none",
    reason:
      "No model connected. Add a provider and API key in Settings, or install the local Hermes agent.",
  };
}

/**
 * Re-write a direct-mode conversation to the desktop-local store (overwrite by
 * id). Direct providers are stateless, so the full conversation is persisted
 * each turn from the replayed history + the just-finished turn.
 */
function persistDirectSession(
  sessionId: string,
  model: string,
  history: Array<{ role: string; content: string }> | undefined,
  userMessage: string,
  assistantText: string,
): void {
  if (!sessionId || !assistantText) return;
  const messages: DesktopSessionMessage[] = [];
  for (const h of history || []) {
    const role = h.role === "agent" ? "assistant" : h.role;
    if (role === "user" || role === "assistant") {
      messages.push({ role, content: h.content });
    }
  }
  messages.push({ role: "user", content: userMessage });
  messages.push({ role: "assistant", content: assistantText });
  saveDesktopSession(sessionId, model, messages);
}

function clampTemperature(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : undefined;
}

/**
 * Compose the user-turn text for non-OpenAI direct protocols: the message plus
 * inlined text-file attachments and path references. Mirrors buildUserContent's
 * text composition (images are handled per-protocol by the caller).
 */
function composeDirectText(text: string, attachments?: Attachment[]): string {
  if (!attachments || attachments.length === 0) return text;
  const parts: string[] = [];
  if (text.trim()) parts.push(text);
  for (const f of attachments) {
    if (f.kind === "text-file" && typeof f.text === "string") {
      parts.push(
        `<file name="${escapeXmlAttr(f.name)}" mime="${escapeXmlAttr(f.mime || "text/plain")}">\n${f.text}\n</file>`,
      );
    }
  }
  const pathRefs = attachments.filter(
    (a) => a.kind === "path-ref" && typeof a.path === "string" && a.path,
  );
  if (pathRefs.length > 0) {
    parts.push(pathRefs.map((f) => `[Attached file: ${f.path}]`).join("\n"));
  }
  return parts.join("\n\n");
}

type AnthropicContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: { type: "base64"; media_type: string; data: string };
        }
    >;

function buildAnthropicUserContent(
  text: string,
  attachments?: Attachment[],
): AnthropicContent {
  const composed = composeDirectText(text, attachments);
  const images = (attachments || []).filter(
    (a) => a.kind === "image" && typeof a.dataUrl === "string" && a.dataUrl,
  );
  if (images.length === 0) return composed;
  const blocks: Exclude<AnthropicContent, string> = [];
  if (composed) blocks.push({ type: "text", text: composed });
  for (const img of images) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(img.dataUrl!);
    if (m) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: m[1], data: m[2] },
      });
    }
  }
  return blocks.length > 0 ? blocks : composed;
}

/**
 * Stream a chat turn directly to Anthropic's Messages API (no gateway). System
 * messages become the top-level `system` param; reasoning arrives as
 * `thinking_delta`. Persists to the desktop session store on completion.
 */
function sendMessageViaAnthropic(
  message: string,
  cb: ChatCallbacks,
  profile: string | undefined,
  history: Array<{ role: string; content: string }> | undefined,
  attachments: Attachment[] | undefined,
  runtimeOptions: ChatRuntimeOptions | undefined,
  direct: DirectTarget,
): ChatHandle {
  const mc = getModelConfig(profile);
  const controller = new AbortController();
  const url = `${direct.baseUrl}/messages`;

  const systemParts: string[] = [];
  const messages: Array<{ role: string; content: AnthropicContent }> = [];
  for (const h of history || []) {
    if (h.role === "system") {
      systemParts.push(h.content);
      continue;
    }
    const role = h.role === "agent" ? "assistant" : h.role;
    if (role === "user" || role === "assistant") {
      messages.push({ role, content: h.content });
    }
  }
  messages.push({
    role: "user",
    content: buildAnthropicUserContent(message, attachments),
  });

  const temperature = clampTemperature(runtimeOptions?.temperature);
  const body = JSON.stringify({
    model: mc.model,
    max_tokens: 4096,
    stream: true,
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    messages,
  });
  const bodyBuf = Buffer.from(body, "utf-8");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(bodyBuf.length),
    "x-api-key": direct.apiKey,
    "anthropic-version": "2023-06-01",
  };

  const sessionId = `desk-${Date.now()}-${randomUUID()}`;
  let assistantText = "";
  let finished = false;
  let lastError = "";

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    if (error) {
      cb.onError(error);
    } else {
      persistDirectSession(sessionId, mc.model || "", history, message, assistantText);
      cb.onDone(sessionId);
    }
  }

  // Returns true when the stream signals completion (message_stop).
  function handleAnthropicEvent(data: string): boolean {
    if (!data || data === "[DONE]") return false;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return false;
    }
    const type = parsed?.type;
    if (type === "error") {
      lastError = parsed?.error?.message || "Anthropic stream error";
      return false;
    }
    if (type === "content_block_delta") {
      const d = parsed.delta;
      if (d?.type === "text_delta" && typeof d.text === "string") {
        assistantText += d.text;
        cb.onChunk(d.text);
      } else if (d?.type === "thinking_delta" && typeof d.thinking === "string") {
        cb.onReasoningChunk?.(d.thinking);
      }
      return false;
    }
    if (type === "message_delta" && parsed.usage && cb.onUsage) {
      const inTok = parsed.usage.input_tokens || 0;
      const outTok = parsed.usage.output_tokens || 0;
      cb.onUsage({
        promptTokens: inTok,
        completionTokens: outTok,
        totalTokens: inTok + outTok,
      });
      return false;
    }
    return type === "message_stop";
  }

  const requester = url.startsWith("https") ? https.request : http.request;
  const req = requester(
    url,
    { method: "POST", headers, signal: controller.signal, timeout: 120000 },
    (res) => {
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d) => (errBody += d.toString()));
        res.on("end", () => {
          try {
            const e = JSON.parse(errBody);
            finish(e.error?.message || `Anthropic error ${res.statusCode}`);
          } catch {
            finish(`Anthropic returned ${res.statusCode}: ${errBody.slice(0, 200)}`);
          }
        });
        return;
      }
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          let dataStr = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (handleAnthropicEvent(dataStr)) {
            finish(assistantText ? undefined : lastError || undefined);
            return;
          }
        }
      });
      res.on("end", () =>
        finish(
          assistantText ? undefined : lastError || "No response from Anthropic.",
        ),
      );
      res.on("error", (err) => {
        if (err.message === "aborted" || err.name === "AbortError") return;
        finish(`Stream error: ${err.message}`);
      });
    },
  );
  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`Anthropic request failed: ${err.message}`);
  });
  req.on("timeout", () => {
    req.destroy();
    finish("Anthropic request timed out.");
  });
  req.write(bodyBuf);
  req.end();
  return { abort: () => controller.abort() };
}

/**
 * Stream a chat turn directly to Google's Gemini API (no gateway). System
 * messages become `systemInstruction`; the assistant role maps to "model".
 * Images are not inlined in this MVP path (text + text-file attachments only).
 */
function sendMessageViaGemini(
  message: string,
  cb: ChatCallbacks,
  profile: string | undefined,
  history: Array<{ role: string; content: string }> | undefined,
  attachments: Attachment[] | undefined,
  runtimeOptions: ChatRuntimeOptions | undefined,
  direct: DirectTarget,
): ChatHandle {
  const mc = getModelConfig(profile);
  const controller = new AbortController();
  const url = `${direct.baseUrl}/models/${encodeURIComponent(mc.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(direct.apiKey)}`;

  const systemParts: string[] = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const h of history || []) {
    if (h.role === "system") {
      systemParts.push(h.content);
      continue;
    }
    const role = h.role === "assistant" || h.role === "agent" ? "model" : "user";
    contents.push({ role, parts: [{ text: h.content }] });
  }
  contents.push({
    role: "user",
    parts: [{ text: composeDirectText(message, attachments) }],
  });

  const temperature = clampTemperature(runtimeOptions?.temperature);
  const body = JSON.stringify({
    contents,
    ...(systemParts.length > 0
      ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } }
      : {}),
    ...(temperature !== undefined ? { generationConfig: { temperature } } : {}),
  });
  const bodyBuf = Buffer.from(body, "utf-8");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(bodyBuf.length),
  };

  const sessionId = `desk-${Date.now()}-${randomUUID()}`;
  let assistantText = "";
  let finished = false;
  let lastError = "";

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    if (error) {
      cb.onError(error);
    } else {
      persistDirectSession(sessionId, mc.model || "", history, message, assistantText);
      cb.onDone(sessionId);
    }
  }

  function handleGeminiData(data: string): void {
    if (!data || data === "[DONE]") return;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (parsed?.error) {
      lastError = parsed.error.message || "Gemini error";
      return;
    }
    const parts = parsed?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (typeof p?.text === "string" && p.text) {
          assistantText += p.text;
          cb.onChunk(p.text);
        }
      }
    }
    if (parsed?.usageMetadata && cb.onUsage) {
      cb.onUsage({
        promptTokens: parsed.usageMetadata.promptTokenCount || 0,
        completionTokens: parsed.usageMetadata.candidatesTokenCount || 0,
        totalTokens: parsed.usageMetadata.totalTokenCount || 0,
      });
    }
  }

  const requester = url.startsWith("https") ? https.request : http.request;
  const req = requester(
    url,
    { method: "POST", headers, signal: controller.signal, timeout: 120000 },
    (res) => {
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d) => (errBody += d.toString()));
        res.on("end", () => {
          try {
            const e = JSON.parse(errBody);
            finish(e.error?.message || `Gemini error ${res.statusCode}`);
          } catch {
            finish(`Gemini returned ${res.statusCode}: ${errBody.slice(0, 200)}`);
          }
        });
        return;
      }
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          for (const line of block.split("\n")) {
            if (line.startsWith("data:")) handleGeminiData(line.slice(5).trim());
          }
        }
      });
      res.on("end", () => {
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            if (line.startsWith("data:")) handleGeminiData(line.slice(5).trim());
          }
        }
        finish(
          assistantText ? undefined : lastError || "No response from Gemini.",
        );
      });
      res.on("error", (err) => {
        if (err.message === "aborted" || err.name === "AbortError") return;
        finish(`Stream error: ${err.message}`);
      });
    },
  );
  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`Gemini request failed: ${err.message}`);
  });
  req.on("timeout", () => {
    req.destroy();
    finish("Gemini request timed out.");
  });
  req.write(bodyBuf);
  req.end();
  return { abort: () => controller.abort() };
}

function sendMessageViaApi(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  _resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  runtimeOptions?: ChatRuntimeOptions,
  direct?: DirectTarget,
): ChatHandle {
  const mc = getModelConfig(profile);
  const controller = new AbortController();

  // Endpoint: a direct provider posts to `<base>/chat/completions` (its base
  // URL already carries `/v1`); the gateway/remote path appends `/v1/...` to
  // the resolved gateway URL. Computed once and reused by the stream request
  // and the non-streaming error probe.
  const apiBase = direct ? direct.baseUrl.replace(/\/+$/, "") : "";
  const chatEndpoint = direct
    ? `${apiBase}/chat/completions`
    : `${getApiUrl(profile)}/v1/chat/completions`;

  // Build full conversation from history + current message (standard OpenAI format).
  // History items are kept text-only — attachments from prior turns live in
  // the gateway's session state when resuming via session_id.
  const messages: Array<{ role: string; content: ChatContent }> = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({
        role: msg.role === "agent" ? "assistant" : msg.role,
        content: msg.content,
      });
    }
  }
  const userContent = buildUserContent(message, attachments);
  messages.push({ role: "user", content: userContent });

  // Context folder (issue #27): when the conversation is bound to a working
  // folder, prepend a system message so the agent scopes file/terminal work
  // there. Injected only at the request-build step — the renderer's visible
  // transcript stays clean, and getSessionMessages filters non-user/assistant
  // roles, so reloaded sessions stay clean too.
  const ctxSystem = contextFolderSystemMessage(contextFolder);
  if (ctxSystem) messages.unshift(ctxSystem);

  const temperature =
    typeof runtimeOptions?.temperature === "number" &&
    Number.isFinite(runtimeOptions.temperature)
      ? Math.min(1, Math.max(0, runtimeOptions.temperature))
      : undefined;

  const body = JSON.stringify({
    model: mc.model || "hermes-agent",
    messages,
    stream: true,
    ...(temperature !== undefined ? { temperature } : {}),
    // Gateway sessions resume via `session_id`; direct providers are stateless
    // (history is replayed in `messages`) and may reject the unknown field.
    ...(!direct && _resumeSessionId ? { session_id: _resumeSessionId } : {}),
  });

  // Encode the body up-front into a Buffer so we can:
  //  1. Set `Content-Length` accurately based on byte length (NOT char
  //     count — JSON.stringify of an image data URL is ASCII so they
  //     match, but multi-byte chars in user text would diverge).
  //  2. Disable Node's default `Transfer-Encoding: chunked` framing for
  //     bodies written via `req.write(body); req.end();`. Chunked
  //     framing skips the gateway's `body_limit_middleware` (which
  //     inspects Content-Length only), so an oversized payload that
  //     should produce a clean 413 "body_too_large" gets the
  //     misleading 400 "Invalid JSON in request body" via aiohttp's
  //     client_max_size overflow path. See #405.
  const bodyBuf = Buffer.from(body, "utf-8");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(bodyBuf.length),
    // Direct provider authenticates with its own bearer key; gateway/remote
    // use the remote auth header (empty in local-gateway mode, filled below).
    ...(direct
      ? direct.apiKey
        ? { Authorization: `Bearer ${direct.apiKey}` }
        : {}
      : getRemoteAuthHeader()),
  };
  // Local API server key (API_SERVER_KEY in the profile's .env /
  // config.yaml) only applies to the local *gateway* path — never to a direct
  // provider (it has its own bearer above) and never in remote/SSH mode (the
  // remote endpoint's own auth header is authoritative and must not be
  // overwritten).
  if (!direct && !isRemoteMode()) {
    const apiServerKey = getApiServerKey(profile);
    if (apiServerKey) {
      headers.Authorization = `Bearer ${apiServerKey}`;
    }
  }

  // Session id: always send via `X-Hermes-Session-Id` so the gateway
  // doesn't fall back to its `_derive_chat_session_id` fingerprint —
  // sha256(system_prompt + first_user_message)[:16] — which collides
  // across every chat whose first user message is the same (e.g. "Hi").
  // The collision silently fragments state.db rows across unrelated
  // conversations and, post-#352, surfaces as old-session content
  // bleeding into new chats when our end-of-stream merge reads
  // getSessionMessages(). Filed upstream as
  // NousResearch/hermes-agent#7484 (security framing — same root cause).
  //
  // Format: `desk-<ms>-<uuidv4>`. UUIDv4 alone is collision-safe
  // probabilistically (~10⁻³⁶ for any pair); the timestamp prefix makes
  // it defensively unique even under a hypothetical PRNG bug, and the
  // `desk-` tag makes desktop-originated sessions visually distinct
  // from the gateway's fingerprint-derived `api-<hash>` ids in
  // state.db / logs.
  //
  // Gate on auth: the gateway rejects `X-Hermes-Session-Id` with 403
  // when API_SERVER_KEY isn't configured (its history-load is gated
  // behind auth). The desktop auto-generates API_SERVER_KEY at install
  // and remote mode supplies its own bearer, so in practice this
  // branch is always taken; the guard exists only so a misconfigured
  // local install degrades to the pre-fix (fingerprint) behaviour
  // rather than 403-looping.
  const hasAuth = "Authorization" in headers;
  // Mint a client-side id so the renderer can group the turn. Direct providers
  // don't understand the gateway's `X-Hermes-Session-Id` (and some reject
  // unknown headers), so keep the id local and never send it upstream. The
  // gateway path keeps its existing auth-gated header behaviour.
  let sessionId =
    _resumeSessionId ||
    (direct || hasAuth ? `desk-${Date.now()}-${randomUUID()}` : "");
  if (sessionId && !direct) {
    headers["X-Hermes-Session-Id"] = sessionId;
  }
  let hasContent = false;
  let finished = false; // guard against double callbacks
  let lastError = ""; // capture embedded error messages
  let directAssistant = ""; // accumulated assistant text for direct-mode persistence
  // Tool progress pattern: `emoji tool_name` or `emoji description`
  const toolProgressRe = /^`([^\s`]+)\s+([^`]+)`$/;

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    if (error) {
      cb.onError(error);
    } else {
      if (direct) {
        persistDirectSession(sessionId, mc.model || "", history, message, directAssistant);
      }
      cb.onDone(sessionId || undefined);
    }
  }

  function probeRealError(): void {
    // When streaming returns empty, make a non-streaming request to surface the real error
    const probeBody = JSON.stringify({
      model: mc.model || "hermes-agent",
      messages: [{ role: "user", content: userContent }],
      stream: false,
      ...(temperature !== undefined ? { temperature } : {}),
    });
    const probeBodyBuf = Buffer.from(probeBody, "utf-8");
    // Per-request Content-Length (the outer `headers` object's value
    // belongs to the streaming request — reusing it here would lie about
    // this body's size and break the framing the same way the missing
    // Content-Length did before #405). Spread + override.
    const probeHeaders = {
      ...headers,
      "Content-Length": String(probeBodyBuf.length),
    };
    const probeUrl = chatEndpoint;
    const probeMod = probeUrl.startsWith("https") ? https : http;
    const probeReq = probeMod.request(
      probeUrl,
      { method: "POST", headers: probeHeaders, timeout: 15000 },
      (res) => {
        let raw = "";
        res.on("data", (d) => {
          raw += d.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const content = parsed.choices?.[0]?.message?.content || "";
            const errMsg = parsed.error?.message || "";
            finish(
              content ||
                errMsg ||
                "No response received from the model. Check your model configuration and API key.",
            );
          } catch {
            finish(
              "No response received from the model. Check your model configuration and API key.",
            );
          }
        });
      },
    );
    probeReq.on("timeout", () => {
      probeReq.destroy();
      finish(lastError || "Gateway timed out");
    });
    probeReq.on("error", () => {
      finish(
        "No response received from the model. Check your model configuration and API key.",
      );
    });
    probeReq.write(probeBodyBuf);
    probeReq.end();
  }

  /**
   * Process a single SSE `data:` payload (after the prefix is stripped).
   *
   * Mirrors sse-parser.ts's `processSseData`, but inlined here because this
   * path needs three hermes-specific behaviours that sse-parser deliberately
   * omits (its callback shape is fixed and shared with other call sites):
   *   1. `onReasoningChunk` via extractReasoningDelta (#352)
   *   2. cache-token usage fields (cacheReadTokens / cacheWriteTokens)
   *   3. the empty-stream `probeRealError()` non-streaming fallback on [DONE]
   * Framing (parseSseBlock) and custom events (processCustomEvent) are reused
   * from sse-parser. Returns true when the stream is done.
   */
  function processSseData(data: string): boolean {
    if (data === "[DONE]") {
      if (hasContent) {
        finish();
      } else if (lastError) {
        finish(lastError);
      } else {
        // Streaming returned empty — probe non-streaming to get the real error
        probeRealError();
      }
      return true; // signals done
    }
    try {
      const parsed = JSON.parse(data);

      // Capture error responses forwarded through SSE
      if (parsed.error) {
        lastError = parsed.error.message || JSON.stringify(parsed.error);
        return false;
      }

      const choice = parsed.choices?.[0];
      const delta = choice?.delta;

      // Extract usage from final chunk (with optional cost + rate limit info)
      if (parsed.usage && cb.onUsage) {
        cb.onUsage({
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0,
          cost: parsed.usage.cost,
          rateLimitRemaining: parsed.usage.rate_limit_remaining,
          rateLimitReset: parsed.usage.rate_limit_reset,
          // Prompt-cache stats for the context gauge. The gateway emits
          // cache_read_tokens / cache_write_tokens; OpenAI-style providers
          // expose cached_tokens under prompt_tokens_details.
          cacheReadTokens:
            parsed.usage.cache_read_tokens ??
            parsed.usage.prompt_tokens_details?.cached_tokens,
          cacheWriteTokens: parsed.usage.cache_write_tokens,
        });
      }

      // Reasoning / thinking tokens, when the provider emits them.
      // Forwarded on a dedicated callback so the renderer can render the
      // thinking bubble live (#352). We do NOT set `hasContent = true`
      // here — reasoning alone shouldn't suppress the "empty stream"
      // diagnostic probe.
      const reasoningDelta = extractReasoningDelta(delta);
      if (reasoningDelta && cb.onReasoningChunk) {
        cb.onReasoningChunk(reasoningDelta);
      }

      if (delta?.content) {
        const content = delta.content.trim();
        // Legacy: Detect tool progress lines injected into content: `🔍 search_web`
        const match = toolProgressRe.exec(content);
        if (match && cb.onToolProgress) {
          cb.onToolProgress(`${match[1]} ${match[2]}`);
        } else {
          hasContent = true;
          if (direct) directAssistant += delta.content;
          cb.onChunk(delta.content);
        }
      }
    } catch {
      /* malformed chunk — skip */
    }
    return false;
  }

  const chatUrl = chatEndpoint;
  const requester = chatUrl.startsWith("https") ? https.request : http.request;
  const req = requester(
    chatUrl,
    {
      method: "POST",
      headers,
      signal: controller.signal,
      timeout: 120000,
    },
    (res) => {
      const sid = res.headers["x-hermes-session-id"];
      if (sid && typeof sid === "string") sessionId = sid;

      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d) => {
          errBody += d.toString();
        });
        res.on("end", () => {
          try {
            const err = JSON.parse(errBody);
            finish(err.error?.message || `API error ${res.statusCode}`);
          } catch {
            finish(
              `API server returned ${res.statusCode}: ${errBody.slice(0, 200)}`,
            );
          }
        });
        return;
      }

      let buffer = "";

      /**
       * Parse an SSE block which may contain `event:` and `data:` lines.
       * Framing + custom-event dispatch are reused from sse-parser.ts;
       * the data path uses the inline processSseData above (reasoning +
       * cache tokens + empty-stream probe). Returns true when done.
       */
      function processSseBlock(block: string): boolean {
        const parsed = parseSseBlock(block);
        if (!parsed) return false;
        if (parsed.eventType) {
          // Custom event (e.g. hermes.tool.progress) — never signals [DONE]
          processCustomEvent(parsed.eventType, parsed.data, {
            onToolProgress: cb.onToolProgress,
          });
          return false;
        }
        return processSseData(parsed.data);
      }

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (processSseBlock(part)) return;
        }
      });

      res.on("end", () => {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            if (processSseBlock(part)) return;
          }
        }
        // Signal completion — even when no content was received
        if (!hasContent && !lastError) {
          probeRealError();
          return;
        }
        finish(hasContent ? undefined : lastError);
      });

      res.on("error", (err) => {
        if (err.message === "aborted" || err.name === "AbortError") return;
        finish(`Stream error: ${err.message}`);
      });
    },
  );

  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`API request failed: ${err.message}`);
  });
  req.on("timeout", () => {
    req.destroy();
    finish(
      "API request timed out. Check the SSH tunnel and remote Hermes gateway.",
    );
  });

  req.write(bodyBuf);
  req.end();

  return {
    abort: () => {
      controller.abort();
    },
  };
}

// ────────────────────────────────────────────────────
//  Public API: auto-routes to HTTP API or CLI fallback
// ────────────────────────────────────────────────────

let apiServerAvailable: boolean | null = null; // cached after first check

// ────────────────────────────────────────────────────
//  CLI fallback (local mode, API server unreachable)
// ────────────────────────────────────────────────────

// Lines from the CLI's TUI chrome we never want to surface in the chat
// stream: box-drawing borders and the `⚕ Hermes` banner.
const NOISE_PATTERNS = [/^[╭╰│╮╯─┌┐└┘┤├┬┴┼]/, /⚕\s*Hermes/];

/**
 * Spawn the bundled Hermes CLI in one-shot chat mode and scrape its stdout
 * back through the streaming callbacks. This is the local-only fallback for
 * when the API gateway isn't reachable — remote/SSH always go through the
 * API path. Multimodal content can't be piped, so text-file attachments are
 * inlined and images dropped. API keys are read from the profile .env and
 * injected into the child env; nothing is logged.
 */
function sendMessageViaCli(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  attachments?: Attachment[],
): ChatHandle {
  // CLI fallback can't pipe multimodal content; inline text-file attachments
  // and ignore images. The gateway is the supported attachment path; this is
  // only hit when the API server isn't reachable.
  if (attachments && attachments.length > 0) {
    const textFiles = attachments.filter(
      (a) => a.kind === "text-file" && typeof a.text === "string",
    );
    if (textFiles.length > 0) {
      const wrapped = textFiles
        .map(
          (f) =>
            `<file name="${escapeXmlAttr(f.name)}" mime="${escapeXmlAttr(f.mime || "text/plain")}">\n${f.text}\n</file>`,
        )
        .join("\n\n");
      message = message.trim() ? `${message}\n\n${wrapped}` : wrapped;
    }
  }
  const mc = getModelConfig(profile);
  const profileEnv = readProfileEnvFile(profile);

  const args = hermesCliArgs();
  if (profile && profile !== "default") {
    args.push("-p", profile);
  }
  args.push("chat", "-q", message, "-Q", "--source", "desktop");

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  if (mc.model) {
    args.push("-m", mc.model);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME: HERMES_HOME,
    PYTHONUNBUFFERED: "1",
  };

  // Inject all API keys from the profile .env so the CLI can access them.
  // The built-in remote OpenAI-compatible providers are listed too — without
  // them the agent can't see the user-configured key when the user picked the
  // built-in provider entry rather than a `custom` one.
  const KNOWN_API_KEYS = [
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_API_KEY",
    "TOGETHER_API_KEY",
    "FIREWORKS_API_KEY",
    "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY",
    "PERPLEXITY_API_KEY",
    "GLM_API_KEY",
    "KIMI_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_CN_API_KEY",
    "HF_TOKEN",
    "EXA_API_KEY",
    "PARALLEL_API_KEY",
    "TAVILY_API_KEY",
    "FIRECRAWL_API_KEY",
    "FAL_KEY",
    "HONCHO_API_KEY",
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "VOICE_TOOLS_OPENAI_KEY",
    "TINKER_API_KEY",
    "WANDB_API_KEY",
  ];
  for (const key of KNOWN_API_KEYS) {
    if (profileEnv[key] && !env[key]) {
      env[key] = profileEnv[key];
    }
  }

  const isCustomEndpoint = OPENAI_COMPAT_PROVIDERS.has(mc.provider);
  if (isCustomEndpoint && mc.baseUrl) {
    // Check if this model has an explicit apiMode from custom_providers
    let modelApiMode: string | null = null;
    try {
      const modelEntry = readModels().find(
        (m) => m.baseUrl === mc.baseUrl && m.model === mc.model,
      );
      if (modelEntry) modelApiMode = modelEntry.apiMode || null;
    } catch {
      /* ignore */
    }
    const isAnthropicProtocol = modelApiMode === "anthropic_messages";
    if (isAnthropicProtocol) {
      env.HERMES_INFERENCE_PROVIDER = "anthropic";
      env.ANTHROPIC_BASE_URL = mc.baseUrl.replace(/\/+$/, "");
    } else {
      env.HERMES_INFERENCE_PROVIDER = "custom";
      env.OPENAI_BASE_URL = mc.baseUrl.replace(/\/+$/, "");
    }

    // Resolve the right API key: URL-specific key first, then OPENAI_API_KEY.
    let resolvedKey = "";
    for (const { pattern, envKey } of URL_KEY_MAP) {
      if (pattern.test(mc.baseUrl)) {
        resolvedKey = profileEnv[envKey] || env[envKey] || "";
        break;
      }
    }
    if (!resolvedKey) {
      // Try custom provider auto-generated key from models.json
      try {
        const models = readModels();
        const matching = models.find((m) => m.baseUrl === mc.baseUrl);
        if (matching) {
          const envKey2 =
            "CUSTOM_PROVIDER_" +
            matching.name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase() +
            "_KEY";
          resolvedKey = profileEnv[envKey2] || env[envKey2] || "";
        }
      } catch {
        /* ignore */
      }
      if (!resolvedKey) {
        resolvedKey =
          profileEnv.CUSTOM_API_KEY ||
          env.CUSTOM_API_KEY ||
          profileEnv.OPENAI_API_KEY ||
          env.OPENAI_API_KEY ||
          "";
      }
    }
    // Local servers (localhost/127.0.0.1) don't need a real key
    if (!resolvedKey && /localhost|127\.0\.0\.1/i.test(mc.baseUrl)) {
      resolvedKey = "no-key-required";
    }
    if (isAnthropicProtocol) {
      env.ANTHROPIC_API_KEY = resolvedKey || "no-key-required";
    } else {
      env.OPENAI_API_KEY = resolvedKey || "no-key-required";
    }

    delete env.OPENROUTER_API_KEY;
    delete env.ANTHROPIC_TOKEN;
    delete env.OPENROUTER_BASE_URL;
  }

  const proc = spawn(HERMES_PYTHON, args, {
    cwd: HERMES_REPO,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });

  let hasOutput = false;
  let capturedSessionId = "";
  let outputBuffer = "";

  function captureSessionId(text: string): void {
    const sidMatch = text.match(/session_id:\s*(\S+)/);
    if (sidMatch) capturedSessionId = sidMatch[1];
  }

  function processOutput(raw: Buffer): void {
    const text = stripAnsi(raw.toString());
    outputBuffer += text;

    captureSessionId(outputBuffer);

    const cleaned = text.replace(/session_id:\s*\S+\n?/g, "");
    const lines = cleaned.split("\n");
    const result: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t && NOISE_PATTERNS.some((p) => p.test(t))) continue;
      result.push(line);
    }

    const output = result.join("\n");
    if (output) {
      hasOutput = true;
      cb.onChunk(output);
    }
  }

  proc.stdout?.on("data", processOutput);

  let stderrBuffer = "";
  proc.stderr?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    captureSessionId(text);
    if (
      !text.trim() ||
      text.includes("UserWarning") ||
      text.includes("FutureWarning")
    ) {
      return;
    }
    // Forward errors visibly to the chat
    if (
      /❌|⚠️|Error|Traceback|error|failed|denied|unauthorized|invalid/i.test(
        text,
      )
    ) {
      hasOutput = true;
      cb.onChunk(text);
    } else {
      // Buffer other stderr for reporting on non-zero exit
      stderrBuffer += text;
    }
  });

  proc.on("close", (code) => {
    if (code === 0 || hasOutput) {
      cb.onDone(capturedSessionId || undefined);
    } else {
      const detail = stderrBuffer.trim();
      cb.onError(
        detail
          ? `Hermes exited with code ${code}: ${detail}`
          : `Hermes exited with code ${code}. Check your model configuration and API key.`,
      );
    }
  });

  proc.on("error", (err) => {
    cb.onError(err.message);
  });

  return {
    abort: () => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 3000);
    },
  };
}

export async function sendMessage(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  runtimeOptions?: ChatRuntimeOptions,
): Promise<ChatHandle> {
  ensureInitialized();

  // Remote mode: always use API, no CLI fallback
  if (isRemoteMode()) {
    return sendMessageViaApi(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      attachments,
      contextFolder,
      runtimeOptions,
    );
  }

  // Local mode. Prefer a running local gateway (full agent: tools, skills,
  // memory, server-side session persistence). Only probe health when a gateway
  // is actually installed or already running — otherwise every send from a
  // BYO-key user who never installed hermes-agent would burn the health
  // timeout before falling through to the direct path.
  const gatewayInstalled =
    existsSync(HERMES_PYTHON) && existsSync(HERMES_REPO);
  const localGatewayRunning = isGatewayRunning(profile);
  if (gatewayInstalled || localGatewayRunning) {
    // A running gateway can still be in its startup window (or the cached ready
    // state can be stale after an external stop/start), so verify health
    // before taking the API path.
    if (
      apiServerAvailable === null ||
      apiServerAvailable === false ||
      localGatewayRunning
    ) {
      apiServerAvailable = await isApiServerReady(profile);
      if (!apiServerAvailable && localGatewayRunning) {
        apiServerAvailable = await waitForApiServerReady(8000, profile);
      }
    }
    if (apiServerAvailable) {
      return sendMessageViaApi(
        message,
        cb,
        profile,
        resumeSessionId,
        history,
        attachments,
        contextFolder,
        runtimeOptions,
      );
    }
  }

  // Hybrid fallback: no local gateway reachable. If the active profile has a
  // direct OpenAI-compatible provider configured (base_url + key, or a known
  // provider with its key in .env), stream straight to it — no agent install
  // required. This is what makes chat work out of the box for BYO-key users.
  const direct = resolveDirectTarget(profile);
  if (direct) {
    if (direct.protocol === "anthropic") {
      return sendMessageViaAnthropic(
        message, cb, profile, history, attachments, runtimeOptions, direct,
      );
    }
    if (direct.protocol === "gemini") {
      return sendMessageViaGemini(
        message, cb, profile, history, attachments, runtimeOptions, direct,
      );
    }
    return sendMessageViaApi(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      attachments,
      contextFolder,
      runtimeOptions,
      direct,
    );
  }

  // Nothing reachable: spawn the bundled CLI as a last resort. The CLI itself
  // surfaces an honest error via cb.onError if Python/the agent isn't
  // available — no fake stream.
  return sendMessageViaCli(message, cb, profile, resumeSessionId, attachments);
}

// Lazy init — called on first sendMessage or gateway start
let _initialized = false;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

function ensureInitialized(): void {
  if (_initialized) return;
  _initialized = true;
  // Note: api_server config is written per-profile by startGateway() now
  // (each profile needs its own port), so ensureInitialized only owns the
  // shared health poller.
  startHealthPolling();
}

function startHealthPolling(): void {
  if (_healthCheckInterval) return;
  _healthCheckInterval = setInterval(async () => {
    apiServerAvailable = await isApiServerReady();
    // Stop polling once API is confirmed available — only re-check on demand
    if (apiServerAvailable && _healthCheckInterval) {
      clearInterval(_healthCheckInterval);
      _healthCheckInterval = null;
    }
  }, 15000);
}

export function stopHealthPolling(): void {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
  }
}

// ────────────────────────────────────────────────────
//  Gateway management
// ────────────────────────────────────────────────────

// Profiles each own a gateway, keyed by profileKey() ("default" for the
// default profile, the profile name otherwise). Tracking them in maps —
// rather than a single global — lets several profiles' gateways run at once
// (e.g. each keeping its own Telegram bot online), which is the documented
// hermes model: one gateway per profile, bound to that profile's own port.
const gatewayProcesses = new Map<string, ChildProcess>();
const appStartedProfiles = new Set<string>();

/**
 * Clear the cached API-server-ready flag, but only when `profile` is the one
 * the desktop currently addresses (the active profile). A *background*
 * profile's gateway dying must not flip the active profile's chat into the
 * CLI-fallback path on its next message.
 */
function invalidateApiCacheFor(profile?: string): void {
  if (profileKey(profile) === profileKey(undefined)) {
    apiServerAvailable = false;
  }
}

export function startGateway(profile?: string): boolean {
  // Defensive: the local gateway is never the right thing to spawn in
  // remote/SSH mode — the user is pointing at an off-machine server.
  // Callers should already gate, but several IPC handlers historically
  // forgot to (issue #266), and reaching `spawn(HERMES_PYTHON, …)` when
  // there's no local hermes-agent install produces an uncaught ENOENT
  // that pops a generic error dialog.  Refuse cleanly here.
  if (isRemoteMode()) {
    console.warn(
      "[gateway] startGateway() called in remote/SSH mode — refusing local spawn",
    );
    return false;
  }
  ensureInitialized();
  if (isGatewayRunning(profile)) return false;

  // Pre-flight: verify the Python interpreter exists before attempting to
  // spawn. Without this check, spawn() fails with ENOENT and the error is
  // completely silent (stdio:"ignore", no error handler).
  if (!existsSync(HERMES_PYTHON)) {
    console.error(
      `[gateway] Cannot start: Python interpreter not found at ${HERMES_PYTHON}. ` +
        "Is hermes-agent installed?",
    );
    return false;
  }
  if (!existsSync(HERMES_REPO)) {
    console.error(
      `[gateway] Cannot start: hermes-agent repo not found at ${HERMES_REPO}. ` +
        "Is hermes-agent installed?",
    );
    return false;
  }

  const resolved = resolveProfile(profile); // undefined => default
  const key = profileKey(profile);

  // Make sure this profile's config.yaml enables the api_server and binds the
  // profile's own port before we spawn.
  ensureApiServerConfig(profile);
  const port = getProfilePort(profile);

  // Build gateway env with profile API keys
  const gatewayEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME: HERMES_HOME,
    API_SERVER_ENABLED: "true", // Ensure API server starts with gateway
    // Bind to this profile's port. config.yaml's api_server.port wins when
    // present (getProfilePort keeps it collision-free); this env value covers
    // the case where the block exists but omits an explicit port.
    API_SERVER_PORT: String(port),
  };

  // Inject ALL profile API keys so the gateway can authenticate with any provider.
  const profileEnv = readProfileEnvFile(profile);
  for (const [k, value] of Object.entries(profileEnv)) {
    if (value) {
      gatewayEnv[k] = value;
    }
  }

  // Inject the resolved API_SERVER_KEY into the gateway's env.
  //
  // The desktop's `getApiServerKey` reads the shared secret from six
  // sources: config.yaml top-level `API_SERVER_KEY:`, `.env`
  // `API_SERVER_KEY=`, and config.yaml `api_server.token:` (each per-profile
  // and default-profile). The upstream gateway's `APIServerAdapter` (see
  // `gateway/platforms/api_server.py:647`) only reads two of those:
  // `api_server.extra.key` from config.yaml, or `os.getenv("API_SERVER_KEY")`
  // at startup. Upstream `gateway/run.py:608-610` bridges *top-level*
  // config.yaml keys into env vars, so `API_SERVER_KEY:` at the top
  // level works — but the nested `api_server.token:` location does not
  // become an env var, and the gateway never reads it directly.
  //
  // Bridging the desktop's resolved value into the spawn env makes the
  // gateway's `os.getenv("API_SERVER_KEY")` fallback see whatever the
  // desktop sees, regardless of source. This is the canonical fix until
  // upstream learns to read `api_server.token` directly.
  const resolvedApiServerKey = getApiServerKey(profile);
  if (resolvedApiServerKey) {
    gatewayEnv.API_SERVER_KEY = resolvedApiServerKey;
  }

  // Route stderr to a log file so startup errors are visible for debugging.
  // Per-profile log dir so a named profile's failures (e.g. a duplicate bot
  // token, which the gateway refuses to start with) don't get mixed into the
  // default profile's log. stdout is ignored (the gateway daemonizes and
  // writes its own logs).
  const logDir = profileHome(resolved);
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    // ignore
  }
  const logPath = join(logDir, "gateway-stderr.log");
  // Open the log synchronously and hand spawn a real fd. A createWriteStream
  // opens its fd asynchronously, so passing the stream to stdio races: when
  // the fd hasn't resolved yet (fd: null) Electron's Node rejects it with
  // ERR_INVALID_ARG_VALUE. An integer fd sidesteps the race entirely.
  let stderrFd: number;
  try {
    stderrFd = openSync(logPath, "a");
  } catch {
    // If the log file can't be opened (e.g. permissions), fall back to
    // discarding stderr rather than failing the whole gateway start.
    stderrFd = -1;
  }

  // Target the specific profile via `--profile <name>` (placed before the
  // subcommand, as the CLI requires). The flag makes the CLI repoint
  // HERMES_HOME at the profile's dir internally; the shared repo/venv stay
  // put. The default profile takes no flag.
  const cliArgs = resolved ? ["--profile", resolved, "gateway"] : ["gateway"];
  const proc = spawn(HERMES_PYTHON, hermesCliArgs(cliArgs), {
    cwd: HERMES_REPO,
    env: gatewayEnv,
    stdio: ["ignore", "ignore", stderrFd >= 0 ? stderrFd : "ignore"],
    detached: true,
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });
  // The child has inherited (dup'd) the fd; close our copy so we don't leak a
  // descriptor on every gateway (re)start.
  if (stderrFd >= 0) {
    try {
      closeSync(stderrFd);
    } catch {
      // best-effort
    }
  }

  proc.on("error", (err) => {
    console.error(
      `[gateway:${key}] Failed to spawn gateway process:`,
      err.message,
    );
    if (gatewayProcesses.get(key) === proc) gatewayProcesses.delete(key);
    appStartedProfiles.delete(key);
    invalidateApiCacheFor(profile);
  });

  proc.on("close", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(
        `[gateway:${key}] Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}. ` +
          `Check ${logPath} for details.`,
      );
    }
    if (gatewayProcesses.get(key) === proc) gatewayProcesses.delete(key);
    appStartedProfiles.delete(key);
    invalidateApiCacheFor(profile);
    // Restart health polling to detect if gateway comes back
    startHealthPolling();
  });

  proc.unref();
  gatewayProcesses.set(key, proc);
  appStartedProfiles.add(key);

  // Wait a bit then check if API server came up (only meaningful for the
  // active profile, whose URL getApiUrl() resolves to).
  setTimeout(async () => {
    if (profileKey(profile) === profileKey(undefined)) {
      apiServerAvailable = await isApiServerReady(profile);
    }
  }, 3000);

  return true;
}

function parsePidFromFile(pidFile: string): number | null {
  if (!existsSync(pidFile)) return null;
  try {
    const raw = readFileSync(pidFile, "utf-8").trim();
    // PID file can be JSON ({"pid": 1234, ...}) or plain integer
    const parsed = raw.startsWith("{")
      ? JSON.parse(raw).pid
      : parseInt(raw, 10);
    return typeof parsed === "number" && !isNaN(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The gateway.pid path for a profile. The hermes CLI writes it into the
 * profile's home directory (~/.hermes/gateway.pid for default,
 * ~/.hermes/profiles/<name>/gateway.pid for a named profile), so each
 * profile's gateway has its own PID file — that's what lets them coexist.
 */
function gatewayPidPath(profile?: string): string {
  return join(profileHome(resolveProfile(profile)), "gateway.pid");
}

function readPidFile(profile?: string): number | null {
  return parsePidFromFile(gatewayPidPath(profile));
}

/**
 * Stop a single profile's gateway. Defaults to the active profile. By design
 * this only touches the named profile — switching profiles, app exit, etc.
 * must never take down a *different* profile's gateway (and its bots).
 */
export function stopGateway(profile?: string, force = false): void {
  const key = profileKey(profile);
  if (!force && !appStartedProfiles.has(key)) return;

  const proc = gatewayProcesses.get(key);
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
  }
  gatewayProcesses.delete(key);

  const pid = readPidFile(profile);
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
  }
  // Always clear the PID file once we've signalled it. Leaving a stale PID
  // around means the next isGatewayRunning() / stopGateway() call can hit
  // an unrelated process that the OS has since assigned the same PID.
  const pidFile = gatewayPidPath(profile);
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile);
    } catch {
      // best-effort; will be overwritten on next gateway start
    }
  }
  appStartedProfiles.delete(key);
  invalidateApiCacheFor(profile);
}

// Python image prefixes covering both native Windows (pythonw.exe / python.exe)
// and POSIX (python, python3, pythonw). Used to verify the PID we read from
// gateway.pid actually belongs to a python process before reporting alive.
const GATEWAY_IMAGE_PREFIXES = ["python", "pythonw"];

export function isGatewayRunning(profile?: string): boolean {
  const proc = gatewayProcesses.get(profileKey(profile));
  if (proc && !proc.killed) return true;
  const pid = readPidFile(profile);
  if (!pid) return false;
  return pidIsAliveAs(pid, GATEWAY_IMAGE_PREFIXES);
}

export function isApiReady(): boolean {
  return apiServerAvailable === true;
}

export function testRemoteConnection(
  url: string,
  apiKey?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const target = `${normaliseRemoteUrl(url)}/health`;
    const mod = target.startsWith("https") ? https : http;
    const headers: Record<string, string> = {};
    const resolvedApiKey = resolveRemoteApiKey(url, apiKey);
    if (resolvedApiKey) headers.Authorization = `Bearer ${resolvedApiKey}`;
    const req = mod.request(
      target,
      { method: "GET", timeout: 5000, headers },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export function restartGateway(profile?: string): void {
  // Same defensive gate as startGateway — the local gateway has no role
  // in remote/SSH mode.  Cheap to check; catches IPC paths that don't
  // wrap their restart calls in an isRemoteMode() check.
  if (isRemoteMode()) return;
  const key = profileKey(profile);
  if (!appStartedProfiles.has(key) && !isGatewayRunning(profile)) return;
  stopGateway(profile, true);
  setTimeout(() => {
    startGateway(profile);
  }, 500);
}

/**
 * Hook for the profile-switch handler: drop the cached ready flag so the next
 * health check probes the newly active profile's port instead of trusting a
 * value sampled against the previous profile's gateway.
 */
export function notifyProfileSwitched(): void {
  apiServerAvailable = null;
}

/**
 * Read a profile's .env into a flat key→value map. The ported config.ts
 * exposes per-key reads (getEnvValue) rather than the ref's bulk `readEnv`;
 * the gateway spawn needs every key, so parse the file directly here. Keys are
 * the same `KEY=value` lines getEnvValue scans, with surrounding quotes
 * stripped. Returns {} when the file is absent or unreadable.
 */
function readProfileEnvFile(profile?: string): Record<string, string> {
  const { envFile } = profilePaths(resolveProfile(profile));
  const out: Record<string, string> = {};
  try {
    if (!existsSync(envFile)) return out;
    const content = readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key) out[key] = value;
    }
  } catch {
    /* non-fatal — gateway can still start with process.env keys */
  }
  return out;
}
