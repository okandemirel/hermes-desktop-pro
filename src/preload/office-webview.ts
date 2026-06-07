/// <reference lib="dom" />

const markOfficeRuntimeReadyForHermes = () => {
  try {
    [
      "claw3d:onboarding:completed",
      "claw3d:welcome:dismissed",
      "openclaw:onboarding:completed",
      "openclaw:welcome:dismissed",
    ].forEach((key) => window.localStorage.setItem(key, "true"));
  } catch {
    /* Workspace can still run if storage is unavailable. */
  }
};

const HERMES_BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bHERMES[-_\s]*AGENT\b/gi, "Hermes Desktop Pro"],
  [/\bClaw\s*3D\b/gi, "Hermes Office"],
  [/\bOpen\s*Claw\b/gi, "Hermes Office"],
  [/\bLuke Headquarters?\b/gi, "Hermes HQ"],
  [/(?:~|\/[^\s)]*)?\/?\.openclaw[^\s)]*/gi, "Hermes Office files"],
];

const HERMES_TEXT_ATTRIBUTES = [
  "title",
  "aria-label",
  "placeholder",
  "alt",
  "data-tooltip",
  "data-title",
];

const HERMES_SIGNATURE_ATTRIBUTES = [
  ...HERMES_TEXT_ATTRIBUTES,
  "id",
  "class",
  "data-brand",
  "data-testid",
  "data-test-id",
  "data-tour",
  "data-onboarding",
  "data-slot",
];

const FOREIGN_BRAND_PATTERN =
  /\b(?:Claw\s*3D|Open\s*Claw|HERMES[-_\s]*AGENT|Luke Headquarters?)\b|\.openclaw/i;
const UPSTREAM_ONBOARDING_PATTERN =
  /\b(?:Welcome(?:\s+to)?|onboarding|getting started|product tour|quick tour|skip onboarding|close onboarding)\b/i;
const UPSTREAM_SELECTOR_PATTERN = /\b(?:onboarding|tour|welcome|intro|walkthrough)\b/i;
const CHROME_SELECTOR_PATTERN =
  /\b(?:topbar|bottombar|header|footer|masthead|chrome|brand|navbar|statusbar)\b/i;
const HERMES_HIDDEN_UPSTREAM_CLASS = "hermes-office-hidden-upstream";
const HERMES_VISUAL_GUARD_CLASS = "hermes-office-visual-guard";
const HERMES_VISUAL_READY_CLASS = "hermes-office-visual-ready";
const HERMES_VISUAL_BLOCKED_CLASS = "hermes-office-visual-blocked";
const BLOCKING_RUNTIME_TEXT_PATTERN =
  /\b(?:Welcome\s+to\s+Hermes Office|No local gateway found|No gateway found|Connect(?:ing)?\s+to\s+your\s+runtime)\b/i;

const applyHermesText = (value: string): string =>
  HERMES_BRAND_REPLACEMENTS.reduce(
    (nextValue, [pattern, replacement]) => nextValue.replace(pattern, replacement),
    value,
  );

const shouldSkipTextNode = (node: Node): boolean => {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName.toLowerCase();
  return ["script", "style", "noscript", "textarea", "input", "code"].includes(tag);
};

const scrubHermesBrandText = (root: ParentNode = document): void => {
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    textNodes.forEach((node) => {
      if (shouldSkipTextNode(node)) return;
      const current = node.nodeValue || "";
      const next = applyHermesText(current);
      if (next !== current) node.nodeValue = next;
    });
  } catch {
    /* Branding polish is best-effort and must not block runtime hydration. */
  }
};

const scrubHermesBrandAttributes = (root: ParentNode = document): void => {
  try {
    const nodes = [
      ...(root instanceof HTMLElement ? [root] : []),
      ...Array.from(
        root.querySelectorAll<HTMLElement>(
          HERMES_TEXT_ATTRIBUTES.map((attr) => `[${attr}]`).join(", "),
        ),
      ),
    ];
    nodes.forEach((node) => {
      HERMES_TEXT_ATTRIBUTES.forEach((attr) => {
        const current = node.getAttribute(attr);
        if (!current) return;
        const next = applyHermesText(current);
        if (next !== current) node.setAttribute(attr, next);
      });
    });
  } catch {
    /* Attribute cleanup is cosmetic. */
  }
};

const candidateElements = (root: ParentNode, selector: string): HTMLElement[] => {
  const nodes: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(selector)) nodes.push(root);
  root.querySelectorAll<HTMLElement>(selector).forEach((node) => nodes.push(node));
  return nodes;
};

const elementSignature = (node: HTMLElement): string => {
  const attributes = HERMES_SIGNATURE_ATTRIBUTES.map((attr) => node.getAttribute(attr) || "");
  return [
    ...attributes,
    node.innerText || node.textContent || "",
  ]
    .filter(Boolean)
    .join(" ");
};

const protectsLiveWorkspace = (node: HTMLElement): boolean => {
  if (node instanceof HTMLCanvasElement) return true;
  return Boolean(node.querySelector("canvas"));
};

const hideUpstreamElement = (node: HTMLElement, reason: string): void => {
  node.classList.add(HERMES_HIDDEN_UPSTREAM_CLASS);
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("data-hermes-office-hidden", reason);
  node.setAttribute("inert", "");
};

const hideUpstreamOnboarding = (root: ParentNode = document): void => {
  try {
    const candidates = candidateElements(
      root,
      [
        '[role="dialog"]',
        '[aria-modal="true"]',
        '[class*="onboarding" i]',
        '[class*="tour" i]',
        '[class*="welcome" i]',
        '[class*="walkthrough" i]',
        '[id*="onboarding" i]',
        '[id*="tour" i]',
        '[id*="welcome" i]',
        "[data-onboarding]",
        "[data-tour]",
      ].join(", "),
    );
    candidates.forEach((node) => {
      if (protectsLiveWorkspace(node)) return;
      const signature = elementSignature(node);
      const isUpstreamWelcome =
        UPSTREAM_ONBOARDING_PATTERN.test(signature) &&
        (FOREIGN_BRAND_PATTERN.test(signature) ||
          /Welcome\s+to\s+Hermes Office/i.test(signature));
      const hasUpstreamSelector =
        UPSTREAM_SELECTOR_PATTERN.test(signature) && UPSTREAM_ONBOARDING_PATTERN.test(signature);
      if (!isUpstreamWelcome && !hasUpstreamSelector) return;
      hideUpstreamElement(node, "onboarding");
    });
  } catch {
    /* Runtime is allowed to continue even when the tour cannot be hidden. */
  }
};

const hideForeignOfficeChrome = (root: ParentNode = document): void => {
  try {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    const candidates = candidateElements(
      root,
      [
        "header",
        "footer",
        "nav",
        '[role="banner"]',
        '[role="navigation"]',
        '[role="contentinfo"]',
        '[class*="topbar" i]',
        '[class*="bottom" i]',
        '[class*="header" i]',
        '[class*="footer" i]',
        '[class*="masthead" i]',
        '[class*="chrome" i]',
        '[class*="brand" i]',
        '[class*="statusbar" i]',
      ].join(", "),
    );

    candidates.forEach((node) => {
      if (node.matches("html, body, main, #root, #__next")) return;
      if (protectsLiveWorkspace(node)) return;
      const signature = elementSignature(node);
      if (!FOREIGN_BRAND_PATTERN.test(signature) && !CHROME_SELECTOR_PATTERN.test(signature)) return;

      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nearTop = rect.top <= 24;
      const nearBottom = viewportHeight - rect.bottom <= 24;
      const spansViewport = rect.width >= viewportWidth * 0.45;
      const compactChrome = rect.height <= Math.max(96, viewportHeight * 0.18);
      if (!spansViewport || !compactChrome || (!nearTop && !nearBottom)) return;

      const isForeignChrome =
        FOREIGN_BRAND_PATTERN.test(signature) ||
        (CHROME_SELECTOR_PATTERN.test(signature) && /Hermes Office/i.test(signature));
      if (!isForeignChrome) return;
      hideUpstreamElement(node, "foreign-chrome");
    });
  } catch {
    /* Chrome cleanup must never block the live Office runtime. */
  }
};

const ownText = (node: HTMLElement): string => (
  Array.from(node.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
);

const findCompactOfficeHeader = (titleNode: HTMLElement): HTMLElement | null => {
  let candidate: HTMLElement | null = titleNode.parentElement;
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

const markHermesOfficeRuntimeHeaders = (root: ParentNode = document): void => {
  try {
    const nodes = candidateElements(root, "h1, h2, h3, h4, p, span, div");
    nodes.forEach((node) => {
      const titleText = ownText(node) || (node.children.length === 0 ? (node.textContent || "").trim() : "");
      if (!/^Hermes Office$/i.test(titleText)) return;
      const header = findCompactOfficeHeader(node);
      if (!header) return;

      header.setAttribute("data-hermes-office-header", "true");
      const children = Array.from(header.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const iconChild = children.find((child) =>
        child !== node &&
        (child.querySelector("svg, img") ||
          /(?:icon|mark|avatar|chip|logo)/i.test(String(child.className || "")) ||
          (child.getBoundingClientRect().width <= 88 && child.getBoundingClientRect().height <= 88)),
      );
      const copyChild = node.parentElement && node.parentElement !== header ? node.parentElement : node;
      iconChild?.setAttribute("data-hermes-office-header-icon", "true");
      copyChild.setAttribute("data-hermes-office-header-copy", "true");
    });
  } catch {
    /* Header alignment is visual polish only. */
  }
};

const hasLargeWorkspaceSurface = (): boolean => {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"));
  if (canvases.some((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return (
      rect.width >= Math.min(680, viewportWidth * 0.58) &&
      rect.height >= Math.min(360, viewportHeight * 0.50)
    );
  })) {
    return true;
  }

  const visibleText = document.body?.innerText || "";
  const workspaceTextReady = /HERMES|KANBAN BOARD|AGENTS|CHAT/i.test(visibleText);
  const bodyRect = document.body?.getBoundingClientRect();
  return Boolean(
    workspaceTextReady &&
      bodyRect &&
      bodyRect.width >= Math.min(680, viewportWidth * 0.58) &&
      bodyRect.height >= Math.min(360, viewportHeight * 0.50),
  );
};

const markHermesOfficeVisualState = (): void => {
  try {
    const root = document.documentElement;
    root.classList.add(HERMES_VISUAL_GUARD_CLASS);
    const alreadyReady = root.classList.contains(HERMES_VISUAL_READY_CLASS);
    const visibleText = document.body?.innerText || "";
    const hasForeignBranding = FOREIGN_BRAND_PATTERN.test(visibleText);
    const hasBlockingRuntimeText = BLOCKING_RUNTIME_TEXT_PATTERN.test(visibleText);
    const hasSurface = hasLargeWorkspaceSurface();
    const shouldBlock = !alreadyReady && (hasForeignBranding || hasBlockingRuntimeText || !hasSurface);

    root.classList.toggle(HERMES_VISUAL_BLOCKED_CLASS, shouldBlock);
    if (!shouldBlock) {
      root.classList.add(HERMES_VISUAL_READY_CLASS);
    }
  } catch {
    /* Readiness gating is defensive; never break the embedded workspace. */
  }
};

const runHermesOfficeDomGuard = (root: ParentNode = document): void => {
  hideUpstreamOnboarding(root);
  hideForeignOfficeChrome(root);
  scrubHermesBrandText(root);
  scrubHermesBrandAttributes(root);
  markHermesOfficeRuntimeHeaders(root);
  hideUpstreamOnboarding(root);
  hideForeignOfficeChrome(root);
  markHermesOfficeVisualState();
};

let domGuardScheduled = false;

const scheduleHermesOfficeDomGuard = (): void => {
  if (domGuardScheduled) return;
  domGuardScheduled = true;
  const runGuard = () => {
    domGuardScheduled = false;
    runHermesOfficeDomGuard();
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(runGuard);
    return;
  }
  window.setTimeout(runGuard, 16);
};

const installHermesOfficeGuardStyles = (): void => {
  try {
    const existing = document.getElementById("hermes-office-runtime-guard");
    if (existing) return;
    const style = document.createElement("style");
    style.id = "hermes-office-runtime-guard";
    style.textContent = `
      html,
      body {
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
        margin: 0 !important;
        overflow: hidden !important;
        background: #0d0b08 !important;
      }

      #__next,
      #root,
      body > div:first-child,
      main {
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
      }

      #__next > *,
      #root > *,
      body > div:first-child > * {
        min-width: 100% !important;
        min-height: 100% !important;
      }

      html.${HERMES_VISUAL_GUARD_CLASS}:not(.${HERMES_VISUAL_READY_CLASS}) body,
      html.${HERMES_VISUAL_BLOCKED_CLASS}:not(.${HERMES_VISUAL_READY_CLASS}) body {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      canvas {
        max-width: none !important;
        min-width: 100% !important;
        min-height: 100% !important;
      }

      [data-hermes-office-header="true"] {
        display: grid !important;
        grid-template-columns: 56px minmax(0, 1fr) !important;
        align-items: center !important;
        column-gap: 14px !important;
        min-height: 72px !important;
        padding-block: 8px !important;
      }

      [data-hermes-office-header-icon="true"] {
        width: 56px !important;
        height: 56px !important;
        min-width: 56px !important;
        display: grid !important;
        place-items: center !important;
        align-self: center !important;
        margin: 0 !important;
        transform: none !important;
      }

      [data-hermes-office-header-copy="true"] {
        min-width: 0 !important;
        display: grid !important;
        align-self: center !important;
        gap: 3px !important;
        margin: 0 !important;
        transform: none !important;
      }

      [data-hermes-office-header-copy="true"] > * {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        line-height: 1.14 !important;
      }

      .${HERMES_HIDDEN_UPSTREAM_CLASS},
      [data-hermes-office-hidden] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      [data-brand*="claw" i],
      [class*="brand" i] [title*="Claw" i],
      [aria-label*="OpenClaw" i],
      [title*="OpenClaw" i] {
        color: #f1d36d !important;
      }
    `;
    document.head.appendChild(style);
  } catch {
    /* CSS guard is visual polish only. */
  }
};

const installHermesBrandObserver = (): void => {
  try {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (shouldSkipTextNode(node)) return;
            const current = node.nodeValue || "";
            const next = applyHermesText(current);
            if (next !== current) node.nodeValue = next;
            return;
          }
          if (node instanceof HTMLElement) {
            runHermesOfficeDomGuard(node);
          }
        });
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          const target = mutation.target;
          if (shouldSkipTextNode(target)) return;
          if (target.parentElement) {
            hideUpstreamOnboarding(target.parentElement);
            hideForeignOfficeChrome(target.parentElement);
          }
          const current = target.nodeValue || "";
          const next = applyHermesText(current);
          if (next !== current) target.nodeValue = next;
        }
        if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
          runHermesOfficeDomGuard(mutation.target);
        }
      });
      scheduleHermesOfficeDomGuard();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: HERMES_SIGNATURE_ATTRIBUTES,
    });
  } catch {
    /* Mutation observer is non-critical. */
  }
};

const dismissOfficeRuntimeOnboarding = () => {
  try {
    const closeButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Close onboarding"], [title="Skip onboarding"]',
    );
    closeButton?.click();
  } catch {
    /* Onboarding is cosmetic; avoid interfering with the runtime. */
  }
};

type ReactServerSegmentWindow = Window &
  typeof globalThis & {
    $RB?: unknown[];
    $RV?: (queue: unknown[]) => void;
  };

const flushReactServerSegments = () => {
  try {
    const guestWindow = window as ReactServerSegmentWindow;
    const reactBuffer = guestWindow.$RB;
    if (
      typeof guestWindow.$RV === "function" &&
      Array.isArray(reactBuffer) &&
      reactBuffer.length > 0
    ) {
      guestWindow.$RV(reactBuffer);
    }
  } catch {
    /* Next can complete normally when no streamed segment is pending. */
  }
};

const settleHermesOfficeRuntime = () => {
  try {
    markOfficeRuntimeReadyForHermes();
    installHermesOfficeGuardStyles();
    runHermesOfficeDomGuard();
    dismissOfficeRuntimeOnboarding();
    document.title = "Hermes Desktop Pro";
    flushReactServerSegments();
    markHermesOfficeVisualState();
    window.dispatchEvent(new Event("resize"));
  } catch {
    /* The workspace can still hydrate normally. */
  }
};

let recoveryScheduled = false;

const scheduleHermesOfficeRecovery = () => {
  if (recoveryScheduled) return;
  recoveryScheduled = true;
  window.setTimeout(() => {
    try {
      const text = document.body?.innerText || "";
      const canvas = document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      const canvasStuck = !rect || rect.width <= 320 || rect.height <= 180;
      const streamStuck = Boolean(document.getElementById("S:0"));
      const runtimeStuck =
        /Loading\.\.\.|Connecting to your runtime|HERMES\s*•\s*DISCONNECTED/i.test(text);
      if (!runtimeStuck && !streamStuck) return;
      if (!canvasStuck && !streamStuck) return;
      const current = Number(window.sessionStorage.getItem("hermes:office:recovery") || "0");
      if (current >= 4) return;
      window.sessionStorage.setItem("hermes:office:recovery", String(current + 1));
      window.location.reload();
    } catch {
      /* Recovery is best-effort; never block the workspace. */
    }
  }, 5000);
};

try {
  document.documentElement.classList.add(HERMES_VISUAL_GUARD_CLASS);
  markOfficeRuntimeReadyForHermes();
  installHermesBrandObserver();
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      settleHermesOfficeRuntime();
      scheduleHermesOfficeRecovery();
    },
    { once: true },
  );
  window.addEventListener(
    "load",
    () => {
      settleHermesOfficeRuntime();
      window.requestAnimationFrame(() => {
        settleHermesOfficeRuntime();
        window.dispatchEvent(new Event("resize"));
      });
      window.setTimeout(() => {
        settleHermesOfficeRuntime();
        window.dispatchEvent(new Event("resize"));
      }, 0);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
      window.setTimeout(settleHermesOfficeRuntime, 250);
      window.setTimeout(settleHermesOfficeRuntime, 1000);
      scheduleHermesOfficeRecovery();
    },
    { once: true },
  );
} catch {
  /* Workspace can still run if preload polish fails. */
}
