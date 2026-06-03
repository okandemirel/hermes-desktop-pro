import { useState } from "react";
import { Server, Key, Copy, Check, Globe } from "./Icons";
import type { ProviderInfo } from "@shared/types";
import { providerApiKeyEnv, providerNeedsApiKey } from "@shared/providers";

interface Props { providers: ProviderInfo[] }

export function ProvidersView({ providers }: Props) {
  const [sel, setSel] = useState(providers[0]?.id || "");
  const [copied, setCopied] = useState<string | null>(null);
  const p = providers.find(x => x.id === sel);
  const copy = (t: string) => { navigator.clipboard.writeText(t).catch(()=>{}); setCopied(t); setTimeout(()=>setCopied(null), 1500); };

  return (
    <div className="flex-1 flex min-h-0" style={{ background: "var(--bg-main)" }}>
      <div className="w-52 flex-shrink-0 overflow-y-auto" style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)" }}>
        <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>Providers</h2>
        </div>
        <div className="p-1.5">
          {providers.map(x => (
            <button key={x.id} onClick={() => setSel(x.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors mb-0.5"
              style={{ background: x.id === sel ? "var(--bg-selected)" : "transparent", color: x.id === sel ? "var(--accent)" : "var(--text-secondary)" }}
              onMouseEnter={e => { if (x.id !== sel) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
              onMouseLeave={e => { if (x.id !== sel) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; } }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: x.color }} />
              <span className="truncate">{x.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!p ? <div className="flex items-center justify-center h-full" style={{ color: "var(--text-tertiary)" }}>Select a provider</div> : (
          <div className="max-w-lg mx-auto py-8 px-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: p.color + "18", border: `1px solid ${p.color}28` }}>
                <Server size={18} style={{ color: p.color }} />
              </div>
              <div>
                <h1 className="text-[15px] font-bold" style={{ color: "var(--text)" }}>{p.name}</h1>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{p.description}</p>
              </div>
            </div>

            <S title="Endpoint" icon={<Globe size={12}/>}>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                <code className="text-[11.5px] flex-1 font-mono" style={{ color: "var(--text-secondary)" }}>{p.baseUrl}</code>
                <button onClick={() => copy(p.baseUrl ?? "")} className="p-1 rounded transition-colors" style={{ color: "var(--text-tertiary)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)"}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
                  {copied === (p.baseUrl ?? "") ? <Check size={12} style={{ color: "var(--success)" }}/> : <Copy size={12}/>}
                </button>
              </div>
            </S>

            {providerNeedsApiKey(p.id) && (
              <S title="API Key" icon={<Key size={12}/>}>
                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                  <code className="text-[11.5px] flex-1 font-mono" style={{ color: "var(--accent)" }}>{providerApiKeyEnv(p.id)}</code>
                  <button onClick={() => copy(providerApiKeyEnv(p.id))} className="p-1 rounded transition-colors" style={{ color: "var(--text-tertiary)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)"}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
                    {copied === providerApiKeyEnv(p.id) ? <Check size={12} style={{ color: "var(--success)" }}/> : <Copy size={12}/>}
                  </button>
                </div>
                <p className="text-[10.5px] mt-1" style={{ color: "var(--text-tertiary)" }}>Set in ~/.hermes/.env</p>
              </S>
            )}

            <S title="Capabilities">
              <div className="flex flex-wrap gap-1.5">
                {(["Streaming","Reasoning","Vision","Tool Use"] as const).map((l) => {
                  const e = p.capabilities[l.toLowerCase() as keyof typeof p.capabilities] ?? false;
                  return (
                  <span key={l} className="px-2 py-0.5 rounded-full text-[10.5px] font-medium"
                    style={{ background: e ? "rgba(48,209,88,0.1)" : "var(--bg-input)", color: e ? "var(--success)" : "var(--text-tertiary)", border: `1px solid ${e ? "rgba(48,209,88,0.2)" : "var(--border)"}` }}>
                    {l}
                  </span>
                  );
                })}
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium" style={{ background: "var(--bg-input)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  {p.capabilities.maxContextTokens.toLocaleString()} ctx
                </span>
              </div>
            </S>

            <S title={`Models (${p.models.length})`}>
              <div className="space-y-1">
                {p.models.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                    <div><span className="text-[11.5px] font-mono font-medium" style={{ color: "var(--text)" }}>{m.id}</span><span className="text-[10.5px] ml-2" style={{ color: "var(--text-tertiary)" }}>{m.name}</span></div>
                    <div className="flex items-center gap-1.5">
                      {m.isReasoning && <span className="text-[9.5px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "var(--accent-10)", color: "var(--accent)" }}>reasoning</span>}
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{m.contextLength?.toLocaleString() ?? "N/A"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </S>

            {p.id.startsWith("opencode") && (
              <div className="rounded-xl p-4 mt-4 animate-fade-in" style={{ background: "var(--accent-10)", border: "1px solid var(--accent-20)" }}>
                <p className="text-[12px] font-semibold mb-1" style={{ color: "var(--accent)" }}>🚀 First-Class OpenCode</p>
                <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {p.id === "opencode-zen" ? "Claude, Gemini, GPT via unified API." : "DeepSeek, Qwen, GLM, MiMo via unified API."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function S({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="mb-5">
    <div className="flex items-center gap-1.5 mb-1.5">
      {icon && <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>}
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{title}</h3>
    </div>
    {children}
  </div>;
}
