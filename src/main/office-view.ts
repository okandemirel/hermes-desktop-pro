import { WebContentsView } from "electron";
import type { BrowserWindow, Rectangle, WebContents } from "electron";
import { join } from "path";

const LOCAL_OFFICE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const OFFICE_PRELOAD = join(__dirname, "../preload/office-webview.js");
const HERMES_OFFICE_GUEST_GUARD_SCRIPT = String.raw`
try {
  window.localStorage.setItem("claw3d:onboarding:completed", "true");
  window.localStorage.setItem("claw3d:welcome:dismissed", "true");
  window.localStorage.setItem("openclaw:onboarding:completed", "true");
  window.localStorage.setItem("openclaw:welcome:dismissed", "true");
  document.title = "Hermes Desktop Pro";

  const installHermesOfficeRuntimeStyles = () => {
    if (document.getElementById("hermes-office-runtime-guard")) return;
    const style = document.createElement("style");
    style.id = "hermes-office-runtime-guard";
    style.textContent = [
      '[data-hermes-office-header="true"]{display:grid!important;grid-template-columns:56px minmax(0,1fr)!important;align-items:center!important;column-gap:14px!important;min-height:72px!important;padding-block:8px!important;}',
      '[data-hermes-office-header-icon="true"]{width:56px!important;height:56px!important;min-width:56px!important;display:grid!important;place-items:center!important;align-self:center!important;margin:0!important;transform:none!important;}',
      '[data-hermes-office-header-copy="true"]{min-width:0!important;display:grid!important;align-self:center!important;gap:3px!important;margin:0!important;transform:none!important;}',
      '[data-hermes-office-header-copy="true"]>*{margin-top:0!important;margin-bottom:0!important;line-height:1.14!important;}',
      '.hermes-office-hidden-upstream,[data-hermes-office-hidden]{display:none!important;visibility:hidden!important;pointer-events:none!important;}'
    ].join("");
    document.head.appendChild(style);
  };

  const hermesBrandReplacements = [
    [/\bHERMES[-_\s]*AGENT\b/gi, "Hermes Desktop Pro"],
    [/\bClaw\s*3D\b/gi, "Hermes Office"],
    [/\bOpen\s*Claw\b/gi, "Hermes Office"],
    [/\bLuke Headquarters?\b/gi, "Hermes HQ"],
    [/(?:~|\/[^\s)]*)?\/?\.openclaw[^\s)]*/gi, "Hermes Office files"]
  ];
  const applyHermesText = (value) => hermesBrandReplacements.reduce(
    (nextValue, pair) => nextValue.replace(pair[0], pair[1]),
    value
  );
  const shouldSkipTextNode = (node) => {
    const parent = node.parentElement;
    if (!parent) return true;
    const tag = parent.tagName.toLowerCase();
    return ["script", "style", "noscript", "textarea", "input", "code"].includes(tag);
  };
  const scrubHermesBrandText = (root = document) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      if (shouldSkipTextNode(node)) return;
      const current = node.nodeValue || "";
      const next = applyHermesText(current);
      if (next !== current) node.nodeValue = next;
    });
  };
  const scrubHermesBrandAttributes = (root = document) => {
    const attrs = ["title", "aria-label", "placeholder", "alt", "data-tooltip", "data-title"];
    const selector = attrs.map((attr) => "[" + attr + "]").join(",");
    const nodes = [];
    if (root instanceof HTMLElement) nodes.push(root);
    root.querySelectorAll?.(selector).forEach((node) => nodes.push(node));
    nodes.forEach((node) => {
      attrs.forEach((attr) => {
        const current = node.getAttribute(attr);
        if (!current) return;
        const next = applyHermesText(current);
        if (next !== current) node.setAttribute(attr, next);
      });
    });
  };

  const ownText = (node) => Array.from(node.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const findCompactOfficeHeader = (titleNode) => {
    let candidate = titleNode.parentElement;
    for (let depth = 0; candidate && depth < 5; depth += 1) {
      if (candidate.matches("html, body, main, #root, #__next")) return null;
      const text = (candidate.innerText || candidate.textContent || "").replace(/\s+/g, " ").trim();
      const rect = candidate.getBoundingClientRect();
      const hasWorkspaceSubtitle = /\b(?:independent|local|workspace)\b/i.test(text);
      const isCompact =
        rect.width >= 180 &&
        rect.width <= Math.max(760, window.innerWidth * 0.82) &&
        rect.height > 36 &&
        rect.height <= 140;
      const hasVisualMark = Boolean(candidate.querySelector("svg, img, [class*='icon' i], [class*='mark' i], [class*='avatar' i]"));
      if (hasWorkspaceSubtitle && isCompact && hasVisualMark) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  };

  const markHermesOfficeRuntimeHeaders = (root = document) => {
    const nodes = [];
    if (root instanceof HTMLElement && root.matches("h1,h2,h3,h4,p,span,div")) nodes.push(root);
    root.querySelectorAll?.("h1,h2,h3,h4,p,span,div").forEach((node) => nodes.push(node));
    nodes.forEach((node) => {
      const titleText = ownText(node) || (node.children.length === 0 ? (node.textContent || "").trim() : "");
      if (!/^Hermes Office$/i.test(titleText)) return;
      const header = findCompactOfficeHeader(node);
      if (!header) return;
      header.setAttribute("data-hermes-office-header", "true");
      const children = Array.from(header.children).filter((child) => child instanceof HTMLElement);
      const iconChild = children.find((child) =>
        child !== node &&
        (child.querySelector("svg, img") ||
          /(?:icon|mark|avatar|chip|logo)/i.test(String(child.className || "")) ||
          (child.getBoundingClientRect().width <= 88 && child.getBoundingClientRect().height <= 88))
      );
      const copyChild = node.parentElement && node.parentElement !== header ? node.parentElement : node;
      iconChild?.setAttribute("data-hermes-office-header-icon", "true");
      copyChild.setAttribute("data-hermes-office-header-copy", "true");
    });
  };

  const flushReactServerSegments = () => {
    const reactBuffer = window.$RB;
    if (typeof window.$RV === "function" && Array.isArray(reactBuffer) && reactBuffer.length > 0) {
      try { window.$RV(reactBuffer); } catch {}
    }
  };

  const settleHermesOffice = () => {
    try {
      const closeButton = document.querySelector('[aria-label="Close onboarding"], [title="Skip onboarding"]');
      if (closeButton && typeof closeButton.click === "function") closeButton.click();
      installHermesOfficeRuntimeStyles();
      scrubHermesBrandText();
      scrubHermesBrandAttributes();
      markHermesOfficeRuntimeHeaders();
      flushReactServerSegments();
      document.documentElement.classList.add("hermes-office-visual-ready");
      document.documentElement.classList.remove("hermes-office-visual-blocked");
      window.dispatchEvent(new Event("resize"));
    } catch {}
  };

  if (!window.__hermesOfficeRuntimeHeaderObserver) {
    window.__hermesOfficeRuntimeHeaderObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && !shouldSkipTextNode(node)) {
            const current = node.nodeValue || "";
            const next = applyHermesText(current);
            if (next !== current) node.nodeValue = next;
          }
          if (node instanceof HTMLElement) markHermesOfficeRuntimeHeaders(node);
        });
      });
      window.requestAnimationFrame(settleHermesOffice);
    });
    window.__hermesOfficeRuntimeHeaderObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  settleHermesOffice();
  window.requestAnimationFrame(settleHermesOffice);
  window.setTimeout(settleHermesOffice, 0);
  window.setTimeout(settleHermesOffice, 250);
  window.setTimeout(settleHermesOffice, 1000);
} catch {}
`;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function isAllowedOfficeUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    const port = Number(parsed.port);
    return (
      parsed.protocol === "http:" &&
      LOCAL_OFFICE_HOSTS.has(parsed.hostname) &&
      Number.isInteger(port) &&
      port >= 1024 &&
      port <= 65535 &&
      (parsed.pathname === "/office" || parsed.pathname.startsWith("/office/"))
    );
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
  const clampedWidth = Math.max(1, Math.min(width, contentSize.width - clampedX));
  const clampedHeight = Math.max(1, Math.min(height, contentSize.height - clampedY));
  if (clampedWidth < 80 || clampedHeight < 160) return null;
  return {
    x: clampedX,
    y: clampedY,
    width: clampedWidth,
    height: clampedHeight,
  };
}

export class OfficeViewManager {
  private view: WebContentsView | null = null;
  private owner: BrowserWindow | null = null;
  private currentUrl = "";
  private hidden = true;
  private recoveryKey = "";
  private recoveryTimers: Array<ReturnType<typeof setTimeout>> = [];
  private visibilityToken = 0;

  async show(owner: BrowserWindow, url: string, bounds: Rectangle): Promise<{ success: boolean; error?: string }> {
    if (!isAllowedOfficeUrl(url)) {
      return { success: false, error: "Blocked non-local Office URL." };
    }

    const clamped = this.clampForWindow(owner, bounds);
    if (!clamped) return { success: false, error: "Invalid Office bounds." };

    const view = this.ensureView(owner);
    const token = ++this.visibilityToken;
    this.hidden = false;
    view.setBounds(clamped);
    view.setVisible(false);
    this.raiseView(owner, view);
    try {
      if (this.currentUrl !== url) {
        this.currentUrl = url;
        await view.webContents.loadURL(url);
      }
      await this.primeGuest();
      const ready = await this.waitForGuestVisualReady(view.webContents);
      if (!ready) {
        this.hidden = true;
        view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
        view.setVisible(false);
        return { success: false, error: "Office workspace did not finish its visual handoff." };
      }
      if (this.hidden || token !== this.visibilityToken || this.currentUrl !== url) {
        return { success: true };
      }
      view.setBounds(clamped);
      this.raiseView(owner, view);
      view.setVisible(true);
      this.scheduleStuckRecovery(url);
      return { success: true };
    } catch (err) {
      this.hidden = true;
      view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
      view.setVisible(false);
      return { success: false, error: (err as Error).message || "Failed to load Office workspace." };
    }
  }

  setBounds(owner: BrowserWindow, bounds: Rectangle): { success: boolean; error?: string } {
    if (!this.view) return { success: true };
    if (this.hidden) return { success: true };
    const clamped = this.clampForWindow(owner, bounds);
    if (!clamped) return { success: false, error: "Invalid Office bounds." };
    this.raiseView(owner, this.view);
    this.view.setBounds(clamped);
    this.view.setVisible(true);
    void this.primeGuest();
    return { success: true };
  }

  hide(): void {
    if (!this.view) return;
    this.clearStuckRecovery();
    this.visibilityToken += 1;
    this.hidden = true;
    this.view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    this.view.setVisible(false);
  }

  reload(): void {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    if (this.hidden || !this.currentUrl) return;
    const contents = this.view.webContents;
    const prime = (): void => {
      void this.primeGuest();
    };
    contents.once("dom-ready", prime);
    contents.once("did-finish-load", prime);
    contents.reloadIgnoringCache();
    [250, 750, 1500].forEach((ms) => setTimeout(prime, ms));
  }

  destroy(owner?: BrowserWindow): void {
    if (!this.view) return;
    if (owner && owner !== this.owner) return;
    this.clearStuckRecovery();
    if (this.owner && !this.owner.isDestroyed()) {
      this.owner.contentView.removeChildView(this.view);
    }
    this.view.webContents.close();
    this.view = null;
    this.owner = null;
    this.currentUrl = "";
    this.hidden = true;
  }

  private clearStuckRecovery(): void {
    this.recoveryTimers.forEach((timer) => clearTimeout(timer));
    this.recoveryTimers = [];
    this.recoveryKey = "";
  }

  private scheduleStuckRecovery(url: string): void {
    if (this.recoveryKey === url && this.recoveryTimers.length > 0) return;
    this.clearStuckRecovery();
    this.recoveryKey = url;
    this.recoveryTimers = [4500, 10000].map((ms) =>
      setTimeout(() => {
        if (this.hidden || this.currentUrl !== url) return;
        void this.reloadIfStuck();
      }, ms),
    );
  }

  private async reloadIfStuck(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    if (this.hidden || !this.currentUrl) return;
    try {
      const stuck = await this.view.webContents.executeJavaScript(
        `(() => {
          const text = document.body?.innerText || "";
          const canvas = document.querySelector("canvas");
          const rect = canvas?.getBoundingClientRect();
          const canvasStuck = !rect || rect.width <= 320 || rect.height <= 180;
          const streamStuck = Boolean(document.getElementById("S:0"));
          const runtimeStuck = /Loading\\.\\.\\.|Connecting to your runtime|HERMES\\s*•\\s*DISCONNECTED/i.test(text);
          return Boolean(streamStuck || (runtimeStuck && canvasStuck));
        })()`,
      );
      if (stuck) this.reload();
      else void this.primeGuest();
    } catch {
      this.reload();
    }
  }

  private clampForWindow(owner: BrowserWindow, bounds: Rectangle): Rectangle | null {
    const [width, height] = owner.getContentSize();
    return clampOfficeBounds({ width, height }, bounds);
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
          backgroundThrottling: false,
          allowRunningInsecureContent: false,
        },
      });
      this.view.setBackgroundColor("#11100e");
      this.harden(this.view.webContents);
    }

    if (this.owner !== owner) {
      if (this.owner && !this.owner.isDestroyed()) {
        this.owner.contentView.removeChildView(this.view);
      }
      owner.contentView.addChildView(this.view);
      this.owner = owner;
    }

    return this.view;
  }

  private raiseView(owner: BrowserWindow, view: WebContentsView): void {
    try {
      owner.contentView.removeChildView(view);
    } catch {
      /* View may not be attached yet. */
    }
    owner.contentView.addChildView(view);
    this.owner = owner;
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
      await this.view.webContents.executeJavaScript(HERMES_OFFICE_GUEST_GUARD_SCRIPT);
    } catch {
      /* Guest may still be loading; preload also sets this before app code runs. */
    }
  }

  private async waitForGuestVisualReady(contents: WebContents): Promise<boolean> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      try {
        await this.primeGuest();
        const ready = await contents.executeJavaScript(
          `(() => {
            const text = document.body?.innerText || "";
            const root = document.documentElement;
            const visualReady = root.classList.contains("hermes-office-visual-ready");
            const visualBlocked = root.classList.contains("hermes-office-visual-blocked");
            const blockers = Array.from(document.querySelectorAll(
              '[role="dialog"], [aria-modal="true"], [class*="onboarding" i], [class*="tour" i]'
            )).some((node) => /Welcome to Hermes Office|Welcome to Claw3D|OpenClaw|Claw3D/i.test(node.innerText || ""));
            const canvas = document.querySelector("canvas");
            const rect = canvas?.getBoundingClientRect();
            const canvasReady = Boolean(
              rect &&
              rect.width >= Math.min(680, window.innerWidth * 0.58) &&
              rect.height >= Math.min(360, window.innerHeight * 0.50)
            );
            const shellReady = /HERMES|KANBAN BOARD|AGENTS|CHAT/i.test(text) && text.trim().length > 32;
            const foreignBranding = /Claw3D|OpenClaw|HERMES-AGENT|Luke Headquarters|\\.openclaw/i.test(text);
            if (foreignBranding) {
              console.warn("[Hermes Office] upstream branding detected after readiness gate; keeping workspace hidden.");
            }
            const blockedRuntimeText = /Welcome\\s+to\\s+Hermes Office|No local gateway found|No gateway found/i.test(text);
            return Boolean(
              !visualBlocked &&
              !blockers &&
              !foreignBranding &&
              !blockedRuntimeText &&
              (visualReady || (canvasReady && shellReady))
            );
          })()`,
        );
        if (ready) return true;
      } catch {
        /* Guest may still be hydrating. */
      }
      await delay(180);
    }
    return false;
  }
}
