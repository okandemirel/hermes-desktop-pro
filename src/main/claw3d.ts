// Office workspace backend — LOCAL MODE ONLY adapter for the 3D engine.
//
// Drives the local workspace engine. The renderer presents a native
// Hermes-owned Office workspace; this module only handles install (git clone + npm
// install + build), starting the dev server + websocket adapter bridge,
// stopping them, and reporting status. All SSH / remote-tunnel logic from the
// reference is intentionally dropped: `remoteUrl` is always null.
//
// This module is self-contained: helpers our codebase doesn't ship
// (stripAnsi, safeWriteFile, getEnhancedPath, API key resolution) are inlined
// so it typechecks and runs even though the runtime isn't installed in this repo.

import { spawn, ChildProcess, spawnSync } from "child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  chmodSync,
} from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { createConnection } from "net";
import { getHermesHome, getEnvValue } from "./config";

// ── Constants ─────────────────────────────────────────────────────────────

const CLAW3D_REPO = "https://github.com/iamlukethedev/Claw3D";
// Install dir lives alongside the rest of Hermes state. We don't use HERMES_HOME
// directly to avoid colliding with the agent install; a dedicated subdir keeps
// the workspace engine checkout self-contained and easy to wipe/reinstall.
const CLAW3D_DIR = join(homedir(), ".openclaw", "claw3d", "Claw3D");
const SETTINGS_DIR = join(homedir(), ".openclaw", "claw3d");
const DEV_PID_FILE = join(SETTINGS_DIR, "claw3d-dev.pid");
const ADAPTER_PID_FILE = join(SETTINGS_DIR, "claw3d-adapter.pid");
const PORT_FILE = join(SETTINGS_DIR, "claw3d-port");
const WS_URL_FILE = join(SETTINGS_DIR, "claw3d-ws-url");
const DEFAULT_PORT = 3000;
const DEFAULT_WS_URL = "ws://localhost:18789";
const ADAPTER_PORT = 18789;
const OFFICE_READY_TIMEOUT_MS = 45_000;
const OFFICE_READY_POLL_MS = 500;

// Script entry points inside the workspace engine checkout, run via `node`.
type Claw3dScript = "dev" | "hermes-adapter";
const CLAW3D_SCRIPT_ARGS: Record<Claw3dScript, string[]> = {
  dev: ["server/index.js", "--dev"],
  "hermes-adapter": ["server/hermes-gateway-adapter.js"],
};

// ── Module state ──────────────────────────────────────────────────────────

let devServerProcess: ChildProcess | null = null;
let adapterProcess: ChildProcess | null = null;
let devServerLogs = "";
let adapterLogs = "";
let devServerError = "";
let adapterError = "";

// ── Inlined helpers (not exported by our config/utils) ──────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*[a-zA-Z]|\x1B\][^\x07]*\x07|\x1B\(B|\r/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

/**
 * Write a file atomically, creating parent dirs as needed. When `mode` is given
 * (e.g. 0o600 for credential-bearing files) the temp file is created with that
 * mode and the final file is chmod'd to it regardless of umask.
 */
function safeWriteFile(filePath: string, content: string, mode?: number): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tempPath = join(
    dir,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`,
  );

  let tempWritten = false;
  try {
    writeFileSync(
      tempPath,
      content,
      mode !== undefined ? { encoding: "utf-8", mode } : "utf-8",
    );
    tempWritten = true;
    renameSync(tempPath, filePath);
    if (mode !== undefined) chmodSync(filePath, mode);
  } catch (err) {
    if (tempWritten) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* best-effort cleanup */
      }
    }
    throw err;
  }
}

/**
 * Build a PATH that includes the common locations where node/npm/git live, so
 * child processes spawned from a packaged Electron app (which inherits a bare
 * PATH on macOS) can still find the toolchain.
 */
function getEnhancedPath(): string {
  const home = homedir();
  const extras =
    process.platform === "win32"
      ? [
          join(home, "AppData", "Roaming", "npm"),
          process.env.ProgramFiles
            ? join(process.env.ProgramFiles, "nodejs")
            : "",
        ]
      : [
          "/usr/local/bin",
          "/opt/homebrew/bin",
          "/usr/bin",
          "/bin",
          join(home, ".volta", "bin"),
          join(home, ".asdf", "shims"),
        ];
  const sep = process.platform === "win32" ? ";" : ":";
  return [...extras.filter(Boolean), process.env.PATH || ""]
    .filter(Boolean)
    .join(sep);
}

/**
 * Gateway bearer token the Office adapter uses to authenticate to the Hermes
 * gateway. Reads API_SERVER_KEY from the active profile's `.env`; empty string
 * when none is configured (the gateway then accepts unauthenticated calls).
 */
function getApiServerKey(): string {
  try {
    return getEnvValue("API_SERVER_KEY") || "";
  } catch {
    return "";
  }
}

// ── Command resolution ──────────────────────────────────────────────────────

interface ResolvedCommand {
  command: string;
  windowsScript: boolean;
}

interface CommandInvocation {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

function isWindowsCommandScript(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command);
}

function resolveCommandOnPath(
  command: string,
  envPath: string,
): ResolvedCommand | null {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookupCommand, [command], {
    encoding: "utf8",
    env: { ...process.env, PATH: envPath },
    timeout: 5000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0 || !result.stdout) return null;

  const candidates = result.stdout
    .split(/\r?\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (process.platform === "win32") {
    const exe = candidates.find((c) => /\.exe$/i.test(c));
    if (exe) return { command: exe, windowsScript: false };
    const script = candidates.find(isWindowsCommandScript);
    if (script) return { command: script, windowsScript: true };
  }

  const resolved = candidates[0];
  return resolved ? { command: resolved, windowsScript: false } : null;
}

function resolveCommand(command: string, envPath: string): ResolvedCommand {
  const resolved = resolveCommandOnPath(command, envPath);
  if (resolved) return resolved;
  return {
    command,
    windowsScript:
      process.platform === "win32" && isWindowsCommandScript(command),
  };
}

function quoteWindowsCmdArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function createCommandInvocation(
  resolved: ResolvedCommand,
  args: string[],
): CommandInvocation {
  if (resolved.windowsScript) {
    const line = `"${[resolved.command, ...args]
      .map(quoteWindowsCmdArg)
      .join(" ")}"`;
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", line],
      windowsVerbatimArguments: true,
    };
  }
  return { command: resolved.command, args };
}

let _cachedNpmCommand: ResolvedCommand | null = null;

function findNpm(envPath = getEnhancedPath()): ResolvedCommand {
  if (_cachedNpmCommand) return _cachedNpmCommand;

  const home = homedir();
  const candidates = [
    ...(process.platform === "win32"
      ? [
          join(home, "AppData", "Roaming", "npm", "npm.cmd"),
          process.env.ProgramFiles
            ? join(process.env.ProgramFiles, "nodejs", "npm.cmd")
            : undefined,
        ]
      : []),
    join(home, ".volta", "bin", "npm"),
    join(home, ".asdf", "shims", "npm"),
    "/usr/local/bin/npm",
    "/opt/homebrew/bin/npm",
  ].filter((c): c is string => Boolean(c));

  // Discover the active nvm npm dynamically.
  const nvmDir = process.env.NVM_DIR || join(home, ".nvm");
  const nvmVersions = join(nvmDir, "versions", "node");
  if (existsSync(nvmVersions)) {
    try {
      const versions = readdirSync(nvmVersions)
        .filter((d: string) => d.startsWith("v"))
        .sort()
        .reverse();
      for (const v of versions) {
        candidates.unshift(join(nvmVersions, v, "bin", "npm"));
      }
    } catch {
      /* non-fatal */
    }
  }

  for (const c of candidates) {
    if (existsSync(c)) {
      _cachedNpmCommand = {
        command: c,
        windowsScript:
          process.platform === "win32" && isWindowsCommandScript(c),
      };
      return _cachedNpmCommand;
    }
  }

  _cachedNpmCommand = resolveCommand("npm", envPath);
  return _cachedNpmCommand;
}

// ── Persisted port / ws-url ─────────────────────────────────────────────────

function getSavedPort(): number {
  try {
    const port = parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
    return isNaN(port) ? DEFAULT_PORT : port;
  } catch {
    return DEFAULT_PORT;
  }
}

function getSavedWsUrl(): string {
  try {
    const url = readFileSync(WS_URL_FILE, "utf-8").trim();
    return url || DEFAULT_WS_URL;
  } catch {
    return DEFAULT_WS_URL;
  }
}

export function getClaw3dPort(): number {
  return getSavedPort();
}

export function setClaw3dPort(port: number): void {
  safeWriteFile(PORT_FILE, String(port));
  writeClaw3dSettings();
}

export function getClaw3dWsUrl(): string {
  return getSavedWsUrl();
}

export function setClaw3dWsUrl(url: string): void {
  safeWriteFile(WS_URL_FILE, url);
  writeClaw3dSettings(url);
}

// ── Config files written into the workspace engine checkout ──────────────────

function resolveOfficeModel(): string {
  try {
    const home = getHermesHome();
    void home; // touch to keep import used even if no model resolution wired
  } catch {
    /* ignore */
  }
  return "hermes";
}

function buildOfficeEnv(opts: {
  port: number;
  url: string;
  apiKey: string;
  model: string;
}): string {
  return [
    "# Auto-configured by Hermes Desktop Pro",
    `PORT=${opts.port}`,
    `HOST=127.0.0.1`,
    `NEXT_PUBLIC_GATEWAY_URL=${opts.url}`,
    `CLAW3D_GATEWAY_URL=${opts.url}`,
    `CLAW3D_GATEWAY_ADAPTER_TYPE=hermes`,
    `CLAW3D_GATEWAY_TOKEN=${opts.apiKey}`,
    `HERMES_API_KEY=${opts.apiKey}`,
    `HERMES_ADAPTER_PORT=${ADAPTER_PORT}`,
    `HERMES_MODEL=${opts.model || "hermes"}`,
    `HERMES_AGENT_NAME=Hermes`,
    "DEBUG=false",
    "",
  ].join("\n");
}

/**
 * Write settings.json + the .env in the checkout so the workspace app
 * skips onboarding and points at our gateway.
 */
function writeClaw3dSettings(wsUrl?: string): void {
  const url = wsUrl || getSavedWsUrl();
  const apiKey = getApiServerKey();

  try {
    // owner-only dir — it holds the gateway token (settings.json) + .env
    mkdirSync(SETTINGS_DIR, { recursive: true, mode: 0o700 });
    const settingsPath = join(SETTINGS_DIR, "settings.json");
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      /* fresh */
    }
    const existingGateway =
      existing.gateway &&
      typeof existing.gateway === "object" &&
      !Array.isArray(existing.gateway)
        ? (existing.gateway as Record<string, unknown>)
        : {};
    const existingProfiles =
      existingGateway.profiles &&
      typeof existingGateway.profiles === "object" &&
      !Array.isArray(existingGateway.profiles)
        ? (existingGateway.profiles as Record<string, unknown>)
        : {};
    const existingActiveFloorId =
      typeof existing.activeFloorId === "string"
        ? existing.activeFloorId
        : "hermes-first";
    const activeFloorId =
      existingActiveFloorId.startsWith("openclaw") ||
      existingActiveFloorId.startsWith("claw3d")
        ? "hermes-first"
        : existingActiveFloorId;
    const settings = {
      ...existing,
      version: typeof existing.version === "number" ? existing.version : 1,
      activeFloorId,
      gateway: {
        ...existingGateway,
        url,
        token: apiKey,
        adapterType: "hermes",
        profiles: {
          ...existingProfiles,
          hermes: { url, token: apiKey },
        },
        lastKnownGood: {
          url,
          token: apiKey,
          adapterType: "hermes",
        },
      },
      // Legacy fields for older runtime builds.
      adapter: "hermes",
      url,
      token: apiKey,
    };
    // 0o600 — file carries the API token
    safeWriteFile(settingsPath, JSON.stringify(settings, null, 2), 0o600);
  } catch {
    /* non-fatal */
  }

  try {
    if (existsSync(CLAW3D_DIR)) {
      safeWriteFile(
        join(CLAW3D_DIR, ".env"),
        buildOfficeEnv({
          port: getSavedPort(),
          url,
          apiKey,
          model: resolveOfficeModel(),
        }),
        0o600, // file carries the API token
      );
    }
  } catch {
    /* non-fatal */
  }
}

function patchClaw3dCheckout(): void {
  try {
    const replaceInCheckout = (
      relativePath: string[],
      replacements: Array<[string, string]>,
    ): void => {
      const filePath = join(CLAW3D_DIR, ...relativePath);
      if (!existsSync(filePath)) return;
      const source = readFileSync(filePath, "utf-8");
      let next = source;
      replacements.forEach(([search, replacement]) => {
        next = next.split(search).join(replacement);
      });
      if (next !== source) safeWriteFile(filePath, next);
    };

    const gatewayClientPath = join(
      CLAW3D_DIR,
      "src",
      "lib",
      "gateway",
      "GatewayClient.ts",
    );
    if (!existsSync(gatewayClientPath)) return;
    const source = readFileSync(gatewayClientPath, "utf-8");
    const current = "gatewayUrl: resolveStudioProxyGatewayUrl(),";
    const patched = "gatewayUrl: resolveStudioProxyGatewayUrl(gatewayUrl),";
    let gatewayClientNext = source;
    if (gatewayClientNext.includes(current) && !gatewayClientNext.includes(patched)) {
      gatewayClientNext = gatewayClientNext.replace(current, patched);
    }
    [
      [
        '      ? raw.adapterType\n      : "openclaw";',
        '      ? raw.adapterType\n      : "hermes";',
      ],
      [
        '          ? hello.adapterType\n          : "openclaw";',
        '          ? hello.adapterType\n          : "hermes";',
      ],
      [
        'useState<StudioGatewayAdapterType>("openclaw");',
        'useState<StudioGatewayAdapterType>("hermes");',
      ],
      ['adapterType: "openclaw",', 'adapterType: "hermes",'],
      [
        "This gateway looks too old for Claw3D's protocol v3. Upgrade OpenClaw, use the Hermes adapter, or run `npm run demo-gateway` for a no-framework office demo.",
        "This gateway looks too old for Hermes Office protocol v3. Restart the Hermes workspace adapter, or run the local demo gateway for diagnostics.",
      ],
      [
        "If this is a remote OpenClaw/Tailscale gateway, confirm the Studio host can reach the `wss://...` address and approve the first device pairing on the gateway host with `openclaw devices approve --latest`.",
        "If this is a remote Hermes gateway, confirm this Mac can reach the `wss://...` address and approve the first device pairing on the gateway host.",
      ],
      [
        "This gateway is asking for first-time device approval. Run `openclaw devices approve --latest` on the gateway host, then restart Claw3D and reconnect from this browser.",
        "This Hermes gateway is asking for first-time device approval. Approve the device on the gateway host, then restart Hermes Office and reconnect.",
      ],
      [
        "This gateway rejected the client as a control UI without device identity. For remote OpenClaw/Tailscale connections, update to the latest Claw3D build and approve the device pairing on the gateway host.",
        "This Hermes gateway rejected the client without device identity. Update the Hermes workspace adapter and approve the device pairing on the gateway host.",
      ],
    ].forEach(([search, replacement]) => {
      gatewayClientNext = gatewayClientNext.split(search).join(replacement);
    });
    if (gatewayClientNext !== source) safeWriteFile(gatewayClientPath, gatewayClientNext);

    replaceInCheckout(["server", "studio-settings.js"], [
      ['return { url, token, adapterType: "openclaw" };', 'return { url, token, adapterType: "hermes" };'],
      [': "openclaw";', ': "hermes";'],
      ['if (!token && adapterType === "openclaw") {', 'if (!token && adapterType === "hermes") {'],
    ]);

    replaceInCheckout(["server", "gateway-proxy.js"], [
      [': "openclaw";', ': "hermes";'],
    ]);

    replaceInCheckout(["src", "app", "layout.tsx"], [
      ['title: "Claw3D"', 'title: "Hermes Desktop Pro"'],
      [
        'description: "Focused operator studio for the OpenClaw gateway."',
        'description: "Hermes local command workspace."',
      ],
    ]);

    replaceInCheckout(["src", "features", "retro-office", "RetroOffice3D.tsx"], [
      ['officeTitle = "Luke Headquarters"', 'officeTitle = "Hermes HQ"'],
      [
        '"This is a demo call from the OpenClaw phone booth."',
        '"This is a demo call from the Hermes phone booth."',
      ],
    ]);

    replaceInCheckout(["src", "lib", "studio", "settings.ts"], [
      ['const DEFAULT_OFFICE_TITLE = "Luke Headquarters";', 'const DEFAULT_OFFICE_TITLE = "Hermes HQ";'],
    ]);

    replaceInCheckout(["src", "lib", "office", "floors.ts"], [
      ['label: "OpenClaw Floor"', 'label: "Hermes Floor"'],
      ['shortLabel: "OpenClaw"', 'shortLabel: "Hermes"'],
      ['label: "Claw3D Runtime Floor"', 'label: "Hermes Runtime Floor"'],
      ['shortLabel: "Claw3D"', 'shortLabel: "Hermes"'],
      [
        'export const DEFAULT_ACTIVE_FLOOR_ID: FloorId = "lobby";',
        'export const DEFAULT_ACTIVE_FLOOR_ID: FloorId = "hermes-first";',
      ],
    ]);

    replaceInCheckout(
      ["src", "features", "office", "components", "OfficeFloorNav.tsx"],
      [
        ['openclaw: "OpenClaw"', 'openclaw: "Hermes"'],
        ['claw3d: "Claw3D"', 'claw3d: "Hermes"'],
      ],
    );

    replaceInCheckout(
      ["src", "features", "office", "components", "panels", "SettingsPanel.tsx"],
      [
        ['placeholder="Luke Headquarters"', 'placeholder="Hermes HQ"'],
        ['["claw3d", "Claw3D"]', '["claw3d", "Hermes"]'],
        ['["openclaw", "OpenClaw"]', '["openclaw", "Hermes"]'],
        [
          "Attach a second read-only office from either another Claw3D or a remote OpenClaw gateway.",
          "Attach a second read-only workspace from another Hermes command floor.",
        ],
        [
          '<option value="presence_endpoint">Remote Claw3D presence endpoint</option>',
          '<option value="presence_endpoint">Remote Hermes presence endpoint</option>',
        ],
        [
          '<option value="openclaw_gateway">Remote OpenClaw gateway</option>',
          '<option value="openclaw_gateway">Remote Hermes gateway</option>',
        ],
        [
          "Use a presence endpoint when the other machine runs Claw3D. Use gateway mode when the other machine only runs OpenClaw.",
          "Use a presence endpoint when the other machine runs Hermes. Use gateway mode for a Hermes-compatible local gateway.",
        ],
        [
          "Studio polls this endpoint server-side when the other machine is also running Claw3D.",
          "Hermes polls this endpoint server-side when the other machine is also running Hermes.",
        ],
        [
          "Claw3D connects from the browser directly to the remote OpenClaw gateway and derives a read-only presence snapshot.",
          "Hermes connects directly to the remote workspace gateway and derives a read-only presence snapshot.",
        ],
      ],
    );

    replaceInCheckout(
      ["src", "features", "office", "components", "panels", "SkillsMarketplacePanel.tsx"],
      [['claw3d: "Claw3D"', 'claw3d: "Hermes"']],
    );

    replaceInCheckout(["src", "features", "office", "screens", "OfficeScreen.tsx"], [
      ['useState<FloorId>("lobby")', 'useState<FloorId>("hermes-first")'],
      ['useRef<FloorId>("lobby")', 'useRef<FloorId>("hermes-first")'],
      ['runtimeName: "Claw3D Demo"', 'runtimeName: "Hermes Demo"'],
      [
        "This removes the agent record from OpenClaw and clears its scheduled automations. Claw3D will not touch workspace files.",
        "This removes the agent record from Hermes and clears its scheduled automations. Hermes will not touch workspace files.",
      ],
      ['throw new Error("OpenClaw returned an empty transcript.");', 'throw new Error("Hermes returned an empty transcript.");'],
      ['console.error("Failed to copy OpenClaw console JSON.", error);', 'console.error("Failed to copy Hermes console JSON.", error);'],
      ['message: "Refreshing task-manager state in Claw3D."', 'message: "Refreshing task-manager state in Hermes."'],
      ["Live OpenClaw State", "Live Hermes State"],
      ["Live OpenClaw state does not match the current search.", "Live Hermes state does not match the current search."],
      ["Raw OpenClaw Gateway Events", "Raw Hermes Gateway Events"],
      ["No OpenClaw gateway events received yet.", "No Hermes gateway events received yet."],
      ["No OpenClaw events match the current search.", "No Hermes events match the current search."],
    ]);

    replaceInCheckout(["src", "lib", "runtime", "openclaw", "provider.ts"], [
      ['readonly label = "OpenClaw";', 'readonly label = "Hermes";'],
      ['runtimeName: "OpenClaw"', 'runtimeName: "Hermes"'],
    ]);

    replaceInCheckout(["src", "lib", "runtime", "createRuntimeProvider.ts"], [
      ['label: "Claw3D Runtime"', 'label: "Hermes Runtime"'],
      ['runtimeName: "Claw3D Runtime"', 'runtimeName: "Hermes Runtime"'],
    ]);

    replaceInCheckout(["src", "features", "agents", "components", "HeaderBar.tsx"], [
      [">Claw3D</p>", ">Hermes</p>"],
    ]);
  } catch {
    /* Runtime can still run with its upstream proxy behaviour. */
  }
}

// ── Process liveness ────────────────────────────────────────────────────────

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(file: string): number | null {
  try {
    const pid = parseInt(readFileSync(file, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(file: string, pid: number): void {
  safeWriteFile(file, String(pid));
}

function cleanupPid(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function isDevServerRunning(): boolean {
  if (devServerProcess && !devServerProcess.killed) return true;
  const pid = readPid(DEV_PID_FILE);
  if (pid && isProcessRunning(pid)) return true;
  cleanupPid(DEV_PID_FILE);
  return false;
}

function isAdapterRunning(): boolean {
  if (adapterProcess && !adapterProcess.killed) return true;
  const pid = readPid(ADAPTER_PID_FILE);
  if (pid && isProcessRunning(pid)) return true;
  cleanupPid(ADAPTER_PID_FILE);
  return false;
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(300);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true); // in use
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RuntimeWebSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: string): void;
  close(): void;
};

type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

function getRuntimeWebSocket(): RuntimeWebSocketConstructor | null {
  const candidate = (globalThis as unknown as {
    WebSocket?: RuntimeWebSocketConstructor;
  }).WebSocket;
  return typeof candidate === "function" ? candidate : null;
}

async function probeClaw3dGateway(port: number, timeoutMs: number): Promise<{
  success: boolean;
  error?: string;
}> {
  const WebSocketCtor = getRuntimeWebSocket();
  if (!WebSocketCtor) {
    return { success: false, error: "WebSocket runtime is not available." };
  }

  const url = `ws://127.0.0.1:${port}/api/gateway/ws`;
  return new Promise((resolve) => {
    const connectId = `hermes-office-ready-${Date.now()}`;
    let settled = false;
    let connectSent = false;
    let socket: RuntimeWebSocket | null = null;
    const settle = (result: { success: boolean; error?: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(fallbackConnectTimer);
      try {
        socket?.close();
      } catch {
        /* best-effort */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      settle({
        success: false,
        error: "Timed out waiting for the Office gateway handshake.",
      });
    }, timeoutMs);

    const sendConnect = (): void => {
      if (connectSent) return;
      connectSent = true;
      try {
        socket?.send(
          JSON.stringify({
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 4,
              client: {
                id: "openclaw-control-ui",
                version: "hermes-desktop",
                platform: "macOS",
                mode: "webchat",
              },
              role: "operator",
              scopes: [
                "operator.read",
                "operator.admin",
                "operator.approvals",
                "operator.pairing",
              ],
              caps: [],
              auth: {},
              userAgent: "Hermes Desktop Pro",
              locale: "en-US",
            },
          }),
        );
      } catch (err) {
        settle({
          success: false,
          error: err instanceof Error ? err.message : "Failed to send gateway probe.",
        });
      }
    };

    const fallbackConnectTimer = setTimeout(sendConnect, 750);

    try {
      socket = new WebSocketCtor(url);
    } catch (err) {
      settle({
        success: false,
        error: err instanceof Error ? err.message : "Failed to open gateway WebSocket.",
      });
      return;
    }

    socket.onopen = () => {
      /* The adapter sends connect.challenge immediately after open. */
    };

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data ?? "");
      try {
        const frame = JSON.parse(raw) as {
          type?: string;
          id?: string;
          event?: string;
          ok?: boolean;
          payload?: { type?: string; adapterType?: string };
          error?: { message?: string };
        };
        if (frame.type === "event" && frame.event === "connect.challenge") {
          sendConnect();
          return;
        }
        if (
          frame.type === "res" &&
          frame.id === connectId &&
          frame.ok === true &&
          frame.payload?.type === "hello-ok" &&
          frame.payload.adapterType === "hermes"
        ) {
          settle({ success: true });
          return;
        }
        if (frame.type === "res" && frame.ok === false) {
          settle({
            success: false,
            error: frame.error?.message || "Office gateway rejected the probe.",
          });
        }
      } catch {
        /* Ignore challenge/event frames until hello-ok arrives. */
      }
    };

    socket.onerror = () => {
      settle({ success: false, error: "Office gateway socket failed." });
    };

    socket.onclose = (event) => {
      settle({
        success: false,
        error: `Office gateway closed before hello-ok (${event.code}).`,
      });
    };
  });
}

async function waitForClaw3dGatewayReady(
  port: number,
  timeoutMs = OFFICE_READY_TIMEOUT_MS,
): Promise<{ success: boolean; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    const result = await probeClaw3dGateway(port, 2_500);
    if (result.success) return result;
    lastError = result.error || "";
    await sleep(OFFICE_READY_POLL_MS);
  }
  return {
    success: false,
    error: lastError || "Office gateway did not become ready.",
  };
}

// ── Status (matches the IPC contract shape exactly) ──────────────────────────

export interface Claw3dStatus {
  installed: boolean;
  running: boolean;
  port: number;
  portInUse: boolean;
  wsUrl: string;
  remoteUrl: string | null;
  error?: string;
}

export interface Claw3dSetupProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

export async function getClaw3dStatus(): Promise<Claw3dStatus> {
  // Installed = repo cloned AND deps installed (node_modules present).
  const cloned = existsSync(join(CLAW3D_DIR, "package.json"));
  const installed = cloned && existsSync(join(CLAW3D_DIR, "node_modules"));
  const port = getSavedPort();
  const devRunning = isDevServerRunning();
  const adapterUp = isAdapterRunning();
  const devPortOpen = devRunning ? await checkPort(port) : false;
  const gatewayReady =
    devRunning && devPortOpen && adapterUp
      ? (await probeClaw3dGateway(port, 1_000)).success
      : false;
  // Only flag a port conflict when our own dev server isn't the listener.
  const portInUse = devRunning ? false : await checkPort(port);
  const error = devServerError || adapterError;

  return {
    installed,
    running: devRunning && devPortOpen && adapterUp && gatewayReady,
    port,
    portInUse,
    wsUrl: getSavedWsUrl(),
    remoteUrl: null, // LOCAL MODE ONLY
    error:
      error ||
      (devRunning && !devPortOpen
        ? `Workspace process is running, but port ${port} is not reachable yet.`
        : devRunning && devPortOpen && adapterUp && !gatewayReady
          ? "Workspace gateway is starting. Waiting for hello-ok."
        : undefined),
  };
}

// ── Setup: clone + install + build ───────────────────────────────────────────

export async function claw3dSetup(
  onProgress: (progress: Claw3dSetupProgress) => void,
): Promise<void> {
  const totalSteps = 3;
  let log = "";

  function emit(step: number, title: string, text: string): void {
    log += text;
    onProgress({
      step,
      totalSteps,
      title,
      detail: text.trim().slice(0, 120),
      log,
    });
  }

  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    OPENCLAW_STATE_DIR: join(homedir(), ".openclaw"),
    TERM: "dumb",
  };

  function runStep(
    step: number,
    title: string,
    invocation: CommandInvocation,
    cwd: string,
    opts: { fatal: boolean } = { fatal: true },
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(invocation.command, invocation.args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      });
      proc.stdout?.on("data", (d: Buffer) =>
        emit(step, title, stripAnsi(d.toString())),
      );
      proc.stderr?.on("data", (d: Buffer) =>
        emit(step, title, stripAnsi(d.toString())),
      );
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else if (opts.fatal)
          reject(new Error(`${title} failed (exit code ${code})`));
        else resolve();
      });
      proc.on("error", (err) => {
        if (opts.fatal) reject(new Error(`${title}: ${err.message}`));
        else resolve();
      });
    });
  }

  const cloned = existsSync(join(CLAW3D_DIR, "package.json"));

  // Step 1: clone only when missing. Hermes owns the Office product shell; an
  // existing engine checkout must not drift by silently pulling upstream UI.
  if (!cloned) {
    const git = resolveCommand("git", env.PATH);
    mkdirSync(dirname(CLAW3D_DIR), { recursive: true });
    emit(1, "Preparing workspace...", "Preparing workspace files...\n");
    await runStep(
      1,
      "Preparing workspace...",
      createCommandInvocation(git, ["clone", CLAW3D_REPO, CLAW3D_DIR]),
      homedir(),
    );
    emit(1, "Preparing workspace...", "Workspace files ready.\n");
  } else {
    emit(
      1,
      "Preparing workspace...",
      "Hermes Office engine files already exist; skipping upstream update.\n",
    );
  }

  // Step 2: npm install.
  emit(2, "Installing dependencies...", "Running npm install...\n");
  await runStep(
    2,
    "Installing dependencies...",
    createCommandInvocation(findNpm(env.PATH), ["install"]),
    CLAW3D_DIR,
  );
  emit(2, "Installing dependencies...", "Dependencies installed.\n");

  // Step 3: build. Non-fatal — some runtime setups serve straight from `dev`
  // without a separate build step, so a missing/failing build script should
  // not abort the install.
  emit(3, "Building workspace...", "Running build step...\n");
  await runStep(
    3,
    "Building workspace...",
    createCommandInvocation(findNpm(env.PATH), ["run", "build"]),
    CLAW3D_DIR,
    { fatal: false },
  );
  emit(3, "Building workspace...", "Build step complete.\n");

  // Write config so the workspace app skips onboarding.
  patchClaw3dCheckout();
  writeClaw3dSettings();
}

// ── Start / stop ─────────────────────────────────────────────────────────────

function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  }
  setTimeout(() => {
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGKILL");
    } catch {
      /* already dead */
    }
  }, 3000);
}

function attachLogCapture(
  proc: ChildProcess,
  appendLog: (text: string) => void,
  setError: (text: string) => void,
): void {
  proc.stdout?.on("data", (d: Buffer) => appendLog(stripAnsi(d.toString())));
  proc.stderr?.on("data", (d: Buffer) => {
    const text = stripAnsi(d.toString());
    appendLog(text);
    if (
      /error|EADDRINUSE|ENOENT|failed|fatal/i.test(text) &&
      !/warning/i.test(text)
    ) {
      setError(text.trim().slice(0, 300));
    }
  });
}

function startDevServer(): boolean {
  if (isDevServerRunning()) return true;
  if (!existsSync(join(CLAW3D_DIR, "node_modules"))) return false;

  devServerError = "";
  devServerLogs = "";
  const port = getSavedPort();
  const wsUrl = getSavedWsUrl();
  const apiKey = getApiServerKey();
  const model = resolveOfficeModel();
  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    OPENCLAW_STATE_DIR: join(homedir(), ".openclaw"),
    TERM: "dumb",
    NEXT_PUBLIC_GATEWAY_URL: wsUrl,
    CLAW3D_GATEWAY_URL: wsUrl,
    CLAW3D_GATEWAY_ADAPTER_TYPE: "hermes",
    CLAW3D_GATEWAY_TOKEN: apiKey,
    HERMES_API_KEY: apiKey,
    HERMES_ADAPTER_PORT: String(ADAPTER_PORT),
    HERMES_MODEL: model,
    HERMES_AGENT_NAME: "Hermes",
    PORT: String(port),
    DEBUG: "false",
  };
  const node = resolveCommand("node", env.PATH);
  const proc = spawn(node.command, CLAW3D_SCRIPT_ARGS.dev, {
    cwd: CLAW3D_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    windowsHide: true,
  });

  devServerProcess = proc;
  if (proc.pid) writePid(DEV_PID_FILE, proc.pid);

  attachLogCapture(
    proc,
    (t) => {
      devServerLogs += t;
      if (devServerLogs.length > 2000)
        devServerLogs = devServerLogs.slice(-2000);
    },
    (e) => {
      devServerError = e;
    },
  );

  proc.on("close", (code) => {
    if (code && code !== 0 && !devServerError) {
      devServerError = `Dev server exited with code ${code}. Check if port ${port} is available.`;
    }
    devServerProcess = null;
    cleanupPid(DEV_PID_FILE);
  });

  proc.unref();
  return true;
}

function stopDevServer(): void {
  if (devServerProcess) {
    killProcessTree(devServerProcess);
    devServerProcess = null;
  }
  const pid = readPid(DEV_PID_FILE);
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    }
  }
  cleanupPid(DEV_PID_FILE);
}

function startAdapter(): boolean {
  if (isAdapterRunning()) return true;
  if (!existsSync(join(CLAW3D_DIR, "node_modules"))) return false;

  adapterError = "";
  adapterLogs = "";
  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    TERM: "dumb",
    HERMES_API_KEY: getApiServerKey(),
    HERMES_ADAPTER_PORT: String(ADAPTER_PORT),
    HERMES_MODEL: resolveOfficeModel(),
    HERMES_AGENT_NAME: "Hermes",
  };
  const node = resolveCommand("node", env.PATH);
  const proc = spawn(node.command, CLAW3D_SCRIPT_ARGS["hermes-adapter"], {
    cwd: CLAW3D_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    windowsHide: true,
  });

  adapterProcess = proc;
  if (proc.pid) writePid(ADAPTER_PID_FILE, proc.pid);

  attachLogCapture(
    proc,
    (t) => {
      adapterLogs += t;
      if (adapterLogs.length > 2000) adapterLogs = adapterLogs.slice(-2000);
    },
    (e) => {
      adapterError = e;
    },
  );

  proc.on("close", (code) => {
    if (code && code !== 0 && !adapterError) {
      adapterError = `Hermes adapter exited with code ${code}`;
    }
    adapterProcess = null;
    cleanupPid(ADAPTER_PID_FILE);
  });

  proc.unref();
  return true;
}

function stopAdapter(): void {
  if (adapterProcess) {
    killProcessTree(adapterProcess);
    adapterProcess = null;
  }
  const pid = readPid(ADAPTER_PID_FILE);
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    }
  }
  cleanupPid(ADAPTER_PID_FILE);
}

/**
 * Start the full Office stack: dev server + websocket adapter bridge.
 * `profile` is accepted for API parity with the reference; in local mode it
 * doesn't change behaviour (no SSH/remote selection).
 */
export async function startClaw3dAll(profile?: string): Promise<{
  success: boolean;
  error?: string;
}> {
  void profile; // local mode: profile has no effect on the stack
  if (!existsSync(join(CLAW3D_DIR, "node_modules"))) {
    return {
      success: false,
      error: "Workspace is not installed. Please install it first.",
    };
  }

  const port = getSavedPort();
  // Refresh config so the processes read the current port / url / key.
  patchClaw3dCheckout();
  writeClaw3dSettings();

  if (!startDevServer()) {
    return { success: false, error: `Failed to start dev server on port ${port}` };
  }
  if (!startAdapter()) {
    return { success: false, error: "Failed to start Hermes adapter" };
  }
  const ready = await waitForClaw3dGatewayReady(port);
  if (!ready.success) {
    return {
      success: false,
      error:
        ready.error ||
        "Workspace started, but the gateway handshake did not complete.",
    };
  }
  return { success: true };
}

export function stopClaw3dAll(): void {
  stopDevServer();
  stopAdapter();
  devServerError = "";
  adapterError = "";
}

export function getClaw3dLogs(): string {
  return [
    devServerLogs ? `=== Dev Server ===\n${devServerLogs}` : "",
    adapterLogs ? `=== Adapter ===\n${adapterLogs}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
