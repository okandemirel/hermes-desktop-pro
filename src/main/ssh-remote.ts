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
