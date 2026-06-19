# Stage 2B — `ask_profile` Bridge Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Cross-profile delegation" toggle card to the Tools screen that enables/disables the Stage 2A `ask_profile` MCP bridge via the existing `setAskProfileBridge`/`getAskProfileBridgeEnabled` IPC.

**Architecture:** Pure renderer change in `Tools.tsx` — load the bridge state on mount, render a distinct card (reusing `.ui-tools-card*` classes), and toggle it optimistically with rollback, mirroring the file's existing `toggleToolset` pattern. cron/delegate are already in the toolset list (no work).

**Tech Stack:** React 19, TypeScript strict, existing `ui/` components (Card, Toggle, IconChip), lucide-react.

## Global Constraints

- TypeScript strict; `npm run typecheck` stays green; existing test suite stays green; `build` clean.
- Reuse existing `.ui-*` classes / `ui/` components; no new dependency.
- The IPC already exists (Stage 2A): `window.hermes.getAskProfileBridgeEnabled(profile?): Promise<boolean>` and `window.hermes.setAskProfileBridge(enabled: boolean, profile?: string): Promise<boolean>` (returns the new enabled state).
- Toggle is for the active/default profile (call with no `profile` arg).

---

### Task 1: Bridge toggle card on the Tools screen

**Files:**
- Modify: `src/renderer/src/screens/Tools/Tools.tsx`

**Interfaces:**
- Consumes: `window.hermes.getAskProfileBridgeEnabled()`, `window.hermes.setAskProfileBridge(enabled)` (Stage 2A IPC).

- [ ] **Step 1: Import the icon**

In the lucide import block (top of `Tools.tsx`), add `Users`:
```ts
import {
  Wrench,
  Zap,
  Code,
  Image as ImageIcon,
  MessageSquare,
  Layers,
  Info,
  Power,
  PackageOpen,
  ShieldCheck,
  Users,
} from "lucide-react";
```

- [ ] **Step 2: Add bridge state + load effect**

In `ToolsView`, after the `const [activeCategory, setActiveCategory] = useState("All");` line, add:
```ts
  const [bridgeEnabled, setBridgeEnabled] = useState(false);
```
Then, immediately after the existing toolsets-loading `useEffect(() => { … }, []);` block (the one that calls `getToolsets`), add a second effect:
```ts
  useEffect(() => {
    let active = true;
    window.hermes
      .getAskProfileBridgeEnabled()
      .then((on) => {
        if (active) setBridgeEnabled(on);
      })
      .catch(() => {
        /* leave off on read failure */
      });
    return () => {
      active = false;
    };
  }, []);
```

- [ ] **Step 3: Add the toggle handler**

After the existing `toggleToolset` function (before `setAll`), add:
```ts
  // Optimistic toggle for the desktop-managed ask_profile MCP bridge. The IPC
  // returns the authoritative new state; revert to the previous value on error.
  const toggleBridge = async () => {
    const next = !bridgeEnabled;
    setBridgeEnabled(next);
    try {
      const result = await window.hermes.setAskProfileBridge(next);
      setBridgeEnabled(result);
    } catch {
      setBridgeEnabled(!next);
    }
  };
```

- [ ] **Step 4: Render the card**

In the JSX, immediately AFTER the hero `</Card>` (the `ui-tools-hero` card) and BEFORE the `<div className="ui-tools-toolbar …">` block, insert:
```tsx
        <Card pad className="ui-tools-bridge mint-in mint-in-2" data-enabled={bridgeEnabled}>
          <div className="ui-tools-card-head">
            <div className="ui-tools-card-title">
              <IconChip className="ui-tools-card-icon ui-tools-card-icon-automation">
                <Users size={18} className="ui-tools-card-glyph" />
              </IconChip>
              <div>
                <h3>Cross-profile delegation</h3>
                <span>ask_profile · MCP bridge</span>
              </div>
            </div>
            <Toggle on={bridgeEnabled} onChange={toggleBridge} />
          </div>
          <p>
            Let this profile&apos;s agent call another profile with the <strong>ask_profile</strong> tool, via the desktop MCP bridge. Off by default. Works in local mode; cron &amp; delegation tools are in the list below.
          </p>
        </Card>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/Tools/Tools.tsx
git commit -m "feat: ask_profile bridge toggle card on the Tools screen (Stage 2B)"
```

---

### Task 2: Live verification

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `npm run build` — clean.

- [ ] **Step 2: Drive the app (electron-screenshot-driver pattern)**

Launch the built app, resize to 1440×900, navigate to the Tools screen (click the sidebar `Tools` nav), and:
1. Confirm the "Cross-profile delegation" card renders with a Toggle.
2. Read the toggle's initial state via `window.hermes.getAskProfileBridgeEnabled()`.
3. Click the bridge toggle ON; wait; confirm `~/.hermes/config.yaml` now contains an `mcp_servers.hermes-desktop` block (grep). 
4. Click it OFF; confirm the block is removed (grep count 0).
5. Screenshot the Tools screen with the card.

Expected: the card toggles the bridge config on/off through the real app. (The config write/remove itself was already proven in Stage 2A; this confirms the UI wiring.)

No commit (verification only).

---

## Notes for the implementer

- Mirror the existing `toggleToolset` optimistic-rollback style; the bridge IPC differs only in that `setAskProfileBridge` returns the authoritative boolean (set state to it on success).
- Do not touch the toolset list / cron / delegation — they are already surfaced.
- The card is a sibling of the hero card and the toolbar, inside `<div className="ui-tools-shell">`.
