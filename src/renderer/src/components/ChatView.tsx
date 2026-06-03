import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Send, Square, Plus, X, Zap, Terminal, Globe, Image, Code, Wrench, Brain, User, Clock, HelpCircle, Trash2, RotateCcw, Activity, Eye } from "lucide-react";
import type { ChatTab, ProviderId, ProviderInfo, TokenUsage } from "@shared/types";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { useChatStream } from "../hooks/useChatStream";

interface ChatViewProps {
  tab: ChatTab;
  providers: ProviderInfo[];
  allTabs: ChatTab[];
  onClose?: (id: string) => void;
  onNewTab?: () => void;
  onSelectTab?: (id: string) => void;
  onUpdateProvider?: (tabId: string, providerId: ProviderId) => void;
  onUpdateModel?: (tabId: string, modelId: string) => void;
}

const SLASH_COMMANDS = [
  { cmd: "/new", desc: "New conversation", icon: Plus },
  { cmd: "/clear", desc: "Clear and new session", icon: Trash2 },
  { cmd: "/fast", desc: "Toggle fast mode", icon: Zap },
  { cmd: "/web", desc: "Web search", icon: Globe },
  { cmd: "/image", desc: "Generate image", icon: Image },
  { cmd: "/browse", desc: "Open browser", icon: Globe },
  { cmd: "/code", desc: "Code execution", icon: Code },
  { cmd: "/shell", desc: "Terminal command", icon: Terminal },
  { cmd: "/usage", desc: "Token usage", icon: Activity },
  { cmd: "/tools", desc: "Manage tools", icon: Wrench },
  { cmd: "/skills", desc: "Browse skills", icon: Brain },
  { cmd: "/model", desc: "Change model", icon: Brain },
  { cmd: "/memory", desc: "View memory", icon: Brain },
  { cmd: "/persona", desc: "Edit persona", icon: User },
  { cmd: "/version", desc: "Show version", icon: HelpCircle },
  { cmd: "/compact", desc: "Compact context", icon: Zap },
  { cmd: "/undo", desc: "Undo last", icon: RotateCcw },
  { cmd: "/retry", desc: "Retry last", icon: RotateCcw },
  { cmd: "/debug", desc: "Debug info", icon: Eye },
  { cmd: "/status", desc: "Session status", icon: Clock },
];

export default function ChatView({ tab, providers, allTabs, onClose, onNewTab, onSelectTab, onUpdateProvider, onUpdateModel }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeProvider = providers.find(p => p.id === tab.providerId);

  const { messages, isStreaming, sendMessage, abortStream } = useChatStream({
    providerId: tab.providerId,
    modelId: tab.modelId,
    onTokenUsage: (usage: TokenUsage) => setTokenUsage(usage),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (input.startsWith("/")) {
      const q = input.slice(1).toLowerCase();
      const filtered = q ? SLASH_COMMANDS.filter(c => c.cmd.toLowerCase().includes(q)) : SLASH_COMMANDS;
      setFilteredCommands(filtered);
      setShowCommands(true);
      setSelectedCmdIdx(0);
    } else { setShowCommands(false); }
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    if (trimmed.startsWith("/")) {
      const cmd = trimmed.split(" ")[0].toLowerCase();
      if (cmd === "/new") { onNewTab?.(); setInput(""); return; }
      if (cmd === "/clear") { sendMessage("/new"); setInput(""); return; }
      if (cmd === "/usage") {
        const m = messages.slice(-2);
        sendMessage("/usage");
        setInput(""); return;
      }
    }
    sendMessage(trimmed);
    setInput("");
    setShowCommands(false);
  }, [input, isStreaming, sendMessage, onNewTab]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showCommands && filteredCommands.length > 0) {
        setInput(filteredCommands[selectedCmdIdx].cmd + " ");
        setShowCommands(false);
        inputRef.current?.focus();
        return;
      }
      handleSend();
    }
    if (showCommands) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedCmdIdx(i => Math.min(i + 1, filteredCommands.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedCmdIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Escape") { setShowCommands(false); }
    }
  };

  const handleCommandSelect = (cmd: string) => {
    setInput(cmd + " ");
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const modelName = activeProvider?.models?.find(m => m.id === tab.modelId)?.name || tab.modelId || "Select model";
  const providerLabel = activeProvider?.label || tab.providerId;

  return (
    <div className="flex flex-col h-full bg-[#0D0D0D]">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#0A84FF]/10 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-[#0A84FF]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{tab.name || "Chat"}</div>
            <div className="text-[11px] text-white/40">{providerLabel} · {modelName}</div>
          </div>
        </div>

        {/* Provider selector */}
        <select
          value={tab.providerId}
          onChange={e => onUpdateProvider?.(tab.id, e.target.value as ProviderId)}
          className="bg-[#1A1A1A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-[#0A84FF]/50 appearance-none cursor-pointer"
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        {/* Model selector */}
        <select
          value={tab.modelId}
          onChange={e => onUpdateModel?.(tab.id, e.target.value)}
          className="bg-[#1A1A1A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-[#0A84FF]/50 appearance-none cursor-pointer max-w-[140px]"
        >
          <option value="">Auto</option>
          {activeProvider?.models?.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          )) || null}
        </select>

        {/* Tabs */}
        <div className="flex items-center gap-1 ml-2">
          {allTabs.map(t => (
            <button
              key={t.id}
              onClick={() => onSelectTab?.(t.id)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                t.id === tab.id ? "bg-[#0A84FF]/15 text-[#0A84FF]" : "text-white/40 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              {t.name || "Chat"}
            </button>
          ))}
          <button onClick={onNewTab} className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#0A84FF]/5 flex items-center justify-center mb-6">
              <Zap size={36} className="text-[#0A84FF]/60" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Hermes Desktop Pro</h2>
            <p className="text-white/40 text-sm max-w-md mb-8">
              Start a conversation. Use <code className="text-[#0A84FF] bg-[#0A84FF]/10 px-1.5 py-0.5 rounded text-xs">/</code> for slash commands.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {["/web search", "/code python", "/image generate", "/model switch", "/tools manage", "/clear session"].map(s => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 rounded-full border border-white/10 text-xs text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <ChatMessageBubble key={i} message={msg} isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Slash command popup */}
      {showCommands && (
        <div className="mx-5 mb-1 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[240px] overflow-y-auto">
          {filteredCommands.map((c, i) => (
            <button
              key={c.cmd}
              onClick={() => handleCommandSelect(c.cmd)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                i === selectedCmdIdx ? "bg-[#0A84FF]/10" : "hover:bg-white/5"
              }`}
            >
              <c.icon size={14} className={i === selectedCmdIdx ? "text-[#0A84FF]" : "text-white/40"} />
              <span className={`text-sm ${i === selectedCmdIdx ? "text-[#0A84FF]" : "text-white/70"}`}>{c.cmd}</span>
              <span className="text-xs text-white/30 ml-auto">{c.desc}</span>
            </button>
          ))}
          {filteredCommands.length === 0 && (
            <div className="px-3 py-4 text-xs text-white/30 text-center">No commands found</div>
          )}
        </div>
      )}

      {/* Token usage footer */}
      {(tokenUsage.totalTokens > 0 || isStreaming) && (
        <div className="px-5 py-2 border-t border-white/5 flex items-center gap-4 text-[11px] text-white/30">
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-[#0A84FF]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF] animate-pulse" />
              Streaming
            </span>
          )}
          {tokenUsage.totalTokens > 0 && (
            <>
              <span>Prompt: <span className="text-white/50">{tokenUsage.promptTokens.toLocaleString()}</span></span>
              <span>Completion: <span className="text-white/50">{tokenUsage.completionTokens.toLocaleString()}</span></span>
              <span>Total: <span className="text-white/50">{tokenUsage.totalTokens.toLocaleString()}</span></span>
              {(tokenUsage.cost ?? 0) > 0 && (
                <span className="ml-auto">${(tokenUsage.cost ?? 0).toFixed(4)}</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Input */}
      <div className="px-5 pb-4 pt-2">
        <div className="flex items-end gap-3 bg-[#1A1A1A] border border-white/10 rounded-2xl px-4 py-3 focus-within:border-[#0A84FF]/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message Hermes... (type / for commands)`}
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none resize-none max-h-[200px]"
            style={{ scrollbarWidth: "thin" }}
          />
          {isStreaming ? (
            <button onClick={abortStream} className="shrink-0 w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()} className="shrink-0 w-9 h-9 rounded-xl bg-[#0A84FF] text-white flex items-center justify-center hover:bg-[#0A84FF]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
