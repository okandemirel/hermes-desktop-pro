# Cross-Profile Ask (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user route one chat turn to another profile via `/ask <profile> <message>` or `@<profile> <message>`, streaming that profile's reply inline with a "via &lt;profile&gt;" badge.

**Architecture:** Almost entirely renderer-side. A pure parser turns composer input into `{profile, message}`; `useChatStream.sendMessage` gains an `overrideProfile` option that reuses the existing (verified) `window.hermes.sendMessage(text, { profile })` pipeline; the bubble shows a badge. No new IPC, no main-process change.

**Tech Stack:** React 19, TypeScript (strict), Vitest, electron-vite.

## Global Constraints

- TypeScript strict; `npm run typecheck` must stay green (web + node).
- Existing test suite (114 tests) must stay green; add new tests, don't break old.
- Match existing renderer style (2-space indent, `.ui-*` classes, CSS tokens). No new deps.
- Cross-profile ask is ALWAYS a single send to the override profile (never dispatch), and one-shot (no `resumeSessionId`).
- `@<profile>` only routes when it starts the message (mid-sentence mentions out of scope).

---

### Task 1: Pure parser util (`crossProfileAsk.ts`)

**Files:**
- Create: `src/renderer/src/crossProfileAsk.ts`
- Test: `src/renderer/src/crossProfileAsk.test.ts`

**Interfaces:**
- Produces: `parseCrossProfileAsk(input: string, profileNames: string[]): { profile: string; message: string } | null` and `detectProfileMention(input: string): { mode: "ask" | "mention"; query: string } | null`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/crossProfileAsk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCrossProfileAsk, detectProfileMention } from "./crossProfileAsk";

const PROFILES = ["default", "appstore-analyst", "ChiefOperator"];

describe("parseCrossProfileAsk", () => {
  it("parses /ask <profile> <message>", () => {
    expect(parseCrossProfileAsk("/ask appstore-analyst summarize Q2", PROFILES)).toEqual({
      profile: "appstore-analyst",
      message: "summarize Q2",
    });
  });
  it("parses @profile <message>", () => {
    expect(parseCrossProfileAsk("@appstore-analyst hi there", PROFILES)).toEqual({
      profile: "appstore-analyst",
      message: "hi there",
    });
  });
  it("matches case-insensitively and returns the canonical name", () => {
    expect(parseCrossProfileAsk("/ask chiefoperator go", PROFILES)).toEqual({
      profile: "ChiefOperator",
      message: "go",
    });
  });
  it("returns null for an unknown profile", () => {
    expect(parseCrossProfileAsk("/ask nobody hello", PROFILES)).toBeNull();
  });
  it("returns null for plain text", () => {
    expect(parseCrossProfileAsk("just a normal message", PROFILES)).toBeNull();
  });
  it("returns null when there is no message after the profile", () => {
    expect(parseCrossProfileAsk("/ask appstore-analyst", PROFILES)).toBeNull();
    expect(parseCrossProfileAsk("@appstore-analyst   ", PROFILES)).toBeNull();
  });
});

describe("detectProfileMention", () => {
  it("detects an /ask mention in progress", () => {
    expect(detectProfileMention("/ask app")).toEqual({ mode: "ask", query: "app" });
    expect(detectProfileMention("/ask ")).toEqual({ mode: "ask", query: "" });
  });
  it("detects an @ mention in progress", () => {
    expect(detectProfileMention("@chief")).toEqual({ mode: "mention", query: "chief" });
    expect(detectProfileMention("@")).toEqual({ mode: "mention", query: "" });
  });
  it("returns null once a full ask is typed", () => {
    expect(detectProfileMention("/ask app hello")).toBeNull();
    expect(detectProfileMention("@app hello")).toBeNull();
  });
  it("returns null for normal input", () => {
    expect(detectProfileMention("hello world")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/crossProfileAsk.test.ts`
Expected: FAIL — cannot find module `./crossProfileAsk`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/crossProfileAsk.ts`:

```ts
export interface CrossProfileAsk {
  profile: string;
  message: string;
}

/**
 * Parse a cross-profile ask from composer input. Two equivalent forms route the
 * turn to another profile:
 *   /ask <profile> <message>
 *   @<profile> <message>      (@profile must start the message)
 * Returns the resolved target + message, or null when the input isn't a
 * cross-profile ask or names an unknown profile. `profileNames` is matched
 * case-insensitively; the returned `profile` is the canonical name.
 */
export function parseCrossProfileAsk(
  input: string,
  profileNames: string[],
): CrossProfileAsk | null {
  const trimmed = input.trimStart();
  const m =
    /^\/ask\s+(\S+)\s+([\s\S]+)$/.exec(trimmed) ||
    /^@(\S+)\s+([\s\S]+)$/.exec(trimmed);
  if (!m) return null;
  const wanted = m[1].toLowerCase();
  const canonical = profileNames.find((n) => n.toLowerCase() === wanted);
  if (!canonical) return null;
  const message = m[2].trim();
  if (!message) return null;
  return { profile: canonical, message };
}

export interface ProfileMention {
  mode: "ask" | "mention";
  query: string;
}

/**
 * Detect an in-progress profile mention for autocomplete: the user is typing the
 * profile name after `/ask ` or right after `@` (no space yet). Returns the mode
 * and partial query, or null.
 */
export function detectProfileMention(input: string): ProfileMention | null {
  const ask = /^\/ask\s+(\S*)$/.exec(input);
  if (ask) return { mode: "ask", query: ask[1] };
  const mention = /^@(\S*)$/.exec(input);
  if (mention) return { mode: "mention", query: mention[1] };
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/crossProfileAsk.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/crossProfileAsk.ts src/renderer/src/crossProfileAsk.test.ts
git commit -m "feat: cross-profile ask parser (/ask + @mention)"
```

---

### Task 2: `viaProfile` on ChatMessage + `overrideProfile` in useChatStream

**Files:**
- Modify: `src/shared/types.ts` (ChatMessage interface)
- Modify: `src/renderer/src/hooks/useChatStream.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `ChatMessage.viaProfile?: string`; `useChatStream`'s `sendMessage(text, options?)` now accepts `options.overrideProfile?: string`.

- [ ] **Step 1: Add the type field**

In `src/shared/types.ts`, inside `interface ChatMessage`, after the `run?: AgentRunState;` line, add:

```ts
  /** Set when this turn was routed to another profile via a cross-profile ask
   *  (/ask or @mention); the bubble shows a "via <profile>" badge. */
  viaProfile?: string;
```

- [ ] **Step 2: Extend the sendMessage signature (return interface)**

In `src/renderer/src/hooks/useChatStream.ts`, in `interface UseChatStreamReturn`, change:

```ts
  sendMessage: (text: string, options?: { attachments?: Attachment[] }) => Promise<void>;
```
to:
```ts
  sendMessage: (text: string, options?: { attachments?: Attachment[]; overrideProfile?: string }) => Promise<void>;
```

- [ ] **Step 3: Use overrideProfile in the sendMessage implementation**

In the `sendMessage` useCallback, change the signature line:

```ts
  const sendMessage = useCallback(async (text: string, messageOptions: { attachments?: Attachment[] } = {}) => {
```
to:
```ts
  const sendMessage = useCallback(async (text: string, messageOptions: { attachments?: Attachment[]; overrideProfile?: string } = {}) => {
```

Then, immediately after `const attachments = messageOptions.attachments?.length ? messageOptions.attachments : undefined;`, add:

```ts
    const overrideProfile = messageOptions.overrideProfile;
```

In the `userMsg` object literal, add `viaProfile` after the attachments spread:

```ts
      ...(attachments ? { attachments } : {}),
      ...(overrideProfile ? { viaProfile: overrideProfile } : {}),
```

Change the `assistantMsg` line from:
```ts
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };
```
to:
```ts
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), ...(overrideProfile ? { viaProfile: overrideProfile } : {}) };
```

Change the dispatch guard from:
```ts
    const shouldUseDispatch = dispatchMode !== "single" && targets.length > 1;
```
to:
```ts
    // A cross-profile ask is always a single send to the override profile.
    const shouldUseDispatch = !overrideProfile && dispatchMode !== "single" && targets.length > 1;
```

In the single-send IPC call, change:
```ts
      const result = await window.hermes.sendMessage(text, {
        profile: selectedProfileName,
        resumeSessionId: currentState.sessionId,
        history,
        attachments,
        temperature: options.temperature,
      });
```
to:
```ts
      const result = await window.hermes.sendMessage(text, {
        profile: overrideProfile || selectedProfileName,
        // One-shot for cross-profile asks: don't resume the tab's main session
        // (it belongs to the active profile, not the asked-of profile).
        resumeSessionId: overrideProfile ? undefined : currentState.sessionId,
        history: overrideProfile ? [] : history,
        attachments,
        temperature: options.temperature,
      });
```

- [ ] **Step 4: Verify typecheck + existing tests**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; 114 + 10 (Task 1) tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/renderer/src/hooks/useChatStream.ts
git commit -m "feat: overrideProfile in useChatStream + ChatMessage.viaProfile"
```

---

### Task 3: "via &lt;profile&gt;" badge in ChatMessageBubble

**Files:**
- Modify: `src/renderer/src/components/ChatMessageBubble.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**
- Consumes: `ChatMessage.viaProfile` (Task 2).

- [ ] **Step 1: Import the icon**

In `src/renderer/src/components/ChatMessageBubble.tsx`, change the lucide import:
```ts
import { ChevronDown, ChevronRight, Activity } from "lucide-react";
```
to:
```ts
import { ChevronDown, ChevronRight, Activity, AtSign } from "lucide-react";
```

- [ ] **Step 2: Render the badge**

In `ChatMessageBubble`, inside `<div className="flex-1 min-w-0">`, as the FIRST child (before the `{!isUser && run …}` block), add:

```tsx
        {message.viaProfile && (
          <div className="ui-via-profile-badge"><AtSign size={11} /> via {message.viaProfile}</div>
        )}
```

- [ ] **Step 3: Add the badge style**

Append to `src/renderer/src/styles/global.css`:

```css
/* ── Cross-profile ask badge ─────────────────────────────────────────── */
.ui-via-profile-badge { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 6px; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 560; color: var(--accent-text); background: var(--accent-weak); border: 1px solid var(--accent-line); }
.ui-via-profile-badge svg { flex-shrink: 0; }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChatMessageBubble.tsx src/renderer/src/styles/global.css
git commit -m "feat: via-profile badge on cross-profile ask bubbles"
```

---

### Task 4: ChatView — `/ask` command + parse in handleSend

**Files:**
- Modify: `src/renderer/src/components/ChatView.tsx`

**Interfaces:**
- Consumes: `parseCrossProfileAsk` (Task 1), `sendMessage(text, { overrideProfile })` (Task 2).

- [ ] **Step 1: Import the parser**

In `src/renderer/src/components/ChatView.tsx`, after the existing `import { normalizeDispatchTargets, sendLabelForDispatch } from "../chatDispatch";` line, add:
```ts
import { parseCrossProfileAsk, detectProfileMention } from "../crossProfileAsk";
```

- [ ] **Step 2: Add the `/ask` slash command**

In `SLASH_COMMANDS`, after the `{ cmd: "/clear", … }` entry, add:
```ts
  { cmd: "/ask", desc: "Ask another profile", icon: Users },
```
(`Users` is already imported.)

- [ ] **Step 3: Route cross-profile asks in handleSend**

In `handleSend`, replace the normal-send tail. Change:
```ts
    void sendMessage(trimmed, { attachments: queuedAttachments });
    setInput("");
    setAttachments([]);
    setAttachmentNotice("");
    setShowCommands(false);
  }, [attachments, input, isStreaming, sendMessage, onNewTab]);
```
to:
```ts
    const ask = parseCrossProfileAsk(trimmed, profiles.map(p => p.name));
    if (ask) {
      void sendMessage(ask.message, { attachments: queuedAttachments, overrideProfile: ask.profile });
      setInput("");
      setAttachments([]);
      setAttachmentNotice("");
      setShowCommands(false);
      return;
    }
    if (/^\/ask\b/i.test(trimmed)) {
      setAttachmentNotice("Unknown profile — use /ask <profile> <message>.");
      return;
    }
    void sendMessage(trimmed, { attachments: queuedAttachments });
    setInput("");
    setAttachments([]);
    setAttachmentNotice("");
    setShowCommands(false);
  }, [attachments, input, isStreaming, sendMessage, onNewTab, profiles]);
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass (the ChatView mock already stubs `sendMessage`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChatView.tsx
git commit -m "feat: /ask + @mention routing in ChatView handleSend"
```

---

### Task 5: ChatView — profile-mention autocomplete

**Files:**
- Modify: `src/renderer/src/components/ChatView.tsx`

**Interfaces:**
- Consumes: `detectProfileMention` (Task 1).

- [ ] **Step 1: Suppress the slash menu during a profile mention**

In the input effect that toggles `showCommands` (the one starting `if (suppressCommandMenuRef.current) {`), add a guard right after the `suppressCommandMenuRef` block and before `if (input.startsWith("/"))`:
```ts
    if (detectProfileMention(input)) {
      setShowCommands(false);
      return;
    }
```

- [ ] **Step 2: Derive the mention menu + insert helper**

Just before `const composerEl = (`, add:
```ts
  const profileMention = detectProfileMention(input);
  const mentionProfiles = profileMention
    ? profiles.filter(p => p.name.toLowerCase().includes(profileMention.query.toLowerCase())).slice(0, 8)
    : [];
  const insertMention = (name: string) => {
    suppressCommandMenuRef.current = true;
    setInput(profileMention?.mode === "ask" ? `/ask ${name} ` : `@${name} `);
    setShowCommands(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
```

- [ ] **Step 3: Render the mention menu**

In `composerEl`, immediately after the `{showCommands && (…command menu…)}` block, add:
```tsx
      {profileMention && mentionProfiles.length > 0 && (
        <div className="ui-command-menu slide-up">
          {mentionProfiles.map(p => (
            <button key={p.name} className="ui-menu-item" onClick={() => insertMention(p.name)}>
              <Users size={14} className="shrink-0" />
              <span className="font-medium">{p.name}</span>
              <span className="ml-auto text-[12px] text-[var(--text-3)]">{p.isActive ? "active" : p.provider}</span>
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Verify (static)**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChatView.tsx
git commit -m "feat: profile-mention autocomplete for /ask and @"
```

---

### Task 6: Live verification (Playwright)

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Drive the app**

Reuse the screenshot-driver pattern (`/tmp/*.mjs` per the electron-screenshot-driver memory). Launch, resize to 1440×900, then:
1. Type `/ask ` and confirm the profile autocomplete menu appears (`.ui-command-menu` with profile names).
2. Type a full `/ask <a-real-profile> Reply with one word: pong`, click `.ui-send-button`, poll until an assistant `.ui-bubble-agent` has content and streaming stopped.
3. Probe: `.ui-via-profile-badge` is present and reads `via <profile>`; the reply is non-empty.
4. Repeat with `@<profile> Reply with one word: pong`.

Expected: both forms stream a reply from the named profile, each tagged with the via-profile badge. Capture a screenshot for the record.

- [ ] **Step 3: Commit (if the driver script is kept in-repo)**

Driver lives in `/tmp` (not committed). No commit needed unless a reusable script is added under `scripts/`.

---

## Notes for the implementer

- `profiles` is existing ChatView state (`ProfileInfo[]`), already loaded + refreshed via `refreshProfiles`. `p.name`, `p.isActive`, `p.provider` are available.
- Do NOT add a new IPC — `window.hermes.sendMessage(text, { profile })` already exists and is the whole point of reuse.
- Keep the cross-profile ask one-shot; do not thread it into dispatch or session resume.
