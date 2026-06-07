# Office Claw3D Perfect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hermes Office render as a full-height Claw3D workspace inside the macOS app, matching the target visual without black dead space, clipped UI, stale overlays, or reduced functionality.

**Architecture:** Retire the renderer `<webview>` embed for Office. Claw3D blocks iframes and Electron `<webview>` keeps the guest viewport at 150px even when the host element is 950x726, so Office must use a native Electron `WebContentsView`/`BrowserView`-style guest surface managed by the main process. The renderer owns layout and sends measured bounds; the main process owns Claw3D loading, bounds, local-only navigation, onboarding priming, hide/show, and teardown.

**Tech Stack:** Electron 39, `WebContentsView`, React 19, TypeScript, Vite/electron-vite, Vitest, Claw3D local Next.js runtime at `http://127.0.0.1:<port>/office`.

---

## Future UI Backlog

- [ ] Add a Hermes-owned toast/notification treatment for unavailable voice input in Office. The target state should read like the screenshot reference: left microphone icon, small agent/source label, and a concise message such as `Voice input is not available right now.` It must use Hermes dark/gold styling, avoid the upstream red/pill look, be dismissible or auto-expiring, and never cover critical Office controls.

---

## Root Cause Evidence To Preserve

- Parent Hermes frame measured correctly: `.ui-office-claw-runtime` and `<webview>` host were `950x726`.
- Guest Claw3D page still measured `window.innerHeight === 150`, `documentElement.clientHeight === 150`, and canvas `950x150`.
- Claw3D `/office` rendered correctly in normal Chromium at `1000x700`, so Claw3D route/root/canvas is not inherently 150px.
- Changing host CSS, `autosize`, `minheight`, `height`, and creating a fresh `<webview>` node with dimensions before `src` did not change the guest viewport.
- Therefore the reliable fix is not CSS; it is replacing the `<webview>` embed path with a native Electron guest view whose bounds are controlled by main.

## File Structure

- Create `src/main/office-view.ts`: native Office guest manager, URL/bounds validation, show/hide/reload/prime APIs.
- Create `src/main/office-view.test.ts`: pure tests for URL allowlist and bounds clamping.
- Modify `src/main/index.ts`: register Office IPC handlers and destroy Office view on window close/nav hide.
- Modify `src/preload/index.ts`: expose typed Office view IPC API.
- Modify `src/renderer/src/screens/Office/Office.tsx`: replace `<webview>` with a measured native surface host.
- Modify `src/renderer/src/styles/global.css`: make Office host frame full-height and remove webview-specific sizing assumptions.
- Keep `src/preload/office-webview.ts` or rename its purpose in comments: it primes Claw3D onboarding in the guest.

---

### Task 1: Native View Validation Helpers

**Files:**
- Create: `src/main/office-view.ts`
- Create: `src/main/office-view.test.ts`

- [ ] **Step 1: Add pure helper exports in `src/main/office-view.ts`**

```ts
import type { BrowserWindow, Rectangle } from "electron";

const LOCAL_OFFICE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isAllowedOfficeUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    const port = Number(parsed.port);
    return parsed.protocol === "http:" &&
      LOCAL_OFFICE_HOSTS.has(parsed.hostname) &&
      Number.isInteger(port) &&
      port >= 1024 &&
      port <= 65535 &&
      parsed.pathname.startsWith("/office");
  } catch {
    return false;
  }
}

export function clampOfficeBounds(
  contentSize: { width: number; height: number },
  input: unknown,
): Rectangle | null {
  const value = input as Partial<Rectangle> | null;
  const x = Math.round(Number(value?.x));
  const y = Math.round(Number(value?.y));
  const width = Math.round(Number(value?.width));
  const height = Math.round(Number(value?.height));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 80 || height < 160) return null;

  const clampedX = Math.max(0, Math.min(x, Math.max(0, contentSize.width - 1)));
  const clampedY = Math.max(0, Math.min(y, Math.max(0, contentSize.height - 1)));
  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(1, Math.min(width, contentSize.width - clampedX)),
    height: Math.max(1, Math.min(height, contentSize.height - clampedY)),
  };
}
```

- [ ] **Step 2: Add tests in `src/main/office-view.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { clampOfficeBounds, isAllowedOfficeUrl } from "./office-view";

describe("isAllowedOfficeUrl", () => {
  it("allows local Claw3D office URLs only", () => {
    expect(isAllowedOfficeUrl("http://127.0.0.1:3000/office")).toBe(true);
    expect(isAllowedOfficeUrl("http://localhost:4567/office")).toBe(true);
    expect(isAllowedOfficeUrl("https://127.0.0.1:3000/office")).toBe(false);
    expect(isAllowedOfficeUrl("http://evil.example:3000/office")).toBe(false);
    expect(isAllowedOfficeUrl("http://127.0.0.1:80/office")).toBe(false);
    expect(isAllowedOfficeUrl("http://127.0.0.1:3000/settings")).toBe(false);
  });
});

describe("clampOfficeBounds", () => {
  it("rejects unusable or invalid bounds", () => {
    expect(clampOfficeBounds({ width: 1280, height: 860 }, null)).toBeNull();
    expect(clampOfficeBounds({ width: 1280, height: 860 }, { x: 0, y: 0, width: 40, height: 80 })).toBeNull();
  });

  it("clamps bounds inside the BrowserWindow content area", () => {
    expect(clampOfficeBounds(
      { width: 1280, height: 860 },
      { x: 302, y: 108, width: 952, height: 728 },
    )).toEqual({ x: 302, y: 108, width: 952, height: 728 });

    expect(clampOfficeBounds(
      { width: 1280, height: 860 },
      { x: 1200, y: 800, width: 400, height: 400 },
    )).toEqual({ x: 1200, y: 800, width: 80, height: 60 });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- src/main/office-view.test.ts`

Expected: PASS.

---

### Task 2: Implement Main-Process Office Guest Manager

**Files:**
- Modify: `src/main/office-view.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Extend `src/main/office-view.ts` with an `OfficeViewManager`**

```ts
import { WebContentsView } from "electron";
import type { BrowserWindow, Rectangle, WebContents } from "electron";
import { join } from "path";

const OFFICE_PRELOAD = join(__dirname, "../preload/office-webview.js");

export class OfficeViewManager {
  private view: WebContentsView | null = null;
  private owner: BrowserWindow | null = null;
  private currentUrl = "";

  show(owner: BrowserWindow, url: string, bounds: Rectangle): { success: boolean; error?: string } {
    if (!isAllowedOfficeUrl(url)) return { success: false, error: "Blocked non-local Office URL." };
    const contentSize = owner.getContentSize();
    const clamped = clampOfficeBounds({ width: contentSize[0], height: contentSize[1] }, bounds);
    if (!clamped) return { success: false, error: "Invalid Office bounds." };

    const view = this.ensureView(owner);
    view.setBounds(clamped);
    view.setVisible(true);
    if (this.currentUrl !== url) {
      this.currentUrl = url;
      void view.webContents.loadURL(url);
    }
    void this.primeGuest();
    return { success: true };
  }

  setBounds(owner: BrowserWindow, bounds: Rectangle): { success: boolean; error?: string } {
    if (!this.view) return { success: true };
    const contentSize = owner.getContentSize();
    const clamped = clampOfficeBounds({ width: contentSize[0], height: contentSize[1] }, bounds);
    if (!clamped) return { success: false, error: "Invalid Office bounds." };
    this.view.setBounds(clamped);
    this.view.setVisible(true);
    void this.primeGuest();
    return { success: true };
  }

  hide(): void {
    if (!this.view) return;
    this.view.setVisible(false);
    this.view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
  }

  reload(): void {
    this.view?.webContents.reloadIgnoringCache();
  }

  destroy(owner?: BrowserWindow): void {
    if (!this.view) return;
    if (this.owner && !this.owner.isDestroyed()) this.owner.contentView.removeChildView(this.view);
    if (!owner || owner === this.owner) {
      this.view.webContents.close();
      this.view = null;
      this.owner = null;
      this.currentUrl = "";
    }
  }

  private ensureView(owner: BrowserWindow): WebContentsView {
    if (!this.view || this.view.webContents.isDestroyed()) {
      this.view = new WebContentsView({
        webPreferences: {
          preload: OFFICE_PRELOAD,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });
      this.view.setBackgroundColor("#11100e");
      this.harden(this.view.webContents);
    }

    if (this.owner !== owner) {
      if (this.owner && !this.owner.isDestroyed()) this.owner.contentView.removeChildView(this.view);
      owner.contentView.addChildView(this.view);
      this.owner = owner;
    }

    return this.view;
  }

  private harden(contents: WebContents): void {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!isAllowedOfficeUrl(url)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url) => {
      if (!isAllowedOfficeUrl(url)) event.preventDefault();
    });
  }

  private async primeGuest(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    try {
      await this.view.webContents.executeJavaScript(
        `try {
          window.localStorage.setItem("claw3d:onboarding:completed", "true");
          window.dispatchEvent(new Event("resize"));
        } catch {}`,
      );
    } catch {
      // Guest may still be loading; preload also sets this before app code runs.
    }
  }
}
```

- [ ] **Step 2: Wire IPC in `src/main/index.ts`**

Add one singleton near existing process state:

```ts
import { OfficeViewManager } from "./office-view";

const officeViewManager = new OfficeViewManager();
```

Add handlers inside `registerIpcHandlers()`:

```ts
ipcMain.handle("office-view-show", (event, url: string, bounds: Rectangle) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner) return { success: false, error: "Office window is not available." };
  return officeViewManager.show(owner, url, bounds);
});

ipcMain.handle("office-view-set-bounds", (event, bounds: Rectangle) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner) return { success: false, error: "Office window is not available." };
  return officeViewManager.setBounds(owner, bounds);
});

ipcMain.handle("office-view-hide", () => {
  officeViewManager.hide();
  return { success: true };
});

ipcMain.handle("office-view-reload", () => {
  officeViewManager.reload();
  return { success: true };
});
```

On main window close:

```ts
mainWindow.on("closed", () => {
  if (retainedMainWindow === mainWindow) retainedMainWindow = null;
  officeViewManager.destroy(mainWindow);
});
```

- [ ] **Step 3: Run `npm run typecheck`**

Expected: PASS.

---

### Task 3: Renderer Native Surface Host

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/screens/Office/Office.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Expose preload APIs**

Add to the `api` object in `src/preload/index.ts`:

```ts
officeViewShow: (
  url: string,
  bounds: { x: number; y: number; width: number; height: number },
): Promise<{ success: boolean; error?: string }> =>
  ipcRenderer.invoke("office-view-show", url, bounds),
officeViewSetBounds: (
  bounds: { x: number; y: number; width: number; height: number },
): Promise<{ success: boolean; error?: string }> =>
  ipcRenderer.invoke("office-view-set-bounds", bounds),
officeViewHide: (): Promise<{ success: boolean; error?: string }> =>
  ipcRenderer.invoke("office-view-hide"),
officeViewReload: (): Promise<{ success: boolean; error?: string }> =>
  ipcRenderer.invoke("office-view-reload"),
```

- [ ] **Step 2: Replace `ClawOfficeViewport` with a native host component**

Use this behavior in `src/renderer/src/screens/Office/Office.tsx`:

```ts
function getElementBounds(node: HTMLElement): { x: number; y: number; width: number; height: number } {
  const rect = node.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}
```

The component must:

```ts
useEffect(() => {
  if (!running) {
    void window.hermes.officeViewHide();
    return;
  }
  const node = runtimeRef.current;
  if (!node) return;

  let raf = 0;
  const sync = (): void => {
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(() => {
      const bounds = getElementBounds(node);
      if (bounds.width < 80 || bounds.height < 160) return;
      void window.hermes.officeViewShow(officeUrl, bounds);
    });
  };

  sync();
  const observer = new ResizeObserver(sync);
  observer.observe(node);
  window.addEventListener("resize", sync);

  return () => {
    window.cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener("resize", sync);
    void window.hermes.officeViewHide();
  };
}, [officeUrl, running]);
```

Render only a transparent measured host plus a starting/stopped placeholder. Do not render `<webview>`:

```tsx
<div ref={runtimeRef} className="ui-office-native-runtime" data-running={running}>
  {!running && <OfficeStoppedPlaceholder />}
  {running && <div className="ui-office-native-hitshield" aria-hidden />}
</div>
```

- [ ] **Step 3: Update CSS**

Add:

```css
.ui-office-native-runtime {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 620px;
  overflow: hidden;
  background: #11100e;
  border-radius: inherit;
}

.ui-office-native-runtime[data-running="true"] {
  background: transparent;
}

.ui-office-native-hitshield {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
```

Remove Office `<webview>` assumptions from `.ui-office-claw-frame` after native mode is stable.

- [ ] **Step 4: Hide native view when overlays would conflict**

When `showLogs` or `showSettings` opens, either keep those panels outside the native bounds or call `officeViewHide()` while the panel is open. The first release should use the simpler rule:

```ts
useEffect(() => {
  if (showLogs || showSettings || !running) void window.hermes.officeViewHide();
}, [showLogs, showSettings, running]);
```

When panels close, the ResizeObserver path must call `officeViewShow()` again.

---

### Task 4: Claw3D Runtime State And Target Visual

**Files:**
- Modify: `src/main/claw3d.ts`
- Keep: `src/preload/office-webview.ts`

- [ ] **Step 1: Keep settings normalized**

Ensure `writeClaw3dSettings()` writes:

```ts
gateway: {
  adapterType: "hermes",
  url: wsUrl,
  token,
  profiles: {
    hermes: { url: wsUrl, token },
  },
}
```

Expected UI result: Claw3D status should move toward `HERMES • CONNECTED` instead of stale demo/disconnected state when the adapter is running.

- [ ] **Step 2: Keep onboarding skipped before Claw3D app boot**

`src/preload/office-webview.ts` must stay:

```ts
/// <reference lib="dom" />

try {
  window.localStorage.setItem("claw3d:onboarding:completed", "true");
} catch {
  /* Claw3D can still run if storage is unavailable. */
}
```

- [ ] **Step 3: Do not crop or recreate Claw3D**

The Office output must come from live Claw3D, not a static screenshot or Hermes-side mock. The target visual is the full isometric Office with visible desk floor, toolbar, side labels, console, and chat button.

---

### Task 5: Verification And Manual-Test Handoff

**Files:**
- Create: `scripts/verify-office-native-view.mjs` only if repeated CDP verification is needed.

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run typecheck
npm test -- src/main/office-view.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 2: Run the app with CDP**

Run:

```bash
./node_modules/.bin/electron --remote-debugging-port=9223 .
```

Expected: app opens to Hermes Desktop Pro.

- [ ] **Step 3: Verify native Claw3D viewport**

Use CDP target list:

```bash
curl -s http://127.0.0.1:9223/json/list
```

Expected: one Hermes page target and one Claw3D/Office guest target after Office starts.

Inside the Claw3D target, verify:

```js
JSON.stringify({
  inner: { w: window.innerWidth, h: window.innerHeight },
  canvas: (() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas?.getBoundingClientRect();
    return rect ? { w: rect.width, h: rect.height } : null;
  })(),
  text: document.body.innerText.slice(0, 120),
})
```

Expected: `inner.h >= 620` and `canvas.h >= 620`; never `150`.

- [ ] **Step 4: Visual QA**

Capture screenshots at:

- `1280x860`
- maximized desktop window
- narrow width around `1100x760`

Expected:

- no black dead area below Claw3D toolbar
- full isometric office visible
- side navigation does not overlap Office view
- Stop/Refresh/Open/Settings buttons remain clickable
- logs/settings do not render underneath native view
- closing/navigating away from Office hides the native view immediately

- [ ] **Step 5: Leave app open for manual test**

After passing verification, launch the app normally with Office running and tell the user it is ready for manual testing.

---

## Subagent Execution Split

- Agent A: implement `src/main/office-view.ts` and `src/main/office-view.test.ts`.
- Agent B: implement `src/preload/index.ts` and `src/renderer/src/screens/Office/Office.tsx`.
- Agent C: run verification, capture screenshots, and report visual defects only.
- Controller: integrate, resolve conflicts, run final checks, and open the app.

## Self-Review

- Spec coverage: plan directly addresses black Office area, Claw3D full visual, no feature reduction, clickable controls, and manual test handoff.
- Placeholder scan: no TBD/TODO/later steps; each implementation task has concrete files and code shape.
- Type consistency: IPC names use `office-view-*`; preload methods use `officeView*`; bounds shape is `{ x, y, width, height }`.
