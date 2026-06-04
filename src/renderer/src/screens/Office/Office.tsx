import { useState, useEffect, useRef, useCallback } from "react";
import {
  Server, Play, Square, RefreshCw, ExternalLink, Settings as SettingsIcon,
  LoaderCircle, Boxes, AlertTriangle, FileText,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, Input, Field, Badge, StatusDot, SectionLabel,
} from "../../ui";

/* Electron's <webview> isn't in React's JSX intrinsic elements. */
const WebView = "webview" as unknown as React.FC<
  React.HTMLAttributes<HTMLElement> & { src?: string; ref?: React.Ref<HTMLElement> }
>;

type OfficeState = "checking" | "not-installed" | "installing" | "ready" | "error";

interface SetupProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

const CLAW3D_REPO = "https://github.com/iamlukethedev/Claw3D";

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
  const [webviewReady, setWebviewReady] = useState(false);
  const [webviewError, setWebviewError] = useState("");

  const logRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement>(null);

  // Refs to avoid restarting the poll interval on every state change
  const startingRef = useRef(starting);
  const runningRef = useRef(running);
  const errorRef = useRef(error);
  startingRef.current = starting;
  runningRef.current = running;
  errorRef.current = error;

  const checkStatus = useCallback(async (): Promise<void> => {
    setState("checking");
    const status = await window.hermes.claw3dStatus();
    setRunning(status.running);
    setPort(status.port);
    setPortInput(String(status.port));
    setPortInUse(status.portInUse);
    setWsUrlInput(status.wsUrl || "ws://localhost:18789");
    if (status.error) setError(status.error);
    setState(status.installed ? "ready" : "not-installed");
  }, []);

  useEffect(() => {
    window.hermes.getActiveProfile().then(setProfile).catch(() => {});
    checkStatus();
  }, [checkStatus]);

  // Poll status every 5s while ready
  useEffect(() => {
    if (state !== "ready") return;
    const interval = setInterval(async () => {
      const status = await window.hermes.claw3dStatus();
      setRunning(status.running);
      setPort(status.port);
      setPortInUse(status.portInUse);
      if (status.error && !errorRef.current) setError(status.error);
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

  // Webview load/error handling
  useEffect(() => {
    const wv = webviewRef.current as unknown as {
      addEventListener: (e: string, fn: (evt?: unknown) => void) => void;
      removeEventListener: (e: string, fn: (evt?: unknown) => void) => void;
      executeJavaScript?: (code: string) => Promise<unknown>;
    } | null;
    if (!wv) return;

    const ONBOARDING_JS = `try { localStorage.setItem("claw3d:onboarding:completed", "true") } catch(e) {}`;

    // Inject onboarding flag as early as possible (before Claw3D's scripts run).
    // Electron throws synchronously if the webview isn't attached + dom-ready yet —
    // catch it; the dom-ready handler re-injects.
    const injectOnboardingFlag = (): void => {
      if (!wv.executeJavaScript) return;
      try {
        wv.executeJavaScript(ONBOARDING_JS).catch(() => {});
      } catch {
        /* pre-dom-ready throw — re-injected on dom-ready */
      }
    };

    const onStartLoad = (): void => injectOnboardingFlag();
    const onDomReady = (): void => {
      injectOnboardingFlag();
      setWebviewReady(true);
      setWebviewError("");
    };
    const onFail = (evt: unknown): void => {
      setWebviewReady(false);
      const e = evt as { errorDescription?: string; errorCode?: number };
      if (e?.errorCode === -3) return; // Aborted — ignore (happens on reload)
      setWebviewError(
        e?.errorDescription ||
          "Failed to load Claw3D. The dev server may still be starting up.",
      );
    };

    wv.addEventListener("did-start-loading", onStartLoad);
    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-fail-load", onFail);
    return () => {
      wv.removeEventListener("did-start-loading", onStartLoad);
      wv.removeEventListener("dom-ready", onDomReady);
      wv.removeEventListener("did-fail-load", onFail);
    };
  }, [running, port]);

  async function handleInstall(): Promise<void> {
    setState("installing");
    setError("");
    const cleanup = window.hermes.onClaw3dSetupProgress(setProgress);
    try {
      const result = await window.hermes.claw3dSetup();
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
      await window.hermes.claw3dStopAll();
      setRunning(false);
      setWebviewReady(false);
      setWebviewError("");
      setError("");
    } else {
      setError("");
      setWebviewError("");
      setStarting(true);
      const result = await window.hermes.claw3dStartAll(profile);
      if (!result.success) {
        setError(result.error || "Failed to start Claw3D");
        setStarting(false);
      } else {
        setTimeout(() => setRunning(true), 2000);
      }
    }
  }

  async function handlePortSave(): Promise<void> {
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) return;
    await window.hermes.claw3dSetPort(newPort);
    setPort(newPort);
    const status = await window.hermes.claw3dStatus();
    setPortInUse(status.portInUse);
  }

  async function handleWsUrlSave(): Promise<void> {
    const trimmed = wsUrlInput.trim();
    if (!trimmed) return;
    await window.hermes.claw3dSetWsUrl(trimmed);
  }

  async function loadLogs(): Promise<void> {
    setLogs(await window.hermes.claw3dGetLogs());
    setShowLogs(true);
  }

  function refreshWebview(): void {
    setWebviewError("");
    const wv = webviewRef.current as unknown as { reload?: () => void } | null;
    wv?.reload?.();
  }

  const percent =
    progress.totalSteps > 0
      ? Math.round((progress.step / progress.totalSteps) * 100)
      : 0;
  const claw3dUrl = `http://localhost:${port}`;

  /* ── Checking ── */
  if (state === "checking") {
    return (
      <Screen icon={<Server size={19} />} kicker="Live Workspace" title="Hermes Office">
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
      <Screen icon={<Server size={19} />} kicker="Live Workspace" title="Hermes Office">
        <div className="flex items-center justify-center min-h-[360px] fade-in">
          <Card pad className="relative overflow-hidden w-full max-w-[460px] flex flex-col items-center text-center gap-4 mint-in">
            <span className="ui-stamp w-[64px] h-[64px] rounded-full text-[var(--accent-text)] mint-in mint-in-1">
              <Boxes size={28} />
            </span>
            <div>
              <div className="ui-eyebrow justify-center">Office · Setup</div>
              <h2 className="serif text-[22px] text-[var(--text)]">Set up the Hermes Office</h2>
              <p className="text-[13px] text-[var(--text-2)] mt-2 leading-relaxed">
                Installs <span className="text-[var(--accent-text)]">Claw3D</span> — the isometric 3D
                office where your agents work side by side. This downloads and builds the workspace
                locally; it only runs when you start it.
              </p>
            </div>
            {error && (
              <div className="w-full flex items-start gap-2 text-left px-3.5 py-2.5 rounded-[var(--r)] bg-[var(--error-weak,rgba(229,72,77,0.16))] border border-[var(--border)]">
                <AlertTriangle size={15} className="text-[var(--error)] shrink-0 mt-0.5" />
                <span className="text-[12.5px] text-[var(--text-2)] break-words">{error}</span>
              </div>
            )}
            <hr className="ui-divider-gold w-full" />
            <div className="flex items-center gap-2.5">
              <Button variant="primary" leftIcon={<Boxes size={14} />} onClick={handleInstall}>
                Install Claw3D
              </Button>
              <Button
                variant="secondary"
                leftIcon={<ExternalLink size={14} />}
                onClick={() => window.hermes.openExternal(CLAW3D_REPO)}
              >
                View on GitHub
              </Button>
            </div>
          </Card>
        </div>
      </Screen>
    );
  }

  /* ── Installing → progress panel ── */
  if (state === "installing") {
    return (
      <Screen icon={<Server size={19} />} kicker="Live Workspace" title="Hermes Office">
        <div className="flex items-center justify-center min-h-[440px] fade-in">
          <Card pad className="w-full max-w-[560px] flex flex-col gap-4 slide-up">
            <div className="flex items-center gap-2.5">
              <LoaderCircle size={18} className="animate-spin text-[var(--accent-text)]" />
              <h2 className="text-[15px] font-semibold text-[var(--text)]">Installing Claw3D</h2>
              <span className="ml-auto text-[12px] font-mono text-[var(--text-3)]">
                Step {progress.step}/{progress.totalSteps}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium text-[var(--text)]">{progress.title}</span>
                <span className="text-[12px] font-mono text-[var(--accent-text)]">{percent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {progress.detail && (
                <p className="text-[12px] text-[var(--text-3)] mt-2">{progress.detail}</p>
              )}
            </div>

            <div
              ref={logRef}
              className="h-[220px] overflow-auto rounded-[var(--r)] bg-[rgba(0,0,0,0.28)] border border-[var(--border)] p-3 text-[11.5px] leading-relaxed font-mono text-[var(--text-2)] whitespace-pre-wrap"
            >
              {progress.log || "Waiting to start…"}
            </div>
          </Card>
        </div>
      </Screen>
    );
  }

  /* ── Ready → toolbar + webview ── */
  const statusLabel = starting ? "Starting…" : running ? "Running" : "Stopped";

  return (
    <Screen
      icon={<Server size={19} />}
      kicker="Live Workspace"
      title="Hermes Office"
      sub="A living spatial workspace where your agents work side by side."
      actions={
        <div className="flex items-center gap-2">
          <Badge variant={running ? "success" : "neutral"}>
            <StatusDot color={running ? "var(--success)" : "var(--text-3)"} pulse={running} />
            {statusLabel}
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
          {running && (
            <>
              <IconButton onClick={refreshWebview} title="Reload">
                <RefreshCw size={15} />
              </IconButton>
              <IconButton onClick={() => window.hermes.openExternal(claw3dUrl)} title="Open in browser">
                <ExternalLink size={15} />
              </IconButton>
            </>
          )}
          <IconButton
            onClick={() => setShowSettings(s => !s)}
            title="Settings"
            aria-pressed={showSettings}
          >
            <SettingsIcon size={15} />
          </IconButton>
        </div>
      }
    >
      {showSettings && (
        <Card pad className="mb-3.5 flex flex-wrap items-end gap-4 slide-up">
          <Field label="Port" hint="Local port for the Claw3D dev server.">
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
          <Field label="WebSocket URL" hint="Bridge the office to your agents.">
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
          <Button variant="ghost" size="sm" leftIcon={<FileText size={14} />} onClick={loadLogs} className="ml-auto">
            View logs
          </Button>
        </Card>
      )}

      {portInUse && !running && (
        <div className="mb-3.5 flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--r)] bg-[var(--warning-weak)] border border-[var(--border)] text-[12.5px] text-[var(--warning)]">
          <AlertTriangle size={15} className="shrink-0" />
          Port {port} is already in use. Change it in settings before starting.
        </div>
      )}

      {error && (
        <div className="mb-3.5 flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--r)] bg-[var(--error-weak,rgba(229,72,77,0.16))] border border-[var(--border)]">
          <AlertTriangle size={15} className="text-[var(--error)] shrink-0" />
          <span className="text-[12.5px] text-[var(--text-2)] flex-1 break-words">{error}</span>
          <Button variant="ghost" size="sm" onClick={loadLogs}>View logs</Button>
          <Button variant="ghost" size="sm" onClick={() => setError("")}>Dismiss</Button>
        </div>
      )}

      {showLogs && (
        <Card className="mb-3.5 slide-up">
          <div className="flex items-center justify-between px-[18px] h-[48px] border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <FileText size={15} className="text-[var(--accent-text)]" />
              <SectionLabel>Process logs</SectionLabel>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowLogs(false)}>Close</Button>
          </div>
          <div
            ref={logRef}
            className="h-[260px] overflow-auto p-3 text-[11.5px] leading-relaxed font-mono text-[var(--text-2)] whitespace-pre-wrap"
          >
            {logs || "No logs yet."}
          </div>
        </Card>
      )}

      {/* ── Content area ── */}
      <Card className="relative overflow-hidden flex flex-col min-h-[560px] slide-up">
        {running && !showLogs ? (
          <div className="relative flex-1 min-h-[560px]">
            {(!webviewReady || webviewError) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3.5 bg-[var(--surface)]">
                {webviewError ? (
                  <div className="flex flex-col items-center text-center gap-3 max-w-[420px]">
                    <span className="flex items-center justify-center w-12 h-12 rounded-[12px] bg-[var(--error-weak,rgba(229,72,77,0.16))] border border-[var(--border)]">
                      <AlertTriangle size={22} className="text-[var(--error)]" />
                    </span>
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">Cannot load Claw3D</h3>
                    <p className="text-[12.5px] text-[var(--text-3)]">{webviewError}</p>
                    <div className="flex items-center gap-2.5 mt-1">
                      <Button variant="primary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={refreshWebview}>
                        Retry
                      </Button>
                      <Button variant="secondary" size="sm" leftIcon={<FileText size={14} />} onClick={loadLogs}>
                        View logs
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <LoaderCircle size={26} className="animate-spin text-[var(--accent-text)]" />
                    <p className="text-[13px] text-[var(--text-3)]">
                      {starting ? "Starting the Claw3D service…" : "Loading the 3D workspace…"}
                    </p>
                  </>
                )}
              </div>
            )}
            <WebView
              ref={webviewRef}
              src={claw3dUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        ) : !showLogs ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center gap-4 min-h-[560px] p-6">
            <span className="ui-stamp w-[64px] h-[64px] rounded-full text-[var(--accent-text)] mint-in mint-in-1">
              <Boxes size={28} />
            </span>
            <div>
              <div className="ui-eyebrow justify-center">Workspace · Idle</div>
              <h3 className="serif text-[20px] text-[var(--text)]">Start the office to load the 3D workspace</h3>
              <p className="text-[13px] text-[var(--text-2)] mt-1.5 max-w-sm">
                {portInUse
                  ? `Port ${port} is in use — change it in settings first.`
                  : "Boot the Claw3D dev server to step into your isometric office."}
              </p>
            </div>
            <Button
              variant="primary"
              leftIcon={<Play size={14} />}
              onClick={handleStartStop}
              disabled={starting || portInUse}
            >
              {starting ? "Starting…" : "Start the office"}
            </Button>
          </div>
        ) : null}
      </Card>
    </Screen>
  );
}
