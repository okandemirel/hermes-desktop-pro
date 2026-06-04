import { useState } from "react";
import { Cpu, Copy, Check } from "lucide-react";
import type { ProviderInfo } from "@shared/types";
import { providerApiKeyEnv, providerNeedsApiKey } from "@shared/providers";
import { Screen, Card, Badge, IconButton, IconChip, cx } from "../ui";

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

  return (
    <Screen
      icon={<Cpu size={19} />}
      title="Providers"
      sub={<>Connect LLM providers. Keys live in <code className="ui-kbd">~/.hermes/.env</code> — never committed.</>}
    >
      <div className="ui-grid stagger">
        {providers.map(p => {
          const needsKey = providerNeedsApiKey(p.id);
          const envVar = providerApiKeyEnv(p.id);
          const isOpenCode = p.id.startsWith("opencode");
          return (
            <Card key={p.id} pad interactive className="flex flex-col gap-3.5">
              <div className="flex items-center gap-3">
                <IconChip className="font-semibold text-[14px]">{p.label.charAt(0)}</IconChip>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[var(--text)] truncate">{p.label}</div>
                  <div className="text-[11.5px] text-[var(--text-3)]">{p.models.length} model{p.models.length !== 1 ? "s" : ""}</div>
                </div>
                {isOpenCode && <Badge variant="accent">OpenCode</Badge>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CAPS.map(c => (
                  <Badge key={c.key} variant={p.capabilities[c.key] ? "success" : "neutral"}>{c.label}</Badge>
                ))}
                <Badge variant="accent">{(p.capabilities.maxContextTokens / 1000).toLocaleString()}K ctx</Badge>
              </div>

              <div className="mt-auto pt-3.5 border-t border-[var(--border)]">
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
        })}
      </div>
    </Screen>
  );
}
