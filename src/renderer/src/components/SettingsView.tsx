import { useState } from "react";
import { Settings, Shield, Download, Upload, Moon, Sun, Laptop, Database, Terminal as TerminalIcon, Copy, Check } from "lucide-react";
import {
  Screen, Card, Button, Input, Badge, SectionLabel, Toggle, Segment, SegmentItem, IconButton, Field, cx,
} from "../ui";

type ConnMode = "local" | "remote";
type LogTab = "gateway" | "agent" | "error";

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

export default function SettingsView() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [accent, setAccent] = useState("#E7B84E");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [mode, setMode] = useState<ConnMode>("local");
  const [localPort, setLocalPort] = useState("8642");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [logTab, setLogTab] = useState<LogTab>("gateway");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (t: string) => {
    navigator.clipboard.writeText(t).catch(() => {});
    setCopied(t);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Screen icon={<Settings size={19} />} title="Settings" sub="Connection, providers, appearance and diagnostics">
      <div className="flex flex-col gap-9 stagger" style={{ maxWidth: 760 }}>
        {/* ── General ── */}
        <section className="flex flex-col gap-3">
          <SectionLabel>General</SectionLabel>
          <Card>
            <div className="px-[18px] py-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[var(--text)]">Connection Mode</div>
                  <div className="text-[12.5px] text-[var(--text-2)] mt-0.5">
                    {mode === "local" ? `Run Hermes on 127.0.0.1:${localPort}` : "Connect to a remote Hermes server"}
                  </div>
                </div>
                <Segment>
                  <SegmentItem active={mode === "local"} onClick={() => setMode("local")}>Local</SegmentItem>
                  <SegmentItem active={mode === "remote"} onClick={() => setMode("remote")}>Remote</SegmentItem>
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
        </section>

        {/* ── Network ── */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Network</SectionLabel>
          <Card pad>
            <div className="flex flex-col gap-4">
              <Field label="Local Port">
                <Input value={localPort} onChange={e => setLocalPort(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Remote URL" hint="Used when running in remote mode">
                <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://hermes.example.com" />
              </Field>
              <Field label="API Key" hint="Required for remote mode authentication">
                <Input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="••••••••" />
              </Field>
            </div>
          </Card>
        </section>

        {/* ── Providers ── */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Provider Credentials</SectionLabel>
          <div className="text-[12.5px] text-[var(--text-2)]">
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
        </section>

        {/* ── Appearance ── */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Appearance</SectionLabel>
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
        </section>

        {/* ── Backup ── */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Backup &amp; Restore</SectionLabel>
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
        </section>

        {/* ── Logs ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <SectionLabel>Logs</SectionLabel>
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
                    className={cx(
                      isError ? "text-[var(--error)]" : isWarn ? "text-[var(--warning)]" : "text-[var(--text-2)]",
                    )}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      </div>
    </Screen>
  );
}
