/**
 * SSH-proxied implementations of hermes operations — chat-MVP subset.
 * Exports: sshExec, sshReadEnv, sshReadRemoteApiKey, buildRemoteHermesCmd,
 *          buildGatewayStartCommand, buildGatewayStatusCommand,
 *          sshGatewayStatus, sshStartGateway
 */

import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import type { SshConfig } from "./ssh-tunnel";
import { buildSshControlOptions, assertSafeSshConfig } from "./ssh-options";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";
import type {
  ToolsetInfo,
  MemoryInfo,
  MemoryEntry,
  SavedModel,
} from "@shared/types";

// ── SSH exec core ────────────────────────────────────────────────────────────

function buildExecArgs(config: SshConfig): string[] {
  const keyPath = config.keyPath?.trim() || join(homedir(), ".ssh", "id_rsa");
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=15",
    ...buildSshControlOptions(),
    "-i",
    keyPath,
    "-p",
    String(config.port || 22),
    `${config.username}@${config.host}`,
  ];
}

export function sshExec(
  config: SshConfig,
  command: string,
  stdin?: string,
  timeoutMs = 30000,
): Promise<string> {
  assertSafeSshConfig(config);
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [...buildExecArgs(config), command], {
      stdio: ["pipe", "pipe", "pipe"],
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("SSH command timed out"));
    }, timeoutMs);
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(sanitizeSshError(stderr) || "SSH command failed"));
    });
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

function sanitizeSshError(stderr: string): string {
  const cleaned = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^Warning: Permanently added /.test(line))
    .filter((line) => !/identity file .* not accessible/i.test(line))
    .join("\n")
    .trim();
  if (
    /Permission denied \(publickey\)|no such identity|could not open a connection|publickey/i.test(
      cleaned,
    )
  ) {
    return "SSH authentication failed. Configure an SSH key for this host and try again.";
  }
  if (
    /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(
      cleaned,
    )
  ) {
    return "SSH host key verification failed. Check the host key before reconnecting.";
  }
  return cleaned;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function sshPython(
  config: SshConfig,
  script: string,
  stdin?: string,
  timeoutMs = 30000,
): Promise<string> {
  if (stdin === undefined) {
    return sshExec(config, "python3 -", script, timeoutMs);
  }
  return sshExec(config, `python3 -c ${shellQuote(script)}`, stdin, timeoutMs);
}

function pythonJsonInput(payload: unknown): string {
  return JSON.stringify(payload);
}

function normalizeRemotePath(remotePath: string): string {
  return remotePath.replace(/^~\//, "$HOME/");
}

async function sshReadFile(
  config: SshConfig,
  remotePath: string,
): Promise<string> {
  try {
    return await sshExec(
      config,
      `bash -c 'case "$1" in "~/"*) p="$HOME/\${1#~/}" ;; "\\$HOME/"*) p="$HOME/\${1#\\$HOME/}" ;; *) p="$1" ;; esac; cat -- "$p" 2>/dev/null || true' -- ${shellQuote(normalizeRemotePath(remotePath))}`,
    );
  } catch {
    return "";
  }
}

async function sshWriteFile(
  config: SshConfig,
  remotePath: string,
  content: string,
): Promise<void> {
  const p = normalizeRemotePath(remotePath);
  const dir = p.includes("/") ? p.substring(0, p.lastIndexOf("/")) : ".";
  await sshExec(
    config,
    `bash -c 'expand(){ case "$1" in "~/"*) printf "%s" "$HOME/\${1#~/}" ;; "\\$HOME/"*) printf "%s" "$HOME/\${1#\\$HOME/}" ;; *) printf "%s" "$1" ;; esac; }; dir=$(expand "$1"); file=$(expand "$2"); mkdir -p -- "$dir" && cat > "$file"' -- ${shellQuote(dir)} ${shellQuote(p)}`,
    content,
  );
}

// ── Env ───────────────────────────────────────────────────────────────────────

function remoteEnvPath(profile?: string): string {
  if (profile && profile !== "default")
    return `~/.hermes/profiles/${profile}/.env`;
  return "~/.hermes/.env";
}

export async function sshReadEnv(
  config: SshConfig,
  profile?: string,
): Promise<Record<string, string>> {
  const content = await sshReadFile(config, remoteEnvPath(profile));
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const k = trimmed.substring(0, eqIdx).trim();
    let v = trimmed.substring(eqIdx + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (v) result[k] = v;
  }
  // Home Assistant has accumulated three naming conventions across hermes
  // versions: HASS_* (what gateway/config.py currently reads), HOMEASSISTANT_*
  // (legacy), and HA_* (older desktop builds). Mirror all three so the UI
  // can display the value regardless of which one the remote server uses.
  const HA_ALIAS_GROUPS: string[][] = [
    ["HASS_URL", "HOMEASSISTANT_URL", "HA_URL"],
    ["HASS_TOKEN", "HOMEASSISTANT_TOKEN", "HA_TOKEN"],
  ];
  for (const group of HA_ALIAS_GROUPS) {
    const present = group.find((k) => result[k]);
    if (!present) continue;
    const value = result[present];
    for (const k of group) {
      if (!result[k]) result[k] = value;
    }
  }
  return result;
}

// ── Remote API key (for chat auth through SSH tunnel) ─────────────────────────

export async function sshReadRemoteApiKey(config: SshConfig): Promise<string> {
  try {
    const env = await sshReadEnv(config);
    return env["API_SERVER_KEY"] || "";
  } catch {
    return "";
  }
}

// ── Gateway ───────────────────────────────────────────────────────────────────
//
// In SSH mode the remote gateway may be owned by a systemd `hermes.service`
// unit — the standard VPS installer sets this up. Starting our own detached
// `nohup` gateway then strands that unit in a restart crash-loop (issue
// #285). Each operation below therefore asks the remote, in a single shell
// `if`, whether such a unit is installed and routes the request through
// systemd when it is — one SSH round-trip, atomic decision. The command
// strings are built by the exported helpers below so they can be unit
// tested without a live host.

/**
 * Shell test that succeeds when a systemd `hermes.service` unit file is
 * installed on the remote. Safe on hosts without systemd: a missing
 * `systemctl` yields empty output, so the test simply fails and callers
 * fall back to the plain (`nohup` / pidfile) path.
 */
const SYSTEMD_HERMES_UNIT_TEST =
  "systemctl list-unit-files hermes.service 2>/dev/null | " +
  "grep -q '^hermes\\.service'";

/**
 * Command to start the remote gateway (issue #285). When a systemd
 * `hermes.service` exists it owns the lifecycle, so the request is handed
 * to systemd — `hermes.service` is a system unit, so `sudo` is tried first,
 * then a direct call for when the SSH user is root. If neither works the
 * command does nothing on purpose: an unmanaged `nohup` orphan that
 * crash-loops the systemd unit is worse than a gateway that simply did not
 * start (the status check will then report it as down). The detached
 * `nohup` start is used only when there is no unit to collide with.
 */
export function buildGatewayStartCommand(): string {
  return (
    `if ${SYSTEMD_HERMES_UNIT_TEST}; then ` +
    `sudo -n systemctl start hermes.service 2>/dev/null || ` +
    `systemctl start hermes.service 2>/dev/null || true; ` +
    `else ` +
    `(nohup hermes gateway start > $HOME/.hermes/gateway.log 2>&1 &); ` +
    `fi`
  );
}

/**
 * Command to report remote gateway state (issue #285). For a systemd-managed
 * gateway this is the unit's `is-active` state (`active` when up); otherwise
 * it is a liveness check on the recorded pid. Prints `active` or `running`
 * when up, anything else when not.
 */
export function buildGatewayStatusCommand(): string {
  return (
    `if ${SYSTEMD_HERMES_UNIT_TEST}; then ` +
    `systemctl is-active hermes.service 2>/dev/null || true; ` +
    `else ` +
    `if [ -f $HOME/.hermes/gateway.pid ]; then ` +
    `pid=$(python3 -c "import json,sys; d=json.load(open('$HOME/.hermes/gateway.pid')); print(d.get('pid',d) if isinstance(d,dict) else d)" 2>/dev/null || cat $HOME/.hermes/gateway.pid); ` +
    `kill -0 $pid 2>/dev/null && echo "running" || echo "stopped"; ` +
    `else echo "stopped"; fi; ` +
    `fi`
  );
}

export async function sshGatewayStatus(config: SshConfig): Promise<boolean> {
  try {
    const out = await sshExec(config, buildGatewayStatusCommand());
    const state = out.trim();
    return state === "running" || state === "active";
  } catch {
    return false;
  }
}

export async function sshStartGateway(config: SshConfig): Promise<void> {
  try {
    await sshExec(config, buildGatewayStartCommand());
  } catch {
    // best effort
  }
}

// ── Remote hermes CLI probe ───────────────────────────────────────────────────
//
// The desktop's non-interactive SSH does not source ~/.profile/~/.bashrc, so
// PATH additions made there are not visible. Probe known venv locations
// before falling back to `command -v hermes`.
//
// Exported for unit testing the probe list without a live remote host.
export function buildRemoteHermesCmd(args: string[], extraShell = ""): string {
  const candidates = [
    "$HOME/hermes-agent/.venv/bin/hermes",
    "$HOME/hermes-agent/venv/bin/hermes",
    "$HOME/.hermes/hermes-agent/.venv/bin/hermes",
    "$HOME/.hermes/hermes-agent/venv/bin/hermes",
    "/opt/hermes/hermes-agent/.venv/bin/hermes",
    "/opt/hermes/hermes-agent/venv/bin/hermes",
    "$HOME/.local/bin/hermes",
  ];
  const quotedArgs = args.map((a) => shellQuote(a)).join(" ");
  const probe = candidates
    .map((p) => `[ -x ${p} ] && exec ${p} ${quotedArgs}${extraShell}`)
    .join("; ");
  const script = `${probe}; command -v hermes >/dev/null && exec hermes ${quotedArgs}${extraShell}; echo "ERR: hermes CLI not found on remote PATH or in any known venv location" >&2; exit 1`;
  return `bash -c ${shellQuote(script)}`;
}

// ── Memory ───────────────────────────────────────────────────────────────────

const ENTRY_DELIMITER = "\n§\n";
const MEMORY_CHAR_LIMIT = 2200;
const USER_CHAR_LIMIT = 1375;

function parseMemoryEntries(content: string): MemoryEntry[] {
  if (!content.trim()) return [];
  return content
    .split(ENTRY_DELIMITER)
    .map((entry, index) => ({ index, content: entry.trim() }))
    .filter((e) => e.content.length > 0);
}

function serializeEntries(entries: MemoryEntry[]): string {
  return entries.map((e) => e.content).join(ENTRY_DELIMITER);
}

function remoteMemoryPath(profile?: string): string {
  if (profile && profile !== "default") {
    return `~/.hermes/profiles/${profile}/memories/MEMORY.md`;
  }
  return "~/.hermes/memories/MEMORY.md";
}

function remoteUserPath(profile?: string): string {
  if (profile && profile !== "default") {
    return `~/.hermes/profiles/${profile}/memories/USER.md`;
  }
  return "~/.hermes/memories/USER.md";
}

async function sshGetSessionStats(
  config: SshConfig,
  profile?: string,
): Promise<{ totalSessions: number; totalMessages: number }> {
  const script = `
import sqlite3, json, os, sys
payload = json.load(sys.stdin)
profile = payload.get("profile")
db = os.path.expanduser(f"~/.hermes/profiles/{profile}/state.db" if profile and profile != "default" else "~/.hermes/state.db")
if not os.path.exists(db):
    print(json.dumps({"totalSessions": 0, "totalMessages": 0}))
    sys.exit(0)
conn = sqlite3.connect(db)
try:
    s = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    m = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    print(json.dumps({"totalSessions": s, "totalMessages": m}))
except:
    print(json.dumps({"totalSessions": 0, "totalMessages": 0}))
finally:
    conn.close()
`;
  try {
    const out = await sshPython(config, script, pythonJsonInput({ profile }));
    return JSON.parse(out.trim());
  } catch {
    return { totalSessions: 0, totalMessages: 0 };
  }
}

export async function sshReadMemory(
  config: SshConfig,
  profile?: string,
): Promise<MemoryInfo> {
  const memContent = await sshReadFile(config, remoteMemoryPath(profile));
  const userContent = await sshReadFile(config, remoteUserPath(profile));
  const stats = await sshGetSessionStats(config, profile);

  return {
    memory: {
      content: memContent,
      exists: memContent.length > 0,
      lastModified: null,
      entries: parseMemoryEntries(memContent),
      charCount: memContent.length,
      charLimit: MEMORY_CHAR_LIMIT,
    },
    user: {
      content: userContent,
      exists: userContent.length > 0,
      lastModified: null,
      charCount: userContent.length,
      charLimit: USER_CHAR_LIMIT,
    },
    stats,
  };
}

export async function sshAddMemoryEntry(
  config: SshConfig,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  const current = await sshReadFile(config, remoteMemoryPath(profile));
  const entries = parseMemoryEntries(current);
  const newContent = serializeEntries([
    ...entries,
    { index: entries.length, content: content.trim() },
  ]);
  if (newContent.length > MEMORY_CHAR_LIMIT) {
    return {
      success: false,
      error: `Would exceed memory limit (${newContent.length}/${MEMORY_CHAR_LIMIT} chars)`,
    };
  }
  await sshWriteFile(config, remoteMemoryPath(profile), newContent);
  return { success: true };
}

export async function sshUpdateMemoryEntry(
  config: SshConfig,
  index: number,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  const current = await sshReadFile(config, remoteMemoryPath(profile));
  const entries = parseMemoryEntries(current);
  if (index < 0 || index >= entries.length)
    return { success: false, error: "Entry not found" };
  entries[index] = { ...entries[index], content: content.trim() };
  const newContent = serializeEntries(entries);
  if (newContent.length > MEMORY_CHAR_LIMIT) {
    return {
      success: false,
      error: `Would exceed memory limit (${newContent.length}/${MEMORY_CHAR_LIMIT} chars)`,
    };
  }
  await sshWriteFile(config, remoteMemoryPath(profile), newContent);
  return { success: true };
}

export async function sshRemoveMemoryEntry(
  config: SshConfig,
  index: number,
  profile?: string,
): Promise<boolean> {
  const current = await sshReadFile(config, remoteMemoryPath(profile));
  const entries = parseMemoryEntries(current);
  if (index < 0 || index >= entries.length) return false;
  entries.splice(index, 1);
  await sshWriteFile(
    config,
    remoteMemoryPath(profile),
    serializeEntries(entries),
  );
  return true;
}

export async function sshWriteUserProfile(
  config: SshConfig,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (content.length > USER_CHAR_LIMIT) {
    return {
      success: false,
      error: `Exceeds limit (${content.length}/${USER_CHAR_LIMIT} chars)`,
    };
  }
  await sshWriteFile(config, remoteUserPath(profile), content);
  return { success: true };
}

// ── Soul ─────────────────────────────────────────────────────────────────────

const DEFAULT_SOUL = `You are Hermes, a helpful AI assistant. You are friendly, knowledgeable, and always eager to help.

You communicate clearly and concisely. When asked to perform tasks, you think step-by-step and explain your reasoning. You are honest about your limitations and ask for clarification when needed.

You strive to be helpful while being safe and responsible. You respect the user's privacy and handle sensitive information carefully.
`;

function remoteSoulPath(profile?: string): string {
  if (profile && profile !== "default")
    return `~/.hermes/profiles/${profile}/SOUL.md`;
  return "~/.hermes/SOUL.md";
}

export async function sshReadSoul(
  config: SshConfig,
  profile?: string,
): Promise<string> {
  return await sshReadFile(config, remoteSoulPath(profile));
}

export async function sshWriteSoul(
  config: SshConfig,
  content: string,
  profile?: string,
): Promise<boolean> {
  try {
    await sshWriteFile(config, remoteSoulPath(profile), content);
    return true;
  } catch {
    return false;
  }
}

export async function sshResetSoul(
  config: SshConfig,
  profile?: string,
): Promise<string> {
  await sshWriteSoul(config, DEFAULT_SOUL, profile);
  return DEFAULT_SOUL;
}

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLSET_DEFS = [
  {
    key: "web",
    labelKey: "tools.web.label",
    descriptionKey: "tools.web.description",
  },
  {
    key: "browser",
    labelKey: "tools.browser.label",
    descriptionKey: "tools.browser.description",
  },
  {
    key: "terminal",
    labelKey: "tools.terminal.label",
    descriptionKey: "tools.terminal.description",
  },
  {
    key: "file",
    labelKey: "tools.file.label",
    descriptionKey: "tools.file.description",
  },
  {
    key: "code_execution",
    labelKey: "tools.code_execution.label",
    descriptionKey: "tools.code_execution.description",
  },
  {
    key: "vision",
    labelKey: "tools.vision.label",
    descriptionKey: "tools.vision.description",
  },
  {
    key: "image_gen",
    labelKey: "tools.image_gen.label",
    descriptionKey: "tools.image_gen.description",
  },
  {
    key: "tts",
    labelKey: "tools.tts.label",
    descriptionKey: "tools.tts.description",
  },
  {
    key: "skills",
    labelKey: "tools.skills.label",
    descriptionKey: "tools.skills.description",
  },
  {
    key: "memory",
    labelKey: "tools.memory.label",
    descriptionKey: "tools.memory.description",
  },
  {
    key: "session_search",
    labelKey: "tools.session_search.label",
    descriptionKey: "tools.session_search.description",
  },
  {
    key: "clarify",
    labelKey: "tools.clarify.label",
    descriptionKey: "tools.clarify.description",
  },
  {
    key: "delegation",
    labelKey: "tools.delegation.label",
    descriptionKey: "tools.delegation.description",
  },
  {
    key: "cronjob",
    labelKey: "tools.cronjob.label",
    descriptionKey: "tools.cronjob.description",
  },
  {
    key: "moa",
    labelKey: "tools.moa.label",
    descriptionKey: "tools.moa.description",
  },
  {
    key: "todo",
    labelKey: "tools.todo.label",
    descriptionKey: "tools.todo.description",
  },
];

function parseEnabledToolsets(content: string): Set<string> {
  const enabled = new Set<string>();
  let inPlatformToolsets = false;
  let inCli = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trimEnd();
    if (/^\s*platform_toolsets\s*:/.test(trimmed)) {
      inPlatformToolsets = true;
      inCli = false;
      continue;
    }
    if (inPlatformToolsets && /^\s+cli\s*:/.test(trimmed)) {
      inCli = true;
      continue;
    }
    if (inPlatformToolsets && /^\S/.test(trimmed) && !/^\s*$/.test(trimmed)) {
      inPlatformToolsets = false;
      inCli = false;
      continue;
    }
    if (inCli && /^\s{4}\S/.test(trimmed) && !/^\s{4,}-/.test(trimmed)) {
      inCli = false;
      continue;
    }
    if (inCli) {
      const m = trimmed.match(/^\s+-\s+["']?(\w+)["']?/);
      if (m) enabled.add(m[1]);
    }
  }
  return enabled;
}

function localizeToolDefs(
  enabled: boolean | ((key: string) => boolean),
): ToolsetInfo[] {
  const locale = getAppLocale();
  return TOOLSET_DEFS.map((d) => ({
    key: d.key,
    label: t(d.labelKey, locale),
    description: t(d.descriptionKey, locale),
    enabled: typeof enabled === "function" ? enabled(d.key) : enabled,
  }));
}

function remoteConfigPath(profile?: string): string {
  if (profile && profile !== "default")
    return `$HOME/.hermes/profiles/${profile}/config.yaml`;
  return `$HOME/.hermes/config.yaml`;
}

export async function sshGetToolsets(
  config: SshConfig,
  profile?: string,
): Promise<ToolsetInfo[]> {
  const content = await sshReadFile(config, remoteConfigPath(profile));
  if (!content) return localizeToolDefs(true);
  const enabled = parseEnabledToolsets(content);
  if (enabled.size === 0 && !content.includes("platform_toolsets"))
    return localizeToolDefs(true);
  return localizeToolDefs((key) => enabled.has(key));
}

export async function sshSetToolsetEnabled(
  config: SshConfig,
  key: string,
  enabled: boolean,
  profile?: string,
): Promise<boolean> {
  try {
    const configPath = remoteConfigPath(profile);
    const content = await sshReadFile(config, configPath);
    if (!content) return false;

    const current = parseEnabledToolsets(content);
    if (enabled) current.add(key);
    else current.delete(key);

    const toolsetLines = Array.from(current)
      .sort()
      .map((tk) => `      - ${tk}`)
      .join("\n");
    const newSection = `  cli:\n${toolsetLines}`;

    let newContent: string;
    if (content.includes("platform_toolsets")) {
      const lines = content.split("\n");
      const result: string[] = [];
      let inPT = false,
        inCli = false,
        inserted = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimEnd();
        if (/^\s*platform_toolsets\s*:/.test(trimmed)) {
          inPT = true;
          result.push(line);
          continue;
        }
        if (inPT && /^\s+cli\s*:/.test(trimmed)) {
          inCli = true;
          result.push(newSection);
          inserted = true;
          continue;
        }
        if (inCli) {
          if (/^\s+-\s/.test(trimmed)) continue;
          inCli = false;
          result.push(line);
          continue;
        }
        if (inPT && /^\S/.test(trimmed) && trimmed !== "") {
          inPT = false;
          if (!inserted) {
            result.push(newSection);
          }
        }
        result.push(line);
      }
      newContent = result.join("\n");
    } else {
      newContent =
        content.trimEnd() + "\n\nplatform_toolsets:\n" + newSection + "\n";
    }

    await sshWriteFile(config, configPath, newContent);
    return true;
  } catch {
    return false;
  }
}

// ── Models library ─────────────────────────────────────────────────────────────

export async function sshListModels(config: SshConfig): Promise<SavedModel[]> {
  try {
    const raw = await sshReadFile(config, "$HOME/.hermes/models.json");
    if (raw.trim()) return JSON.parse(raw);
  } catch {
    // no models.json on remote yet
  }
  return [];
}

export async function sshSaveModels(
  config: SshConfig,
  models: SavedModel[],
): Promise<void> {
  await sshWriteFile(
    config,
    "$HOME/.hermes/models.json",
    JSON.stringify(models, null, 2),
  );
}

// Mirror the local CRUD helpers in models.ts against the remote
// ~/.hermes/models.json. Each operation does a full read/mutate/write so the
// SSH cost is the same as a manual edit — there is no remote API to call
// instead, and the file is small (a few KB at most).

function randomId(): string {
  // RFC4122-ish v4 UUID without pulling in crypto.randomUUID, which is fine
  // here because IDs only need to be unique within models.json.
  const hex = (n: number): string =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

export async function sshAddModel(
  config: SshConfig,
  name: string,
  provider: string,
  model: string,
  baseUrl: string,
): Promise<SavedModel> {
  const models = await sshListModels(config);
  const existing = models.find(
    (m) => m.model === model && m.provider === provider,
  );
  if (existing) return existing;
  const entry: SavedModel = {
    id: randomId(),
    name,
    provider,
    model,
    baseUrl: baseUrl || "",
    createdAt: Date.now(),
  };
  await sshSaveModels(config, [...models, entry]);
  return entry;
}

export async function sshRemoveModel(
  config: SshConfig,
  id: string,
): Promise<boolean> {
  const models = await sshListModels(config);
  const filtered = models.filter((m) => m.id !== id);
  if (filtered.length === models.length) return false;
  await sshSaveModels(config, filtered);
  return true;
}

export async function sshUpdateModel(
  config: SshConfig,
  id: string,
  fields: Partial<Pick<SavedModel, "name" | "provider" | "model" | "baseUrl">>,
): Promise<boolean> {
  const models = await sshListModels(config);
  const idx = models.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  models[idx] = { ...models[idx], ...fields };
  await sshSaveModels(config, models);
  return true;
}
