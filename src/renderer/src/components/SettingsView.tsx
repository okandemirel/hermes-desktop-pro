import { useState, useEffect, useCallback } from "react";
import {
  Settings, Shield, Download, Upload, Moon, Sun, Laptop, Database, Terminal as TerminalIcon,
  Copy, Check, SlidersHorizontal, Globe, KeyRound, Palette,
} from "lucide-react";
import {
  Screen, Card, Button, Input, Badge, Toggle, Segment, SegmentItem, IconButton, Field, StatusDot, cx,
} from "../ui";

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
type SectionId = "general" | "network" | "providers" | "appearance" | "backup" | "diagnostics";

const SECTIONS: { id: SectionId; label: string; icon: typeof Settings; desc: string }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, desc: "Connection mode and automatic updates" },
  { id: "network", label: "Network", icon: Globe, desc: "Local port, remote endpoint and authentication" },
  { id: "providers", label: "Providers", icon: KeyRound, desc: "Model provider API credentials" },
  { id: "appearance", label: "Appearance", icon: Palette, desc: "Theme and accent colour" },
  { id: "backup", label: "Backup", icon: Database, desc: "Export, restore and diagnostics bundle" },
  { id: "diagnostics", label: "Diagnostics", icon: TerminalIcon, desc: "Live gateway, agent and error logs" },
];

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

const ACCENTS = ["#E7B84E", "#FF453A", "#30D158", "#0A84FF", "#BF5AF2", "#FF9F0A"];

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

export default function SettingsView() {
  const [section, setSection] = useState<SectionId>("general");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [accent, setAccent] = useState("#E7B84E");
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

  const active = SECTIONS.find(s => s.id === section)!;

  return (
    <Screen
      className="ui-settings-console"
      icon={<Settings size={19} />}
      kicker="Preferences"
      title="Settings"
      sub="Connection, providers, appearance and diagnostics"
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
            <span>Section <strong>{SECTIONS.findIndex(s => s.id === section) + 1}/{SECTIONS.length}</strong></span>
          </div>
        </div>

        <div className="ui-settings-layout">
        {/* ── Section rail (struck-gold active pill) ── */}
        <nav className="ui-settings-rail">
          {SECTIONS.map(s => (
            <button key={s.id} type="button" className="ui-nav no-drag" data-active={s.id === section} onClick={() => setSection(s.id)}>
              <s.icon size={16} className="shrink-0" strokeWidth={s.id === section ? 2.2 : 1.9} />
              <span className="truncate">{s.label}</span>
              <small>{s.desc}</small>
            </button>
          ))}
        </nav>

        {/* ── Active panel (re-minted on section change) ── */}
        <div key={section} className="ui-settings-panel mint-in">
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

          {section === "appearance" && (
            <Card className="ui-settings-card">
              <Row
                title="Theme"
                desc="Match the system or pick a fixed appearance"
                control={
                  <Segment>
                    {THEMES.map(([id, label, Icon]) => (
                      <SegmentItem key={id} active={theme === id} onClick={() => setTheme(id)}>
                        <Icon size={14} />
                        {label}
                      </SegmentItem>
                    ))}
                  </Segment>
                }
              />
              <Row
                title="Accent Color"
                desc="Used across buttons, highlights and status"
                control={
                  <div className="ui-settings-swatches">
                    {ACCENTS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAccent(c)}
                        title={c}
                        className={cx(
                          "w-7 h-7 rounded-[8px] border-2 transition-all",
                          accent === c ? "border-[var(--text)]" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                }
                last
              />
            </Card>
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
    </Screen>
  );
}
