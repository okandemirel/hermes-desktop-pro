# Multi-Profile Chat Dispatch Design

## Goal

Hermes Desktop Pro should let a user work with one or many Hermes profiles from the same chat without losing the existing single-profile experience. A prompt can be sent to one profile, to several profiles one after another, to several profiles in parallel, or in a hybrid flow where a primary profile runs first and the remaining profiles fan out after it starts or completes.

The feature must preserve profile isolation. Each profile keeps its own config, model, skills, memory, session history, and gateway behavior. The chat UI becomes a command surface for routing work, not a global profile merge.

## Modes

### Single Profile

This is the current default. The active chat sends to one selected profile and renders one assistant response. Existing provider, model, tools, context, and inspector behavior should continue to work.

### Sequential Multi-Profile

The same prompt is sent to the selected profiles in a deterministic order. The next profile starts after the current profile finishes or fails. This is the safer mode for resource-limited machines and for workflows where results should be reviewed in order.

### Parallel Multi-Profile

The same prompt is sent to every selected profile at the same time. Each profile has an independent run identity and independent stream state. A failure in one profile must not stop the other profile runs.

### Hybrid Dispatch

The user picks a primary profile plus one or more secondary profiles. The primary profile starts first. Secondary profiles then fan out either after the primary run starts streaming or after it completes, depending on the selected hybrid policy. The initial implementation should use "primary completes, then fan-out" because it avoids partial-context races.

## User Experience

### Profile Dispatch Control

Add a compact `Profiles` control near the composer and keep the top command bar efficient. The control opens a vertical popover, not a horizontal overflow strip. It contains:

- Profile search.
- Multi-select list with profile name, active/default badges, provider/model summary, and connection health.
- Primary profile marker for hybrid mode.
- Dispatch mode segmented control: `Single`, `Sequential`, `Parallel`, `Hybrid`.
- Summary row showing selected profile count and estimated execution shape.

The send button label should adapt:

- `Send` for one profile.
- `Send to 4 profiles` for sequential.
- `Run 4 parallel` for parallel.
- `Run primary + 3` for hybrid.

### Chat Rendering

One user message should represent the prompt. Under it, Hermes renders a grouped run block when more than one profile is targeted. Each profile run card shows:

- Profile name.
- Provider and model.
- State: queued, running, done, error, aborted.
- Tool events, token usage, and duration.
- Streaming answer preview, expandable to the full response.
- Actions: inspect, copy result, stop run, retry profile.

Single-profile messages keep the existing chat bubble and agent timeline style. Multi-profile mode uses the same visual language, but groups multiple profile run cards under the same user prompt.

### Inspector

The right inspector should understand multi-profile runs. Activity shows a merged timeline grouped by profile. Context shows selected profiles and the active dispatch mode. Tools shows per-profile tool availability when available, with a clear fallback if a profile cannot report tool state.

## Data Model

Add shared types:

- `DispatchMode = "single" | "sequential" | "parallel" | "hybrid"`.
- `ProfileDispatchTarget` with `profileName`, `isPrimary`, `providerId`, `modelId`, and optional health metadata.
- `DispatchRunState` with `dispatchId`, `mode`, `prompt`, `targets`, `startedAt`, `endedAt`, and `profileRuns`.
- `ProfileRunState` with `runId`, `profileName`, `assistantMessageId`, `sessionId`, status, events, usage, and content.

`ChatTab` should store the selected dispatch mode and selected profile targets so tab switching keeps the user's routing choice.

## Backend and IPC

The current stream events are global and do not carry profile or run identity. Parallel mode needs profile-aware stream routing.

Add a new IPC path for dispatch:

- Renderer calls `dispatchMessage(prompt, options)`.
- Main creates a `dispatchId` and one `runId` per profile target.
- Main emits stream events with `dispatchId`, `runId`, and `profileName`.
- Renderer updates the matching profile run card instead of relying on a single global active stream.

Sequential mode can be implemented through the same dispatcher by awaiting each profile run before starting the next. Parallel mode starts all profile runs concurrently. Hybrid mode starts the primary run first, then starts secondary runs after the primary completes.

Existing `sendMessage` can remain as a compatibility wrapper around the dispatcher for single-profile chats.

## Session Behavior

Each profile run should resume or create a session in that profile's own context. A multi-profile prompt therefore may produce several profile-scoped session ids. The visible chat groups those results, but does not collapse them into one backend session.

When a user resumes a prior chat session, existing single-session behavior remains. The first implementation stores multi-profile dispatch history in renderer tab state only. Durable cross-profile dispatch history is out of scope for this implementation and should be added as a separate local dispatch ledger feature.

## Error Handling

Profile failures are isolated. A failed profile card displays the error and exposes retry for that profile only. Sequential mode continues by default after a failed profile, but the UI should make that behavior explicit in the run timeline.

Abort behavior:

- Single profile: current stop behavior.
- Sequential: stops the current run and cancels queued runs.
- Parallel: stops all running profile runs.
- Per-profile stop: stops only that profile run when supported.

## Testing

Unit tests:

- Dispatch mode selection persists per tab.
- Sequential order is deterministic.
- Parallel events update the correct profile run by `runId`.
- Hybrid starts primary before secondary runs.
- Closing or switching chat tabs does not leak stream chunks into another tab.

Integration tests:

- Single-profile chat remains compatible with existing `sendMessage`.
- Multi-profile dispatch handles one failing profile without losing successful results.
- Session ids are attached to the correct profile run.

Manual QA:

- Open the app and verify the profile popover is vertical, readable, and keyboard/click accessible.
- Send to one profile, sequential profiles, parallel profiles, and hybrid primary plus secondaries.
- Verify the inspector does not overflow with long profile names or long generated text.

## Implementation Boundaries

This feature should not change Office, Cron Jobs, Providers, Models, or profile management screens except for shared type/API additions. It should not globally switch the active profile when a chat dispatch targets another profile. Profile selection inside chat is routing metadata, not a global app state mutation.
