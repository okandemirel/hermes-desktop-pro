# Stage 2B — `ask_profile` Bridge Toggle UI Design Spec

Date: 2026-06-20
Status: approved (design), pending implementation plan

## Goal

Add a desktop UI to enable/disable the Stage 2A `ask_profile` MCP bridge. The
toggle IPC (`setAskProfileBridge` / `getAskProfileBridgeEnabled`) already exists;
this adds the only missing piece — a visible control.

## Context (what is already done)

- The **Tools screen** (`src/renderer/src/screens/Tools/Tools.tsx`) already lists
  and toggles every agent toolset via `getToolsets` / `setToolsetEnabled`,
  **including `delegation` and `cronjob`** (defined in `src/main/tools.ts`). So
  "surface cron/delegate toolsets" is already satisfied — no work needed there.
- The genuinely-new piece is the **`ask_profile` bridge toggle**: the bridge is a
  desktop-managed MCP server (config block + opt-in), NOT a standard `getToolsets`
  toolset, so it needs its own control wired to its own IPC.

## Design

A single new control on the Tools screen — chosen home because that screen is
already "agent capabilities", where cron/delegate live.

1. At the top of the Tools screen body (above/around the existing toolset list,
   below the stat header), render a distinct **"Cross-profile delegation"** card:
   - Title + short description: *"Let this profile's agent call another profile
     with the `ask_profile` tool, via the desktop MCP bridge. Off by default."*
   - A small caveat line: *"Works in local mode; cron & delegation tools are in
     the list below."*
   - A `Toggle` (the existing `ui/` Toggle component).
2. On mount, load state via `window.hermes.getAskProfileBridgeEnabled()` and set
   the toggle.
3. On toggle, optimistically flip, call `window.hermes.setAskProfileBridge(next)`,
   and roll back on failure — mirroring the existing `toggleToolset` pattern in
   the same file (optimistic update + revert on `!ok`).

The card is visually distinct from the standard toolset rows (it's a
desktop-managed bridge, not a config toolset), e.g. a small bordered card using
existing `.ui-*` classes / tokens.

## Files

- Modify: `src/renderer/src/screens/Tools/Tools.tsx` (state + load effect + the card + handler).
- Possibly Modify: `src/renderer/src/styles/global.css` only if a small new class is needed; prefer reusing existing card/`.ui-*` classes.

## Testing

- `typecheck` + existing suite stay green; `build` clean.
- Live (Playwright): open Tools, confirm the card renders with the toggle; flip it
  on → confirm `~/.hermes/config.yaml` gains `mcp_servers.hermes-desktop`; flip
  off → confirm it's removed (the write/remove path itself was already proven in
  Stage 2A).

## Out of scope

- cron/delegate toolset surfacing (already present in the Tools list).
- Settings placement (rejected — agent capabilities live in Tools).
- Bridge behavior/guardrails (Stage 2A, done) and VPS deployment (separate work).
