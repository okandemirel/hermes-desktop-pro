# Cross-Profile Ask — Design Spec

Date: 2026-06-19
Status: approved (design), pending implementation plan

## Goal

Let a user trigger another profile from within a chat and see its reply, and lay
the groundwork for the agent itself to do the same autonomously. User request
(paraphrased): "switch between profiles and give them tasks, trigger one profile
from another and converse with it; a profile (the Hermes agent) should be able to
do the same — e.g. open/trigger a cron and do many things."

## Decomposition (two sub-projects)

- **Stage 1 — THIS spec, now:** user-orchestrated cross-profile ask via `/ask` +
  `@mention` inside a chat. Entirely in this (Electron desktop) repo.
- **Stage 2 — separate spec, later:** expose the same capability (and cron CRUD)
  to the agent as tools, via a desktop-hosted local MCP/tool bridge. **Gated on
  first verifying hermes-agent's MCP/custom-tool support** — hence a separate
  cycle. Out of scope here except for the shared primitive named below.

## Why this approach

`window.hermes.sendMessage(text, { profile, … })` already accepts a `profile`
option and the whole stream pipeline (chunks → assistant bubble → inline
activity) is verified working. So routing one turn to a different profile is
almost entirely a renderer concern — low risk, maximal reuse. The rejected
alternative (a separate dispatch-style sub-panel) duplicates the existing
`ProfileDispatchTimeline` for no benefit.

## Stage 1 design

### Trigger + parse
Two equivalent entry forms, both routing the turn to a target profile:
- `/ask <profile> <message>` — added to `SLASH_COMMANDS`.
- `@<profile> <message>` — `@profile` at the START of the composer routes the
  rest of the message. (Mid-sentence `@mention` is out of scope for v1.)

A pure parser `parseCrossProfileAsk(input, profileNames) → { profile, message } | null`:
- Matches `^/ask\s+(\S+)\s+([\s\S]+)$` or `^@(\S+)\s+([\s\S]+)$`.
- Resolves the profile name case-insensitively against the loaded profile list;
  returns null if no match or the profile is unknown (the message then sends
  normally to the active profile, or shows an "unknown profile" notice for
  `/ask`).
- Pure + no I/O → unit tested directly.

### Autocomplete
Reuse the existing command-menu pattern (`showCommands` / `.ui-command-menu`):
- When input matches `^/ask\s+(\S*)$` or `^@(\S*)$`, show a profile dropdown
  filtered by the partial (profiles are already loaded in ChatView state).
- Selecting a profile inserts `/ask <profile> ` or `@<profile> ` and refocuses.

### Send path
- `useChatStream.sendMessage(text, options)` gains `options.overrideProfile?: string`.
- `const sendProfile = options.overrideProfile || selectedProfileName`.
- The IPC call passes `profile: sendProfile`. When `overrideProfile` is set, the
  call passes NO `resumeSessionId` (one-shot ask → does not pollute the tab's
  main session, which belongs to the active profile).
- The user + assistant messages for that turn carry `viaProfile: overrideProfile`.

### Labeling
- `ChatMessage` gains `viaProfile?: string`.
- `ChatMessageBubble` renders a small "via &lt;profile&gt;" badge (on both the user
  ask and the assistant reply) when `viaProfile` is present, so it's clear which
  profile answered.

### Error handling
- Unknown profile in `/ask`: inline notice (reuse the existing `attachmentNotice`/
  voice-toast style), do not send.
- Reachable-but-failing profile: the existing `onStreamError` path writes an
  honest error into the assistant bubble (already works).

### Chaining vs continuity
- Chaining works naturally: ask A, read its reply, then ask B (each ask is
  independent). This satisfies "trigger another profile and use its result".
- Multi-turn *continuity* with the same other-profile in one tab (resuming its
  session) is OUT of scope for v1 — each ask is one-shot. Noted as a future
  extension.

## Shared primitive (Stage 2 entry — design only, NOT built in Stage 1)

`runProfileTask(profile, message, opts?) → Promise<{ reply: string; sessionId?: string; error?: string }>`
in the main process — wraps `sendMessage`, accumulates `onChunk` into `reply`,
resolves on `onDone`/`onError`. Stage 2's agent tools (`ask_profile`,
`create_cron`, `trigger_cron`, …) and the desktop-hosted MCP/tool server build on
this. Stage 1 does NOT need it (it reuses the renderer stream pipeline), so per
YAGNI it is not implemented here — only named for architectural continuity.

## Files touched (Stage 1)

- `src/shared/types.ts` — `ChatMessage.viaProfile?: string`.
- `src/renderer/src/crossProfileAsk.ts` (new, focused util) + `crossProfileAsk.test.ts` — `parseCrossProfileAsk`.
- `src/renderer/src/hooks/useChatStream.ts` — `overrideProfile` option; tag messages with `viaProfile`; skip resume on override.
- `src/renderer/src/components/ChatView.tsx` — `/ask` in `SLASH_COMMANDS`; parse in `handleSend`; profile-mention autocomplete; thread `overrideProfile` into `sendMessage`.
- `src/renderer/src/components/ChatMessageBubble.tsx` — `viaProfile` badge.
- `src/renderer/src/styles/global.css` — badge style (+ mention-menu style if not fully reusing `.ui-command-menu`).

## Testing

- Unit: `parseCrossProfileAsk` (valid `/ask`, valid `@`, unknown profile, no
  match, case-insensitivity).
- Static: `typecheck` + existing 114 tests stay green; `build` + `lint` clean.
- Live (Playwright): type `/ask <profile> …`, confirm the reply streams from that
  profile with the "via" badge; confirm `@profile …` does the same.

## Out of scope (v1)

- Stage 2 (agent tool / MCP bridge) — separate spec, gated on agent MCP verification.
- Multi-turn cross-profile session continuity.
- Mid-sentence `@mention`.
