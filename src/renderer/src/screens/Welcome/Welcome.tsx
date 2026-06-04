import { useState } from "react";
import {
  Zap, Globe, Monitor, Cpu, HardDrive, MemoryStick, Wifi,
  ArrowRight, Server, Key, Shield, Terminal, Download
} from "lucide-react";
import { Button, Input } from "../../ui";
import { BrandMark } from "../../components/BrandMark";

// ─── WelcomeView ────────────────────────────────────────────────────────

export default function WelcomeView() {
  const [mode, setMode] = useState<"local" | "remote" | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "var(--surface)" }}>
      {/* ── Hero section ── */}
      <div className="flex-shrink-0 px-6 py-10 border-b border-[var(--border)]" style={{ background: "var(--surface-2)" }}>
        <div className="max-w-2xl mx-auto text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <BrandMark chip size={48} />
            <div className="text-left">
              <h1 className="text-xl font-bold text-[var(--text)]">Hermes Desktop Pro</h1>
              <p className="text-xs text-[var(--text-3)]">by Nous Research</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-[var(--text)] mb-3">Welcome to Hermes</h2>
          <p className="text-sm text-[var(--text-2)] max-w-md mx-auto leading-relaxed">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-[var(--accent-text)]"
                  style={{ background: "var(--accent-weak)", border: "1px solid var(--accent-line)" }}
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
          <h3 className="text-sm font-semibold text-[var(--text-2)] uppercase tracking-wide mb-5 text-center">
            Choose your setup
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* ── Local Mode card ── */}
            <button
              onClick={() => setMode("local")}
              className={`text-left rounded-xl border-2 p-5 transition-all duration-200 ${
                mode === "local" ? "border-[var(--accent-line)]" : "border-[var(--border)] hover:border-[var(--border-2)]"
              }`}
              style={{ background: mode === "local" ? "var(--accent-weak)" : "var(--surface-3)" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--accent-weak)] border border-[var(--accent-line)]">
                  <Monitor size={20} className="text-[var(--accent-text)]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-[var(--text)]">Local Mode</h4>
                  <p className="text-xs text-[var(--text-3)] mt-0.5">Install Hermes directly on this machine</p>
                </div>
              </div>

              {/* System requirements */}
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-medium text-[var(--text-3)] uppercase tracking-wide mb-2">System Requirements</p>
                {[
                  { icon: Cpu, label: "CPU", value: "x86-64 or ARM64, 2+ cores" },
                  { icon: MemoryStick, label: "RAM", value: "4 GB minimum (8 GB recommended)" },
                  { icon: HardDrive, label: "Disk", value: "2 GB free space" },
                  { icon: Wifi, label: "Network", value: "Internet connection required" },
                ].map(req => {
                  const Icon = req.icon;
                  return (
                    <div key={req.label} className="flex items-center gap-2">
                      <Icon size={12} className="text-[var(--text-3)]" />
                      <span className="text-[11px] text-[var(--text-3)]">{req.label}:</span>
                      <span className="text-[11px] text-[var(--text-2)]">{req.value}</span>
                    </div>
                  );
                })}
              </div>

              {mode === "local" && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  <span className="text-xs text-[var(--accent-text)] font-medium">Selected</span>
                </div>
              )}
            </button>

            {/* ── Remote Mode card ── */}
            <button
              onClick={() => setMode("remote")}
              className={`text-left rounded-xl border-2 p-5 transition-all duration-200 ${
                mode === "remote" ? "border-[var(--accent-line)]" : "border-[var(--border)] hover:border-[var(--border-2)]"
              }`}
              style={{ background: mode === "remote" ? "var(--accent-weak)" : "var(--surface-3)" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--accent-weak)] border border-[var(--accent-line)]">
                  <Server size={20} className="text-[var(--accent-text)]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-[var(--text)]">Remote Mode</h4>
                  <p className="text-xs text-[var(--text-3)] mt-0.5">Connect to an existing Hermes server</p>
                </div>
              </div>

              {/* Remote mode description */}
              <div className="mt-4">
                <p className="text-xs text-[var(--text-2)] leading-relaxed">
                  Connect to a Hermes instance running on another machine, a cloud server, or a Docker container. No local installation required.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {[
                    "Instant setup — just enter a URL and API key",
                    "Lightweight — no local compute needed",
                    "Share one instance across multiple clients",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--accent-text)] text-[11px] mt-0.5">•</span>
                      <span className="text-[11px] text-[var(--text-2)]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {mode === "remote" && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  <span className="text-xs text-[var(--accent-text)] font-medium">Selected</span>
                </div>
              )}
            </button>
          </div>

          {/* ── Remote connection form ── */}
          {mode === "remote" && (
            <div className="rounded-xl border border-[var(--border)] p-5 mb-8 animate-fade-in" style={{ background: "var(--surface-2)" }}>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                <Globe size={15} className="text-[var(--accent-text)]" />
                Server Connection
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1.5">Server URL</label>
                  <Input
                    type="url"
                    value={remoteUrl}
                    onChange={e => setRemoteUrl(e.target.value)}
                    placeholder="https://hermes.example.com:8080"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1.5">API Key</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-hermes-..."
                  />
                  <p className="text-[10px] text-[var(--text-3)] mt-1.5 flex items-center gap-1">
                    <Key size={10} /> Find your API key in ~/.hermes/.env on the server
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Action button ── */}
          <div className="flex justify-center">
            {mode === "local" && (
              <Button variant="primary" leftIcon={<Download size={16} />}>
                Install Hermes Locally
                <ArrowRight size={14} />
              </Button>
            )}

            {mode === "remote" && (
              <Button variant="primary" disabled={!remoteUrl || !apiKey} leftIcon={<Wifi size={16} />}>
                Connect to Server
                <ArrowRight size={14} />
              </Button>
            )}

            {!mode && (
              <p className="text-xs text-[var(--text-3)]">Select a setup mode above to continue</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

