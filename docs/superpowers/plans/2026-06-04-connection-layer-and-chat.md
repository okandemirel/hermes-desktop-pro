# Connection Layer + Real Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated chat with real streamed chat against a Hermes gateway, reachable three ways — locally-spawned, remote URL, or VPS over an SSH tunnel — wired through the existing Hallmark UI.

**Architecture:** Thin Electron client. Main process resolves a `ConnectionConfig` (from `~/.hermes/desktop.json`) into a base URL + bearer, POSTs `/v1/chat/completions` (`stream:true`), parses SSE, and emits `stream-*` IPC events the renderer already subscribes to. Code is **ported and adapted from the reference at `/tmp/hermes-ref/src/main/`** (hybrid: faithful for hard/edge-case modules, re-glued to our types).

**Tech Stack:** Electron + electron-vite, TypeScript, React 19, Node builtins (`child_process`/`http`/`net`), system `ssh` binary, vitest. **No new npm dependencies.**

**Porting convention:** For "PORT" tasks, the reference file at the given path is the source of truth for function bodies — copy it, then apply the listed adaptations (imports/paths/types). Full code is inlined only for new glue and tests. The spec is `docs/superpowers/specs/2026-06-04-connection-layer-and-chat-design.md`.

**Channel-name decision:** Keep OUR existing preload event channels (`stream-chunk`, `reasoning-chunk`, `tool-progress`, `stream-done`, `stream-error`, `stream-usage`). The new main emitter targets those names (do NOT adopt the ref's `chat-*` names). Only `sendMessage` (→ `invoke("send-message")`) and abort (`chat-abort`) change in preload.

**E2E target:** The user's real `~/.hermes/desktop.json` is `ssh` mode (VPS, tunnel `18642→8642`). Primary end-to-end verification is SSH mode against that VPS.

---

## Pre-flight

- [ ] **Step 1: Confirm the reference is present**

Run: `ls /tmp/hermes-ref/src/main/{sse-parser,gateway-ports,ssh-tunnel,ssh-options,ssh-remote,config,hermes,process-options}.ts && ls /tmp/hermes-ref/src/shared/{url-key-map,attachments}.ts`
Expected: all files listed. If missing: `git clone --depth 1 https://github.com/fathah/hermes-desktop /tmp/hermes-ref`.

- [ ] **Step 2: Confirm no gateway is needed for unit work**

Run: `node -e "require('node:child_process').execSync('ssh -V',{stdio:'inherit'})"`
Expected: OpenSSH version prints (macOS ships it). Confirms SSH mode prerequisites.

---

## Phase A — Foundation modules (pure ports, bottom-up)

### Task A1: process-options + utils

**Files:**
- Create: `src/main/process-options.ts`
- Create: `src/main/utils.ts`

- [ ] **Step 1: Port `process-options.ts` verbatim**

Copy `/tmp/hermes-ref/src/main/process-options.ts` → `src/main/process-options.ts` (8 lines, no imports). Exports `HIDDEN_SUBPROCESS_OPTIONS`.

- [ ] **Step 2: Create `utils.ts` with the send-path subset**

Port from `/tmp/hermes-ref/src/main/utils.ts` ONLY these exports: `stripAnsi`, `normalizeProfileName`, `profileHome`, `profilePaths`, `pidIsAliveAs`, `getActiveProfileNameSync`. Adapt their `HERMES_HOME` source to our `getHermesHome()` in `src/main/config.ts` (import `{ getHermesHome }`). Drop any export that pulls in modules outside this subset.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors in `process-options.ts` / `utils.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/main/process-options.ts src/main/utils.ts
git commit -m "feat(main): port process-options + utils subset"
```

### Task A2: shared pure modules

**Files:**
- Create: `src/shared/url-key-map.ts`
- Create: `src/shared/attachments.ts`

- [ ] **Step 1: Copy both verbatim** (both are pure, zero imports)

Copy `/tmp/hermes-ref/src/shared/url-key-map.ts` and `/tmp/hermes-ref/src/shared/attachments.ts` to the same paths under our `src/shared/`. Confirm our `@shared` alias resolves them (it maps to `src/shared`).

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/shared/url-key-map.ts src/shared/attachments.ts
git commit -m "feat(shared): port url-key-map + attachments (pure)"
```

### Task A3: slim `installer.ts` (paths only — full installer deferred)

**Files:**
- Create: `src/main/installer.ts`

- [ ] **Step 1: Create a minimal installer module**

Implement ONLY the exports the send path needs, ported/adapted from `/tmp/hermes-ref/src/main/installer.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export const HERMES_HOME = process.env.HERMES_HOME || join(homedir(), ".hermes");
export const HERMES_REPO = join(HERMES_HOME, "hermes-agent");
export const HERMES_PYTHON = join(HERMES_REPO, "venv", "bin", "python"); // adapt to ref's resolution if it differs (check ref lines defining HERMES_PYTHON)

/** PATH with ~/.hermes/bin (uv) + common bins prepended, so spawned python/uv resolve. */
export function getEnhancedPath(): string {
  const extra = [join(HERMES_HOME, "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  return [...extra, process.env.PATH || ""].join(":");
}

/** Build CLI args to invoke the hermes module under the repo. */
export function hermesCliArgs(args: string[] = []): string[] {
  return ["-m", "hermes", ...args]; // adapt to ref's exact module/entry if different
}
```

Before finalizing, open `/tmp/hermes-ref/src/main/installer.ts` and reconcile `HERMES_PYTHON` and `hermesCliArgs` with the real definitions (the venv path and module entry must match the installed agent). A full install flow (clone/venv) is a later slice — do NOT port it now.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/installer.ts
git commit -m "feat(main): slim installer (paths/cli helpers; full install deferred)"
```

---

## Phase B — Connection config (desktop.json) + API server key

### Task B1: ConnectionConfig types + desktop.json I/O in config.ts

**Files:**
- Modify: `src/main/config.ts` (append; do NOT route desktop.json through the YAML helpers)

- [ ] **Step 1: Add types + desktop.json read/write + accessors**

Append to `src/main/config.ts`, ported from `/tmp/hermes-ref/src/main/config.ts:21-109`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
// getHermesHome() already exists in this file.

export interface SshConnectionConfig {
  host: string; port: number; username: string;
  keyPath: string; remotePort: number; localPort: number;
}
export interface ConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string; apiKey: string; ssh: SshConnectionConfig;
}
export interface PublicConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string; hasApiKey: boolean; apiKeyLength: number; ssh: SshConnectionConfig;
}

function desktopConfigFile(): string { return join(getHermesHome(), "desktop.json"); }

export function readDesktopConfig(): Record<string, unknown> {
  try {
    const f = desktopConfigFile();
    if (!existsSync(f)) return {};
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch { return {}; }
}
export function writeDesktopConfig(data: Record<string, unknown>): void {
  const home = getHermesHome();
  if (!existsSync(home)) mkdirSync(home, { recursive: true });
  writeFileSync(desktopConfigFile(), JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export function getConnectionConfig(): ConnectionConfig {
  const d = readDesktopConfig();
  const ssh = (d.sshConfig as Record<string, unknown>) || {};
  return {
    mode: (d.connectionMode as ConnectionConfig["mode"]) || "local",
    remoteUrl: (d.remoteUrl as string) || "",
    apiKey: (d.remoteApiKey as string) || "",
    ssh: {
      host: (ssh.host as string) || "", port: (ssh.port as number) || 22,
      username: (ssh.username as string) || "", keyPath: (ssh.keyPath as string) || "",
      remotePort: (ssh.remotePort as number) || 8642, localPort: (ssh.localPort as number) || 18642,
    },
  };
}
export function getPublicConnectionConfig(): PublicConnectionConfig {
  const c = getConnectionConfig();
  return { mode: c.mode, remoteUrl: c.remoteUrl, hasApiKey: !!c.apiKey, apiKeyLength: c.apiKey.length, ssh: c.ssh };
}
export function setConnectionConfig(input: { mode: ConnectionConfig["mode"]; remoteUrl?: string; apiKey?: string; ssh?: SshConnectionConfig }): void {
  const d = readDesktopConfig();
  d.connectionMode = input.mode;
  if (input.remoteUrl !== undefined) d.remoteUrl = input.remoteUrl;
  if (input.apiKey !== undefined && input.apiKey !== "") d.remoteApiKey = input.apiKey; // never clobber with blank
  if (input.mode === "ssh" && input.ssh) d.sshConfig = input.ssh;
  writeDesktopConfig(d);
}
```

Reconcile the snake-ish on-disk keys (`connectionMode`/`remoteApiKey`/`sshConfig`) against the ref exactly — stored configs must keep working.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/config.ts
git commit -m "feat(main): ConnectionConfig + desktop.json I/O"
```

### Task B2: getApiServerKey

**Files:**
- Modify: `src/main/config.ts`

- [ ] **Step 1: Port `getApiServerKey`**

Port `getApiServerKey(profile?)` from the ref `config.ts` (resolves `API_SERVER_KEY` from its 6 sources: config top-level, `.env`, `api_server.token` × profile/default). Reuse our existing `.env` reader (`getEnvValue`/`readEnv`) and YAML getter for the config-side lookups. Keep the exact precedence order from the ref.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/config.ts
git commit -m "feat(main): port getApiServerKey resolution"
```

---

## Phase C — Gateway ports (per-profile port resolution)

### Task C1: gateway-ports.ts + test

**Files:**
- Create: `src/main/gateway-ports.ts`
- Test: `src/main/gateway-ports.test.ts`

- [ ] **Step 1: Copy the ref test first (TDD)**

Copy `/tmp/hermes-ref/tests/gateway-ports.test.ts` → `src/main/gateway-ports.test.ts`; fix the import path to `./gateway-ports`. Adapt any config helper names to ours.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/main/gateway-ports.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Port `gateway-ports.ts`**

Copy `/tmp/hermes-ref/src/main/gateway-ports.ts` → `src/main/gateway-ports.ts` (105 lines). Adapt imports: `HERMES_HOME` from `./installer`, `normalizeProfileName` from `./utils`, and `getConfigValue`/`setConfigValue` to our config YAML helpers (the ref uses `./config` `getConfigValue`/`setConfigValue` — map to our `loadConfigYaml`/`saveConfigYaml` dot-path accessors, or add thin `getConfigValue`/`setConfigValue` wrappers in config.ts). Exports `DEFAULT_API_SERVER_PORT = 8642`, `getProfilePort(profile?)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/gateway-ports.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/gateway-ports.ts src/main/gateway-ports.test.ts
git commit -m "feat(main): port gateway-ports + test"
```

---

## Phase D — SSE parser (pure, TDD via ref test)

### Task D1: sse-parser.ts + its 247-line test

**Files:**
- Create: `src/main/sse-parser.ts`
- Test: `src/main/sse-parser.test.ts`

- [ ] **Step 1: Copy the ref test first**

Copy `/tmp/hermes-ref/tests/sse-parser.test.ts` → `src/main/sse-parser.test.ts`; set import to `./sse-parser`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/main/sse-parser.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Copy `sse-parser.ts` verbatim** (pure, zero imports)

Copy `/tmp/hermes-ref/src/main/sse-parser.ts` → `src/main/sse-parser.ts` (129 lines). Exports `processCustomEvent`, `processSseData`, `parseSseBlock`, `ParsedUsage`, `SseCallbacks`, `SseDataResult`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/main/sse-parser.test.ts`
Expected: PASS (all parse cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/sse-parser.ts src/main/sse-parser.test.ts
git commit -m "feat(main): port sse-parser + test (pure)"
```

---

## Phase E — SSH tunnel (~450 line MVP subset)

### Task E1: ssh-options + ssh-tunnel

**Files:**
- Create: `src/main/ssh-options.ts`
- Create: `src/main/ssh-tunnel.ts`

- [ ] **Step 1: Port `ssh-options.ts` verbatim** (32 lines, pure)

Copy `/tmp/hermes-ref/src/main/ssh-options.ts`. Exports `SshControlOptions`, `buildSshControlOptions`.

- [ ] **Step 2: Port `ssh-tunnel.ts`** (258 lines)

Copy `/tmp/hermes-ref/src/main/ssh-tunnel.ts`. Adapt imports: `./ssh-options`, `./process-options` (both ported). Uses only node builtins (`child_process`, `os`, `path`, `net`, `http`). Exports `SshConfig`, `getSshTunnelUrl`, `isSshTunnelActive`, `isSshTunnelHealthy`, `startSshTunnel`, `stopSshTunnel`, `ensureSshTunnel`, `testSshConnection` (+ private `findFreePort`/`waitForPort`/`waitForHealth`/`buildSshArgs`).

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/ssh-options.ts src/main/ssh-tunnel.ts
git commit -m "feat(main): port ssh-options + ssh-tunnel (system ssh, no deps)"
```

### Task E2: ssh-remote subset (exec + apiKey + gateway helpers only)

**Files:**
- Create: `src/main/ssh-remote.ts`

- [ ] **Step 1: Port ONLY the chat-MVP exports**

From `/tmp/hermes-ref/src/main/ssh-remote.ts` port ONLY: `sshExec`, `sshReadRemoteApiKey`, `buildRemoteHermesCmd`, `buildGatewayStartCommand`, `buildGatewayStatusCommand`, `sshGatewayStatus`, `sshStartGateway`, plus any tiny private helpers they call (e.g. `sanitizeSshError`, `sshPython` if referenced). Adapt imports to `./ssh-options`, `./process-options`, and type-only `./ssh-tunnel` (`SshConfig`). **Do NOT port** the ~40 per-screen proxies (skills/memory/sessions/etc.) — later slices.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean (no dangling imports from the dropped exports).

- [ ] **Step 3: Commit**

```bash
git add src/main/ssh-remote.ts
git commit -m "feat(main): port ssh-remote subset (exec/apiKey/gateway)"
```

---

## Phase F — Chat client (`hermes.ts`)

### Task F1: connection resolvers + unit test

**Files:**
- Create: `src/main/hermes.ts` (initial: resolvers only)
- Test: `src/main/hermes-connection.test.ts`

- [ ] **Step 1: Write the failing test for URL/header resolution**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./config", () => ({
  getConnectionConfig: vi.fn(),
}));
vi.mock("./ssh-tunnel", () => ({
  getSshTunnelUrl: vi.fn(() => "http://127.0.0.1:18642"),
  isSshTunnelActive: vi.fn(() => true), isSshTunnelHealthy: vi.fn(async () => true), startSshTunnel: vi.fn(),
}));
vi.mock("./gateway-ports", () => ({ getProfilePort: vi.fn(() => 8642), DEFAULT_API_SERVER_PORT: 8642 }));

import { getApiUrl, getRemoteAuthHeader, normaliseRemoteUrl, setSshRemoteApiKey } from "./hermes";
import { getConnectionConfig } from "./config";

describe("connection resolution", () => {
  beforeEach(() => vi.clearAllMocks());
  it("local → 127.0.0.1:profilePort, no auth", () => {
    (getConnectionConfig as any).mockReturnValue({ mode: "local", remoteUrl: "", apiKey: "", ssh: {} });
    expect(getApiUrl()).toBe("http://127.0.0.1:8642");
    expect(getRemoteAuthHeader()).toEqual({});
  });
  it("remote → normalised url + bearer", () => {
    (getConnectionConfig as any).mockReturnValue({ mode: "remote", remoteUrl: "https://vps.example/v1/", apiKey: "K", ssh: {} });
    expect(getApiUrl()).toBe("https://vps.example");
    expect(getRemoteAuthHeader()).toEqual({ Authorization: "Bearer K" });
  });
  it("ssh → tunnel url + remote bearer", () => {
    (getConnectionConfig as any).mockReturnValue({ mode: "ssh", remoteUrl: "", apiKey: "", ssh: { host: "h" } });
    setSshRemoteApiKey("RK");
    expect(getApiUrl()).toBe("http://127.0.0.1:18642");
    expect(getRemoteAuthHeader()).toEqual({ Authorization: "Bearer RK" });
  });
  it("normaliseRemoteUrl strips trailing / and /v1", () => {
    expect(normaliseRemoteUrl("http://x/v1/")).toBe("http://x");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/main/hermes-connection.test.ts`
Expected: FAIL (no `./hermes`).

- [ ] **Step 3: Implement the resolvers in `hermes.ts`**

Port from `/tmp/hermes-ref/src/main/hermes.ts:78-152`: `normaliseRemoteUrl`, `getApiUrl`, `getRemoteAuthHeader`, `isRemoteMode`, `isRemoteOnlyMode`, `setSshRemoteApiKey` (+ module `_sshRemoteApiKey`), `ensureSshTunnelIfNeeded`. Imports: `./config` (`getConnectionConfig`), `./ssh-tunnel`, `./ssh-remote` (`sshReadRemoteApiKey`, `sshGatewayStatus`, `sshStartGateway`), `./gateway-ports` (`getProfilePort`), `./utils` (`getActiveProfileNameSync`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/main/hermes-connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/hermes.ts src/main/hermes-connection.test.ts
git commit -m "feat(main): hermes connection resolvers + test"
```

### Task F2: sendMessage (HTTP/SSE) + gateway lifecycle

**Files:**
- Modify: `src/main/hermes.ts`

- [ ] **Step 1: Port the send path + gateway lifecycle**

Port from the ref `hermes.ts`: `ChatCallbacks` + `ChatHandle` interfaces, `sendMessage(message, cb, profile?, resumeSessionId?, history?, attachments?, contextFolder?)`, private `sendMessageViaApi` (HTTP `POST {getApiUrl()}/v1/chat/completions`, `stream:true`, `Authorization` + `X-Hermes-Session-Id`; inline SSE parse loop lines 616–776 — content/reasoning/tool/usage/[DONE]/error; AbortController returning `{abort}`), `startGateway`/`stopGateway`/`isGatewayRunning`/`isApiReady`/`restartGateway`, `testRemoteConnection(url, apiKey?)`, and the local-vs-remote routing in `sendMessage` (remote/ssh → API only; local → health-check then API, else CLI). Build the request body via `getModelConfig`. Preserve the `ChatCallbacks` shape verbatim (incl. `onReasoningChunk` + cache/rate-limit usage fields).

`sendMessageViaCli` (the spawn fallback) is a **stretch** — implement only after F2 API path works E2E; it additionally needs `./installer` (`HERMES_PYTHON`, `hermesCliArgs`, `getEnhancedPath`) and `./utils` (`stripAnsi`).

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck && npx vitest run src/main/hermes-connection.test.ts`
Expected: clean + connection test still passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/hermes.ts
git commit -m "feat(main): port sendMessage HTTP/SSE + gateway lifecycle"
```

---

## Phase G — Main IPC wiring

### Task G1: send-message handler + abort + emitters

**Files:**
- Modify: `src/main/index.ts` (replace the empty `chat-abort` stub at ~:244; add `send-message`)

- [ ] **Step 1: Add the streaming IPC handler**

In `registerIpcHandlers`, add (emitting to OUR existing channel names):

```ts
import { sendMessage, ensureSshTunnelIfNeeded, setSshRemoteApiKey, isRemoteMode } from "./hermes";
import { getConnectionConfig } from "./config";
import { sshReadRemoteApiKey } from "./ssh-remote";

let currentChatAbort: (() => void) | null = null;

ipcMain.handle("send-message", async (event, message: string, options: {
  profile?: string; resumeSessionId?: string;
  history?: Array<{ role: string; content: string }>; attachments?: import("../shared/attachments").Attachment[];
} = {}) => {
  const safeSend = (ch: string, payload?: unknown) => { if (!event.sender.isDestroyed()) event.sender.send(ch, payload); };
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") { await ensureSshTunnelIfNeeded(); setSshRemoteApiKey(await sshReadRemoteApiKey(conn.ssh)); }
  return await new Promise((resolve) => {
    let full = "", sid: string | undefined;
    const handle = sendMessageSyncWrap(message, {
      onChunk: (t) => { full += t; safeSend("stream-chunk", t); },
      onReasoningChunk: (t) => safeSend("reasoning-chunk", t),
      onToolProgress: (tool) => safeSend("tool-progress", tool),
      onUsage: (u) => safeSend("stream-usage", u),
      onError: (e) => { currentChatAbort = null; safeSend("stream-error", e); resolve({ response: full, sessionId: sid }); },
      onDone: (s) => { sid = s; currentChatAbort = null; safeSend("stream-done", s ?? ""); resolve({ response: full, sessionId: sid }); },
    }, options.profile, options.resumeSessionId, options.history, options.attachments);
    currentChatAbort = handle.abort;
  });
});

ipcMain.on("chat-abort", () => { currentChatAbort?.(); currentChatAbort = null; });
```

`sendMessageSyncWrap` = call `sendMessage(...)` (which returns `Promise<ChatHandle>`); capture the handle for abort. If `sendMessage` is async-returning, `await` it before assigning `currentChatAbort`, or adjust to the ref's pattern (ref stores `handle.abort` after `await sendMessage(...)`). Match the ref's index.ts:823–955 wiring exactly.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): send-message IPC handler + abort + stream emitters"
```

### Task G2: connection + gateway + ssh IPC

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add control-plane handlers**

```ts
import { getPublicConnectionConfig, setConnectionConfig } from "./config";
import { startGateway, stopGateway, isGatewayRunning, isApiReady, testRemoteConnection } from "./hermes";
import { isSshTunnelActive, startSshTunnel, stopSshTunnel, testSshConnection } from "./ssh-tunnel";

ipcMain.handle("get-connection-config", () => getPublicConnectionConfig());
ipcMain.handle("set-connection-config", (_e, input) => { setConnectionConfig(input); return getPublicConnectionConfig(); });
ipcMain.handle("test-connection", async () => {
  const conn = getConnectionConfig();
  const t0 = Date.now();
  try {
    if (conn.mode === "ssh") { const ok = await testSshConnection(conn.ssh); return { ok, mode: conn.mode, latencyMs: Date.now() - t0 }; }
    if (conn.mode === "remote") { const ok = await testRemoteConnection(conn.remoteUrl, conn.apiKey); return { ok, mode: conn.mode, latencyMs: Date.now() - t0 }; }
    return { ok: isApiReady() || isGatewayRunning(), mode: conn.mode, latencyMs: Date.now() - t0 };
  } catch (e) { return { ok: false, mode: conn.mode, latencyMs: Date.now() - t0, error: String(e) }; }
});
ipcMain.handle("gateway-status", () => ({ running: isGatewayRunning(), ready: isApiReady() }));
ipcMain.handle("gateway-start", () => startGateway());
ipcMain.handle("gateway-stop", () => stopGateway());
ipcMain.handle("ssh-tunnel-active", () => isSshTunnelActive());
ipcMain.handle("start-ssh-tunnel", async () => { await startSshTunnel(getConnectionConfig().ssh); return isSshTunnelActive(); });
ipcMain.handle("stop-ssh-tunnel", () => { stopSshTunnel(); return true; });
```

- [ ] **Step 2: App lifecycle — auto tunnel + teardown**

In `app.whenReady().then(...)` after window creation: `const c = getConnectionConfig(); if (c.mode === "ssh" && c.ssh.host) startSshTunnel(c.ssh).catch(()=>{});`. In `app.on("window-all-closed")` and `app.on("before-quit")`: `stopSshTunnel(); stopGateway();`.

- [ ] **Step 3: Verify + Commit**

Run: `npm run typecheck`

```bash
git add src/main/index.ts
git commit -m "feat(main): connection/gateway/ssh IPC + lifecycle"
```

---

## Phase H — Preload bridge

### Task H1: real sendMessage + connection methods

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace the `sendMessage` stub (lines 42–58)**

```ts
sendMessage: (message: string, options: {
  profile?: string; resumeSessionId?: string;
  history?: Array<{ role: string; content: string }>; attachments?: Attachment[];
} = {}): Promise<{ response: string; sessionId?: string }> =>
  ipcRenderer.invoke("send-message", message, options),
abortChat: (): void => ipcRenderer.send("chat-abort"),
```

(Keep the 6 `onStream*`/`onReasoningChunk`/`onToolProgress`/`onUsage` subscribers UNCHANGED — channel names already match the main emitters.)

- [ ] **Step 2: Add connection/gateway/ssh methods**

```ts
getConnectionConfig: () => ipcRenderer.invoke("get-connection-config"),
setConnectionConfig: (input: { mode: "local"|"remote"|"ssh"; remoteUrl?: string; apiKey?: string; ssh?: { host:string;port:number;username:string;keyPath:string;remotePort:number;localPort:number } }) => ipcRenderer.invoke("set-connection-config", input),
testConnection: () => ipcRenderer.invoke("test-connection"),
gatewayStatus: () => ipcRenderer.invoke("gateway-status"),
gatewayStart: () => ipcRenderer.invoke("gateway-start"),
gatewayStop: () => ipcRenderer.invoke("gateway-stop"),
sshTunnelActive: () => ipcRenderer.invoke("ssh-tunnel-active"),
startSshTunnel: () => ipcRenderer.invoke("start-ssh-tunnel"),
stopSshTunnel: () => ipcRenderer.invoke("stop-ssh-tunnel"),
```

`HermesAPI = typeof api` updates automatically; `window.hermes` typing in `env.d.ts` needs no change.

- [ ] **Step 3: Verify + Commit**

Run: `npm run typecheck`

```bash
git add src/preload/index.ts
git commit -m "feat(preload): real sendMessage invoke + connection methods"
```

---

## Phase I — Renderer wiring

### Task I1: useChatStream → IPC

**Files:**
- Modify: `src/renderer/src/hooks/useChatStream.ts`
- Modify: `src/renderer/src/components/ChatView.tsx`

- [ ] **Step 1: Rewrite the send path (replace lines 23–127)**

Replace the `fetch`/SSE/`runSimulated` body. New `sendMessage`:
1. Push user bubble + empty assistant bubble (`assistantId`); `setIsStreaming(true)`.
2. Build `history` from prior `messages` filtered to role user/assistant `{role, content}`.
3. Subscribe (store unsubscribe fns): `window.hermes.onStreamChunk(t => append t to assistantId)`, `onReasoningChunk(t => append to assistant.reasoning)`, `onToolProgress(...)`, `onUsage(u => onTokenUsage(u))`, `onStreamError(e => set assistant content to honest error, stop)`, `onStreamDone(sid => stop, store sessionId)`. Unsubscribe all on done/error.
4. `await window.hermes.sendMessage(text, { resumeSessionId: options.sessionId, history })`.
5. `abortStream` → `window.hermes.abortChat()`.
6. Delete `runSimulated`/`simulateResponse`/local `AbortController`. **No fake stream** — disconnected surfaces as an error bubble.

Add `sessionId?: string` to `UseChatStreamOptions`; keep `ChatMessage`/`TokenUsage` from `@shared/types`.

- [ ] **Step 2: Thread sessionId at the call site (ChatView.tsx:60–63)**

```ts
const { messages, isStreaming, sendMessage, abortStream } = useChatStream({
  providerId: tab.providerId, modelId: tab.modelId, sessionId: tab.sessionId,
  onTokenUsage: (usage: TokenUsage) => setTokenUsage(usage),
});
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useChatStream.ts src/renderer/src/components/ChatView.tsx
git commit -m "feat(renderer): wire chat to real IPC (no simulated fallback)"
```

### Task I2: Settings connection UI (local/remote/ssh) + status

**Files:**
- Modify: `src/renderer/src/components/SettingsView.tsx`
- Modify: `src/renderer/src/App.tsx` (sidebar status)

- [ ] **Step 1: Load + persist real connection config**

On mount, `const cfg = await window.hermes.getConnectionConfig()` → seed `mode` (add `"ssh"` to `ConnMode`), `remoteUrl`, `localPort`, and an `ssh` state object `{host,port,username,keyPath,remotePort,localPort}`. The Network section's Local/Remote segment becomes Local/Remote/SSH. On change of any field, debounce-call `window.hermes.setConnectionConfig({ mode, remoteUrl, apiKey, ssh })`.

- [ ] **Step 2: Add the SSH sub-form (shown when mode==="ssh")**

Using existing `Field`/`Input` primitives, add fields: Host, Port (default 22), Username, Key path (default `~/.ssh/id_rsa`), Remote port (default 8642), Local port (default 18642). Keep the Hallmark two-pane layout.

- [ ] **Step 3: Test connection button + live status**

Add a "Test connection" `Button` → `const r = await window.hermes.testConnection()` → show ok/latency/error inline. Show a status row reflecting `r.ok`.

- [ ] **Step 4: Sidebar status (App.tsx footer)**

Poll `window.hermes.testConnection()` (or `gatewayStatus`) on an interval; render the footer "Local · Connected" from the real `{ ok, mode }` (mode label + green/red `StatusDot`).

- [ ] **Step 5: Verify build + Commit**

Run: `npm run typecheck && npm run build`

```bash
git add src/renderer/src/components/SettingsView.tsx src/renderer/src/App.tsx
git commit -m "feat(renderer): real connection settings (local/remote/ssh) + status"
```

---

## Phase J — End-to-end verification

### Task J1: E2E against the user's SSH/VPS gateway

- [ ] **Step 1: Confirm connection config**

Run: `npm run build && npm run dev` (real window). In Settings → Network, confirm mode = SSH with the VPS host/key prefilled from `desktop.json`; click **Test connection** → expect `ok:true`.

- [ ] **Step 2: Real chat**

Open Chat, send "hello" → expect a **real streamed reply** (not the canned simulated text) + token usage in the footer. Try a reasoning model to see reasoning chunks; trigger a tool to see tool-progress.

- [ ] **Step 3: Mode matrix smoke test**

- Remote: point at the VPS URL directly (mode remote) + key → chat works.
- Local: if the agent venv runs, `gateway-start` → status ready → chat; if not installed, confirm the honest "not installed/disconnected" state (installer is a later slice).

- [ ] **Step 4: Disconnect honesty**

Stop the tunnel / use a bad URL → Chat shows a real error + a path to Settings (NO simulated reply).

- [ ] **Step 5: Final gate**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: all clean/green.

- [ ] **Step 6: Commit + push**

```bash
git add -A && git commit -m "feat: Slice 1 — real chat over local/remote/ssh connection"
git push origin main
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** connection layer (B, C, F1, G2) · 3 modes (B1, E, F1, G2) · SSE chat (D, F2, G1, H, I1) · renderer wiring (I) · honest errors (I1, J4) · testing (C1, D1, F1, J5) · out-of-scope respected (slim installer A3, ssh-remote subset E2) — all mapped.
- **Placeholder scan:** ported bodies reference exact ref files (convention stated up front); new glue + tests inlined. No "TBD".
- **Type consistency:** `ConnectionConfig`/`SshConnectionConfig` (B1) reused in E/F/G; `ChatCallbacks` (F2) → emitter channels (G1) → preload subscribers (H, unchanged) → hook (I1); channel names fixed to `stream-*`. `sendMessage(message, options)` signature consistent across H1/I1/G1.
- **Risks:** SSH isolated to D/E; if local won't spawn, remote/ssh still ship; secrets stay in `.env`/`desktop.json` (0600), never logged.
