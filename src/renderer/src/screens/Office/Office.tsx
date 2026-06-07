import { useState, useEffect, useRef, useCallback } from "react";
import {
  Server, Play, Square, RefreshCw, Settings as SettingsIcon,
  LoaderCircle, Boxes, AlertTriangle, FileText, Monitor, Activity,
  Users, MessageSquare, Map, Radio,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, Input, Field, Badge, StatusDot, SectionLabel,
} from "../../ui";

type OfficeState = "checking" | "not-installed" | "installing" | "ready" | "error";

interface OfficeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SetupProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getElementBounds(node: HTMLElement): OfficeBounds {
  const rect = node.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(Math.max(0, right - left)),
    height: Math.round(Math.max(0, bottom - top)),
  };
}

function boundsEqual(a: OfficeBounds | null, b: OfficeBounds): boolean {
  return Boolean(a) &&
    a!.x === b.x &&
    a!.y === b.y &&
    a!.width === b.width &&
    a!.height === b.height;
}

function sanitizeWorkspaceText(value: string): string {
  return value
    .replace(/https:\/\/github\.com\/iamlukethedev\/Claw3D/gi, "Hermes workspace package")
    .replace(/\bHERMES-AGENT\b/g, "HERMES")
    .replace(/\bClaw3D\b/g, "Hermes Office")
    .replace(/\bOpenClaw\b/gi, "Hermes Office")
    .replace(/\bOffice runtime\b/gi, "Hermes Office")
    .replace(/\bruntime files\b/gi, "office files")
    .replace(/\bLuke Headquarters?\b/gi, "Hermes HQ")
    .replace(/\/Users\/[^\s)]+\/\.openclaw[^\s)]*/g, "[office files]")
    .replace(/~\/\.openclaw[^\s)]*/g, "[office files]");
}

function OfficeReadinessRail({ running, starting, port }: { running: boolean; starting: boolean; port: number }): React.JSX.Element {
  const rows = [
    { icon: Activity, label: "Engine", value: running ? "Live" : starting ? "Starting" : "Standby" },
    { icon: Users, label: "Agents", value: running ? "Bridge ready" : "Waiting" },
    { icon: Radio, label: "Endpoint", value: `:${port}` },
  ];
  return (
    <div className="ui-office-readiness-rail" aria-label="Office readiness">
      {rows.map((row) => (
        <div key={row.label}>
          <row.icon size={15} />
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function OfficeStandbyPreview(): React.JSX.Element {
  return (
    <div className="ui-office-standby-preview" aria-hidden>
      <div className="ui-office-standby-toolbar">
        <span><Map size={13} /> Floor</span>
        <span><Users size={13} /> Agents</span>
        <span><MessageSquare size={13} /> Chat</span>
      </div>
      <div className="ui-office-standby-map">
        <i className="ui-office-standby-zone ui-office-standby-zone-a" />
        <i className="ui-office-standby-zone ui-office-standby-zone-b" />
        <i className="ui-office-standby-zone ui-office-standby-zone-c" />
        <span className="ui-office-standby-agent">H</span>
      </div>
    </div>
  );
}

function OfficeRuntimeViewport({
  officeUrl,
  port,
  running,
  starting,
  portInUse,
  suspended,
  onToggleRuntime,
  onOpenLogs,
  onError,
}: {
  officeUrl: string;
  port: number;
  running: boolean;
  starting: boolean;
  portInUse: boolean;
  suspended: boolean;
  onToggleRuntime: () => void;
  onOpenLogs: () => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const runtimeRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);
  const showingRef = useRef(false);
  const lastBoundsRef = useRef<OfficeBounds | null>(null);
  const [viewStatus, setViewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [handoffRetry, setHandoffRetry] = useState(0);

  const hideNativeView = useCallback((): void => {
    shownRef.current = false;
    showingRef.current = false;
    lastBoundsRef.current = null;
    setViewStatus("idle");
    void window.hermes.officeViewHide().catch(() => {});
  }, []);

  useEffect(() => {
    return () => hideNativeView();
  }, [hideNativeView]);

  useEffect(() => {
    if (!running || suspended) {
      hideNativeView();
      return;
    }

    const node = runtimeRef.current;
    if (!node) return;

    let disposed = false;
    let raf = 0;
    const sync = (): void => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        if (disposed) return;
        const bounds = getElementBounds(node);
        if (bounds.width < 80 || bounds.height < 160) return;
        if (boundsEqual(lastBoundsRef.current, bounds) && shownRef.current) return;
        if (!shownRef.current && showingRef.current) return;
        lastBoundsRef.current = bounds;
        const request = shownRef.current
          ? window.hermes.officeViewSetBounds(bounds)
          : window.hermes.officeViewShow(officeUrl, bounds);
        if (!shownRef.current) {
          showingRef.current = true;
          setViewStatus("loading");
        }
        void request.then((result: { success: boolean; error?: string }) => {
          if (disposed) return;
          showingRef.current = false;
          if (result.success) {
            shownRef.current = true;
            setViewStatus("ready");
            return;
          }
          shownRef.current = false;
          setViewStatus("error");
          onError(result.error || "Failed to show Office view.");
        }).catch((err: unknown) => {
          if (disposed) return;
          showingRef.current = false;
          shownRef.current = false;
          setViewStatus("error");
          onError((err as Error).message || "Failed to show Office view.");
        });
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    const movementTimer = window.setInterval(sync, 700);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);

    return () => {
      disposed = true;
      showingRef.current = false;
      window.cancelAnimationFrame(raf);
      window.clearInterval(movementTimer);
      observer.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      hideNativeView();
    };
  }, [handoffRetry, hideNativeView, officeUrl, onError, running, suspended]);

  useEffect(() => {
    if (!running || suspended || viewStatus !== "loading") return;

    const timer = window.setTimeout(() => {
      shownRef.current = false;
      showingRef.current = false;
      lastBoundsRef.current = null;
      setViewStatus("idle");
      void window.hermes.officeViewHide().catch(() => {});
      void window.hermes.officeViewReload().catch(() => {});
      setHandoffRetry((value) => value + 1);
    }, 5500);

    return () => window.clearTimeout(timer);
  }, [running, suspended, viewStatus]);

  if (running) {
    const waitingForView = !suspended && viewStatus !== "ready";
    return (
      <div ref={runtimeRef} className="ui-office-native-runtime" data-running={!suspended}>
        {(suspended || waitingForView) && (
          <div className="ui-office-workspace-placeholder" data-state="starting">
            <span className="ui-office-workspace-placeholder-icon">
              {viewStatus === "error" ? <AlertTriangle size={28} /> : <LoaderCircle size={28} className="animate-spin" />}
            </span>
            <div className="ui-eyebrow">Hermes Office</div>
            <h2>{suspended ? "Office paused" : viewStatus === "error" ? "Office handoff paused" : "Loading Office"}</h2>
            <p>
              {suspended
                ? "Close settings or logs to return to the live Office floor."
                : viewStatus === "error"
                  ? "Hermes is keeping the live view hidden until Office is visually ready."
                  : "Hermes is preparing the isometric command floor before showing it."}
            </p>
          </div>
        )}
        {!suspended && viewStatus === "ready" && (
          <>
            <div className="ui-office-workspace-underlay" aria-hidden>
              <span className="ui-office-workspace-underlay-mark">H</span>
              <span className="ui-office-workspace-underlay-title">Hermes Office</span>
            </div>
            <div className="ui-office-native-hitshield" aria-hidden />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="ui-office-workspace-placeholder" data-state={portInUse ? "blocked" : starting ? "starting" : "stopped"}>
      <span className="ui-office-workspace-placeholder-icon">
        {starting ? <LoaderCircle size={28} className="animate-spin" /> : portInUse ? <AlertTriangle size={28} /> : <Monitor size={28} />}
      </span>
      <div className="ui-eyebrow">Hermes Office</div>
      <h2>{starting ? "Starting Hermes Office" : portInUse ? `Port ${port} is busy` : "Hermes Office is offline"}</h2>
      <p>
        {starting
          ? "Hermes is preparing the spatial command floor and agent bridge."
          : portInUse
            ? "Change the Office port from settings, then start again."
            : "Start Office to load the isometric Hermes command floor."}
      </p>
      <OfficeReadinessRail running={running} starting={starting} port={port} />
      {!starting && !portInUse && <OfficeStandbyPreview />}
      <div className="ui-office-workspace-placeholder-actions">
        <Button
          variant={portInUse ? "secondary" : "primary"}
          leftIcon={starting ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
          onClick={onToggleRuntime}
          disabled={starting || portInUse}
        >
          {starting ? "Starting" : "Start Office"}
        </Button>
        <Button variant="secondary" leftIcon={<FileText size={14} />} onClick={onOpenLogs}>
          Logs
        </Button>
      </div>
    </div>
  );
}

export default function OfficeView(): React.JSX.Element {
  const [state, setState] = useState<OfficeState>("checking");
  const [profile, setProfile] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [port, setPort] = useState(3000);
  const [portInput, setPortInput] = useState("3000");
  const [portInUse, setPortInUse] = useState(false);
  const [wsUrlInput, setWsUrlInput] = useState("ws://localhost:18789");
  const [error, setError] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState<SetupProgress>({
    step: 0,
    totalSteps: 2,
    title: "Preparing…",
    detail: "",
    log: "",
  });
  const logRef = useRef<HTMLDivElement>(null);

  // Refs to avoid restarting the poll interval on every state change
  const startingRef = useRef(starting);
  const runningRef = useRef(running);
  const errorRef = useRef(error);
  startingRef.current = starting;
  runningRef.current = running;
  errorRef.current = error;

  const checkStatus = useCallback(async (showChecking = true) => {
    if (showChecking) setState("checking");
    const status = await window.hermes.officeStatus();
    setRunning(status.running);
    setPort(status.port);
    setPortInput(String(status.port));
    setPortInUse(status.portInUse);
    setWsUrlInput(status.wsUrl || "ws://localhost:18789");
    if (status.running) {
      setError("");
    } else if (status.error) setError(status.error);
    setState(status.installed ? "ready" : "not-installed");
    return status;
  }, []);

  useEffect(() => {
    window.hermes.getActiveProfile().then(setProfile).catch(() => {});
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    return () => {
      void window.hermes.officeViewHide().catch(() => {});
    };
  }, []);

  const handleOfficeViewError = useCallback((message: string): void => {
    void window.hermes.officeViewHide().catch(() => {});
    setError(message);
  }, []);

  // Poll status every 5s while ready
  useEffect(() => {
    if (state !== "ready") return;
    const interval = setInterval(async () => {
      const status = await window.hermes.officeStatus();
      setRunning(status.running);
      setPort(status.port);
      setPortInUse(status.portInUse);
      if (status.running) setError("");
      else if (status.error && !errorRef.current) setError(status.error);
      if (startingRef.current && status.running) setStarting(false);
      if (!startingRef.current && !status.running && runningRef.current) {
        setRunning(false);
        if (status.error) setError(status.error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [state]);

  // Auto-scroll log views
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress.log, logs]);

  async function handleInstall(): Promise<void> {
    setState("installing");
    setError("");
    const cleanup = window.hermes.onOfficeSetupProgress(setProgress);
    try {
      const result = await window.hermes.officeSetup();
      cleanup();
      if (result.success) {
        setState("ready");
      } else {
        setError(result.error || "Setup failed");
        setState("error");
      }
    } catch (err) {
      cleanup();
      setError((err as Error).message || "Setup failed");
      setState("error");
    }
  }

  async function handleStartStop(): Promise<void> {
    if (running) {
      void window.hermes.officeViewHide().catch(() => {});
      await window.hermes.officeStop();
      setRunning(false);
      setError("");
    } else {
      setError("");
      setStarting(true);
      const result = await window.hermes.officeStart(profile);
      if (!result.success) {
        setError(result.error || "Failed to start Office");
        setStarting(false);
      } else {
        for (let attempt = 0; attempt < 32; attempt += 1) {
          const status = await window.hermes.officeStatus();
          setPort(status.port);
          setPortInUse(status.portInUse);
          if (status.running) {
            setRunning(true);
            setError("");
            setStarting(false);
            return;
          }
          await delay(500);
        }
        const status = await window.hermes.officeStatus();
        setRunning(false);
        setError(status.error || `Office did not become reachable on port ${port}.`);
        setStarting(false);
      }
    }
  }

  async function handlePortSave(): Promise<void> {
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) return;
    await window.hermes.officeSetPort(newPort);
    setPort(newPort);
    const status = await window.hermes.officeStatus();
    setPortInUse(status.portInUse);
  }

  async function handleWsUrlSave(): Promise<void> {
    const trimmed = wsUrlInput.trim();
    if (!trimmed) return;
    await window.hermes.officeSetWsUrl(trimmed);
  }

  async function loadLogs(): Promise<void> {
    setLogs(await window.hermes.officeGetLogs());
  }

  async function suspendOfficeView(): Promise<void> {
    try {
      await window.hermes.officeViewHide();
    } catch {
      /* Native view recovery is best-effort; renderer state still owns overlays. */
    }
  }

  async function toggleLogs(): Promise<void> {
    if (showLogs) {
      setShowLogs(false);
      return;
    }
    await suspendOfficeView();
    setShowSettings(false);
    setShowLogs(true);
    await loadLogs();
  }

  async function toggleSettings(): Promise<void> {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    await suspendOfficeView();
    setShowLogs(false);
    setShowSettings(true);
  }

  const percent =
    progress.totalSteps > 0
      ? Math.round((progress.step / progress.totalSteps) * 100)
      : 0;

  /* ── Checking ── */
  if (state === "checking") {
    return (
      <Screen icon={<Server size={19} />} kicker="Hermes Office" title="Office">
        <div className="flex flex-col items-center justify-center gap-3.5 min-h-[440px] fade-in">
          <LoaderCircle size={26} className="animate-spin text-[var(--accent-text)]" />
          <p className="text-[13px] text-[var(--text-3)]">Checking Office status…</p>
        </div>
      </Screen>
    );
  }

  /* ── Not installed / error → setup panel ── */
  if (state === "not-installed" || state === "error") {
    return (
      <Screen icon={<Server size={19} />} kicker="Hermes Office" title="Office">
        <div className="flex items-center justify-center min-h-[360px] fade-in">
          <Card pad className="relative overflow-hidden w-full max-w-[460px] flex flex-col items-center text-center gap-4 mint-in">
            <span className="ui-stamp w-[64px] h-[64px] rounded-full text-[var(--accent-text)] mint-in mint-in-1">
              <Boxes size={28} />
            </span>
            <div>
              <div className="ui-eyebrow justify-center">Hermes Office · Setup</div>
              <h2 className="serif text-[22px] text-[var(--text)]">Set up Hermes Office</h2>
              <p className="text-[13px] text-[var(--text-2)] mt-2 leading-relaxed">
                Installs the local Office engine used by Hermes Desktop Pro. It powers
                the isometric command floor, agent bridge, and diagnostics, and only runs when you start it.
              </p>
            </div>
            {error && (
              <div className="w-full flex items-start gap-2 text-left px-3.5 py-2.5 rounded-[var(--r)] bg-[var(--error-weak,rgba(229,72,77,0.16))] border border-[var(--border)]">
                <AlertTriangle size={15} className="text-[var(--error)] shrink-0 mt-0.5" />
                <span className="text-[12.5px] text-[var(--text-2)] break-words">{sanitizeWorkspaceText(error)}</span>
              </div>
            )}
            <hr className="ui-divider-gold w-full" />
            <div className="flex items-center gap-2.5">
              <Button variant="primary" leftIcon={<Boxes size={14} />} onClick={handleInstall}>
                Install Office
              </Button>
              <Badge variant="neutral">Local engine</Badge>
            </div>
          </Card>
        </div>
      </Screen>
    );
  }

  /* ── Installing → progress panel ── */
  if (state === "installing") {
    return (
      <Screen icon={<Server size={19} />} kicker="Hermes Office" title="Office">
        <div className="flex items-center justify-center min-h-[440px] fade-in">
          <Card pad className="w-full max-w-[560px] flex flex-col gap-4 slide-up">
            <div className="flex items-center gap-2.5">
              <LoaderCircle size={18} className="animate-spin text-[var(--accent-text)]" />
              <h2 className="text-[15px] font-semibold text-[var(--text)]">Installing Hermes Office</h2>
              <span className="ml-auto text-[12px] font-mono text-[var(--text-3)]">
                Step {progress.step}/{progress.totalSteps}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium text-[var(--text)]">{sanitizeWorkspaceText(progress.title)}</span>
                <span className="text-[12px] font-mono text-[var(--accent-text)]">{percent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {progress.detail && (
                <p className="text-[12px] text-[var(--text-3)] mt-2">{sanitizeWorkspaceText(progress.detail)}</p>
              )}
            </div>

            <div
              ref={logRef}
              className="h-[220px] overflow-auto rounded-[var(--r)] bg-[rgba(0,0,0,0.28)] border border-[var(--border)] p-3 text-[11.5px] leading-relaxed font-mono text-[var(--text-2)] whitespace-pre-wrap"
            >
              {sanitizeWorkspaceText(progress.log) || "Waiting to start…"}
            </div>
          </Card>
        </div>
      </Screen>
    );
  }

  async function refreshOfficeStatus(): Promise<void> {
    setError("");
    const status = await checkStatus(false);
    if (status.running) await window.hermes.officeViewReload();
  }

  /* ── Ready → Hermes-owned live workspace shell ── */
  const statusLabel = starting ? "Starting…" : running ? "Running" : "Stopped";
  const officeUrl = `http://127.0.0.1:${port}/office`;
  const officeViewSuspended = showLogs || showSettings;

  return (
    <div className="ui-office-immersive">
      <header className="ui-office-commandbar">
        <div className="ui-office-command-title">
          <span className="ui-office-command-icon">
            <Server size={18} />
          </span>
          <div>
            <h1>Hermes Office</h1>
            <p>Spatial AI command floor</p>
          </div>
          <Badge variant={running ? "success" : "neutral"}>
            <StatusDot color={running ? "var(--success)" : "var(--text-3)"} pulse={running} />
            {statusLabel}
          </Badge>
        </div>

        <div className="ui-office-actions">
          <Badge variant={running ? "success" : "neutral"}>
            <StatusDot color={running ? "var(--success)" : "var(--text-3)"} pulse={running} />
            {running ? "Office online" : "Ready to start"}
          </Badge>
          <Button
            variant={running ? "secondary" : "primary"}
            size="sm"
            leftIcon={running ? <Square size={14} /> : <Play size={14} />}
            onClick={handleStartStop}
            disabled={starting || (portInUse && !running)}
          >
            {starting ? "Starting…" : running ? "Stop" : "Start"}
          </Button>
          <IconButton onClick={refreshOfficeStatus} title="Refresh Office">
            <RefreshCw size={15} />
          </IconButton>
          <IconButton onClick={toggleLogs} title={showLogs ? "Hide logs" : "Show logs"} aria-pressed={showLogs}>
            <FileText size={15} />
          </IconButton>
          <IconButton
            onClick={() => void toggleSettings()}
            title="Settings"
            aria-pressed={showSettings}
          >
            <SettingsIcon size={15} />
          </IconButton>
        </div>
      </header>

      {showSettings && (
        <Card pad className="ui-office-settings flex flex-wrap items-end gap-4 slide-up">
          <Field label="Office port" hint="Local port for the Hermes Office engine.">
            <Input
              type="number"
              min={1024}
              max={65535}
              value={portInput}
              onChange={e => setPortInput(e.target.value)}
              onBlur={handlePortSave}
              onKeyDown={e => { if (e.key === "Enter") handlePortSave(); }}
              className="!w-32"
            />
          </Field>
          <Field label="Bridge URL" hint="Connect Hermes Office to your agents.">
            <Input
              type="text"
              value={wsUrlInput}
              onChange={e => setWsUrlInput(e.target.value)}
              onBlur={handleWsUrlSave}
              onKeyDown={e => { if (e.key === "Enter") handleWsUrlSave(); }}
              placeholder="ws://localhost:18789"
              className="!w-64"
            />
          </Field>
          <Button variant="ghost" size="sm" leftIcon={<FileText size={14} />} onClick={() => void toggleLogs()} className="ml-auto">
            {showLogs ? "Hide logs" : "View logs"}
          </Button>
        </Card>
      )}

      {portInUse && !running && (
        <div className="mb-3.5 flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--r)] bg-[var(--warning-weak)] border border-[var(--border)] text-[12.5px] text-[var(--warning)]">
          <AlertTriangle size={15} className="shrink-0" />
              Port {port} is already in use. Change the Office port in settings before starting.
        </div>
      )}

      {error && (
        <div className="mb-3.5 flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--r)] bg-[var(--error-weak,rgba(229,72,77,0.16))] border border-[var(--border)]">
          <AlertTriangle size={15} className="text-[var(--error)] shrink-0" />
          <span className="text-[12.5px] text-[var(--text-2)] flex-1 break-words">{sanitizeWorkspaceText(error)}</span>
          <Button variant="ghost" size="sm" onClick={() => void toggleLogs()}>{showLogs ? "Hide logs" : "View logs"}</Button>
          <Button variant="ghost" size="sm" onClick={() => setError("")}>Dismiss</Button>
        </div>
      )}

      {/* ── Content area ── */}
      <Card className="ui-office-frame ui-office-frame-direct relative overflow-hidden slide-up">
        <div className="ui-office-live-shell">
          <OfficeRuntimeViewport
            officeUrl={officeUrl}
            port={port}
            running={running}
            starting={starting}
            portInUse={portInUse}
            suspended={officeViewSuspended}
            onToggleRuntime={handleStartStop}
            onOpenLogs={toggleLogs}
            onError={handleOfficeViewError}
          />
        </div>

        {showLogs && (
          <div className="ui-office-log-drawer slide-up">
            <div className="flex items-center justify-between px-[18px] h-[48px] border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <FileText size={15} className="text-[var(--accent-text)]" />
                <SectionLabel>Office logs</SectionLabel>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowLogs(false)}>Close</Button>
            </div>
            <div
              ref={logRef}
              className="ui-office-log-body"
            >
              {sanitizeWorkspaceText(logs) || "No logs yet."}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
