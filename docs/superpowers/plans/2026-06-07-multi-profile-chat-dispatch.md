# Multi-Profile Chat Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile-aware chat routing so a user can send one prompt to one profile, multiple profiles sequentially, multiple profiles in parallel, or a hybrid primary-then-fan-out dispatch.

**Architecture:** Keep existing single-profile chat as the default path, but add a profile-aware dispatch layer that labels every stream event with `dispatchId`, `runId`, and `profileName`. The renderer stores dispatch mode and selected profile targets per chat tab, renders grouped profile run cards, and uses a reducer so global stream chunks cannot leak into the wrong tab or profile run.

**Tech Stack:** Electron IPC, TypeScript, React 19, Vitest, existing Hermes gateway/CLI send pipeline, existing Hermes dark/gold UI system.

---

## File Structure

- Modify `src/shared/types.ts`: add dispatch mode, target, event, and run-state types; extend `ChatTab`.
- Modify `src/preload/index.ts`: expose `dispatchMessage`, `abortDispatch`, and typed dispatch event subscriptions while preserving existing `sendMessage`.
- Modify `src/main/index.ts`: add `dispatch-message` and `dispatch-abort` IPC handlers; convert current single abort state into keyed abort maps for dispatch/profile runs.
- Create `src/renderer/src/chatDispatch.ts`: pure reducer/helpers for dispatch state, target normalization, labels, and event application.
- Create `src/renderer/src/chatDispatch.test.ts`: reducer tests for sequential, parallel, hybrid, and wrong-run event isolation.
- Modify `src/renderer/src/hooks/useChatStream.ts`: add dispatch options, dispatch event subscriptions, multi-run state, and single-message compatibility wrapper.
- Modify `src/renderer/src/components/ChatView.tsx`: load profiles, add profile dispatch popover, adaptive send labels, grouped run rendering, and inspector awareness.
- Modify `src/renderer/src/styles/global.css`: add vertical profile dispatch popover and grouped run card styling using the existing Hermes visual language.

---

### Task 1: Shared Dispatch Types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add dispatch shared types**

Add these types near the existing chat types in `src/shared/types.ts`:

```ts
export type DispatchMode = "single" | "sequential" | "parallel" | "hybrid";

export interface ProfileDispatchTarget {
  profileName: string;
  isPrimary?: boolean;
  providerId?: ProviderId;
  modelId?: string;
  label?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface DispatchMessageOptions {
  mode: DispatchMode;
  targets: ProfileDispatchTarget[];
  resumeSessionByProfile?: Record<string, string | undefined>;
  history?: Array<{ role: string; content: string }>;
  attachments?: Attachment[];
  contextFolder?: string;
  temperature?: number;
}

export interface DispatchMessageResult {
  dispatchId: string;
  sessionIdsByProfile: Record<string, string | undefined>;
}

export type DispatchEventKind = "chunk" | "reasoning" | "tool" | "usage" | "done" | "error" | "queued" | "started" | "aborted";

export interface DispatchStreamEvent {
  dispatchId: string;
  runId: string;
  profileName: string;
  kind: DispatchEventKind;
  text?: string;
  tool?: string;
  usage?: TokenUsage;
  sessionId?: string;
  error?: string;
  timestamp: number;
}

export interface ProfileRunState {
  runId: string;
  profileName: string;
  assistantMessageId: string;
  sessionId?: string;
  status: AgentRunStatus;
  content: string;
  reasoning?: string;
  events: AgentRunEvent[];
  usage?: TokenUsage;
  startedAt?: number;
  endedAt?: number;
  error?: string;
}

export interface DispatchRunState {
  dispatchId: string;
  mode: DispatchMode;
  prompt: string;
  targets: ProfileDispatchTarget[];
  status: AgentRunStatus;
  startedAt: number;
  endedAt?: number;
  profileRuns: ProfileRunState[];
}
```

Extend `ChatTab`:

```ts
export interface ChatTab {
  id: string;
  name: string;
  title?: string;
  providerId: ProviderId;
  modelId: string;
  sessionId?: string;
  baseUrl?: string;
  messages?: ChatMessage[];
  dispatchMode?: DispatchMode;
  dispatchTargets?: ProfileDispatchTarget[];
  isStreaming?: boolean;
  createdAt?: number;
  dirty?: boolean;
}
```

- [ ] **Step 2: Run typecheck and expect existing references to compile**

Run:

```bash
npm run typecheck
```

Expected: PASS. If it fails because an added type references a missing import, fix the type definition in `src/shared/types.ts` before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add profile dispatch types"
```

---

### Task 2: Pure Renderer Dispatch Reducer

**Files:**
- Create: `src/renderer/src/chatDispatch.ts`
- Create: `src/renderer/src/chatDispatch.test.ts`

- [ ] **Step 1: Write reducer tests first**

Create `src/renderer/src/chatDispatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DispatchStreamEvent, ProfileDispatchTarget } from "@shared/types";
import {
  applyDispatchEvent,
  createDispatchRunState,
  normalizeDispatchTargets,
  sendLabelForDispatch,
} from "./chatDispatch";

const targets: ProfileDispatchTarget[] = [
  { profileName: "default", isPrimary: true, label: "default" },
  { profileName: "marketanalyst", label: "marketanalyst" },
  { profileName: "chiefoperator", label: "chiefoperator" },
];

function event(profileName: string, runId: string, kind: DispatchStreamEvent["kind"], text = ""): DispatchStreamEvent {
  return {
    dispatchId: "dispatch-1",
    runId,
    profileName,
    kind,
    text,
    timestamp: 1000,
  };
}

describe("chat dispatch reducer", () => {
  it("normalizes empty target selections to a single active profile target", () => {
    expect(normalizeDispatchTargets([], "default")).toEqual([
      { profileName: "default", isPrimary: true, label: "default" },
    ]);
  });

  it("keeps one primary target for hybrid mode", () => {
    const normalized = normalizeDispatchTargets(targets, "default");
    expect(normalized.filter(target => target.isPrimary)).toHaveLength(1);
    expect(normalized[0].profileName).toBe("default");
  });

  it("creates one profile run for each target", () => {
    const state = createDispatchRunState("dispatch-1", "parallel", "Plan this", targets, 1000);
    expect(state.profileRuns.map(run => run.profileName)).toEqual(["default", "marketanalyst", "chiefoperator"]);
    expect(state.profileRuns.every(run => run.status === "idle")).toBe(true);
  });

  it("applies chunk events only to the matching run id and profile", () => {
    const state = createDispatchRunState("dispatch-1", "parallel", "Plan this", targets, 1000);
    const updated = applyDispatchEvent(state, event("marketanalyst", "dispatch-1-marketanalyst", "chunk", "market reply"));
    expect(updated.profileRuns.find(run => run.profileName === "marketanalyst")?.content).toBe("market reply");
    expect(updated.profileRuns.find(run => run.profileName === "default")?.content).toBe("");
  });

  it("ignores events from another dispatch id", () => {
    const state = createDispatchRunState("dispatch-1", "parallel", "Plan this", targets, 1000);
    const updated = applyDispatchEvent(state, { ...event("default", "dispatch-1-default", "chunk", "wrong"), dispatchId: "dispatch-2" });
    expect(updated).toBe(state);
  });

  it("builds adaptive send labels", () => {
    expect(sendLabelForDispatch("single", 1)).toBe("Send");
    expect(sendLabelForDispatch("sequential", 3)).toBe("Send to 3 profiles");
    expect(sendLabelForDispatch("parallel", 3)).toBe("Run 3 parallel");
    expect(sendLabelForDispatch("hybrid", 3)).toBe("Run primary + 2");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- src/renderer/src/chatDispatch.test.ts
```

Expected: FAIL with missing `./chatDispatch` module.

- [ ] **Step 3: Implement reducer helpers**

Create `src/renderer/src/chatDispatch.ts`:

```ts
import type {
  AgentRunEvent,
  DispatchMode,
  DispatchRunState,
  DispatchStreamEvent,
  ProfileDispatchTarget,
  ProfileRunState,
} from "@shared/types";

function runIdFor(dispatchId: string, profileName: string): string {
  return `${dispatchId}-${profileName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function eventStatus(kind: DispatchStreamEvent["kind"]): AgentRunEvent["status"] {
  if (kind === "error" || kind === "aborted") return "error";
  if (kind === "done" || kind === "usage") return "done";
  return "running";
}

function agentEventFromDispatch(event: DispatchStreamEvent): AgentRunEvent {
  const labelByKind: Record<DispatchStreamEvent["kind"], string> = {
    queued: "Queued",
    started: "Run started",
    chunk: "Generating response",
    reasoning: "Reasoning trace",
    tool: "Tool progress",
    usage: "Token usage recorded",
    done: "Run complete",
    error: "Run stopped with error",
    aborted: "Run aborted",
  };
  return {
    id: `${event.runId}-${event.kind}-${event.timestamp}`,
    kind: event.kind === "chunk" ? "output" : event.kind === "aborted" ? "abort" : event.kind,
    label: labelByKind[event.kind],
    detail: event.error || event.tool || event.text,
    status: eventStatus(event.kind),
    timestamp: event.timestamp,
    tokens: event.usage?.totalTokens,
  };
}

export function normalizeDispatchTargets(
  targets: ProfileDispatchTarget[],
  fallbackProfileName: string,
): ProfileDispatchTarget[] {
  const source = targets.length > 0 ? targets : [{ profileName: fallbackProfileName }];
  const seen = new Set<string>();
  const unique = source.filter(target => {
    if (!target.profileName || seen.has(target.profileName)) return false;
    seen.add(target.profileName);
    return true;
  });
  const primaryIndex = Math.max(0, unique.findIndex(target => target.isPrimary));
  return unique.map((target, index) => ({
    ...target,
    label: target.label || target.profileName,
    isPrimary: index === primaryIndex,
  }));
}

export function createDispatchRunState(
  dispatchId: string,
  mode: DispatchMode,
  prompt: string,
  targets: ProfileDispatchTarget[],
  startedAt = Date.now(),
): DispatchRunState {
  const profileRuns: ProfileRunState[] = targets.map(target => {
    const runId = runIdFor(dispatchId, target.profileName);
    return {
      runId,
      profileName: target.profileName,
      assistantMessageId: `${runId}-assistant`,
      status: "idle",
      content: "",
      events: [],
    };
  });
  return { dispatchId, mode, prompt, targets, startedAt, status: "running", profileRuns };
}

export function applyDispatchEvent(state: DispatchRunState, event: DispatchStreamEvent): DispatchRunState {
  if (event.dispatchId !== state.dispatchId) return state;
  let changed = false;
  const profileRuns = state.profileRuns.map(run => {
    if (run.runId !== event.runId || run.profileName !== event.profileName) return run;
    changed = true;
    const nextEvents = [...run.events, agentEventFromDispatch(event)];
    if (event.kind === "chunk") return { ...run, status: "running" as const, content: run.content + (event.text || ""), events: nextEvents };
    if (event.kind === "reasoning") return { ...run, status: "running" as const, reasoning: `${run.reasoning || ""}${event.text || ""}`, events: nextEvents };
    if (event.kind === "usage") return { ...run, usage: event.usage, events: nextEvents };
    if (event.kind === "done") return { ...run, status: "done" as const, sessionId: event.sessionId || run.sessionId, endedAt: event.timestamp, events: nextEvents };
    if (event.kind === "error") return { ...run, status: "error" as const, error: event.error, endedAt: event.timestamp, events: nextEvents };
    if (event.kind === "aborted") return { ...run, status: "aborted" as const, endedAt: event.timestamp, events: nextEvents };
    return { ...run, status: "running" as const, startedAt: run.startedAt || event.timestamp, events: nextEvents };
  });
  if (!changed) return state;
  const allSettled = profileRuns.every(run => run.status === "done" || run.status === "error" || run.status === "aborted");
  return {
    ...state,
    profileRuns,
    status: allSettled ? "done" : "running",
    endedAt: allSettled ? event.timestamp : state.endedAt,
  };
}

export function sendLabelForDispatch(mode: DispatchMode, targetCount: number): string {
  if (mode === "single" || targetCount <= 1) return "Send";
  if (mode === "sequential") return `Send to ${targetCount} profiles`;
  if (mode === "parallel") return `Run ${targetCount} parallel`;
  return `Run primary + ${Math.max(0, targetCount - 1)}`;
}
```

- [ ] **Step 4: Run reducer tests**

Run:

```bash
npm test -- src/renderer/src/chatDispatch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/chatDispatch.ts src/renderer/src/chatDispatch.test.ts
git commit -m "feat: add chat dispatch reducer"
```

---

### Task 3: Profile-Aware IPC Dispatch

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add preload API shape**

Modify the chat streaming section in `src/preload/index.ts` to import the new shared types and expose:

```ts
  dispatchMessage: (
    message: string,
    options: DispatchMessageOptions,
  ): Promise<DispatchMessageResult> =>
    ipcRenderer.invoke("dispatch-message", message, options),

  abortDispatch: (dispatchId?: string, runId?: string): void =>
    ipcRenderer.send("dispatch-abort", dispatchId, runId),

  onDispatchEvent: (cb: (event: DispatchStreamEvent) => void): (() => void) => {
    const handler = (_: any, event: DispatchStreamEvent) => cb(event);
    ipcRenderer.on("dispatch-event", handler);
    return () => ipcRenderer.removeListener("dispatch-event", handler);
  },
```

Keep `sendMessage`, `abortChat`, and the legacy stream listeners unchanged for compatibility.

- [ ] **Step 2: Add main dispatch handler**

In `src/main/index.ts`, import `randomUUID` from `crypto` if it is not already imported, and import `DispatchMessageOptions`, `DispatchMessageResult`, and `DispatchStreamEvent` from shared types.

Add a keyed abort map near the existing `currentChatAbort`:

```ts
const dispatchAborters = new Map<string, () => void>();
```

Add helper functions inside `registerIpcHandlers()` above the chat IPC block:

```ts
const emitDispatch = (event: Electron.IpcMainInvokeEvent, payload: DispatchStreamEvent): boolean => {
  if (event.sender.isDestroyed()) return false;
  try {
    event.sender.send("dispatch-event", payload);
    return true;
  } catch {
    return false;
  }
};

const runDispatchTarget = async (
  event: Electron.IpcMainInvokeEvent,
  dispatchId: string,
  runId: string,
  message: string,
  target: ProfileDispatchTarget,
  options: DispatchMessageOptions,
): Promise<string | undefined> => {
  const profile = target.profileName;
  if (!isRemoteMode() && !isGatewayRunning(profile)) startGateway(profile);
  emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "started", timestamp: Date.now() });
  return await new Promise((resolve) => {
    let sessionId: string | undefined;
    sendMessage(
      message,
      {
        onChunk: text => emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "chunk", text, timestamp: Date.now() }),
        onReasoningChunk: text => emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "reasoning", text, timestamp: Date.now() }),
        onToolProgress: tool => emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "tool", tool, timestamp: Date.now() }),
        onUsage: usage => emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "usage", usage, timestamp: Date.now() }),
        onError: error => {
          dispatchAborters.delete(runId);
          emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "error", error, timestamp: Date.now() });
          resolve(sessionId);
        },
        onDone: sid => {
          sessionId = sid;
          dispatchAborters.delete(runId);
          emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "done", sessionId: sid, timestamp: Date.now() });
          resolve(sessionId);
        },
      },
      profile,
      options.resumeSessionByProfile?.[profile],
      options.history,
      options.attachments,
      options.contextFolder,
      { temperature: options.temperature },
    )
      .then(handle => dispatchAborters.set(runId, handle.abort))
      .catch(err => {
        dispatchAborters.delete(runId);
        emitDispatch(event, { dispatchId, runId, profileName: profile, kind: "error", error: String(err?.message ?? err), timestamp: Date.now() });
        resolve(sessionId);
      });
  });
};
```

Add `ipcMain.handle("dispatch-message", ...)`:

```ts
ipcMain.handle("dispatch-message", async (event, message: string, options: DispatchMessageOptions): Promise<DispatchMessageResult> => {
  const dispatchId = `dispatch-${Date.now()}-${randomUUID()}`;
  const targets = options.targets.length > 0 ? options.targets : [{ profileName: "default", isPrimary: true }];
  const sessionIdsByProfile: Record<string, string | undefined> = {};
  const runIdFor = (profileName: string) => `${dispatchId}-${profileName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  if (options.mode === "parallel") {
    await Promise.all(targets.map(async target => {
      sessionIdsByProfile[target.profileName] = await runDispatchTarget(event, dispatchId, runIdFor(target.profileName), message, target, options);
    }));
    return { dispatchId, sessionIdsByProfile };
  }

  if (options.mode === "hybrid") {
    const primary = targets.find(target => target.isPrimary) || targets[0];
    const secondary = targets.filter(target => target.profileName !== primary.profileName);
    sessionIdsByProfile[primary.profileName] = await runDispatchTarget(event, dispatchId, runIdFor(primary.profileName), message, primary, options);
    await Promise.all(secondary.map(async target => {
      sessionIdsByProfile[target.profileName] = await runDispatchTarget(event, dispatchId, runIdFor(target.profileName), message, target, options);
    }));
    return { dispatchId, sessionIdsByProfile };
  }

  for (const target of targets) {
    sessionIdsByProfile[target.profileName] = await runDispatchTarget(event, dispatchId, runIdFor(target.profileName), message, target, options);
  }
  return { dispatchId, sessionIdsByProfile };
});
```

Add abort handler:

```ts
ipcMain.on("dispatch-abort", (_event, dispatchId?: string, runId?: string) => {
  if (runId) {
    dispatchAborters.get(runId)?.();
    dispatchAborters.delete(runId);
    return;
  }
  for (const [key, abort] of dispatchAborters.entries()) {
    if (!dispatchId || key.startsWith(dispatchId)) {
      abort();
      dispatchAborters.delete(key);
    }
  }
});
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If Electron type names are unavailable in the helper signature, import `type { IpcMainInvokeEvent } from "electron"` and use that type.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: add profile-aware chat dispatch ipc"
```

---

### Task 4: Hook Multi-Run State

**Files:**
- Modify: `src/renderer/src/hooks/useChatStream.ts`

- [ ] **Step 1: Extend hook options and return shape**

Add imports:

```ts
import type { DispatchMode, DispatchRunState, ProfileDispatchTarget, DispatchStreamEvent } from "@shared/types";
import { applyDispatchEvent, createDispatchRunState, normalizeDispatchTargets } from "../chatDispatch";
```

Extend `UseChatStreamOptions`:

```ts
  dispatchMode?: DispatchMode;
  dispatchTargets?: ProfileDispatchTarget[];
  activeProfileName?: string;
```

Extend `UseChatStreamReturn`:

```ts
  dispatchRunState: DispatchRunState | null;
  abortDispatch: (runId?: string) => void;
```

Extend `ConversationState`:

```ts
  dispatchRunState: DispatchRunState | null;
```

Initialize it to `null` in `createConversationState`.

- [ ] **Step 2: Subscribe to dispatch events**

Add an effect beside existing stream subscriptions:

```ts
useEffect(() => {
  const unsubscribe = window.hermes.onDispatchEvent((event: DispatchStreamEvent) => {
    setStateByKey(prev => {
      const entries = Object.entries(prev);
      for (const [key, state] of entries) {
        if (state.dispatchRunState?.dispatchId !== event.dispatchId) continue;
        return {
          ...prev,
          [key]: {
            ...state,
            dispatchRunState: applyDispatchEvent(state.dispatchRunState, event),
            isStreaming: event.kind === "done" || event.kind === "error" || event.kind === "aborted"
              ? state.dispatchRunState.profileRuns.some(run => run.status === "running" || run.status === "idle")
              : true,
          },
        };
      }
      return prev;
    });
  });
  return unsubscribe;
}, []);
```

- [ ] **Step 3: Route sendMessage through dispatch when needed**

Inside `sendMessage`, before calling legacy `window.hermes.sendMessage`, compute:

```ts
const dispatchMode = options.dispatchMode || "single";
const targets = normalizeDispatchTargets(options.dispatchTargets || [], options.activeProfileName || "default");
const shouldDispatch = dispatchMode !== "single" || targets[0]?.profileName !== "default";
```

For `shouldDispatch`, create a dispatch run state and call `window.hermes.dispatchMessage(text, { mode: dispatchMode, targets, resumeSessionByProfile: currentState.sessionId ? { [targets[0].profileName]: currentState.sessionId } : {}, history, temperature: options.temperature })`. Keep the existing user message insertion. Do not append a blank single assistant message for multi-profile dispatch; the grouped run cards render from `dispatchRunState`.

- [ ] **Step 4: Add abortDispatch**

```ts
const abortDispatch = useCallback((runId?: string) => {
  const state = stateByKeyRef.current[conversationKey];
  const dispatchId = state?.dispatchRunState?.dispatchId;
  if (!dispatchId) return;
  window.hermes.abortDispatch(dispatchId, runId);
}, [conversationKey]);
```

Return `dispatchRunState` and `abortDispatch`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- src/renderer/src/chatDispatch.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/useChatStream.ts
git commit -m "feat: track multi-profile chat runs"
```

---

### Task 5: Profile Dispatch UI

**Files:**
- Modify: `src/renderer/src/components/ChatView.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Load profiles and keep per-tab dispatch selection**

In `ChatView.tsx`, import dispatch types and reducer helpers:

```ts
import type { DispatchMode, DispatchRunState, ProfileDispatchTarget, ProfileInfo } from "@shared/types";
import { normalizeDispatchTargets, sendLabelForDispatch } from "../chatDispatch";
```

Add state:

```ts
const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
const [profilesLoaded, setProfilesLoaded] = useState(false);
const [profilePickerOpen, setProfilePickerOpen] = useState(false);
const [dispatchMode, setDispatchMode] = useState<DispatchMode>(tab.dispatchMode || "single");
const [dispatchTargets, setDispatchTargets] = useState<ProfileDispatchTarget[]>(tab.dispatchTargets || []);
```

Load profiles:

```ts
useEffect(() => {
  let cancelled = false;
  window.hermes.listProfiles()
    .then(rows => {
      if (!cancelled) setProfiles(rows);
    })
    .finally(() => {
      if (!cancelled) setProfilesLoaded(true);
    });
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 2: Pass dispatch options to the hook**

Update `useChatStream` call:

```ts
const activeProfileName = profiles.find(profile => profile.isActive)?.name || "default";
const normalizedTargets = normalizeDispatchTargets(dispatchTargets, activeProfileName);
const { messages, isStreaming, runState, dispatchRunState, sendMessage, abortStream, abortDispatch } = useChatStream({
  providerId: tab.providerId,
  modelId: tab.modelId,
  conversationKey: tab.id,
  sessionId: tab.sessionId,
  initialMessages: tab.messages,
  temperature,
  dispatchMode,
  dispatchTargets: normalizedTargets,
  activeProfileName,
});
```

- [ ] **Step 3: Add profile picker UI near the composer controls**

Create a local render helper:

```tsx
const renderProfileDispatchPicker = () => (
  <div className="ui-profile-dispatch no-drag" data-open={profilePickerOpen}>
    <button type="button" className="ui-profile-dispatch-trigger" onClick={() => setProfilePickerOpen(open => !open)}>
      <Users size={15} />
      <span>Profiles</span>
      <strong>{normalizedTargets.length}</strong>
      <ChevronDown size={14} />
    </button>
    {profilePickerOpen && (
      <div className="ui-profile-dispatch-menu slide-up">
        <div className="ui-profile-dispatch-head">
          <span>Profile Dispatch</span>
          <button type="button" onClick={() => setProfilePickerOpen(false)}><X size={14} /></button>
        </div>
        <div className="ui-profile-dispatch-modes">
          {(["single", "sequential", "parallel", "hybrid"] as DispatchMode[]).map(mode => (
            <button key={mode} type="button" data-active={dispatchMode === mode} onClick={() => setDispatchMode(mode)}>
              {mode}
            </button>
          ))}
        </div>
        <div className="ui-profile-dispatch-list">
          {profilesLoaded && profiles.map(profile => {
            const selected = normalizedTargets.some(target => target.profileName === profile.name);
            const primary = normalizedTargets.find(target => target.profileName === profile.name)?.isPrimary;
            return (
              <div key={profile.name} className="ui-profile-dispatch-row" data-selected={selected}>
                <button type="button" onClick={() => toggleDispatchTarget(profile)}>
                  <span>{profile.name}</span>
                  <small>{profile.provider} · {profile.model}</small>
                </button>
                <button type="button" disabled={!selected || dispatchMode !== "hybrid"} onClick={() => markDispatchPrimary(profile.name)}>
                  {primary ? "Primary" : "Make primary"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
);
```

Implement `toggleDispatchTarget` and `markDispatchPrimary` so single mode always keeps one selected profile, while sequential/parallel/hybrid can keep many.

- [ ] **Step 4: Use adaptive send label**

Change the send button visible label or tooltip to use:

```ts
const sendLabel = sendLabelForDispatch(dispatchMode, normalizedTargets.length);
```

For icon-only compact button, keep the arrow icon and set `title={sendLabel}` plus an adjacent small status string in the composer meta.

- [ ] **Step 5: Add CSS**

Append to `src/renderer/src/styles/global.css`:

```css
.ui-profile-dispatch {
  position: relative;
}
.ui-profile-dispatch-trigger {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 9px;
  color: var(--text);
  background: rgba(255,255,255,0.055);
  border: 1px solid rgba(255,255,255,0.12);
}
.ui-profile-dispatch-trigger strong {
  min-width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: var(--accent-text);
  background: rgba(223,175,55,0.12);
}
.ui-profile-dispatch-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  z-index: var(--z-popover);
  width: min(380px, calc(100vw - 40px));
  max-height: min(520px, 70vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(15,17,22,0.96);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: var(--shadow-pop);
}
.ui-profile-dispatch-head,
.ui-profile-dispatch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.ui-profile-dispatch-head span {
  color: var(--accent-text);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ui-profile-dispatch-modes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.ui-profile-dispatch-modes button {
  min-width: 0;
  height: 30px;
  border-radius: 8px;
  color: var(--text-2);
  background: rgba(255,255,255,0.045);
}
.ui-profile-dispatch-modes button[data-active="true"] {
  color: var(--accent-text);
  background: rgba(223,175,55,0.14);
  border: 1px solid rgba(223,175,55,0.25);
}
.ui-profile-dispatch-list {
  overflow: auto;
}
.ui-profile-dispatch-row button:first-child {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 3px;
  text-align: left;
}
.ui-profile-dispatch-row span,
.ui-profile-dispatch-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-profile-dispatch-row[data-selected="true"] {
  background: rgba(223,175,55,0.08);
}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ChatView.tsx src/renderer/src/styles/global.css
git commit -m "feat: add profile dispatch controls"
```

---

### Task 6: Grouped Run Rendering and Inspector

**Files:**
- Modify: `src/renderer/src/components/ChatView.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Render profile run cards**

Add a component in `ChatView.tsx`:

```tsx
function ProfileDispatchRunGroup({
  dispatchRunState,
  onStopRun,
}: {
  dispatchRunState: DispatchRunState;
  onStopRun: (runId: string) => void;
}) {
  return (
    <section className="ui-dispatch-run-group" data-mode={dispatchRunState.mode}>
      <div className="ui-dispatch-run-head">
        <span>{dispatchRunState.mode}</span>
        <strong>{dispatchRunState.profileRuns.length} profile runs</strong>
      </div>
      <div className="ui-dispatch-run-grid">
        {dispatchRunState.profileRuns.map(run => (
          <article key={run.runId} className="ui-dispatch-run-card" data-status={run.status}>
            <div className="ui-dispatch-run-card-head">
              <strong>{run.profileName}</strong>
              <span>{run.status}</span>
            </div>
            <p>{run.content || run.reasoning || run.error || "Waiting for output..."}</p>
            <div className="ui-dispatch-run-card-foot">
              <span>{run.usage?.totalTokens || 0} tokens</span>
              <button type="button" onClick={() => onStopRun(run.runId)} disabled={run.status !== "running"}>
                Stop
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Render this after message bubbles when `dispatchRunState` is present.

- [ ] **Step 2: Update inspector activity**

When `dispatchRunState` exists and inspector tab is `activity`, show grouped profile rows:

```tsx
{dispatchRunState?.profileRuns.map(run => (
  <button key={run.runId} type="button" className="ui-inspector-row">
    <Activity size={15} />
    <span>{run.profileName}</span>
    <small>{run.status}</small>
  </button>
))}
```

Keep the existing single-run inspector when `dispatchRunState` is null.

- [ ] **Step 3: Add CSS**

Append:

```css
.ui-dispatch-run-group {
  width: min(100%, 820px);
  margin: 10px auto 0;
  padding: 12px;
  border-radius: 12px;
  background: rgba(15,17,22,0.76);
  border: 1px solid rgba(255,255,255,0.12);
}
.ui-dispatch-run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.ui-dispatch-run-head span {
  color: var(--accent-text);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ui-dispatch-run-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}
.ui-dispatch-run-card {
  min-width: 0;
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.045);
  border: 1px solid rgba(255,255,255,0.10);
}
.ui-dispatch-run-card[data-status="running"] {
  border-color: rgba(223,175,55,0.34);
}
.ui-dispatch-run-card[data-status="error"] {
  border-color: rgba(255,69,58,0.32);
}
.ui-dispatch-run-card-head,
.ui-dispatch-run-card-foot {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ui-dispatch-run-card p {
  min-height: 58px;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.48;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 4: Run typecheck and reducer tests**

Run:

```bash
npm run typecheck
npm test -- src/renderer/src/chatDispatch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChatView.tsx src/renderer/src/styles/global.css
git commit -m "feat: render profile dispatch runs"
```

---

### Task 7: Full Verification and Manual App Launch

**Files:**
- No new files unless a preceding task found a bug.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Expected:

- Typecheck passes.
- Vitest passes all test files.
- ESLint exits 0.
- Electron Vite build completes.

- [ ] **Step 2: Launch the app for manual approval**

Run:

```bash
npm run dev
```

Expected: Hermes Desktop Pro opens. Manually verify:

- Profile dispatch popover is vertical.
- Single profile send still works.
- Sequential mode creates separate profile run cards in order.
- Parallel mode creates separate profile run cards without text crossing between profiles.
- Hybrid mode runs primary first, then fan-out.
- Long profile names and long text do not overflow the right inspector or profile cards.

- [ ] **Step 3: Wait for user approval before pushing**

Do not push automatically. The user explicitly wants to inspect the app and approve before pushing to `main`.

