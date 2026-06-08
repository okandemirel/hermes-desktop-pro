import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Settings, Shield, Download, Upload, Moon, Sun, Laptop, Database, Terminal as TerminalIcon,
  Copy, Check, SlidersHorizontal, Globe, KeyRound, Palette,
  CalendarClock, RefreshCw, Pencil, Pause, Play, Clock, Send, AlertCircle, Trash2,
} from "lucide-react";
import type { CronJob, CronJobUpdateInput, ProfileInfo } from "@shared/types";
import {
  Screen, Card, Button, Input, Textarea, Select, Badge, Toggle, Segment, SegmentItem,
  IconButton, Field, StatusDot, Modal, cx,
} from "../ui";
import {
  ACCENT_OPTIONS,
  applyAppearancePreferences,
  readAppearancePreferences,
  subscribeToSystemTheme,
  type ThemePreference,
} from "../themePreferences";
import {
  getCronJobOperationProfile,
  groupCronJobsByProfile,
  type CronProfileGroup,
} from "../cronJobGrouping";

type ConnMode = "local" | "remote" | "ssh";

interface SshState {
  host: string;
  port: string;
  username: string;
  keyPath: string;
  remotePort: string;
  localPort: string;
}

interface TestResult {
  ok: boolean;
  mode: ConnMode;
  latencyMs: number;
  error?: string;
}

interface PublicConnConfig {
  mode: ConnMode;
  remoteUrl: string;
  hasApiKey: boolean;
  apiKeyLength: number;
  ssh: { host: string; port: number; username: string; keyPath: string; remotePort: number; localPort: number };
}
type LogTab = "gateway" | "agent" | "error";
type SectionId = "general" | "network" | "providers" | "cronJobs" | "appearance" | "backup" | "diagnostics";

const CRON_SECTION: { id: SectionId; label: string; icon: typeof Settings; desc: string } =
  { id: "cronJobs", label: "Cron Jobs", icon: CalendarClock, desc: "Profile-scoped scheduled automations" };

const SETTINGS_SECTIONS: { id: SectionId; label: string; icon: typeof Settings; desc: string }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, desc: "Connection mode and automatic updates" },
  { id: "network", label: "Network", icon: Globe, desc: "Local port, remote endpoint and authentication" },
  { id: "providers", label: "Providers", icon: KeyRound, desc: "Model provider API credentials" },
  { id: "appearance", label: "Appearance", icon: Palette, desc: "Theme and accent colour" },
  { id: "backup", label: "Backup", icon: Database, desc: "Export, restore and diagnostics bundle" },
  { id: "diagnostics", label: "Diagnostics", icon: TerminalIcon, desc: "Live gateway, agent and error logs" },
];
const SECTIONS = [...SETTINGS_SECTIONS, CRON_SECTION];

// Map the diagnostics tab to its on-disk log file name in ~/.hermes/logs.
const LOG_FILE_FOR_TAB: Record<LogTab, string> = {
  gateway: "gateway.log",
  agent: "agent.log",
  error: "errors.log",
};

const PROVIDER_KEYS: [string, string][] = [
  ["OpenRouter", "OPENROUTER_API_KEY"],
  ["Anthropic", "ANTHROPIC_API_KEY"],
  ["OpenCode Zen", "OPENCODE_ZEN_API_KEY"],
  ["OpenCode Go", "OPENCODE_GO_API_KEY"],
  ["DeepSeek", "DEEPSEEK_API_KEY"],
];

const THEMES = [
  ["dark", "Dark", Moon],
  ["light", "Light", Sun],
  ["system", "System", Laptop],
] as const;

const LOG_TABS: { id: LogTab; label: string }[] = [
  { id: "gateway", label: "Gateway" },
  { id: "agent", label: "Agent" },
  { id: "error", label: "Error" },
];

const CRON_DELIVERY_TARGETS = ["local", "telegram", "discord", "email", "slack"];

interface CronEditTarget {
  profileName: string;
  job: CronJob;
}

interface CronEditForm {
  name: string;
  schedule: string;
  prompt: string;
  deliver: string;
}

function humanizeTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanizeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const everyN = (field: string): number | null => {
    const match = field.match(/^\*\/(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : null;
  };

  const minuteCadence = everyN(min);
  if (minuteCadence && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${minuteCadence} minute${minuteCadence === 1 ? "" : "s"}`;
  }
  const hourCadence = everyN(hour);
  if (min === "0" && hourCadence && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${hourCadence} hour${hourCadence === 1 ? "" : "s"}`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*" && dow === "*") {
    const time = new Date();
    time.setHours(Number.parseInt(hour, 10), Number.parseInt(min, 10), 0, 0);
    return `Every day at ${time.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return expr;
}

function cronState(job: CronJob): "active" | "paused" | "completed" {
  if (job.state === "completed") return "completed";
  if (job.state === "active" && job.enabled) return "active";
  return "paused";
}

/* Single row: label + description on the left, control on the right. */
function Row({ title, desc, control, last }: { title: string; desc?: string; control: React.ReactNode; last?: boolean }) {
  return (
    <div className={cx("ui-settings-row", !last && "ui-settings-row-bordered")}>
      <div className="ui-settings-row-copy">
        <div>{title}</div>
        {desc && <p>{desc}</p>}
      </div>
      <div className="ui-settings-row-control">{control}</div>
    </div>
  );
}

export default function SettingsView({
  initialSection = "general",
  standaloneSection = false,
}: {
  initialSection?: SectionId;
  standaloneSection?: boolean;
}) {
  const [section, setSection] = useState<SectionId>(initialSection);
  const initialAppearance = useMemo(() => readAppearancePreferences(), []);
  const [theme, setTheme] = useState<ThemePreference>(initialAppearance.theme);
  const [accent, setAccent] = useState(initialAppearance.accent);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [mode, setMode] = useState<ConnMode>("local");
  const [localPort, setLocalPort] = useState("8642");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [ssh, setSsh] = useState<SshState>({ host: "", port: "22", username: "", keyPath: "~/.ssh/id_rsa", remotePort: "8642", localPort: "18642" });
  const [logTab, setLogTab] = useState<LogTab>("gateway");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logPath, setLogPath] = useState<string>("");
  const [logLoading, setLogLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [cronGroups, setCronGroups] = useState<CronProfileGroup[]>([]);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [cronBusyKey, setCronBusyKey] = useState<string | null>(null);
  const [cronEditTarget, setCronEditTarget] = useState<CronEditTarget | null>(null);
  const [cronDeleteTarget, setCronDeleteTarget] = useState<CronEditTarget | null>(null);
  const [cronForm, setCronForm] = useState<CronEditForm>({
    name: "",
    schedule: "",
    prompt: "",
    deliver: "local",
  });
  const [cronSaving, setCronSaving] = useState(false);

  useEffect(() => {
    applyAppearancePreferences({ theme, accent });
  }, [theme, accent]);

  useEffect(() => subscribeToSystemTheme(() => {
    if (theme === "system") applyAppearancePreferences({ theme, accent });
  }), [theme, accent]);

  // Seed local state from the real connection config on mount. The API key is
  // never returned — we only surface whether one is set via `hasApiKey`.
  useEffect(() => {
    let cancelled = false;
    window.hermes.getConnectionConfig().then((cfg: PublicConnConfig) => {
      if (cancelled || !cfg) return;
      setMode(cfg.mode || "local");
      setRemoteUrl(cfg.remoteUrl || "");
      setHasApiKey(!!cfg.hasApiKey);
      if (cfg.ssh) {
        setSsh({
          host: cfg.ssh.host || "",
          port: String(cfg.ssh.port ?? 22),
          username: cfg.ssh.username || "",
          keyPath: cfg.ssh.keyPath || "~/.ssh/id_rsa",
          remotePort: String(cfg.ssh.remotePort ?? 8642),
          localPort: String(cfg.ssh.localPort ?? 18642),
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load real logs from ~/.hermes/logs whenever the Diagnostics section is
  // open and the active tab changes. Honest empty/error state — no mocks.
  useEffect(() => {
    if (section !== "diagnostics") return;
    let cancelled = false;
    setLogLoading(true);
    window.hermes.readLogs(LOG_FILE_FOR_TAB[logTab], 50)
      .then(({ content, path }: { content: string; path: string }) => {
        if (cancelled) return;
        setLogPath(path || "");
        setLogLines(content ? content.split("\n").filter((l: string) => l.length > 0) : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLogPath("");
        setLogLines([]);
      })
      .finally(() => { if (!cancelled) setLogLoading(false); });
    return () => { cancelled = true; };
  }, [section, logTab]);

  const loadCronJobs = useCallback(async () => {
    setCronLoading(true);
    setCronError(null);
    try {
      const profileList: ProfileInfo[] = await window.hermes.listProfiles();
      const groups: CronProfileGroup[] = await Promise.all(
        profileList.map(async (profile: ProfileInfo) => {
          try {
            const jobs = await window.hermes.listCronJobs(true, profile.name);
            return { profile, jobs } satisfies CronProfileGroup;
          } catch (err: any) {
            return {
              profile,
              jobs: [],
              error: err?.message ? String(err.message) : "Cron jobs could not be loaded",
            } satisfies CronProfileGroup;
          }
        }),
      );
      const grouped = groupCronJobsByProfile(profileList, groups);
      grouped.sort((a: CronProfileGroup, b: CronProfileGroup) => {
        if (a.profile.isActive !== b.profile.isActive) return a.profile.isActive ? -1 : 1;
        if (a.profile.isDefault !== b.profile.isDefault) return a.profile.isDefault ? -1 : 1;
        return a.profile.name.localeCompare(b.profile.name);
      });
      setCronGroups(grouped);
    } catch (err: any) {
      setCronGroups([]);
      setCronError(err?.message ? String(err.message) : "Cron jobs could not be loaded");
    } finally {
      setCronLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section !== "cronJobs") return;
    void loadCronJobs();
  }, [section, loadCronJobs]);

  // Persist to the backend. Blank apiKey is omitted so a saved key is never
  // clobbered (the main process treats "" as "unchanged" too).
  const persist = useCallback((next: { mode?: ConnMode; remoteUrl?: string; apiKey?: string; ssh?: SshState }) => {
    const m = next.mode ?? mode;
    const s = next.ssh ?? ssh;
    const key = next.apiKey ?? apiKey;
    window.hermes.setConnectionConfig({
      mode: m,
      remoteUrl: next.remoteUrl ?? remoteUrl,
      ...(key ? { apiKey: key } : {}),
      ssh: {
        host: s.host,
        port: Number(s.port) || 22,
        username: s.username,
        keyPath: s.keyPath,
        remotePort: Number(s.remotePort) || 8642,
        localPort: Number(s.localPort) || 18642,
      },
    });
  }, [mode, remoteUrl, apiKey, ssh]);

  const changeMode = (m: ConnMode) => { setMode(m); persist({ mode: m }); };
  const updateSsh = (patch: Partial<SshState>) => {
    setSsh(prev => { const s = { ...prev, ...patch }; persist({ ssh: s }); return s; });
  };

  const runTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await window.hermes.testConnection();
      setTestResult(r as TestResult);
    } catch (err: any) {
      setTestResult({ ok: false, mode, latencyMs: 0, error: err?.message ? String(err.message) : "Test failed" });
    } finally {
      setTesting(false);
    }
  }, [mode]);

  const copy = (t: string) => {
    navigator.clipboard.writeText(t).catch(() => {});
    setCopied(t);
    setTimeout(() => setCopied(null), 1500);
  };

  const cronStats = useMemo(() => {
    const jobs = cronGroups.flatMap(group => group.jobs);
    const activeCount = jobs.filter(job => cronState(job) === "active").length;
    const pausedCount = jobs.filter(job => cronState(job) === "paused").length;
    return {
      profiles: cronGroups.length,
      total: jobs.length,
      active: activeCount,
      paused: pausedCount,
    };
  }, [cronGroups]);

  const openCronEditor = (profileName: string, job: CronJob) => {
    const operationProfile = getCronJobOperationProfile(profileName, job);
    setCronError(null);
    setCronEditTarget({ profileName: operationProfile, job });
    setCronForm({
      name: job.name,
      schedule: job.schedule,
      prompt: job.prompt,
      deliver: job.deliver[0] || "local",
    });
  };

  const closeCronEditor = () => {
    if (cronSaving) return;
    setCronEditTarget(null);
    setCronError(null);
  };

  const toggleCronJob = async (profileName: string, job: CronJob) => {
    const state = cronState(job);
    if (state === "completed") return;
    const operationProfile = getCronJobOperationProfile(profileName, job);
    const key = `${operationProfile}:${job.id}:toggle`;
    setCronBusyKey(key);
    setCronError(null);
    try {
      const result = state === "active"
        ? await window.hermes.pauseCronJob(job.id, operationProfile)
        : await window.hermes.resumeCronJob(job.id, operationProfile);
      if (!result.success) {
        setCronError(result.error || "Cron job could not be updated");
        return;
      }
      await loadCronJobs();
    } catch (err: any) {
      setCronError(err?.message ? String(err.message) : "Cron job could not be updated");
    } finally {
      setCronBusyKey(null);
    }
  };

  const openCronDelete = (profileName: string, job: CronJob) => {
    setCronError(null);
    setCronDeleteTarget({
      profileName: getCronJobOperationProfile(profileName, job),
      job,
    });
  };

  const closeCronDelete = () => {
    if (cronBusyKey?.endsWith(":delete")) return;
    setCronDeleteTarget(null);
    setCronError(null);
  };

  const deleteCronJob = async () => {
    if (!cronDeleteTarget) return;
    const key = `${cronDeleteTarget.profileName}:${cronDeleteTarget.job.id}:delete`;
    setCronBusyKey(key);
    setCronError(null);
    try {
      const result = await window.hermes.removeCronJob(
        cronDeleteTarget.job.id,
        cronDeleteTarget.profileName,
      );
      if (!result.success) {
        setCronError(result.error || "Cron job could not be deleted");
        return;
      }
      setCronDeleteTarget(null);
      await loadCronJobs();
    } catch (err: any) {
      setCronError(err?.message ? String(err.message) : "Cron job could not be deleted");
    } finally {
      setCronBusyKey(null);
    }
  };

  const saveCronJob = async () => {
    if (!cronEditTarget) return;
    const schedule = cronForm.schedule.trim();
    if (!schedule) {
      setCronError("Schedule is required");
      return;
    }
    const payload: CronJobUpdateInput = {
      name: cronForm.name.trim(),
      schedule,
      prompt: cronForm.prompt,
      deliver: cronForm.deliver || "local",
    };
    setCronSaving(true);
    setCronError(null);
    try {
      const result = await window.hermes.updateCronJob(
        cronEditTarget.job.id,
        payload,
        cronEditTarget.profileName,
      );
      if (!result.success) {
        setCronError(result.error || "Cron job could not be saved");
        return;
      }
      setCronEditTarget(null);
      await loadCronJobs();
    } catch (err: any) {
      setCronError(err?.message ? String(err.message) : "Cron job could not be saved");
    } finally {
      setCronSaving(false);
    }
  };

  const visibleSections = standaloneSection ? [CRON_SECTION] : SETTINGS_SECTIONS;
  const active = SECTIONS.find(s => s.id === section) || visibleSections[0];
  const ActiveIcon = active.icon;

  return (
    <Screen
      className="ui-settings-console"
      icon={<ActiveIcon size={19} />}
      kicker={standaloneSection ? "Operations" : "Preferences"}
      title={standaloneSection ? active.label : "Settings"}
      sub={standaloneSection ? active.desc : "Connection, providers, appearance and diagnostics"}
    >
      <div className="ui-settings-shell">
        <div className="ui-settings-topline mint-in mint-in-1">
          <div className="ui-settings-topline-main">
            <Settings size={16} />
            <span>{active.label}</span>
            <small>{active.desc}</small>
          </div>
          <div className="ui-settings-topline-meta">
            <span>Mode <strong>{mode.toUpperCase()}</strong></span>
            <span>API Key <strong>{hasApiKey ? "Set" : "Empty"}</strong></span>
            <span>Section <strong>{visibleSections.findIndex(s => s.id === section) + 1}/{visibleSections.length}</strong></span>
          </div>
        </div>

        <div className={cx("ui-settings-layout", standaloneSection && "ui-settings-layout-standalone")}>
        {/* ── Section rail (struck-gold active pill) ── */}
        {!standaloneSection && (
          <nav className="ui-settings-rail">
            {visibleSections.map(s => (
              <button key={s.id} type="button" className="ui-nav no-drag" data-active={s.id === section} onClick={() => setSection(s.id)}>
                <s.icon size={16} className="shrink-0" strokeWidth={s.id === section ? 2.2 : 1.9} />
                <span className="truncate">{s.label}</span>
                <small>{s.desc}</small>
              </button>
            ))}
          </nav>
        )}

        {/* ── Active panel (re-minted on section change) ── */}
        <div
          key={section}
          className={cx(
            "ui-settings-panel mint-in",
            standaloneSection && "ui-settings-panel-standalone",
            section === "cronJobs" && "ui-settings-panel-cron",
          )}
        >
          {section === "general" && (
            <Card className="ui-settings-card">
              <div className="ui-settings-row ui-settings-row-bordered">
                <div className="ui-settings-row-copy">
                    <div>Connection Mode</div>
                    <p>
                      {mode === "local" ? `Run Hermes on 127.0.0.1:${localPort}` : mode === "ssh" ? "Tunnel to a remote Hermes server over SSH" : "Connect to a remote Hermes server"}
                    </p>
                </div>
                <div className="ui-settings-row-control">
                  <Segment>
                    <SegmentItem active={mode === "local"} onClick={() => changeMode("local")}>Local</SegmentItem>
                    <SegmentItem active={mode === "remote"} onClick={() => changeMode("remote")}>Remote</SegmentItem>
                    <SegmentItem active={mode === "ssh"} onClick={() => changeMode("ssh")}>SSH</SegmentItem>
                  </Segment>
                </div>
              </div>
              <Row
                title="Automatic updates"
                desc="Download and install new versions on launch"
                control={<Toggle on={autoUpdate} onChange={setAutoUpdate} />}
                last
              />
            </Card>
          )}

          {section === "network" && (
            <>
              <Card pad className="ui-settings-card">
                <div className="ui-settings-field-grid">
                  <Field label="Local Port">
                    <Input value={localPort} onChange={e => setLocalPort(e.target.value)} className="font-mono" />
                  </Field>
                  <Field label="Remote URL" hint="Used when running in remote mode">
                    <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} onBlur={() => persist({ remoteUrl })} placeholder="https://hermes.example.com" />
                  </Field>
                  <Field label="API Key" hint={hasApiKey ? <span className="flex items-center gap-1.5"><Badge variant="success">Key set</Badge> Leave blank to keep the saved key</span> : "Required for remote mode authentication"}>
                    <Input value={apiKey} onChange={e => setApiKey(e.target.value)} onBlur={() => { if (apiKey) { persist({ apiKey }); setHasApiKey(true); } }} type="password" placeholder={hasApiKey ? "••••••••" : "Enter API key"} />
                  </Field>

                  {mode === "ssh" && (
                    <div className="ui-settings-ssh-grid">
                      <Field label="Host">
                        <Input value={ssh.host} onChange={e => setSsh(p => ({ ...p, host: e.target.value }))} onBlur={() => updateSsh({})} placeholder="server.example.com" />
                      </Field>
                      <Field label="Port">
                        <Input value={ssh.port} onChange={e => setSsh(p => ({ ...p, port: e.target.value }))} onBlur={() => updateSsh({})} className="font-mono" placeholder="22" />
                      </Field>
                      <Field label="Username">
                        <Input value={ssh.username} onChange={e => setSsh(p => ({ ...p, username: e.target.value }))} onBlur={() => updateSsh({})} placeholder="ubuntu" />
                      </Field>
                      <Field label="Key Path">
                        <Input value={ssh.keyPath} onChange={e => setSsh(p => ({ ...p, keyPath: e.target.value }))} onBlur={() => updateSsh({})} className="font-mono" placeholder="~/.ssh/id_rsa" />
                      </Field>
                      <Field label="Remote Port" hint="Hermes port on the remote host">
                        <Input value={ssh.remotePort} onChange={e => setSsh(p => ({ ...p, remotePort: e.target.value }))} onBlur={() => updateSsh({})} className="font-mono" placeholder="8642" />
                      </Field>
                      <Field label="Local Port" hint="Local forwarded port for the tunnel">
                        <Input value={ssh.localPort} onChange={e => setSsh(p => ({ ...p, localPort: e.target.value }))} onBlur={() => updateSsh({})} className="font-mono" placeholder="18642" />
                      </Field>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="ui-settings-card">
                <Row
                  title="Test Connection"
                  desc="Verify the current connection settings reach Hermes"
                  control={
                    <div className="flex items-center gap-2.5">
                      {testResult && (
                        <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)]">
                          <StatusDot color={testResult.ok ? "var(--success)" : "var(--error)"} />
                          {testResult.ok ? `${testResult.mode} · ${testResult.latencyMs}ms` : (testResult.error || "Unreachable")}
                        </span>
                      )}
                      <Button variant="primary" size="sm" onClick={runTest} disabled={testing}>{testing ? "Testing…" : "Test connection"}</Button>
                    </div>
                  }
                  last
                />
              </Card>
            </>
          )}

          {section === "providers" && (
            <>
              <div className="ui-settings-note">
                Keys live in <code className="ui-kbd">~/.hermes/.env</code> — never committed.
              </div>
              <Card className="ui-settings-card">
                {PROVIDER_KEYS.map(([name, env], i) => (
                  <div
                    key={name}
                    className={cx("ui-settings-provider-row", i < PROVIDER_KEYS.length - 1 && "ui-settings-row-bordered")}
                  >
                    <span className="ui-settings-provider-icon">
                      <Shield size={16} />
                    </span>
                    <div className="ui-settings-provider-copy">
                      <div>{name}</div>
                      <span>{env}</span>
                    </div>
                    <code>~/.hermes/.env</code>
                    <Badge variant="neutral">Env var</Badge>
                    <IconButton onClick={() => copy(env)} title="Copy env var" className={cx(copied === env && "text-[var(--success)]")}>
                      {copied === env ? <Check size={14} /> : <Copy size={14} />}
                    </IconButton>
                  </div>
                ))}
              </Card>
            </>
          )}

          {section === "cronJobs" && (
            <>
              <Card className="ui-settings-cron-summary">
                <div className="ui-settings-cron-summary-main">
                  <span className="ui-settings-cron-summary-icon">
                    <CalendarClock size={18} />
                  </span>
                  <div>
                    <span>Cron Job Registry</span>
                    <strong>{cronStats.total} scheduled jobs</strong>
                    <p>Grouped by Hermes profile so each workspace keeps its own automation queue.</p>
                  </div>
                </div>
                <div className="ui-settings-cron-summary-stats">
                  <div>
                    <span>Profiles</span>
                    <strong>{cronStats.profiles}</strong>
                  </div>
                  <div>
                    <span>Active</span>
                    <strong>{cronStats.active}</strong>
                  </div>
                  <div>
                    <span>Paused</span>
                    <strong>{cronStats.paused}</strong>
                  </div>
                </div>
              </Card>

              <div className="ui-settings-cron-toolbar">
                <div>
                  <CalendarClock size={15} />
                  <span>Profile cron lists</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw size={14} className={cx(cronLoading && "animate-spin")} />}
                  onClick={loadCronJobs}
                  disabled={cronLoading}
                >
                  Refresh
                </Button>
              </div>

              {cronError && (
                <div className="ui-settings-cron-alert" role="alert">
                  <AlertCircle size={15} />
                  <span>{cronError}</span>
                </div>
              )}

              <div className="ui-settings-cron-groups">
                {cronLoading && cronGroups.length === 0 ? (
                  <Card className="ui-settings-cron-empty">
                    <Clock size={18} />
                    <span>Loading cron jobs…</span>
                  </Card>
                ) : cronGroups.length === 0 ? (
                  <Card className="ui-settings-cron-empty">
                    <Clock size={18} />
                    <span>No profiles found.</span>
                  </Card>
                ) : (
                  cronGroups.map(group => {
                    const activeJobs = group.jobs.filter(job => cronState(job) === "active").length;
                    return (
                      <section key={group.profile.name} className="ui-settings-cron-profile">
                        <div className="ui-settings-cron-profile-head">
                          <div className="ui-settings-cron-profile-title">
                            <strong title={group.profile.name}>{group.profile.name}</strong>
                            <div>
                              {group.profile.isActive && <Badge variant="success">Active profile</Badge>}
                              {group.profile.isDefault && <Badge variant="neutral">Default</Badge>}
                              <Badge variant="accent">{group.jobs.length} jobs</Badge>
                            </div>
                          </div>
                          <span>{activeJobs} active</span>
                        </div>

                        {group.error ? (
                          <div className="ui-settings-cron-profile-error">
                            <AlertCircle size={15} />
                            {group.error}
                          </div>
                        ) : group.jobs.length === 0 ? (
                          <div className="ui-settings-cron-profile-empty">
                            No cron jobs for this profile.
                          </div>
                        ) : (
                          <div className="ui-settings-cron-list">
                            {group.jobs.map(job => {
                              const state = cronState(job);
                              const operationProfile = getCronJobOperationProfile(group.profile.name, job);
                              const busy = cronBusyKey === `${operationProfile}:${job.id}:toggle`;
                              const deleting = cronBusyKey === `${operationProfile}:${job.id}:delete`;
                              return (
                                <article key={job.id} className="ui-settings-cron-job" data-state={state}>
                                  <div className="ui-settings-cron-job-state">
                                    <StatusDot
                                      color={state === "active" ? "var(--success)" : state === "completed" ? "var(--accent)" : "var(--text-3)"}
                                      pulse={state === "active"}
                                    />
                                    <span>{state}</span>
                                  </div>
                                  <div className="ui-settings-cron-job-copy">
                                    <div className="ui-settings-cron-job-title">
                                      <h3 title={job.name}>{job.name}</h3>
                                      <code title={job.schedule}>{job.schedule}</code>
                                    </div>
                                    <p title={job.prompt || "No prompt configured"}>
                                      {job.prompt || "No prompt configured"}
                                    </p>
                                  </div>
                                  <div className="ui-settings-cron-job-meta">
                                    <span title={humanizeCron(job.schedule)}>
                                      <Clock size={12} />
                                      {humanizeCron(job.schedule)}
                                    </span>
                                    <span title={job.deliver.join(", ") || "local"}>
                                      <Send size={12} />
                                      {job.deliver.join(", ") || "local"}
                                    </span>
                                    <span>Next {humanizeTimestamp(job.next_run_at)}</span>
                                  </div>
                                  <div className="ui-settings-cron-job-actions">
                                    <IconButton onClick={() => openCronEditor(group.profile.name, job)} title="Edit cron job">
                                      <Pencil size={15} />
                                    </IconButton>
                                    <IconButton
                                      disabled={busy || state === "completed"}
                                      onClick={() => toggleCronJob(group.profile.name, job)}
                                      title={state === "active" ? "Pause cron job" : "Resume cron job"}
                                    >
                                      {state === "active" ? <Pause size={15} /> : <Play size={15} />}
                                    </IconButton>
                                    <IconButton
                                      danger
                                      disabled={deleting}
                                      onClick={() => openCronDelete(group.profile.name, job)}
                                      title="Delete cron job"
                                    >
                                      <Trash2 size={15} />
                                    </IconButton>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            </>
          )}

          {section === "appearance" && (
            <div className="ui-settings-appearance-stack">
            <Card className="ui-settings-card">
              <Row
                title="Theme"
                desc="Match the system or pick a fixed appearance"
                control={
                  <Segment>
                    {THEMES.map(([id, label, Icon]) => (
                      <SegmentItem key={id} active={theme === id} onClick={() => setTheme(id as ThemePreference)}>
                        <Icon size={14} />
                        {label}
                      </SegmentItem>
                    ))}
                  </Segment>
                }
              />
              <Row
                title="Accent Color"
                desc="Used across buttons, highlights, focus rings and status surfaces"
                control={
                  <div className="ui-settings-swatches">
                    {ACCENT_OPTIONS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAccent(c)}
                        title={c}
                        aria-pressed={accent === c}
                        className="ui-settings-swatch"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <label className="ui-settings-color-picker" title="Custom accent color">
                      <span>{accent}</span>
                      <input
                        type="color"
                        value={accent}
                        onChange={(event) => setAccent(event.currentTarget.value.toUpperCase())}
                      />
                    </label>
                  </div>
                }
                last
              />
            </Card>
            <Card className="ui-settings-appearance-preview">
              <div>
                <span className="ui-eyebrow">Live Preview</span>
                <strong>Hermes visual system</strong>
                <p>Theme and accent are applied immediately and restored when the app opens.</p>
              </div>
              <div className="ui-settings-preview-actions">
                <Button variant="primary" size="sm">Primary</Button>
                <Button variant="secondary" size="sm">Secondary</Button>
                <Badge variant="accent">Accent</Badge>
                <Toggle on={true} onChange={() => {}} />
              </div>
            </Card>
            </div>
          )}

          {section === "backup" && (
            <Card className="ui-settings-card">
              <Row
                title="Create Backup"
                desc="Export config, sessions, skills and memory"
                control={<Button variant="primary" size="sm" leftIcon={<Download size={14} />}>Export</Button>}
              />
              <Row
                title="Restore Backup"
                desc="Import from a .zip archive"
                control={<Button variant="secondary" size="sm" leftIcon={<Upload size={14} />}>Import</Button>}
              />
              <Row
                title="Debug Dump"
                desc="Bundle logs and diagnostics for troubleshooting"
                control={<Button variant="danger" size="sm" leftIcon={<Database size={14} />}>Export Dump</Button>}
                last
              />
            </Card>
          )}

          {section === "diagnostics" && (
            <>
              <div className="ui-settings-diagnostics-tabs">
                <Segment>
                  {LOG_TABS.map(t => (
                    <SegmentItem key={t.id} active={logTab === t.id} onClick={() => setLogTab(t.id)}>{t.label}</SegmentItem>
                  ))}
                </Segment>
              </div>
              <Card className="ui-settings-log-card">
                <div className="ui-settings-log-head">
                  <TerminalIcon size={14} className="text-[var(--accent-text)]" />
                  <span>{logPath || `~/.hermes/logs/${LOG_FILE_FOR_TAB[logTab]}`}</span>
                  <small>{logLoading ? "Loading…" : "Last 50 lines"}</small>
                </div>
                <div className="ui-settings-log-body">
                  {logLoading ? (
                    <div className="text-[var(--text-3)]">Reading log…</div>
                  ) : logLines.length === 0 ? (
                    <div className="text-[var(--text-3)]">No log entries yet.</div>
                  ) : (
                    logLines.map((line, i) => {
                      const isError = line.includes("ERROR");
                      const isWarn = line.includes("WARN");
                      return (
                        <div
                          key={i}
                          className={cx(isError ? "text-[var(--error)]" : isWarn ? "text-[var(--warning)]" : "text-[var(--text-2)]")}
                        >
                          {line}
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
        </div>
      </div>
      <Modal
        open={!!cronEditTarget}
        onClose={closeCronEditor}
        title="Edit Cron Job"
        kicker={cronEditTarget ? `Profile · ${cronEditTarget.profileName}` : "Cron Job"}
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={closeCronEditor} disabled={cronSaving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveCronJob} disabled={cronSaving || !cronForm.schedule.trim()}>
              {cronSaving ? "Saving…" : "Save Cron"}
            </Button>
          </>
        }
      >
        <div className="ui-modal-form ui-settings-cron-modal">
          {cronError && (
            <div className="ui-modal-alert" role="alert">
              {cronError}
            </div>
          )}

          <div className="ui-settings-cron-modal-preview">
            <span>
              <Clock size={17} />
            </span>
            <div>
              <strong>{humanizeCron(cronForm.schedule || "—")}</strong>
              <code>{cronForm.schedule || "—"}</code>
            </div>
          </div>

          <div className="ui-settings-cron-modal-grid">
            <Field label="Job Name">
              <Input
                value={cronForm.name}
                onChange={event => setCronForm(prev => ({ ...prev, name: event.target.value }))}
                placeholder="Morning briefing"
              />
            </Field>
            <Field label="Delivery Target">
              <Select
                value={cronForm.deliver}
                onChange={event => setCronForm(prev => ({ ...prev, deliver: event.target.value }))}
              >
                {CRON_DELIVERY_TARGETS.map(target => (
                  <option key={target} value={target}>
                    {target}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Cron Expression" hint="Standard 5-field cron expression: minute hour day month weekday">
            <Input
              value={cronForm.schedule}
              onChange={event => setCronForm(prev => ({ ...prev, schedule: event.target.value }))}
              placeholder="0 8 * * *"
              className="font-mono"
            />
          </Field>

          <Field label="Prompt">
            <Textarea
              value={cronForm.prompt}
              onChange={event => setCronForm(prev => ({ ...prev, prompt: event.target.value }))}
              placeholder="Tell Hermes what this cron job should do."
              rows={5}
            />
          </Field>
        </div>
      </Modal>
      <Modal
        open={!!cronDeleteTarget}
        onClose={closeCronDelete}
        title="Delete Cron Job"
        kicker={cronDeleteTarget ? `Profile · ${cronDeleteTarget.profileName}` : "Cron Job"}
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={closeCronDelete} disabled={cronBusyKey?.endsWith(":delete")}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteCronJob} disabled={cronBusyKey?.endsWith(":delete")}>
              {cronBusyKey?.endsWith(":delete") ? "Deleting…" : "Delete Cron"}
            </Button>
          </>
        }
      >
        <div className="ui-confirm-panel ui-confirm-danger ui-settings-cron-delete">
          <span className="ui-confirm-icon">
            <Trash2 size={18} />
          </span>
          <div>
            <strong>{cronDeleteTarget?.job.name || "Cron job"}</strong>
            <p>
              This removes the scheduled automation from the selected Hermes profile.
              The action cannot be undone.
            </p>
            <code>{cronDeleteTarget?.job.schedule || "—"}</code>
          </div>
        </div>
        {cronError && (
          <div className="ui-modal-alert" role="alert">
            {cronError}
          </div>
        )}
      </Modal>
    </Screen>
  );
}
