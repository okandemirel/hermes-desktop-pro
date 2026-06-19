import { useState } from "react";
import {
  Zap, Globe, Monitor, Cpu, HardDrive, MemoryStick, Wifi,
  ArrowRight, Server, Key, Shield, Terminal, Download, KeyRound, Sparkles
} from "lucide-react";
import { Badge, Button, Card, Field, IconChip, Input, Screen, Select, cx } from "../../ui";
import { BrandMark } from "../../components/BrandMark";
import { getAllProviders } from "@shared/providers";

// ─── WelcomeView ────────────────────────────────────────────────────────

interface WelcomeViewProps {
  /** Chose Local mode — advance to the Install wizard. */
  onContinueLocal?: () => void;
  /** Saved a remote connection — skip install and enter the app. */
  onContinueRemote?: () => void;
  /** Connected a direct provider (BYO key) — skip install and enter the app. */
  onContinueProvider?: () => void;
  /** Dismiss onboarding without finishing setup and enter the app. */
  onSkip?: () => void;
}

const PROVIDERS = getAllProviders();

export default function WelcomeView({ onContinueLocal, onContinueRemote, onContinueProvider, onSkip }: WelcomeViewProps) {
  const [mode, setMode] = useState<"local" | "remote" | "provider" | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [providerId, setProviderId] = useState<string>("");
  const [providerKey, setProviderKey] = useState("");
  const [providerModel, setProviderModel] = useState("");

  const selectedProvider = PROVIDERS.find(p => p.id === providerId);
  const providerModelPlaceholder = selectedProvider?.models[0]?.id || "default model";

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

  async function handleConnectProvider(): Promise<void> {
    if (!selectedProvider || !providerKey.trim()) return;
    setConnecting(true);
    setConnectError("");
    try {
      const model = providerModel.trim() || selectedProvider.models[0]?.id || "";
      await window.hermes.setConnectionConfig({ mode: "local" });
      await window.hermes.setModelConfig(model, selectedProvider.id, selectedProvider.baseUrl || "");
      await window.hermes.setEnvValue(selectedProvider.apiKeyEnv || "", providerKey.trim());
      onContinueProvider?.();
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

            <button
              onClick={() => setMode("provider")}
              className={cx("ui-welcome-mode-card", mode === "provider" && "is-active")}
            >
              <div className="ui-welcome-mode-head">
                <IconChip>
                  <KeyRound size={20} className="text-[var(--accent-text)]" />
                </IconChip>
                <div>
                  <h3>Connect a Provider</h3>
                  <p>Bring your own API key — chat instantly.</p>
                </div>
              </div>
              <div className="ui-welcome-remote-copy">
                <p>Talk directly to any language model provider. No agent install, no server — just your key.</p>
                <ul>
                  {[
                    "Instant - works the moment you add a key",
                    "No install - skip the local runtime entirely",
                    "Any provider - OpenAI, Anthropic, OpenRouter & more",
                  ].map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              {mode === "provider" && <span className="ui-welcome-selected">Selected</span>}
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

        {mode === "provider" && (
          <Card pad className="ui-welcome-remote-form fade-in">
            <div className="ui-welcome-form-head">
              <Sparkles size={15} />
              <strong>Provider Connection</strong>
            </div>
            <Field label="Provider">
              <Select
                value={providerId}
                onChange={e => { setProviderId(e.target.value); setProviderModel(""); }}
                aria-label="Provider"
              >
                <option value="" disabled>Select a provider…</option>
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="API Key" hint={<span><Key size={10} /> Stored locally in ~/.hermes/.env</span>}>
              <Input
                type="password"
                value={providerKey}
                onChange={e => setProviderKey(e.target.value)}
                placeholder="sk-..."
              />
            </Field>
            <Field label="Model" hint={<span>Optional — defaults to the provider's recommended model</span>}>
              <Input
                type="text"
                value={providerModel}
                onChange={e => setProviderModel(e.target.value)}
                placeholder={providerModelPlaceholder}
              />
            </Field>
          </Card>
        )}

        <div className="ui-welcome-action-row">
          {(mode === "remote" || mode === "provider") && connectError && (
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
          {mode === "provider" && (
            <Button
              variant="primary"
              disabled={!selectedProvider || !providerKey.trim() || connecting}
              onClick={handleConnectProvider}
              leftIcon={<KeyRound size={16} />}
            >
              {connecting ? "Connecting..." : "Connect Provider"}
              <ArrowRight size={14} />
            </Button>
          )}
          {!mode && <p className="ui-welcome-idle">Select a setup mode above to continue</p>}
          {onSkip && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip for now
            </Button>
          )}
        </div>
      </div>
    </Screen>
  );
}
