import { useState, useEffect, useCallback } from "react";
import {
  Settings, Shield, Download, Upload, Moon, Sun, Laptop, Database, Terminal as TerminalIcon,
  Copy, Check, SlidersHorizontal, Globe, KeyRound, Palette,
} from "lucide-react";
import {
  Screen, Card, Button, Input, Badge, Toggle, Segment, SegmentItem, IconButton, Field, Eyebrow, StatusDot, cx,
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

const MOCK_LOGS = [
  "[2026-06-03 14:32:01] INFO  Gateway started on port 8642",
  "[2026-06-03 14:32:02] INFO  Platform 'telegram' connected",
  "[2026-06-03 14:32:05] INFO  SSE stream established for session abc123",
  "[2026-06-03 14:32:10] DEBUG Tool 'web_search' completed in 1.2s",
  "[2026-06-03 14:32:15] INFO  Session abc123 saved to state.db",
  "[2026-06-03 14:32:20] WARN  Rate limit approaching for provider 'deepseek'",
  "[2026-06-03 14:32:25] ERROR Failed to connect to MCP server 'filesystem': connection refused",
  "[2026-06-03 14:32:30] INFO  Cron job 'daily-summary' completed successfully",
];

const PROVIDER_KEYS: [string, string, string][] = [
  ["OpenRouter", "OPENROUTER_API_KEY", "●●●●●●●●●●●●●●ab12"],
  ["Anthropic", "ANTHROPIC_API_KEY", "●●●●●●●●●●●●●●cd34"],
  ["OpenCode Zen", "OPENCODE_ZEN_API_KEY", "●●●●●●●●●●●●●●ef56"],
  ["OpenCode Go", "OPENCODE_GO_API_KEY", "●●●●●●●●●●●●●●gh78"],
  ["DeepSeek", "DEEPSEEK_API_KEY", "●●●●●●●●●●●●●●ij90"],
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
    <div className={cx("flex items-center justify-between gap-4 px-[18px] py-4", !last && "border-b border-[var(--border)]")}>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-[var(--text)]">{title}</div>
        {desc && <div className="text-[12.5px] text-[var(--text-2)] mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/* Panel header — the struck editorial heading for the active section. */
function PanelHead({ kicker, title, desc }: { kicker: string; title: string; desc: string }) {
  return (
    <div className="mb-1">
      <Eyebrow>{kicker}</Eyebrow>
      <h2 className="serif text-[24px] leading-tight text-[var(--text)]">{title}</h2>
      <p className="text-[13px] text-[var(--text-2)] mt-1.5">{desc}</p>
      <hr className="ui-divider-gold mt-4" />
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
    <Screen icon={<Settings size={19} />} kicker="Preferences" title="Settings" sub="Connection, providers, appearance and diagnostics">
      <div className="flex gap-8 items-start">
        {/* ── Section rail (struck-gold active pill) ── */}
        <nav className="ui-settings-rail shrink-0 w-[210px] sticky top-1 flex flex-col gap-0.5">
          {SECTIONS.map(s => (
            <button key={s.id} type="button" className="ui-nav no-drag" data-active={s.id === section} onClick={() => setSection(s.id)}>
              <s.icon size={16} className="shrink-0" strokeWidth={s.id === section ? 2.2 : 1.9} />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Active panel (re-minted on section change) ── */}
        <div key={section} className="flex-1 min-w-0 max-w-[680px] flex flex-col gap-5 mint-in">
          <PanelHead kicker="Settings" title={active.label} desc={active.desc} />

          {section === "general" && (
            <Card>
              <div className="px-[18px] py-4 border-b border-[var(--border)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[var(--text)]">Connection Mode</div>
                    <div className="text-[12.5px] text-[var(--text-2)] mt-0.5">
                      {mode === "local" ? `Run Hermes on 127.0.0.1:${localPort}` : mode === "ssh" ? "Tunnel to a remote Hermes server over SSH" : "Connect to a remote Hermes server"}
                    </div>
                  </div>
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
              <Card pad>
                <div className="flex flex-col gap-4">
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
                    <div className="flex flex-col gap-4 pt-1 mt-1 border-t border-[var(--border)]">
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

              <Card>
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
              <div className="text-[12.5px] text-[var(--text-2)] -mt-1">
                Keys live in <code className="ui-kbd">~/.hermes/.env</code> — never committed.
              </div>
              <Card>
                {PROVIDER_KEYS.map(([name, env, masked], i) => (
                  <div
                    key={name}
                    className={cx("flex items-center gap-3 px-[18px] py-3.5", i < PROVIDER_KEYS.length - 1 && "border-b border-[var(--border)]")}
                  >
                    <span className="flex items-center justify-center shrink-0 w-9 h-9 rounded-[10px] bg-[var(--accent-weak)] text-[var(--accent-text)] border border-[var(--accent-line)]">
                      <Shield size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[var(--text)] truncate">{name}</div>
                      <div className="text-[11.5px] font-mono text-[var(--text-3)] truncate">{env}</div>
                    </div>
                    <code className="text-[12px] font-mono text-[var(--text-2)] truncate hidden sm:block max-w-[160px]">{masked}</code>
                    <Badge variant="success">Set</Badge>
                    <IconButton onClick={() => copy(env)} title="Copy env var" className={cx(copied === env && "text-[var(--success)]")}>
                      {copied === env ? <Check size={14} /> : <Copy size={14} />}
                    </IconButton>
                  </div>
                ))}
              </Card>
            </>
          )}

          {section === "appearance" && (
            <Card>
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
                  <div className="flex gap-2">
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
            <Card>
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
              <div className="flex items-center justify-end -mt-1">
                <Segment>
                  {LOG_TABS.map(t => (
                    <SegmentItem key={t.id} active={logTab === t.id} onClick={() => setLogTab(t.id)}>{t.label}</SegmentItem>
                  ))}
                </Segment>
              </div>
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 h-11 border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <TerminalIcon size={14} className="text-[var(--accent-text)]" />
                  <span className="text-[12px] font-mono text-[var(--text-2)]">~/.hermes/logs/{logTab}.log</span>
                  <span className="text-[11.5px] text-[var(--text-3)] ml-auto">Last 50 lines</span>
                </div>
                <div className="p-4 text-[12.5px] leading-relaxed font-mono overflow-x-auto bg-[var(--bg)]">
                  {MOCK_LOGS.map((line, i) => {
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
                  })}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
