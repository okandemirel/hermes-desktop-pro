import { useState } from "react";
import { Settings, Wrench, Shield, HardDrive, Download, Upload, FileText, Monitor, Palette, Moon, Sun, Laptop, Database, Terminal as TerminalIcon, Globe } from "lucide-react";

type SettingsTab = "general" | "providers" | "network" | "backup" | "logs" | "theme";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "providers", label: "Providers", icon: Wrench },
  { id: "network", label: "Network", icon: Globe },
  { id: "backup", label: "Backup", icon: HardDrive },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "theme", label: "Theme", icon: Palette },
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

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [localPort, setLocalPort] = useState("8642");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon || Settings;

  return (
    <div className="flex h-full bg-[#0D0D0D]">
      {/* Side tabs */}
      <div className="w-52 shrink-0 border-r border-white/5 p-3 space-y-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeTab === t.id ? "bg-[#0A84FF]/10 text-[#0A84FF]" : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
          <ActiveIcon size={20} className="text-[#0A84FF]" />
          <h1 className="text-lg font-semibold text-white">{TABS.find(t => t.id === activeTab)?.label}</h1>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === "general" && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white/80">Connection Mode</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-start gap-3 p-4 rounded-xl bg-[#1A1A1A] border border-[#0A84FF]/30 cursor-pointer">
                    <input type="radio" name="mode" defaultChecked className="mt-0.5 accent-[#0A84FF]" />
                    <div>
                      <div className="text-sm font-medium text-white">Local Mode</div>
                      <div className="text-xs text-white/40 mt-1">Run Hermes on 127.0.0.1:{localPort}</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-4 rounded-xl bg-[#1A1A1A] border border-white/5 cursor-pointer hover:border-white/10">
                    <input type="radio" name="mode" className="mt-0.5 accent-[#0A84FF]" />
                    <div>
                      <div className="text-sm font-medium text-white">Remote Mode</div>
                      <div className="text-xs text-white/40 mt-1">Connect to remote Hermes server</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white/80">Auto Update</h3>
                <button
                  onClick={() => setAutoUpdate(!autoUpdate)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${autoUpdate ? "bg-[#0A84FF]" : "bg-white/10"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${autoUpdate ? "left-6" : "left-1"}`} />
                </button>
              </div>
            </>
          )}

          {activeTab === "providers" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white/80">Credential Pools</h3>
              {([
                ["OpenRouter", "OPENROUTER_API_KEY", "●●●●●●●●●●●●●●ab12"],
                ["Anthropic", "ANTHROPIC_API_KEY", "●●●●●●●●●●●●●●cd34"],
                ["OpenCode Zen", "OPENCODE_ZEN_API_KEY", "●●●●●●●●●●●●●●ef56"],
                ["OpenCode Go", "OPENCODE_GO_API_KEY", "●●●●●●●●●●●●●●gh78"],
                ["DeepSeek", "DEEPSEEK_API_KEY", "●●●●●●●●●●●●●●ij90"],
              ] as [string, string, string][]).map(([name, env, masked]) => (
                <div key={name} className="flex items-center gap-4 p-4 rounded-xl bg-[#1A1A1A] border border-white/5">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <Shield size={14} className="text-white/40" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{name}</div>
                    <div className="text-[11px] text-white/25">{env}</div>
                  </div>
                  <div className="text-xs text-white/30 font-mono">{masked}</div>
                  <button className="px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-xs hover:bg-white/10 transition-colors">Edit</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "network" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white/80">Network Configuration</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Local Port</label>
                  <input value={localPort} onChange={e => setLocalPort(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0A84FF]/50" />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Remote URL (optional)</label>
                  <input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://hermes.example.com"
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-[#0A84FF]/50" />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">API Key (remote mode)</label>
                  <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0A84FF]/50" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white/80">Backup & Restore</h3>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex flex-col items-center gap-3 p-6 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-[#0A84FF]/20 transition-colors group">
                  <Download size={24} className="text-white/25 group-hover:text-[#0A84FF] transition-colors" />
                  <div className="text-center">
                    <div className="text-sm font-medium text-white">Create Backup</div>
                    <div className="text-[11px] text-white/30 mt-1">Export config, sessions, skills, memory</div>
                  </div>
                </button>
                <button className="flex flex-col items-center gap-3 p-6 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-[#0A84FF]/20 transition-colors group">
                  <Upload size={24} className="text-white/25 group-hover:text-[#0A84FF] transition-colors" />
                  <div className="text-center">
                    <div className="text-sm font-medium text-white">Restore Backup</div>
                    <div className="text-[11px] text-white/30 mt-1">Import from .zip archive</div>
                  </div>
                </button>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 transition-colors">
                <Database size={14} />
                Export Debug Dump
              </button>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-[#0A84FF]/10 text-[#0A84FF] text-xs font-medium">Gateway Log</button>
                <button className="px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-xs hover:bg-white/10">Agent Log</button>
                <button className="px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-xs hover:bg-white/10">Error Log</button>
              </div>
              <div className="rounded-xl bg-[#0D0D0D] border border-white/5 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border-b border-white/5">
                  <TerminalIcon size={14} className="text-white/30" />
                  <span className="text-xs text-white/30 font-mono">~/.hermes/logs/gateway.log</span>
                  <span className="text-[10px] text-white/15 ml-auto">Last 50 lines</span>
                </div>
                <div className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
                  {MOCK_LOGS.map((line, i) => {
                    const isError = line.includes("ERROR");
                    const isWarn = line.includes("WARN");
                    return (
                      <div key={i} className={`${isError ? "text-red-400" : isWarn ? "text-yellow-400" : "text-white/50"}`}>
                        {line}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "theme" && (
            <div className="space-y-6">
              <h3 className="text-sm font-medium text-white/80">Appearance</h3>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["dark", "Dark", Moon],
                  ["light", "Light", Sun],
                  ["system", "System", Laptop],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setTheme(id)}
                    className={`flex flex-col items-center gap-3 p-5 rounded-xl border transition-all ${
                      theme === id ? "border-[#0A84FF]/30 bg-[#0A84FF]/5" : "border-white/5 bg-[#1A1A1A] hover:border-white/10"
                    }`}
                  >
                    <Icon size={22} className={theme === id ? "text-[#0A84FF]" : "text-white/30"} />
                    <span className={`text-xs font-medium ${theme === id ? "text-[#0A84FF]" : "text-white/50"}`}>{label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-white/80">Preview</h3>
                <div className="p-5 rounded-xl bg-[#1A1A1A] border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#0A84FF]" />
                    <span className="text-sm text-white">Accent Color</span>
                  </div>
                  <div className="flex gap-2">
                    {["#FF453A", "#30D158", "#FFD60A", "#0A84FF", "#BF5AF2", "#FF9F0A"].map(c => (
                      <button key={c} className="w-8 h-8 rounded-lg border-2 transition-all" style={{ backgroundColor: c, borderColor: c === "#0A84FF" ? "white" : "transparent" }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
