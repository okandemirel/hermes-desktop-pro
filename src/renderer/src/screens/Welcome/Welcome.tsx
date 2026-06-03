import { useState } from "react";
import {
  Zap, Globe, Monitor, Cpu, HardDrive, MemoryStick, Wifi,
  ArrowRight, Server, Key, Shield, Sparkles, Terminal, Download
} from "lucide-react";

// ─── WelcomeView ────────────────────────────────────────────────────────

export default function WelcomeView() {
  const [mode, setMode] = useState<"local" | "remote" | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "#0D0D0D" }}>
      {/* ── Hero section ── */}
      <div className="flex-shrink-0 px-6 py-10 border-b border-white/5" style={{ background: "#1A1A1A" }}>
        <div className="max-w-2xl mx-auto text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0A84FF, #6366f1)" }}>
              <Sparkles size={22} className="text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">Hermes Desktop Pro</h1>
              <p className="text-xs text-white/40">by Nous Research</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white/95 mb-3">Welcome to Hermes</h2>
          <p className="text-sm text-white/45 max-w-md mx-auto leading-relaxed">
            Your intelligent, multi-platform AI agent. Connect any language model, chat across any messaging app, and automate your workflow — all from one desktop client.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {[
              { icon: Zap, label: "Multi-Provider" },
              { icon: Globe, label: "16 Platforms" },
              { icon: Terminal, label: "OpenCode" },
              { icon: Shield, label: "Local-First" },
            ].map(f => {
              const Icon = f.icon;
              return (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
                  style={{ background: "rgba(10,132,255,0.08)", color: "#0A84FF", border: "1px solid rgba(10,132,255,0.15)" }}
                >
                  <Icon size={12} /> {f.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Connection options ── */}
      <div className="flex-1 py-8 px-6">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-5 text-center">
            Choose your setup
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* ── Local Mode card ── */}
            <button
              onClick={() => setMode("local")}
              className={`text-left rounded-xl border-2 p-5 transition-all duration-200 ${
                mode === "local" ? "border-[#0A84FF] bg-[#0A84FF]/5" : "border-white/5 hover:border-white/10"
              }`}
              style={{ background: mode === "local" ? "rgba(10,132,255,0.05)" : "#242424" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(10,132,255,0.1)" }}>
                  <Monitor size={20} className="text-[#0A84FF]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white/95">Local Mode</h4>
                  <p className="text-xs text-white/40 mt-0.5">Install Hermes directly on this machine</p>
                </div>
              </div>

              {/* System requirements */}
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-medium text-white/30 uppercase tracking-wide mb-2">System Requirements</p>
                {[
                  { icon: Cpu, label: "CPU", value: "x86-64 or ARM64, 2+ cores" },
                  { icon: MemoryStick, label: "RAM", value: "4 GB minimum (8 GB recommended)" },
                  { icon: HardDrive, label: "Disk", value: "2 GB free space" },
                  { icon: Wifi, label: "Network", value: "Internet connection required" },
                ].map(req => {
                  const Icon = req.icon;
                  return (
                    <div key={req.label} className="flex items-center gap-2">
                      <Icon size={12} className="text-white/20" />
                      <span className="text-[11px] text-white/35">{req.label}:</span>
                      <span className="text-[11px] text-white/50">{req.value}</span>
                    </div>
                  );
                })}
              </div>

              {mode === "local" && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                  <span className="text-xs text-[#0A84FF] font-medium">Selected</span>
                </div>
              )}
            </button>

            {/* ── Remote Mode card ── */}
            <button
              onClick={() => setMode("remote")}
              className={`text-left rounded-xl border-2 p-5 transition-all duration-200 ${
                mode === "remote" ? "border-[#0A84FF] bg-[#0A84FF]/5" : "border-white/5 hover:border-white/10"
              }`}
              style={{ background: mode === "remote" ? "rgba(10,132,255,0.05)" : "#242424" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,0.1)" }}>
                  <Server size={20} className="text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white/95">Remote Mode</h4>
                  <p className="text-xs text-white/40 mt-0.5">Connect to an existing Hermes server</p>
                </div>
              </div>

              {/* Remote mode description */}
              <div className="mt-4">
                <p className="text-xs text-white/35 leading-relaxed">
                  Connect to a Hermes instance running on another machine, a cloud server, or a Docker container. No local installation required.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {[
                    "Instant setup — just enter a URL and API key",
                    "Lightweight — no local compute needed",
                    "Share one instance across multiple clients",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#0A84FF] text-[11px] mt-0.5">•</span>
                      <span className="text-[11px] text-white/40">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {mode === "remote" && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                  <span className="text-xs text-[#0A84FF] font-medium">Selected</span>
                </div>
              )}
            </button>
          </div>

          {/* ── Remote connection form ── */}
          {mode === "remote" && (
            <div className="rounded-xl border border-white/5 p-5 mb-8 animate-fade-in" style={{ background: "#1A1A1A" }}>
              <h4 className="text-sm font-semibold text-white/90 mb-4 flex items-center gap-2">
                <Globe size={15} className="text-[#0A84FF]" />
                Server Connection
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/50 mb-1.5">Server URL</label>
                  <input
                    type="url"
                    value={remoteUrl}
                    onChange={e => setRemoteUrl(e.target.value)}
                    placeholder="https://hermes.example.com:8080"
                    className="w-full rounded-lg px-3 py-2.5 text-sm transition-colors"
                    style={{
                      background: "#0D0D0D",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                      outline: "none",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(10,132,255,0.4)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-white/50 mb-1.5">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-hermes-..."
                    className="w-full rounded-lg px-3 py-2.5 text-sm transition-colors"
                    style={{
                      background: "#0D0D0D",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                      outline: "none",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(10,132,255,0.4)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                  <p className="text-[10px] text-white/25 mt-1.5 flex items-center gap-1">
                    <Key size={10} /> Find your API key in ~/.hermes/.env on the server
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Action button ── */}
          <div className="flex justify-center">
            {mode === "local" && (
              <button
                className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "#0A84FF", color: "#fff" }}
              >
                <Download size={16} /> Install Hermes Locally
                <ArrowRight size={14} />
              </button>
            )}

            {mode === "remote" && (
              <button
                disabled={!remoteUrl || !apiKey}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors ${
                  !remoteUrl || !apiKey ? "opacity-40 cursor-not-allowed" : ""
                }`}
                style={{ background: "#0A84FF", color: "#fff" }}
              >
                <Wifi size={16} /> Connect to Server
                <ArrowRight size={14} />
              </button>
            )}

            {!mode && (
              <p className="text-xs text-white/25">Select a setup mode above to continue</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

