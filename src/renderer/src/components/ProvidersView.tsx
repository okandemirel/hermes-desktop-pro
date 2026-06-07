import { useState } from "react";
import { Cpu, Copy, Check, ShieldCheck, KeyRound, Server, Sparkles, Radio, LockKeyhole, Layers } from "lucide-react";
import type { ProviderInfo } from "@shared/types";
import { providerApiKeyEnv, providerNeedsApiKey } from "@shared/providers";
import { Screen, Card, Badge, IconChip, SectionLabel, StatusDot, cx } from "../ui";

interface Props { providers: ProviderInfo[] }

const CAPS: { label: string; key: "streaming" | "reasoning" | "vision" | "toolUse" }[] = [
  { label: "Streaming", key: "streaming" },
  { label: "Reasoning", key: "reasoning" },
  { label: "Vision", key: "vision" },
  { label: "Tools", key: "toolUse" },
];

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}

export function ProvidersView({ providers }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (t: string) => { navigator.clipboard.writeText(t).catch(() => {}); setCopied(t); setTimeout(() => setCopied(null), 1500); };

  const renderCard = (p: ProviderInfo) => {
    const needsKey = providerNeedsApiKey(p.id);
    const envVar = providerApiKeyEnv(p.id);
    const isOpenCode = p.id.startsWith("opencode");
    const caps = CAPS.filter(c => p.capabilities[c.key]).map(c => c.label);
    const statusLabel = needsKey ? "API key required" : "Ready";
    return (
      <Card key={p.id} pad className="ui-provider-card" active={isOpenCode}>
        <div className="ui-provider-card-head">
          <IconChip className="ui-provider-avatar" aria-hidden>{p.label.charAt(0)}</IconChip>
          <div className="min-w-0 flex-1">
            <div className="ui-provider-name">{p.label}</div>
            <div className="ui-provider-meta">
              <Layers size={12} />
              <span>{p.models.length} model{p.models.length !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{formatContext(p.capabilities.maxContextTokens)}</span>
            </div>
          </div>
          <Badge variant={isOpenCode ? "accent" : needsKey ? "warning" : "success"}>
            {!needsKey && <StatusDot color="var(--success)" />}
            {isOpenCode ? "OpenCode" : statusLabel}
          </Badge>
        </div>

        <div className="ui-provider-cap-grid">
          {caps.map((cap) => <span key={cap}>{cap}</span>)}
          {caps.length === 0 && <span>OpenAI compatible</span>}
        </div>

        <div className="ui-provider-route-row" aria-label="Provider route">
          <Radio size={13} />
          <span>{needsKey ? "Hosted route" : "Local route"}</span>
          <strong>{statusLabel}</strong>
        </div>

        <div>
          {needsKey ? (
            <>
              <button
                type="button"
                className="ui-provider-env-row"
                onClick={() => copy(envVar)}
                title={`Copy ${envVar}`}
                aria-label={`Copy ${envVar}`}
              >
                <LockKeyhole size={14} />
                <code title={envVar}>{envVar}</code>
                <span className={cx("ui-provider-copy-button", copied === envVar && "text-[var(--success)]")}>
                  {copied === envVar ? <Check size={13} /> : <Copy size={13} />}
                </span>
              </button>
              <div className="ui-provider-env-hint" aria-live="polite">
                <span>Set this key in <span className="font-mono">~/.hermes/.env</span></span>
                {copied === envVar && <strong>Copied</strong>}
              </div>
            </>
          ) : (
            <div className="ui-provider-local-row"><Check size={13} /> No API key required</div>
          )}
        </div>
      </Card>
    );
  };

  const hosted = providers.filter(p => providerNeedsApiKey(p.id));
  const local = providers.filter(p => !providerNeedsApiKey(p.id));

  return (
    <Screen
      className="ui-providers-console"
      icon={<Cpu size={19} />}
      kicker="Model Providers"
      title="Providers"
      sub={<>Connect LLM providers. Keys live in <code className="ui-kbd">~/.hermes/.env</code> — never committed.</>}
    >
      <Card className="ui-provider-hero">
        <div className="ui-provider-hero-mark">
          <ShieldCheck size={28} />
        </div>
        <div className="ui-provider-hero-copy">
          <div className="ui-eyebrow">Secure Provider Catalog</div>
          <h2>Model access, key custody, and capability routing</h2>
          <p>Hosted providers expose key slots; local providers stay ready without secrets. Capability chips stay sourced from the live provider catalog.</p>
        </div>
        <div className="ui-provider-hero-metrics">
          <div><span>Hosted</span><strong>{hosted.length}</strong></div>
          <div><span>Local</span><strong>{local.length}</strong></div>
          <div><span>Total</span><strong>{providers.length}</strong></div>
        </div>
      </Card>

      {hosted.length > 0 && (
        <section className="ui-provider-section">
          <div className="ui-provider-section-head">
            <SectionLabel>Hosted Providers</SectionLabel>
            <Badge variant="warning"><KeyRound size={13} /> {hosted.length} key slots</Badge>
          </div>
          <div className="ui-provider-grid stagger">{hosted.map(renderCard)}</div>
        </section>
      )}
      {local.length > 0 && (
        <section className={cx("ui-provider-section", hosted.length > 0 && "mt-7")}>
          <div className="ui-provider-section-head">
            <SectionLabel>Local Providers</SectionLabel>
            <Badge variant="success"><Server size={13} /> {local.length} ready</Badge>
          </div>
          <div className="ui-provider-grid stagger">{local.map(renderCard)}</div>
        </section>
      )}
      {providers.length === 0 && (
        <Card pad className="ui-provider-empty">
          <Sparkles size={20} />
          <span>No providers are currently available from the catalog.</span>
        </Card>
      )}
    </Screen>
  );
}
