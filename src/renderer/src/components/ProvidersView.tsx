import { useState } from "react";
import { Cpu, Copy, Check } from "lucide-react";
import type { ProviderInfo } from "@shared/types";
import { providerApiKeyEnv, providerNeedsApiKey } from "@shared/providers";
import { Screen, Card, Badge, IconButton, IconChip, SectionLabel, cx } from "../ui";

interface Props { providers: ProviderInfo[] }

const CAPS: { label: string; key: "streaming" | "reasoning" | "vision" | "toolUse" }[] = [
  { label: "Streaming", key: "streaming" },
  { label: "Reasoning", key: "reasoning" },
  { label: "Vision", key: "vision" },
  { label: "Tools", key: "toolUse" },
];

export function ProvidersView({ providers }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (t: string) => { navigator.clipboard.writeText(t).catch(() => {}); setCopied(t); setTimeout(() => setCopied(null), 1500); };

  const renderCard = (p: ProviderInfo) => {
    const needsKey = providerNeedsApiKey(p.id);
    const envVar = providerApiKeyEnv(p.id);
    const isOpenCode = p.id.startsWith("opencode");
    const caps = CAPS.filter(c => p.capabilities[c.key]).map(c => c.label);
    return (
      <Card key={p.id} pad interactive className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <IconChip className="ui-stamp !rounded-full font-semibold text-[15px] serif">{p.label.charAt(0)}</IconChip>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[var(--text)] truncate">{p.label}</div>
            <div className="text-[11.5px] text-[var(--text-3)]">{p.models.length} model{p.models.length !== 1 ? "s" : ""}</div>
          </div>
          {isOpenCode && <Badge variant="accent">OpenCode</Badge>}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {caps.length > 0 && (
            <span className="min-w-0 truncate text-[11.5px] font-mono text-[var(--text-3)]">{caps.join(" · ")}</span>
          )}
          <Badge variant="accent" className="ml-auto shrink-0">{(p.capabilities.maxContextTokens / 1000).toLocaleString()}K ctx</Badge>
        </div>

        <hr className="ui-divider-gold mt-auto" />

        <div>
          {needsKey ? (
            <>
              <div className="flex items-center gap-2 h-9 px-3 rounded-[10px] bg-[var(--surface-3)] border border-[var(--border)]">
                <code className="flex-1 text-[12px] font-mono text-[var(--accent-text)] truncate">{envVar}</code>
                <IconButton onClick={() => copy(envVar)} title="Copy" className={cx("!w-7 !h-7", copied === envVar && "text-[var(--success)]")}>
                  {copied === envVar ? <Check size={13} /> : <Copy size={13} />}
                </IconButton>
              </div>
              <div className="text-[11px] text-[var(--text-3)] mt-1.5">Set this key in <span className="font-mono">~/.hermes/.env</span></div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--success)]"><Check size={13} /> No API key required</div>
          )}
        </div>
      </Card>
    );
  };

  const hosted = providers.filter(p => providerNeedsApiKey(p.id));
  const local = providers.filter(p => !providerNeedsApiKey(p.id));

  return (
    <Screen
      icon={<Cpu size={19} />}
      kicker="Model Providers"
      title="Providers"
      sub={<>Connect LLM providers. Keys live in <code className="ui-kbd">~/.hermes/.env</code> — never committed.</>}
    >
      {hosted.length > 0 && (
        <section>
          <SectionLabel className="mb-3">Hosted — API key required</SectionLabel>
          <div className="ui-grid stagger">{hosted.map(renderCard)}</div>
        </section>
      )}
      {local.length > 0 && (
        <section className={hosted.length > 0 ? "mt-7" : undefined}>
          <SectionLabel className="mb-3">Local — no key needed</SectionLabel>
          <div className="ui-grid stagger">{local.map(renderCard)}</div>
        </section>
      )}
    </Screen>
  );
}
