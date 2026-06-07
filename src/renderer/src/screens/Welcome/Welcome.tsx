import { useState } from "react";
import {
  Zap, Globe, Monitor, Cpu, HardDrive, MemoryStick, Wifi,
  ArrowRight, Server, Key, Shield, Terminal, Download
} from "lucide-react";
import { Badge, Button, Card, Field, IconChip, Input, Screen, cx } from "../../ui";
import { BrandMark } from "../../components/BrandMark";

// ─── WelcomeView ────────────────────────────────────────────────────────

interface WelcomeViewProps {
  /** Chose Local mode — advance to the Install wizard. */
  onContinueLocal?: () => void;
  /** Saved a remote connection — skip install and enter the app. */
  onContinueRemote?: () => void;
}

export default function WelcomeView({ onContinueLocal, onContinueRemote }: WelcomeViewProps) {
  const [mode, setMode] = useState<"local" | "remote" | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  async function handleConnectRemote(): Promise<void> {
    if (!remoteUrl || !apiKey) return;
    setConnecting(true);
    setConnectError("");
    try {
      await window.hermes.setConnectionConfig({
        mode: "remote",
        remoteUrl: remoteUrl.trim(),
        apiKey: apiKey.trim(),
      });
      onContinueRemote?.();
    } catch (err) {
      setConnectError((err as Error).message || "Failed to save connection.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Screen
      className="ui-welcome-console"
      kicker="Hermes Desktop Pro"
      icon={<BrandMark size={19} glow={false} />}
      title="Welcome to Hermes"
      sub="Choose how this independent desktop client connects to your Hermes agent."
      actions={
        <>
          <Badge variant="accent"><Shield size={12} /> Local-first</Badge>
          <Badge variant="neutral"><Terminal size={12} /> OpenCode</Badge>
        </>
      }
    >
      <div className="ui-welcome-shell">
        <Card pad className="ui-welcome-hero mint-in mint-in-1">
          <div className="ui-welcome-brand">
            <BrandMark chip size={48} />
            <div>
              <h2>Hermes Desktop Pro</h2>
              <p>Independent AI command client</p>
            </div>
          </div>
          <p className="ui-welcome-hero-copy">
            Connect any language model, chat across messaging platforms, and automate operational work from one focused desktop surface.
          </p>
          <div className="ui-welcome-feature-row">
            {[
              { icon: Zap, label: "Multi-Provider" },
              { icon: Globe, label: "16 Platforms" },
              { icon: Terminal, label: "OpenCode" },
              { icon: Shield, label: "Local-First" },
            ].map(f => {
              const Icon = f.icon;
              return (
                <Badge key={f.label} variant="accent">
                  <Icon size={12} /> {f.label}
                </Badge>
              );
            })}
          </div>
        </Card>

        <section className="ui-welcome-setup">
          <div className="ui-section-label">Choose setup</div>
          <div className="ui-welcome-mode-grid">
            <button
              onClick={() => setMode("local")}
              className={cx("ui-welcome-mode-card", mode === "local" && "is-active")}
            >
              <div className="ui-welcome-mode-head">
                <IconChip>
                  <Monitor size={20} className="text-[var(--accent-text)]" />
                </IconChip>
                <div>
                  <h3>Local Mode</h3>
                  <p>Install Hermes directly on this machine.</p>
                </div>
              </div>
              <div className="ui-welcome-reqs">
                <span>System Requirements</span>
                {[
                  { icon: Cpu, label: "CPU", value: "x86-64 or ARM64, 2+ cores" },
                  { icon: MemoryStick, label: "RAM", value: "4 GB minimum (8 GB recommended)" },
                  { icon: HardDrive, label: "Disk", value: "2 GB free space" },
                  { icon: Wifi, label: "Network", value: "Internet connection required" },
                ].map(req => {
                  const Icon = req.icon;
                  return (
                    <div key={req.label}>
                      <Icon size={12} />
                      <strong>{req.label}</strong>
                      <em>{req.value}</em>
                    </div>
                  );
                })}
              </div>
              {mode === "local" && <span className="ui-welcome-selected">Selected</span>}
            </button>

            <button
              onClick={() => setMode("remote")}
              className={cx("ui-welcome-mode-card", mode === "remote" && "is-active")}
            >
              <div className="ui-welcome-mode-head">
                <IconChip>
                  <Server size={20} className="text-[var(--accent-text)]" />
                </IconChip>
                <div>
                  <h3>Remote Mode</h3>
                  <p>Connect to an existing Hermes server.</p>
                </div>
              </div>
              <div className="ui-welcome-remote-copy">
                <p>Use a Hermes instance running on another machine, cloud server, or Docker host.</p>
                <ul>
                  {[
                    "Instant setup - just enter a URL and API key",
                    "Lightweight - no local compute needed",
                    "Share one instance across multiple clients",
                  ].map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              {mode === "remote" && <span className="ui-welcome-selected">Selected</span>}
            </button>
          </div>
        </section>

        {mode === "remote" && (
          <Card pad className="ui-welcome-remote-form fade-in">
            <div className="ui-welcome-form-head">
              <Globe size={15} />
              <strong>Server Connection</strong>
            </div>
            <Field label="Server URL">
              <Input
                type="url"
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                placeholder="https://hermes.example.com:8080"
              />
            </Field>
            <Field label="API Key" hint={<span><Key size={10} /> Find it in ~/.hermes/.env on the server</span>}>
              <Input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-hermes-..."
              />
            </Field>
          </Card>
        )}

        <div className="ui-welcome-action-row">
          {mode === "remote" && connectError && (
            <p className="ui-welcome-error">{connectError}</p>
          )}
          {mode === "local" && (
            <Button variant="primary" onClick={() => onContinueLocal?.()} leftIcon={<Download size={16} />}>
              Install Hermes Locally
              <ArrowRight size={14} />
            </Button>
          )}
          {mode === "remote" && (
            <Button
              variant="primary"
              disabled={!remoteUrl || !apiKey || connecting}
              onClick={handleConnectRemote}
              leftIcon={<Wifi size={16} />}
            >
              {connecting ? "Connecting..." : "Connect to Server"}
              <ArrowRight size={14} />
            </Button>
          )}
          {!mode && <p className="ui-welcome-idle">Select a setup mode above to continue</p>}
        </div>
      </div>
    </Screen>
  );
}
