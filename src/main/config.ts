import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import * as YAML from "yaml";
import { HERMES_HOME } from "./installer";
import { safeWriteFile } from "./utils";

function configPath(profile?: string): string {
  const home = HERMES_HOME;
  if (profile && profile !== "default") {
    return join(home, "profiles", profile, "config.yaml");
  }
  return join(home, "config.yaml");
}

export function loadConfigYaml(profile?: string): Record<string, any> {
  const path = configPath(profile);
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return YAML.parse(content) || {};
    }
  } catch {}
  return {};
}

export function saveConfigYaml(
  key: string,
  value: any,
  profile?: string,
): void {
  const path = configPath(profile);
  const config = loadConfigYaml(profile);
  const parts = key.split(".");
  let current: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(config), "utf-8");
}

export function getHermesHome(): string {
  return HERMES_HOME;
}

export function getModelConfig(
  profile?: string,
): { model: string; provider: string; baseUrl: string } {
  const config = loadConfigYaml(profile);
  return {
    model: config.model?.default || "",
    provider: config.model?.provider || "auto",
    baseUrl: config.model?.base_url || "",
  };
}

export function setModelConfig(
  model: string,
  provider: string,
  baseUrl: string,
  profile?: string,
): void {
  saveConfigYaml("model.default", model, profile);
  saveConfigYaml("model.provider", provider, profile);
  saveConfigYaml("model.base_url", baseUrl, profile);
}

export function getEnvValue(
  key: string,
  profile?: string,
): string | undefined {
  const home = HERMES_HOME;
  const envPath =
    profile && profile !== "default"
      ? join(home, "profiles", profile, ".env")
      : join(home, ".env");
  try {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (trimmed.startsWith(key + "=")) {
          return trimmed
            .slice(key.length + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {}
  return undefined;
}

export function setEnvValue(
  key: string,
  value: string,
  profile?: string,
): void {
  const home = HERMES_HOME;
  const envPath =
    profile && profile !== "default"
      ? join(home, "profiles", profile, ".env")
      : join(home, ".env");
  mkdirSync(dirname(envPath), { recursive: true });

  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, "utf-8").split("\n");
  }

  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(key + "=") || trimmed.startsWith("# " + key + "=")) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(`${key}=${value}`);
  }

  writeFileSync(envPath, lines.join("\n"), "utf-8");
}

export function listProfiles(): string[] {
  const home = HERMES_HOME;
  const profilesDir = join(home, "profiles");
  const profiles = ["default"];
  try {
    if (existsSync(profilesDir)) {
      for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          profiles.push(entry.name);
        }
      }
    }
  } catch {}
  return profiles;
}

export function getActiveProfileName(): string {
  const home = HERMES_HOME;
  const profileFile = join(home, "active_profile");
  try {
    if (existsSync(profileFile)) {
      return readFileSync(profileFile, "utf-8").trim() || "default";
    }
  } catch {}
  return "default";
}

// ── Connection Config (local / remote / ssh) ──────────────

export interface SshConnectionConfig {
  host: string;
  port: number;
  username: string;
  keyPath: string;
  remotePort: number;
  localPort: number;
}

export interface ConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string;
  apiKey: string;
  ssh: SshConnectionConfig;
}

export interface PublicConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string;
  hasApiKey: boolean;
  apiKeyLength: number;
  ssh: SshConnectionConfig;
}

/** Walk a dotted path through a parsed YAML object; return trimmed string or undefined. */
function yamlGet(
  obj: Record<string, unknown>,
  dottedKey: string,
): string | undefined {
  const parts = dottedKey.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" && cur.trim() ? cur.trim() : undefined;
}

function desktopConfigFile(): string {
  return join(getHermesHome(), "desktop.json");
}

export function readDesktopConfig(): Record<string, unknown> {
  try {
    const f = desktopConfigFile();
    if (!existsSync(f)) return {};
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return {};
  }
}

export function writeDesktopConfig(data: Record<string, unknown>): void {
  const home = getHermesHome();
  if (!existsSync(home)) mkdirSync(home, { recursive: true });
  writeFileSync(desktopConfigFile(), JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function getConnectionConfig(): ConnectionConfig {
  const d = readDesktopConfig();
  const ssh = (d.sshConfig as Record<string, unknown>) || {};
  return {
    mode: (d.connectionMode as ConnectionConfig["mode"]) || "local",
    remoteUrl: (d.remoteUrl as string) || "",
    apiKey: (d.remoteApiKey as string) || "",
    ssh: {
      host: (ssh.host as string) || "",
      port: (ssh.port as number) || 22,
      username: (ssh.username as string) || "",
      keyPath: (ssh.keyPath as string) || "",
      remotePort: (ssh.remotePort as number) || 8642,
      localPort: (ssh.localPort as number) || 18642,
    },
  };
}

export function getPublicConnectionConfig(): PublicConnectionConfig {
  const c = getConnectionConfig();
  return {
    mode: c.mode,
    remoteUrl: c.remoteUrl,
    hasApiKey: !!c.apiKey,
    apiKeyLength: c.apiKey.length,
    ssh: c.ssh,
  };
}

export function setConnectionConfig(input: {
  mode: ConnectionConfig["mode"];
  remoteUrl?: string;
  apiKey?: string;
  ssh?: SshConnectionConfig;
}): void {
  const d = readDesktopConfig();
  d.connectionMode = input.mode;
  if (input.remoteUrl !== undefined) d.remoteUrl = input.remoteUrl;
  // empty/undefined apiKey is treated as "unchanged" — never clobber a saved key with a blank
  if (input.apiKey !== undefined && input.apiKey !== "")
    d.remoteApiKey = input.apiKey;
  // ssh config only persisted in ssh mode (intentional)
  if (input.mode === "ssh" && input.ssh) d.sshConfig = input.ssh;
  writeDesktopConfig(d);
}

// ── API Server Key resolution ─────────────────────────────

/**
 * Resolve the API server's shared secret from 6 sources in precedence order:
 *
 *   1. Profile config.yaml top-level `API_SERVER_KEY` (legacy override)
 *   2. Default config.yaml top-level `API_SERVER_KEY` (legacy override)
 *   3. Profile .env `API_SERVER_KEY`
 *   4. Default .env `API_SERVER_KEY`
 *   5. Profile config.yaml `api_server.token` (canonical hermes-agent location)
 *   6. Default config.yaml `api_server.token`
 *
 * Returns "" when none of the six locations are configured.
 */
/**
 * Read a single dotted-path config value from the profile's config.yaml.
 * Returns the trimmed string value or null if not found / not a string.
 */
export function getConfigValue(key: string, profile?: string): string | null {
  const config = loadConfigYaml(profile);
  const value = yamlGet(config, key);
  return value != null ? value : null;
}

/**
 * Write a single dotted-path config value to the profile's config.yaml.
 * Delegates to saveConfigYaml which handles nested path creation.
 */
export function setConfigValue(
  key: string,
  value: string,
  profile?: string,
): void {
  saveConfigYaml(key, value, profile);
}

export function getApiServerKey(profile?: string): string {
  const isNamed = Boolean(profile && profile !== "default");
  const profileConfig = loadConfigYaml(profile);
  const defaultConfig = isNamed ? loadConfigYaml() : null;

  const candidates: Array<string | undefined> = [
    // 1. Profile config.yaml top-level API_SERVER_KEY
    yamlGet(profileConfig, "API_SERVER_KEY"),
    // 2. Default config.yaml top-level API_SERVER_KEY
    isNamed && defaultConfig ? yamlGet(defaultConfig, "API_SERVER_KEY") : undefined,
    // 3. Profile .env API_SERVER_KEY
    getEnvValue("API_SERVER_KEY", profile),
    // 4. Default .env API_SERVER_KEY
    isNamed ? getEnvValue("API_SERVER_KEY") : undefined,
    // 5. Profile config.yaml api_server.token
    yamlGet(profileConfig, "api_server.token"),
    // 6. Default config.yaml api_server.token
    isNamed && defaultConfig ? yamlGet(defaultConfig, "api_server.token") : undefined,
  ];

  for (const v of candidates) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

// ── Platform toggles (config.yaml platforms section) ──────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read the profile's `.env` into a flat key→value map. */
function readEnvMap(profile?: string): Record<string, string> {
  const home = HERMES_HOME;
  const envPath =
    profile && profile !== "default"
      ? join(home, "profiles", profile, ".env")
      : join(home, ".env");
  const result: Record<string, string> = {};
  try {
    if (!existsSync(envPath)) return result;
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIndex = trimmed.indexOf("=");
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  } catch {}
  return result;
}

interface PlatformRule {
  envCheck: (env: Record<string, string>) => boolean;
  // YAML key for the override-disable lookup. Defaults to the platform key
  // itself; provide an explicit value when the desktop's display key
  // diverges from the Python CLI's config.yaml key (e.g. "home_assistant"
  // in the desktop vs "homeassistant" in the Python gateway).
  configKey?: string;
}

const TRUTHY_VALUES = new Set(["true", "1", "yes", "on"]);

const PLATFORM_RULES: Record<string, PlatformRule> = {
  telegram: { envCheck: (e) => !!e.TELEGRAM_BOT_TOKEN?.trim() },
  discord: { envCheck: (e) => !!e.DISCORD_BOT_TOKEN?.trim() },
  slack: { envCheck: (e) => !!e.SLACK_BOT_TOKEN?.trim() },
  whatsapp: {
    envCheck: (e) =>
      TRUTHY_VALUES.has((e.WHATSAPP_ENABLED || "").trim().toLowerCase()),
  },
  signal: {
    envCheck: (e) => !!e.SIGNAL_HTTP_URL?.trim() && !!e.SIGNAL_ACCOUNT?.trim(),
  },
  matrix: {
    envCheck: (e) =>
      !!e.MATRIX_ACCESS_TOKEN?.trim() || !!e.MATRIX_PASSWORD?.trim(),
  },
  mattermost: { envCheck: (e) => !!e.MATTERMOST_TOKEN?.trim() },
  home_assistant: {
    envCheck: (e) => !!e.HASS_TOKEN?.trim(),
    configKey: "homeassistant",
  },
};

const SUPPORTED_PLATFORMS = Object.keys(PLATFORM_RULES);

/**
 * Match a top-level YAML block's `enabled: <bool>` field. Returns true/false
 * if found, null if absent. The block must start at column 0; `enabled:` is
 * captured if it sits anywhere inside the contiguous indented sub-block.
 */
function readPlatformOverride(
  content: string,
  platform: string,
): boolean | null {
  const blockStartRe = new RegExp(
    `^${escapeRegex(platform)}:[ \\t]*\\r?\\n`,
    "m",
  );
  const startMatch = content.match(blockStartRe);
  if (!startMatch || startMatch.index === undefined) return null;

  const after = content.slice(startMatch.index + startMatch[0].length);
  const lines = after.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) break; // hit next top-level key
    const m = line.match(/^[ \t]+enabled:[ \t]*(true|false)\b/);
    if (m) return m[1] === "true";
  }
  return null;
}

export function getPlatformEnabled(profile?: string): Record<string, boolean> {
  const env = readEnvMap(profile);
  const configFile = configPath(profile);
  const content = existsSync(configFile)
    ? readFileSync(configFile, "utf-8")
    : "";

  const result: Record<string, boolean> = {};
  for (const platform of SUPPORTED_PLATFORMS) {
    const rule = PLATFORM_RULES[platform];
    const envEnabled = rule.envCheck(env);
    const configKey = rule.configKey || platform;
    const override = content ? readPlatformOverride(content, configKey) : null;
    // Env-driven activation; config.yaml `enabled: false` can force-disable.
    // An explicit `enabled: true` doesn't bypass a missing token (the Python
    // gateway still requires the credential), so reflect that here too.
    result[platform] = envEnabled && override !== false;
  }
  return result;
}

/**
 * Toggle a platform's force-disable override in config.yaml.
 *
 * The Python gateway activates a platform when its env vars are set; config
 * can force-disable with `<platform>.enabled: false` at the top level. So
 * toggling here writes/removes that single key:
 *
 *   - enabled=false → ensure `enabled: false` exists in the top-level
 *     `<platform>:` block.
 *   - enabled=true  → remove any existing `enabled: false` line.
 *
 * Filling in the platform's token env vars is what actually starts it; this
 * function only manages the disable override.
 */
export function setPlatformEnabled(
  platform: string,
  enabled: boolean,
  profile?: string,
): void {
  const rule = PLATFORM_RULES[platform];
  if (!rule) return;
  // Use the Python-side YAML key when writing the override, not the desktop's
  // display key (matters for home_assistant → homeassistant).
  const configKey = rule.configKey || platform;

  const configFile = configPath(profile);
  if (!existsSync(configFile)) {
    // Only need to write a file when we're recording a disable override;
    // enabling a platform that has no config is the default.
    if (enabled) return;
    safeWriteFile(configFile, `${configKey}:\n  enabled: false\n`);
    return;
  }

  let content = readFileSync(configFile, "utf-8");
  const enabledLineRe = new RegExp(
    `^([ \\t]+enabled:[ \\t]*)(true|false)\\b([ \\t]*)$`,
    "m",
  );
  const blockStartRe = new RegExp(
    `^(${escapeRegex(configKey)}:[ \\t]*\\r?\\n)`,
    "m",
  );
  const flowStyleRe = new RegExp(
    `^${escapeRegex(configKey)}:[ \\t]*\\{\\s*\\}[ \\t]*$`,
    "m",
  );

  const blockMatch = content.match(blockStartRe);
  const hasBlock = !!blockMatch;
  const isFlowEmpty = flowStyleRe.test(content);

  if (isFlowEmpty) {
    // Convert `<platform>: {}` to a block we can edit.
    content = content.replace(
      flowStyleRe,
      `${configKey}:\n  enabled: ${enabled}`,
    );
    safeWriteFile(configFile, content);
    return;
  }

  if (hasBlock && blockMatch?.index !== undefined) {
    const blockStart = blockMatch.index + blockMatch[0].length;
    const rest = content.slice(blockStart);
    const restLines = rest.split(/\r?\n/);

    // Find the extent of the platform's sub-block (indented children).
    let subBlockEndOffset = 0;
    let existingEnabledLineStart: number | null = null;
    let existingEnabledLineEnd: number | null = null;
    for (const line of restLines) {
      const lineLen = line.length + 1; // include trailing \n
      if (line.trim() === "") {
        subBlockEndOffset += lineLen;
        continue;
      }
      if (!/^\s/.test(line)) break;
      const localStart = blockStart + subBlockEndOffset;
      const enabledMatch = line.match(enabledLineRe);
      if (enabledMatch) {
        existingEnabledLineStart = localStart;
        existingEnabledLineEnd = localStart + line.length;
      }
      subBlockEndOffset += lineLen;
    }

    if (existingEnabledLineStart !== null && existingEnabledLineEnd !== null) {
      if (enabled) {
        // Remove the entire `  enabled: false` line, including its newline.
        const removeEnd =
          content[existingEnabledLineEnd] === "\n"
            ? existingEnabledLineEnd + 1
            : existingEnabledLineEnd;
        content =
          content.slice(0, existingEnabledLineStart) + content.slice(removeEnd);
      } else {
        content =
          content.slice(0, existingEnabledLineStart) +
          `  enabled: false` +
          content.slice(existingEnabledLineEnd);
      }
    } else if (!enabled) {
      // Append `enabled: false` as the first child of the block.
      content =
        content.slice(0, blockStart) +
        `  enabled: false\n` +
        content.slice(blockStart);
    }
    // (enabled=true with no existing override: nothing to do.)

    safeWriteFile(configFile, content);
    return;
  }

  // No block at all — only need to materialize one when recording a disable.
  if (!enabled) {
    const trailingNewline = content.endsWith("\n") ? "" : "\n";
    content += `${trailingNewline}${configKey}:\n  enabled: false\n`;
    safeWriteFile(configFile, content);
  }
}
