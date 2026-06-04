import { useState, useCallback, useEffect, useRef } from "react";
import {
  Check, LoaderCircle, XCircle, ArrowRight, RotateCcw,
  Terminal, Monitor, Download, Package, Key
} from "lucide-react";
import { Button } from "../../ui";

// ─── Step definitions ───────────────────────────────────────────────────

interface Step {
  id: string;
  label: string;
  icon: typeof Monitor;
}

const STEPS: Step[] = [
  { id: "deps", label: "Checking dependencies", icon: Monitor },
  { id: "python", label: "Installing Python", icon: Download },
  { id: "hermes", label: "Setting up Hermes", icon: Package },
  { id: "providers", label: "Configuring providers", icon: Key },
];

type StepStatus = "pending" | "running" | "done" | "error";

// ─── Simulated install log lines ────────────────────────────────────────

const SIM_LOGS: Record<string, string[]> = {
  deps: [
    "\x1b[90m[system]\x1b[0m Checking system dependencies...",
    "\x1b[90m[system]\x1b[0m ✓ Node.js v22.14.0 detected",
    "\x1b[90m[system]\x1b[0m ✓ Git 2.48.1 detected",
    "\x1b[90m[system]\x1b[0m ✓ curl 8.14.0 detected",
    "\x1b[90m[system]\x1b[0m ✓ build-essential installed",
  ],
  python: [
    "\x1b[90m[python]\x1b[0m Checking Python installation...",
    "\x1b[90m[python]\x1b[0m Python 3.11.15 found",
    "\x1b[90m[python]\x1b[0m Installing pip packages...",
    "\x1b[90m[python]\x1b[0m ✓ aiohttp 3.9.5 installed",
    "\x1b[90m[python]\x1b[0m ✓ cryptography 42.0.8 installed",
    "\x1b[90m[python]\x1b[0m ✓ pydantic 2.8.2 installed",
  ],
  hermes: [
    "\x1b[90m[hermes]\x1b[0m Cloning Hermes core...",
    "\x1b[90m[hermes]\x1b[0m ✓ Repository cloned (3.2 MB)",
    "\x1b[90m[hermes]\x1b[0m Installing core dependencies...",
    "\x1b[90m[hermes]\x1b[0m ✓ 48 packages installed",
    "\x1b[90m[hermes]\x1b[0m Initializing Hermes config...",
    "\x1b[90m[hermes]\x1b[0m ✓ Config written to ~/.hermes/config.yaml",
    "\x1b[90m[hermes]\x1b[0m ✓ Agent service registered",
  ],
  providers: [
    "\x1b[90m[providers]\x1b[0m Scanning available providers...",
    "\x1b[90m[providers]\x1b[0m ✓ opencode-go detected",
    "\x1b[90m[providers]\x1b[0m ✓ opencode-zen detected",
    "\x1b[90m[providers]\x1b[0m ✓ anthropic detected",
    "\x1b[90m[providers]\x1b[0m ✓ openai detected",
    "\x1b[90m[providers]\x1b[0m ✓ google detected",
    "\x1b[90m[providers]\x1b[0m → Set API keys in ~/.hermes/.env",
  ],
};

// ─── Terminal log component ─────────────────────────────────────────────

function TerminalLog({ lines, maxLines = 12 }: { lines: string[]; maxLines?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  const visible = lines.slice(-maxLines);

  return (
    <div
      ref={ref}
      className="font-mono text-xs leading-relaxed rounded-lg p-4 overflow-y-auto border border-[var(--border)]"
      style={{ background: "var(--surface)", height: "220px" }}
    >
      {visible.length === 0 && (
        <span className="text-[var(--text-3)]">Waiting for installation to begin...</span>
      )}
      {visible.map((line, i) => {
        // Simple ANSI color code parsing for the simulated logs
        const text = line.replace(/\x1b\[\d+m/g, "");
        const grayMatch = line.match(/\x1b\[90m/);
        if (grayMatch) {
          // Extract labeled parts
          const bracketMatch = text.match(/^\[([^\]]+)\]\s/);
          if (bracketMatch) {
            const label = bracketMatch[0];
            const rest = text.slice(label.length);
            return (
              <div key={i} className="flex">
                <span className="text-[var(--text-3)] flex-shrink-0">{label}</span>
                <span className="text-[var(--text-2)]">{rest}</span>
              </div>
            );
          }
        }
        return <div key={i} className="text-[var(--text-2)]">{text}</div>;
      })}
      {/* Blinking cursor when running */}
      {lines.length > 0 && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-[var(--accent)] animate-pulse align-middle" />
      )}
    </div>
  );
}

// ─── Step indicator ─────────────────────────────────────────────────────

function StepIndicator({ step, status, isLast }: { step: Step; status: StepStatus; isLast: boolean }) {
  const Icon = step.icon;
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-300 ${
            status === "done"
              ? "border-[var(--success)] bg-[var(--success-weak)]"
              : status === "running"
                ? "border-[var(--accent)] bg-[var(--accent-weak)]"
                : status === "error"
                  ? "border-[var(--error)] bg-[var(--error-weak)]"
                  : "border-[var(--border)] bg-transparent"
          }`}
        >
          {status === "done" ? (
            <Check size={14} className="text-[var(--success)]" />
          ) : status === "running" ? (
            <LoaderCircle size={14} className="text-[var(--accent-text)] animate-spin" />
          ) : status === "error" ? (
            <XCircle size={14} className="text-[var(--error)]" />
          ) : (
            <Icon size={14} className="text-[var(--text-3)]" />
          )}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 h-6 mt-1 transition-colors duration-300 ${
              status === "done" ? "bg-[var(--success-weak)]" : "bg-[var(--border)]"
            }`}
          />
        )}
      </div>
      <div className="flex-1 pb-6">
        <p className={`text-sm font-medium transition-colors duration-300 ${
          status === "done" ? "text-[var(--success)]" :
          status === "running" ? "text-[var(--accent-text)]" :
          status === "error" ? "text-[var(--error)]" :
          "text-[var(--text-3)]"
        }`}>
          {step.label}
        </p>
      </div>
    </div>
  );
}

// ─── InstallView ────────────────────────────────────────────────────────

export default function InstallView() {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(["pending", "pending", "pending", "pending"]);
  const [logs, setLogs] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "installing" | "error" | "done">("idle");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const startInstall = useCallback(() => {
    setPhase("installing");
    setCurrentStep(0);
    setStepStatuses(["pending", "pending", "pending", "pending"]);
    setLogs([]);

    clearTimers();

    const runStep = (index: number) => {
      if (index >= STEPS.length) {
        // All done
        setPhase("done");
        return;
      }

      setCurrentStep(index);
      setStepStatuses(prev => prev.map((s, i) => i === index ? "running" : s));

      const stepLogs = SIM_LOGS[STEPS[index].id] || [];
      const delay = 600; // ms between log lines

      stepLogs.forEach((line, lineIndex) => {
        const t = setTimeout(() => {
          setLogs(prev => [...prev, line]);
        }, delay * (lineIndex + 1));
        timersRef.current.push(t);
      });

      // Mark step done after all logs
      const doneTime = delay * (stepLogs.length + 1);
      const t = setTimeout(() => {
        setStepStatuses(prev => prev.map((s, i) => i === index ? "done" : s));
        runStep(index + 1);
      }, doneTime);
      timersRef.current.push(t);
    };

    runStep(0);
  }, [clearTimers]);

  const handleRetry = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setCurrentStep(0);
    setStepStatuses(["pending", "pending", "pending", "pending"]);
    setLogs([]);
  }, [clearTimers]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const progressPercent = Math.round(
    (stepStatuses.filter(s => s === "done").length / STEPS.length) * 100
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ background: "var(--surface)" }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-6 py-6 border-b border-[var(--border)]" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent-weak)] border border-[var(--accent-line)]">
            <Download size={18} className="text-[var(--accent-text)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text)]">Install Hermes</h1>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              {phase === "idle" && "Ready to install Hermes Agent locally"}
              {phase === "installing" && `Installing... Step ${currentStep + 1} of ${STEPS.length}`}
              {phase === "done" && "Installation complete!"}
              {phase === "error" && "Installation encountered an error"}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {(phase === "installing" || phase === "done" || phase === "error") && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[var(--text-3)]">Progress</span>
              <span className="text-[11px] font-mono text-[var(--text-2)]">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  phase === "error" ? "bg-[var(--error)]" : "bg-[var(--accent)]"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          {/* Step indicators */}
          <div className="mb-6">
            {STEPS.map((step, i) => (
              <StepIndicator
                key={step.id}
                step={step}
                status={stepStatuses[i]}
                isLast={i === STEPS.length - 1}
              />
            ))}
          </div>

          {/* Terminal log */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={14} className="text-[var(--text-3)]" />
              <span className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide">Install Log</span>
            </div>
            <TerminalLog lines={logs} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
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
              <>
                <Button variant="primary" onClick={handleRetry} leftIcon={<RotateCcw size={15} />}>
                  Retry Installation
                </Button>
                <Button variant="secondary" onClick={() => setPhase("idle")}>
                  Cancel
                </Button>
              </>
            )}

            {phase === "done" && (
              <Button variant="primary" leftIcon={<ArrowRight size={15} />}>
                Continue to Setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
