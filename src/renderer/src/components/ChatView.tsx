import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Square, Plus, Globe, Image, Code, Wrench, Brain, Activity, Terminal, Paperclip, ArrowUp } from "lucide-react";
import type { ChatTab, ProviderId, ProviderInfo, TokenUsage } from "@shared/types";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { BrandMedallion } from "./BrandMark";
import { useChatStream } from "../hooks/useChatStream";
import { cx, IconButton, StatusDot } from "../ui";

interface ChatViewProps {
  tab: ChatTab; providers: ProviderInfo[]; allTabs: ChatTab[];
  onClose?: (id: string) => void; onNewTab?: () => void; onSelectTab?: (id: string) => void;
  onUpdateProvider?: (tabId: string, providerId: ProviderId) => void;
  onUpdateModel?: (tabId: string, modelId: string) => void;
}

const SLASH_COMMANDS = [
  { cmd: "/new", desc: "New conversation", icon: Plus },
  { cmd: "/clear", desc: "Clear and new session", icon: Plus },
  { cmd: "/web", desc: "Web search", icon: Globe },
  { cmd: "/image", desc: "Generate image", icon: Image },
  { cmd: "/code", desc: "Code execution", icon: Code },
  { cmd: "/shell", desc: "Terminal command", icon: Terminal },
  { cmd: "/usage", desc: "Token usage", icon: Activity },
  { cmd: "/tools", desc: "Manage tools", icon: Wrench },
  { cmd: "/skills", desc: "Browse skills", icon: Brain },
  { cmd: "/model", desc: "Change model", icon: Brain },
];

const SUGGESTIONS = [
  { icon: Globe, label: "Search the web", desc: "Pull live, cited information", cmd: "/web " },
  { icon: Code, label: "Write & run code", desc: "Generate and execute scripts", cmd: "/code " },
  { icon: Image, label: "Generate an image", desc: "Create visuals from a prompt", cmd: "/image " },
  { icon: Wrench, label: "Manage tools", desc: "Configure agent capabilities", cmd: "/tools " },
  { icon: Brain, label: "Browse skills", desc: "Explore installed agent skills", cmd: "/skills " },
  { icon: Activity, label: "Token usage", desc: "Track spend, context & limits", cmd: "/usage " },
];

const TOOLS_ROW = [
  { icon: Globe, label: "Web", cmd: "/web " },
  { icon: Code, label: "Code", cmd: "/code " },
  { icon: Image, label: "Image", cmd: "/image " },
  { icon: Wrench, label: "Tools", cmd: "/tools " },
];

const RECENTS = [
  { icon: Code, title: "Refactor auth module", meta: "OpenCode Zen · 2h ago" },
  { icon: Globe, title: "Research vibrancy APIs", meta: "Claude Sonnet · yesterday" },
  { icon: Activity, title: "Draft release notes", meta: "GPT-4o · 2 days ago" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function ChatView({ tab, providers, allTabs, onNewTab, onSelectTab, onUpdateProvider, onUpdateModel }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeProvider = providers.find(p => p.id === tab.providerId);

  const { messages, isStreaming, sendMessage, abortStream } = useChatStream({
    providerId: tab.providerId, modelId: tab.modelId,
    onTokenUsage: (usage: TokenUsage) => setTokenUsage(usage),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (input.startsWith("/")) {
      const q = input.slice(1).toLowerCase();
      setFilteredCommands(q ? SLASH_COMMANDS.filter(c => c.cmd.toLowerCase().includes(q)) : SLASH_COMMANDS);
      setShowCommands(true); setSelectedCmdIdx(0);
    } else setShowCommands(false);
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    if (trimmed.startsWith("/")) {
      const cmd = trimmed.split(" ")[0].toLowerCase();
      if (cmd === "/new") { onNewTab?.(); setInput(""); return; }
      if (cmd === "/clear") { sendMessage("/new"); setInput(""); return; }
    }
    sendMessage(trimmed); setInput(""); setShowCommands(false);
  }, [input, isStreaming, sendMessage, onNewTab]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showCommands && filteredCommands.length > 0) {
        setInput(filteredCommands[selectedCmdIdx].cmd + " "); setShowCommands(false); inputRef.current?.focus(); return;
      }
      handleSend();
    }
    if (showCommands) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedCmdIdx(i => Math.min(i + 1, filteredCommands.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedCmdIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Escape") setShowCommands(false);
    }
  };

  const modelName = activeProvider?.models?.find(m => m.id === tab.modelId)?.name || tab.modelId || "Auto";
  const providerLabel = activeProvider?.label || tab.providerId;

  const composerEl = (
    <div className="relative">
      {showCommands && (
        <div className="ui-popover slide-up absolute bottom-full mb-2 left-0 right-0 max-h-[260px] overflow-y-auto">
          {filteredCommands.map((c, i) => (
            <button key={c.cmd} className="ui-menu-item" data-active={i === selectedCmdIdx}
              onClick={() => { setInput(c.cmd + " "); setShowCommands(false); inputRef.current?.focus(); }}>
              <c.icon size={14} className="shrink-0" />
              <span className="font-medium">{c.cmd}</span>
              <span className="ml-auto text-[12px] text-[var(--text-3)]">{c.desc}</span>
            </button>
          ))}
          {filteredCommands.length === 0 && <div className="px-3 py-3 text-[12.5px] text-[var(--text-3)] text-center">No commands</div>}
        </div>
      )}
      <div className="ui-composer">
        <div className="flex items-end gap-2 px-3 pt-2.5 pb-1.5">
          <button className="ui-iconbtn no-drag shrink-0 mb-0.5" title="Attach"><Paperclip size={17} /></button>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Message Hermes…   (press / for commands)" rows={1}
            className="flex-1 bg-transparent text-[14.5px] text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none max-h-[200px] leading-relaxed py-1.5" />
          {isStreaming ? (
            <button onClick={abortStream} className="ui-btn ui-btn-secondary !w-9 !h-9 !p-0 rounded-[11px] shrink-0" title="Stop"><Square size={13} fill="currentColor" /></button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()} className="ui-btn ui-btn-primary !w-9 !h-9 !p-0 rounded-[11px] shrink-0" title="Send"><ArrowUp size={17} strokeWidth={2.4} /></button>
          )}
        </div>
        <div className="ui-composer-bar">
          {TOOLS_ROW.map(t => (
            <button key={t.label} className="ui-pill no-drag" onClick={() => { setInput(t.cmd); inputRef.current?.focus(); }}>
              <t.icon size={13} className="shrink-0" /> {t.label}
            </button>
          ))}
          <span className="ui-model-chip ml-auto">{providerLabel} · {modelName}</span>
        </div>
      </div>
      {(isStreaming || tokenUsage.totalTokens > 0) && (
        <div className="flex items-center gap-3 mt-2 px-1.5 text-[11.5px] text-[var(--text-3)]">
          {isStreaming && <span className="flex items-center gap-1.5 text-[var(--accent-text)]"><StatusDot color="var(--accent)" pulse /> Streaming</span>}
          {tokenUsage.totalTokens > 0 && <span className="ml-auto font-mono">{tokenUsage.totalTokens.toLocaleString()} tokens{(tokenUsage.cost ?? 0) > 0 ? ` · $${(tokenUsage.cost ?? 0).toFixed(4)}` : ""}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="ui-topbar drag flex items-center gap-3 h-14 px-5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-[14px] font-semibold text-[var(--text)] truncate">{tab.name || "New chat"}</span>
        </div>
        <div className="no-drag flex items-center gap-2">
          <select className="ui-select w-auto !h-8 text-[12.5px]" value={tab.providerId} onChange={e => onUpdateProvider?.(tab.id, e.target.value as ProviderId)}>
            {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className="ui-select w-auto !h-8 text-[12.5px] max-w-[150px]" value={tab.modelId} onChange={e => onUpdateModel?.(tab.id, e.target.value)}>
            <option value="">Auto</option>
            {activeProvider?.models?.map(m => <option key={m.id} value={m.id}>{m.name}</option>) || null}
          </select>
          {allTabs.length > 1 && (
            <div className="ui-segment ml-1">
              {allTabs.map(t => <button key={t.id} className="ui-segment-item" data-active={t.id === tab.id} onClick={() => onSelectTab?.(t.id)}>{t.name}</button>)}
            </div>
          )}
          <IconButton onClick={onNewTab} title="New chat"><Plus size={16} /></IconButton>
        </div>
      </header>

      {messages.length === 0 ? (
        /* Empty state — a fuller workspace hero: greeting · composer · quick actions · recents */
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center px-6 pt-[6vh] pb-16 gap-10">
            <div className="w-full max-w-[760px] flex flex-col items-center fade-in">
              <BrandMedallion size={76} className="mb-6" />
              <h1 className="serif text-center text-[var(--text)]" style={{ fontSize: "clamp(34px, 4.2vw, 47px)", lineHeight: 1.04 }}>{greeting()}</h1>
              <p className="text-[14px] text-[var(--text-2)] mt-3 text-center max-w-md">
                Ask Hermes to write code, search the web, run tools, and orchestrate work. Press <kbd className="ui-kbd">/</kbd> for commands.
              </p>
              <div className="w-full mt-7">{composerEl}</div>
            </div>

            <div className="w-full max-w-[980px] flex flex-col gap-8">
              <section>
                <div className="ui-rail-label mb-3">Quick actions</div>
                <div className="grid grid-cols-3 gap-2.5 stagger">
                  {SUGGESTIONS.map(s => (
                    <button key={s.label} onClick={() => { setInput(s.cmd); inputRef.current?.focus(); }} className="ui-suggest no-drag">
                      <span className="ui-suggest-icon"><s.icon size={16} /></span>
                      <span className="ui-suggest-text">
                        <span className="ui-suggest-title truncate">{s.label}</span>
                        <span className="ui-suggest-desc truncate">{s.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="ui-rail-label mb-3">Recent sessions</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {RECENTS.map(r => (
                    <button key={r.title} onClick={() => onSelectTab?.(tab.id)} className="ui-suggest no-drag">
                      <span className="ui-suggest-icon"><r.icon size={16} /></span>
                      <span className="ui-suggest-text">
                        <span className="ui-suggest-title truncate">{r.title}</span>
                        <span className="ui-suggest-desc truncate">{r.meta}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : (
        /* Conversation — messages scroll, composer docked at the bottom */
        <>
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="max-w-3xl mx-auto flex flex-col gap-5">
              {messages.map((msg, i) => <ChatMessageBubble key={i} message={msg} isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"} />)}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="px-5 pb-5 pt-1 shrink-0">
            <div className="max-w-3xl mx-auto">{composerEl}</div>
          </div>
        </>
      )}
    </div>
  );
}
