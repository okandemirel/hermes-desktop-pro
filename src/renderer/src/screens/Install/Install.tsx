import { useState, useCallback, useEffect, useRef } from "react";
import {
  Check, LoaderCircle, XCircle, ArrowRight, RotateCcw,
  Terminal, Monitor, Download, Package, Cog, ShieldCheck,
} from "lucide-react";
import { Badge, Button, Card, Screen, cx } from "../../ui";

// ─── Step definitions ───────────────────────────────────────────────────
//
// The backend (installer.ts:runInstall) emits a 1..7 step model parsed from
// the official install.sh / install.ps1 output. We collapse those 7 stages
// into 4 visual buckets so the indicator stays legible.

interface Step {
  id: string;
  label: string;
  icon: typeof Monitor;
  /** Backend steps that map onto this visual bucket. */
  backendSteps: number[];
}

const STEPS: Step[] = [
  { id: "deps", label: "Checking prerequisites", icon: Monitor, backendSteps: [1, 2] },
  { id: "python", label: "Setting up Python", icon: Download, backendSteps: [3] },
  { id: "hermes", label: "Downloading Hermes Desktop Pro", icon: Package, backendSteps: [4, 5] },
  { id: "finish", label: "Installing dependencies", icon: Cog, backendSteps: [6, 7] },
];

type StepStatus = "pending" | "running" | "done" | "error";
type Phase = "checking" | "idle" | "installing" | "error" | "done";

interface InstallProgressPayload {
  step: number;
  log: string;
}

/** Map the backend step (1..7) onto the visual bucket index (0..3). */
function bucketForBackendStep(step: number): number {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (STEPS[i].backendSteps.includes(step)) return i;
  }
  return 0;
}

// ─── Terminal log component ─────────────────────────────────────────────

function TerminalLog({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  const lines = text ? text.split("\n") : [];
  const visible = lines.slice(-200);

  return (
    <div
      ref={ref}
      className="ui-install-log"
    >
      {visible.length === 0 && (
        <span className="ui-install-log-empty">Waiting for installation to begin...</span>
      )}
      {visible.map((line, i) => (
        <div key={i}>{line || " "}</div>
      ))}
      {text.length > 0 && (
        <span className="ui-install-log-caret" />
      )}
    </div>
  );
}

// ─── Step indicator ─────────────────────────────────────────────────────

function StepIndicator({ step, status, isLast }: { step: Step; status: StepStatus; isLast: boolean }) {
  const Icon = step.icon;
  return (
    <div className="ui-install-step" data-status={status}>
      <div className="ui-install-step-rail">
        <div className="ui-install-step-icon">
          {status === "done" ? (
            <Check size={14} />
          ) : status === "running" ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : status === "error" ? (
            <XCircle size={14} />
          ) : (
            <Icon size={14} />
          )}
        </div>
        {!isLast && <div className="ui-install-step-line" />}
      </div>
      <div className="ui-install-step-copy">
        <strong>{step.label}</strong>
        <span>{status === "done" ? "Complete" : status === "running" ? "In progress" : status === "error" ? "Needs attention" : "Waiting"}</span>
      </div>
    </div>
  );
}

// ─── InstallView ────────────────────────────────────────────────────────

interface InstallViewProps {
  /** Called when the agent is installed/verified and the user continues. */
  onComplete?: () => void;
}

export default function InstallView({ onComplete }: InstallViewProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [activeBucket, setActiveBucket] = useState(0);
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState<string | null>(null);

  // Derive per-step status from the active bucket + phase.
  const statusFor = useCallback((index: number): StepStatus => {
    if (phase === "done") return "done";
    if (phase === "error") {
      if (index < activeBucket) return "done";
      if (index === activeBucket) return "error";
      return "pending";
    }
    if (phase === "installing") {
      if (index < activeBucket) return "done";
      if (index === activeBucket) return "running";
      return "pending";
    }
    return "pending";
  }, [phase, activeBucket]);

  // On mount: check whether the agent is already installed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await window.hermes.checkHermesInstalled();
        if (cancelled) return;
        if (status.installed) {
          const v = await window.hermes.getHermesVersion().catch(() => null);
          if (cancelled) return;
          setVersion(v);
          setPhase("done");
        } else {
          setPhase("idle");
        }
      } catch {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startInstall = useCallback(async () => {
    setPhase("installing");
    setActiveBucket(0);
    setLog("");
    setError("");

    const cleanup = window.hermes.onInstallProgress((p: InstallProgressPayload) => {
      setActiveBucket(bucketForBackendStep(p.step));
      setLog(p.log);
    });

    try {
      const result = await window.hermes.installHermes();
      cleanup();
      if (result.success) {
        const v = await window.hermes.getHermesVersion().catch(() => null);
        setVersion(v);
        setPhase("done");
      } else {
        setError(result.error || "Installation failed.");
        setPhase("error");
      }
    } catch (err) {
      cleanup();
      setError((err as Error).message || "Installation failed.");
      setPhase("error");
    }
  }, []);

  const handleRetry = useCallback(() => {
    setPhase("idle");
    setActiveBucket(0);
    setLog("");
    setError("");
  }, []);

  const doneCount = STEPS.filter((_, i) => statusFor(i) === "done").length;
  const progressPercent = phase === "done"
    ? 100
    : Math.round((doneCount / STEPS.length) * 100);

  const phaseCopy = phase === "checking"
    ? "Checking installation..."
    : phase === "idle"
      ? "Ready to install Hermes Desktop Pro locally"
      : phase === "installing"
        ? `Installing... ${STEPS[activeBucket].label}`
        : phase === "done"
          ? (version ? `Hermes Desktop Pro is ready - ${version}` : "Hermes Desktop Pro is ready")
          : "Installation encountered an error";

  return (
    <Screen
      className="ui-install-console"
      icon={<Download size={19} />}
      kicker="Local Runtime"
      title="Install Hermes"
      sub={phaseCopy}
      actions={
        <Badge variant={phase === "done" ? "success" : phase === "error" ? "error" : phase === "installing" ? "accent" : "neutral"}>
          {phase === "done" ? "Ready" : phase === "error" ? "Error" : phase === "installing" ? "Installing" : phase === "checking" ? "Checking" : "Idle"}
        </Badge>
      }
    >
      <div className="ui-install-shell">
        <Card pad className="ui-install-hero mint-in mint-in-1">
          <div className="ui-install-hero-mark">
            <ShieldCheck size={28} />
          </div>
          <div className="ui-install-hero-copy">
            <div className="ui-eyebrow">Hermes Setup</div>
            <h2>{phase === "done" ? "Runtime is ready" : "Prepare the local command center"}</h2>
            <p>
              Install the local Hermes runtime that powers sessions, tools, memory and automation.
              Existing backend install behavior is preserved.
            </p>
          </div>
          <div className="ui-install-metrics">
            <div><span>Progress</span><strong>{progressPercent}%</strong></div>
            <div><span>Steps</span><strong>{doneCount}/{STEPS.length}</strong></div>
            <div><span>Version</span><strong>{version || "Local"}</strong></div>
          </div>
        </Card>

        <div className="ui-install-progress-card mint-in mint-in-2">
          <div className="ui-install-progress-head">
            <span>Setup Progress</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="ui-install-progress-track" data-phase={phase}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className={cx("ui-install-layout", (phase === "installing" || phase === "error") && "has-log")}>
          <Card pad className="ui-install-steps-card mint-in mint-in-3">
            <div className="ui-install-card-head">
              <div>
                <span>Runtime Checklist</span>
                <strong>{phaseCopy}</strong>
              </div>
              {phase === "installing" && <LoaderCircle size={16} className="animate-spin" />}
            </div>
            <div className="ui-install-steps">
              {STEPS.map((step, i) => (
                <StepIndicator
                  key={step.id}
                  step={step}
                  status={statusFor(i)}
                  isLast={i === STEPS.length - 1}
                />
              ))}
            </div>
          </Card>

          <Card pad className="ui-install-action-card mint-in mint-in-4">
            <div className="ui-install-card-head">
              <div>
                <span>Action</span>
                <strong>{phase === "done" ? "Continue to Hermes" : phase === "error" ? "Retry setup" : "Start when ready"}</strong>
              </div>
            </div>

            {phase === "error" && error && (
              <div className="ui-modal-alert" role="alert">
                {error}
              </div>
            )}

            <div className="ui-install-actions">
              {phase === "checking" && (
                <Button variant="secondary" disabled leftIcon={<LoaderCircle size={15} className="animate-spin" />}>
                  Checking...
                </Button>
              )}

              {phase === "idle" && (
                <Button variant="primary" onClick={startInstall} leftIcon={<Download size={15} />}>
                  Install Hermes
                </Button>
              )}

              {phase === "installing" && (
                <Button variant="secondary" disabled leftIcon={<LoaderCircle size={15} className="animate-spin" />}>
                  Installing...
                </Button>
              )}

              {phase === "error" && (
                <Button variant="primary" onClick={handleRetry} leftIcon={<RotateCcw size={15} />}>
                  Retry Installation
                </Button>
              )}

              {phase === "done" && onComplete && (
                <Button variant="primary" onClick={onComplete} leftIcon={<ArrowRight size={15} />}>
                  Continue
                </Button>
              )}
            </div>
            <p className="ui-install-action-note">
              Installation logs remain local. Hermes Desktop Pro keeps your runtime configuration on this machine.
            </p>
          </Card>

          {(phase === "installing" || phase === "error") && (
            <Card pad className="ui-install-log-card mint-in mint-in-5">
              <div className="ui-install-log-head">
                <Terminal size={14} />
                <span>Install Log</span>
                <small>Last 200 lines</small>
              </div>
              <TerminalLog text={log} />
            </Card>
          )}
        </div>
      </div>
    </Screen>
  );
}
