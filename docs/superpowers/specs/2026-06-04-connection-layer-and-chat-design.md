# Slice 1 — Connection Layer + Real Chat (local · remote · ssh)

**Date:** 2026-06-04
**Status:** Approved design (Approach C — hybrid/faithful port)
**Scope:** First slice of the "make the mock shell real" effort. Brings the app from a UI shell to a genuinely working Hermes Desktop client that streams real chat against a Hermes **gateway**, reachable three ways: a locally-spawned gateway, a remote URL, or a VPS over an SSH tunnel.

---

## 1. Context & Goal

`hermes-desktop-pro` reproduces the UI of upstream `fathah/hermes-desktop` but with mock data; the real gap is the backend. The desktop app is **not** the agent — it is a thin control-plane client over a separate Python **gateway** (`hermes-agent`) that exposes an OpenAI-compatible HTTP/SSE API on `127.0.0.1:8642`.

**Goal of Slice 1:** A user can configure a connection (local / remote / ssh) and have **real, streamed chat** flow end-to-end through our Hallmark UI — replacing today's simulated stream. The connection layer is architected so later slices (sessions, memory, skills, …) reuse it.

**Direction (confirmed with user):** Port-and-adapt the real backend from `/tmp/hermes-ref`, keep our Hallmark UI. Support **all three** connection modes (local, remote, VPS/SSH) like upstream.

## 2. Current State (verified)

- Only **Office/Claw3D** is wired (real process spawn). Config/env/profile I/O is real (`config.ts`).
- **Chat** does a raw `fetch` to a hardcoded `127.0.0.1:8642` and falls back to `runSimulated()`; the `sendMessage`/`chat-stream` IPC path is declared in preload but has **no main handler**. The 6 stream events are declared but never emitted.
- Everything else is mock with no backing IPC.
- On disk: `/tmp/hermes-ref/src/main` (reference, intact), `~/.hermes` with `hermes-agent`, `.env` (real keys), `config.yaml`, `desktop.json` (connection config), `bin/uv`. No gateway currently listening on 8642.

## 3. Target Architecture

```
ChatView ──useChatStream──▶ window.hermes.sendMessage()
                                   │ IPC (chat-stream + abort)
                                   ▼
                         [ main: hermes.ts chat client ]
                                   │ resolve
                                   ▼
                         [ connection.ts → ConnectionConfig ]
                 ┌─────────────────┼─────────────────────────┐
              local              remote                      ssh
        spawn+health         direct URL                 SSH tunnel
        127.0.0.1:port       remoteUrl+key         localPort→host:remotePort
                 └─────────────────┴─────────────────────────┘
                                   ▼
                 POST {base}/v1/chat/completions  (stream:true,
                 Authorization: Bearer <API_SERVER_KEY>, X-Hermes-Session-Id)
                                   ▼
                         [ sse-parser.ts ] → events
                                   ▼
        IPC: stream-chunk / reasoning-chunk / tool-progress /
             stream-usage / stream-done / stream-error  ──▶ renderer
```

**Single source of truth for connection:** `~/.hermes/desktop.json` (matches upstream shape).

## 4. Connection Modes

`ConnectionConfig` (resolved by `connection.ts`, persisted to `desktop.json`):

```ts
type ConnectionMode = "local" | "remote" | "ssh";
interface ConnectionConfig {
  mode: ConnectionMode;
  profile?: string;            // active profile (local)
  localPort?: number;          // local gateway port (default 8642)
  remoteUrl?: string;          // remote: base URL of a running gateway
  apiKey?: string;             // remote/ssh: API_SERVER_KEY bearer (else resolved locally)
  ssh?: {                      // ssh tunnel target
    host: string; user: string; port?: number;
    identityFile?: string;     // key path
    remotePort?: number;       // gateway port on the VPS (default 8642)
    localPort?: number;        // local tunnel port (e.g. 18642)
  };
}
```

- **local** — `gateway.ts` checks health; if down, spawns `python --profile <p> gateway` (detached, PID/port tracked, stderr → log). Base = `http://127.0.0.1:<localPort>`. Auth key resolved by `hermes-auth.ts` (`API_SERVER_KEY` from config/env). If the agent isn't installed/runnable → **"not installed" state** (full installer is a later slice).
- **remote** — Base = `remoteUrl`; bearer = `apiKey`. No spawn. Cheapest path to verify "real."
- **ssh** — `ssh-tunnel.ts` opens `localPort → ssh.host:remotePort`; base = `http://127.0.0.1:<ssh.localPort>`; bearer = `apiKey` (or resolved over `ssh-remote.ts` exec). Tunnel lifecycle owned by main.

## 5. Modules to Add (main process)

Port-and-adapt from `/tmp/hermes-ref/src/main` (hybrid: faithful for hard parts, re-glued to our types/patterns). All new files under `src/main/`.

| Module | Responsibility | Ref source | Port fidelity |
|---|---|---|---|
| `connection.ts` | read/write `desktop.json`; resolve active `ConnectionConfig` → `{ baseUrl, headers }` | `getConnectionConfig` | re-glue (our types) |
| `gateway.ts` | local gateway lifecycle: status/health, spawn, stop, PID/port files, stderr log | `hermes.ts` startGateway + `gateway-ports.ts` | faithful |
| `hermes-auth.ts` | resolve `API_SERVER_KEY` / per-provider env injection | `hermes-auth.ts` | faithful |
| `sse-parser.ts` | parse SSE bytes → structured events (delta content, reasoning, tool progress, usage, done, error) | `sse-parser.ts` | faithful (verbatim+tests) |
| `hermes.ts` | chat client: `sendMessage(opts)` → resolve connection → POST SSE → emit events; `abort`; **CLI-spawn fallback (stretch)** | `hermes.ts` | hybrid |
| `ssh-options.ts` / `ssh-tunnel.ts` / `ssh-remote.ts` | SSH tunnel manager + remote exec for ssh mode | same names | faithful (heaviest) |

## 6. IPC Contract

**Wire existing (declared in preload, currently dead):** `sendMessage` (`chat-stream`), `chat-abort`, and the 6 stream events (`onStreamChunk`, `onReasoningChunk`, `onToolProgress`, `onUsage`, `onStreamDone`, `onStreamError`).

**Add new handlers + preload methods (extend `HermesAPI`):**
- `get-connection-config` → `ConnectionConfig`
- `set-connection-config(cfg)` → persist to `desktop.json`
- `test-connection()` → `{ ok, mode, latencyMs, error? }` (probes the resolved base)
- `gateway-status()` → `{ running, port, pid?, installed }`
- `gateway-start()` / `gateway-stop()` (local mode)

Implement `chat-stream` as the streaming entry (preload already `postMessage`s a MessageChannel; adapt to emit the 6 events). Implement the empty `chat-abort` stub with a real AbortController registry keyed by request id.

## 7. Renderer Wiring (UI already exists — only wire it)

- **`hooks/useChatStream.ts`** — remove the direct `fetch(127.0.0.1:8642)` and `runSimulated()`. Call `window.hermes.sendMessage({ providerId, modelId, sessionId, messages })`; subscribe to the 6 events to build the streamed message + token usage. On disconnect: **honest error state** (no fake stream) + a "Configure connection" affordance that deep-links to Settings → Network.
- **`components/SettingsView.tsx` → Network section** — wire the Local/Remote segmented control + `localPort` / `remoteUrl` / `apiKey` fields to `get/set-connection-config`; add an **SSH sub-form** (host/user/port/identityFile/remotePort) shown for ssh mode; add a **"Test connection"** button (calls `test-connection`) and a live gateway/connection status row. (Keep the new two-pane Hallmark layout.)
- **Connection status** — `App.tsx` sidebar footer "Local · Connected" reflects real `gateway-status` / `test-connection` (poll or event), with mode label.

## 8. Data Flow (chat send)

1. User sends a message → `useChatStream.sendMessage()` → `window.hermes.sendMessage(...)`.
2. Main `hermes.ts` resolves `ConnectionConfig` via `connection.ts` → `{ baseUrl, headers }` (local: ensure gateway up; ssh: ensure tunnel up).
3. `POST {baseUrl}/v1/chat/completions` `stream:true` with bearer + `X-Hermes-Session-Id`.
4. Response SSE → `sse-parser.ts` → emits `stream-chunk` / `reasoning-chunk` / `tool-progress` / `stream-usage` / `stream-done` (or `stream-error`).
5. Renderer event subscriptions append to the active message + update token usage; `stream-done` finalizes.
6. Abort → `chat-abort` aborts the in-flight request.

## 9. Error Handling & Fallbacks

- **No simulated stream** anymore. Disconnected/misconfigured → explicit error + path to Settings.
- **local**: agent not installed/venv missing → "not installed" state (defer installer); gateway spawn failure → surface stderr tail.
- **remote**: bad URL / 401 / unreachable → specific message from `test-connection`.
- **ssh**: tunnel/auth failures surfaced; tunnel auto-torn-down on stop/quit.
- **CLI fallback (stretch)**: if the API path is unreachable in local mode and the CLI exists, `sendMessageViaCli` may be attempted — clearly behind the API path, never a fake.

## 10. Testing Strategy

- **Unit:** `sse-parser.ts` against captured SSE fixtures (port ref tests if present); `connection.ts` resolver (each mode → correct baseUrl + headers) with mocked transports.
- **Integration:** `gateway.ts` status/health with a stub server; `chat-abort` cancels an in-flight stream.
- **Manual/E2E:** real gateway — **remote/ssh** against the user's VPS (from `desktop.json`) for the fastest real verification; **local** by spawning the installed `~/.hermes` agent. Verify a real streamed reply + token usage in the Hallmark Chat UI.

## 11. Acceptance Criteria (Slice 1 "done")

1. A real streamed assistant reply renders in Chat (not simulated) in **at least one** mode end-to-end, with token usage.
2. All three modes are selectable + persisted in Settings → Network and `test-connection` reports status per mode.
3. `local` spawns/stops the gateway and reports health; `ssh` opens/closes a tunnel; `remote` talks to a URL.
4. Disconnected state is honest (no fake stream) with a path to fix it.
5. `typecheck` + `build` clean; `sse-parser` + `connection` unit tests pass. No secrets logged/committed.

## 12. Out of Scope (later slices)

Sessions screen (sqlite `state.db` read via `better-sqlite3`), Memory/Soul/Skills/Tools/Schedules/Gateway-channels/Kanban/Profiles real data, Models/Providers discovery, the full Install wizard (`installer.ts`). Slice 1 assumes the agent is already installed for local mode.

## 13. Decisions & Defaults (flag on review)

- **SSH in Slice 1:** yes (per user). It is the heaviest sub-part (~ref `ssh-*.ts`); ported largely verbatim.
- **CLI-spawn fallback:** included as a **stretch**, behind the HTTP/SSE path; can be dropped if it risks the slice.
- **Port source:** `/tmp/hermes-ref` (re-clone `fathah/hermes-desktop` if cleared). This repo already ports from upstream (claw3d precedent).
- **Connection config:** `~/.hermes/desktop.json`, `HERMES_HOME=~/.hermes`.

## 14. Risks & Mitigations

- **SSH complexity (highest risk):** port faithfully; isolate in `ssh-*.ts`; gate behind ssh mode so local/remote ship even if ssh needs iteration.
- **Local gateway may not spawn** (venv/install state): detect + "not installed" state; rely on remote/ssh for E2E if local won't run here.
- **Secret handling:** keys stay in `~/.hermes/.env` (0600); `desktop.json` 0600; never log bearer tokens or commit `.env`/`desktop.json`.
- **Preload `postMessage` channel mismatch:** the existing `chat-stream` MessageChannel contract may not match; adapt to the 6-event model the renderer already subscribes to.
