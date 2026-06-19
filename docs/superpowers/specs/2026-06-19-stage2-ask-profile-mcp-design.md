# Stage 2A — `ask_profile` MCP Bridge Design Spec

Date: 2026-06-19
Status: approved (design), pending implementation plan

## Goal

Give the Hermes **agent** the power to autonomously trigger another named profile
and use its reply — the "profile → profile" capability that Stage 1 (user-driven
`/ask`) does not provide. A profile's agent, mid-task, calls a tool `ask_profile`
and receives the other profile's answer. Works headless (no desktop UI needed at
call time).

Research (recorded in memory `hermes-agent-mcp-support`) confirmed feasibility:
hermes-agent is a full MCP **client** — any profile whose `~/.hermes` (or
per-profile) `config.yaml` has an `mcp_servers:` block loads those servers on
startup and exposes their tools to the LLM as `mcp_<server>_<tool>`. stdio and
localhost servers need no auth. Cron and sub-agent delegation are ALREADY agent
tools (`cronjob`, `delegate_task`) — not rebuilt here.

## Decomposition

- **Stage 2A — THIS spec, now:** the core `ask_profile` capability — a
  desktop-shipped standalone MCP bridge + config registration + guardrails, with
  a programmatic enable/disable (IPC) so it is testable.
- **Stage 2B — later:** the desktop UX — a toggle to enable/disable the bridge and
  surface/enable the existing `cronjob` / `delegate_task` toolsets, plus status.

## Architecture

A **standalone, zero-dependency Node stdio MCP server** ships with the app under
`resources/mcp-bridge/`. The agent (not the desktop) spawns it.

Data flow for `ask_profile(profileB, message)`, called by profileA's agent:
1. Agent loads the `hermes-desktop` MCP server from its config and discovers the
   tools `list_profiles` and `ask_profile`.
2. The agent calls `ask_profile` → the bridge enforces guardrails (below), then
   spawns the **bundled hermes CLI** for the target profile, one-shot:
   `<HERMES_PYTHON> <cli-prefix> -p <profileB> chat -q <message> -Q --source mcp-bridge`
   (the same invocation the desktop's CLI-fallback uses; `cwd = HERMES_REPO`).
3. profileB's agent runs to completion; the bridge collects stdout, strips TUI
   chrome/noise (same logic as the desktop's `stripAnsi` + `NOISE_PATTERNS`), and
   returns it as the MCP tool result `{ content: [{ type: "text", text: reply }] }`.

Rationale for CLI-shell over a gateway POST or an in-process desktop HTTP server:
it runs headless (the CLI is always present where the agent runs), reuses the
target profile's full agent stack (its model + tools), and is the simplest
correct path. The cost is per-call CLI startup latency, which is acceptable.

## MCP surface (hand-rolled, newline-delimited JSON-RPC 2.0 over stdio)

The bridge implements exactly:
- `initialize` → `{ protocolVersion: <echo client's>, capabilities: { tools: {} }, serverInfo: { name: "hermes-desktop", version } }`
- `notifications/initialized` → no reply
- `tools/list` → the two tools:
  - `list_profiles` — inputSchema `{}`; returns the available profile names (so the
    LLM can pick a valid target).
  - `ask_profile` — inputSchema `{ profile: string (required), message: string (required) }`;
    returns the target profile's reply text.
- `tools/call` → dispatch to the two handlers; JSON-RPC errors on bad input.
- Unknown methods → JSON-RPC method-not-found.

Two pure, unit-tested helpers carry the logic so the protocol shell stays thin:
- `evaluateGuardrails(targetProfile, env) → { allowed, reason?, childEnv }`
- `cleanCliOutput(raw) → string`

## Guardrails (enforced in the bridge)

Passed down the spawn chain via environment variables:
- **Depth** — `HERMES_ASK_DEPTH` (default 0). The bridge reads it; if `>= MAX_DEPTH`
  (**2**), it refuses with an error result ("max ask_profile depth reached"). When
  it spawns the CLI it sets `HERMES_ASK_DEPTH = current + 1`, which the spawned
  agent inherits, so a nested `ask_profile` sees the incremented value.
- **Cycle** — `HERMES_ASK_CHAIN` (comma-separated profile names already in the
  chain, e.g. `profileA`). If `targetProfile` is already in the chain, refuse
  ("cycle detected"). Otherwise append it for the child spawn.
- **Timeout** — per-call spawn timeout (**120s**); on exceed, kill the child and
  return a timeout error result.
- **Profile validation** — the `profile` argument comes from the LLM. The bridge
  is standalone (zero-dep) so it implements its OWN equivalent validation rather
  than importing the desktop's `cli-safety.ts`: reject a leading `-`, any path
  separator (`/` or `\`), or a name not present in the enumerated profile list, so
  it can never be smuggled as a flag/path.

`list_profiles` and the validation list are both derived by enumerating
`$HERMES_HOME/profiles/*` (directories) plus the implicit `default` profile — a
small filesystem read in the bridge, using the `HERMES_HOME` passed in its `env`.

A refused/failed call returns a tool result describing the refusal (not a silent
hang), so the calling agent can react.

## Desktop integration (opt-in, programmatic for 2A)

A new main-process module `src/main/mcp-bridge.ts`:
- `enableAskProfileBridge(profile?)` — writes the `mcp_servers.hermes-desktop`
  block into the (active or named) profile's `config.yaml` via the existing
  `saveConfigYaml`, with `command`/`args` pointing at the shipped bridge entry and
  `env` carrying `HERMES_HOME`, `HERMES_PYTHON`, `HERMES_REPO` (so the bridge can
  spawn the CLI). Then restart that profile's gateway so the agent reloads config.
- `disableAskProfileBridge(profile?)` — removes the `hermes-desktop` key; restart.
- `isAskProfileBridgeEnabled(profile?)` — reads config.
- IPC handlers + preload methods (`enableAskProfileBridge` / `disableAskProfileBridge`
  / `getAskProfileBridgeStatus`) so Stage 2B's UI — and the 2A tests — can drive it.

Bridge path resolves differently in dev vs packaged (reuse the existing
dev/`process.resourcesPath` pattern). Default is **disabled**; nothing is written
until enabled.

## Files (Stage 2A)

- Create: `resources/mcp-bridge/server.mjs` (stdio MCP server entry), `resources/mcp-bridge/lib.mjs` (pure helpers: `evaluateGuardrails`, `cleanCliOutput`, tool schemas).
- Create: `src/main/mcp-bridge.ts` (enable/disable/status + config writing).
- Modify: `src/main/index.ts` (IPC handlers), `src/preload/index.ts` (methods).
- Modify: `electron-builder.yml` (ship `resources/mcp-bridge/` as extraResources if not already covered).
- Test: a vitest test importing the pure `lib.mjs` helpers; an integration test that drives the bridge over stdio (mocked CLI spawn).

## Testing

- Unit: `evaluateGuardrails` (depth refuse at MAX, cycle refuse, child env increments + chain-append) and `cleanCliOutput` (strips ANSI + box-drawing + banner).
- Integration: spawn `server.mjs`, send `initialize` → `tools/list` → `tools/call ask_profile` over stdio with the CLI spawn stubbed (e.g., a fake `HERMES_PYTHON` script that echoes a fixed reply); assert the protocol responses and the cleaned reply.
- Live (the real proof): enable the bridge on a test profile, start the agent, prompt it to call `ask_profile` for another profile, confirm it returns that profile's reply; confirm depth/cycle refusals fire.

## Out of scope (2A)

- Stage 2B: the desktop toggle/status UI and surfacing cron/delegate toolsets.
- Re-exposing cron/delegation (already agent tools).
- Multi-turn cross-profile conversations (each `ask_profile` is one-shot).
- Streaming the sub-profile's partial output back through MCP (return the final reply only).

## Risks / unknowns

- **Hand-rolled MCP compliance** — mitigated by the live test against the real
  agent's MCP client; match the client's `protocolVersion` from `initialize`.
- **Agent update overwriting config** — the desktop owns the `hermes-desktop` key
  and re-writes it on enable; a `hermes` self-update could drop it, so enable is
  idempotent and re-checkable.
- **CLI invocation drift** — the bridge must mirror the desktop's exact CLI spawn
  (`HERMES_PYTHON` + cli-prefix + flags); keep it in sync with `sendMessageViaCli`.
- **Cost/latency** — each `ask_profile` is a full one-shot agent run; guardrails
  cap depth/cycles, but a single deep chain is still N agent runs. Acceptable for
  an opt-in power feature.
