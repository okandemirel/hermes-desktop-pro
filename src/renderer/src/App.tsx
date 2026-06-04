import { useState, useCallback, useEffect } from "react";
import {
  MessageSquare, Clock, User, Brain, Cpu, HardDrive,
  Heart, Wrench, Calendar, Radio, Layout, Settings, Box, Package,
  PanelLeftClose, PanelLeft, Plus,
} from "lucide-react";
import ChatView from "./components/ChatView";
import SessionsView from "./components/SessionsView";
import ProfilesView from "./components/ProfilesView";
import { ProvidersView } from "./components/ProvidersView";
import SettingsView from "./components/SettingsView";
import SkillsView from "./screens/Skills/Skills";
import ModelsView from "./screens/Models/Models";
import MemoryView from "./screens/Memory/Memory";
import SoulEditor from "./screens/Soul/Soul";
import ToolsView from "./screens/Tools/Tools";
import SchedulesView from "./screens/Schedules/Schedules";
import GatewayView from "./screens/Gateway/Gateway";
import KanbanView from "./screens/Kanban/Kanban";
import OfficeView from "./screens/Office/Office";
import { BrandMark, HermesWordmark } from "./components/BrandMark";
import { cx, StatusDot } from "./ui";
import type { ChatTab, ProviderId, ProviderInfo } from "@shared/types";

type NavScreen = "chat" | "sessions" | "profiles" | "providers" | "skills" | "models" | "memory" | "soul" | "tools" | "schedules" | "gateway" | "kanban" | "office" | "settings";
type NavItem = { id: NavScreen; label: string; icon: typeof MessageSquare };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Workspace", items: [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "sessions", label: "Sessions", icon: Clock },
    { id: "profiles", label: "Profiles", icon: User },
  ] },
  { label: "Intelligence", items: [
    { id: "providers", label: "Providers", icon: Cpu },
    { id: "models", label: "Models", icon: Box },
    { id: "skills", label: "Skills", icon: Package },
    { id: "memory", label: "Memory", icon: HardDrive },
    { id: "soul", label: "Soul", icon: Heart },
  ] },
  { label: "Automation", items: [
    { id: "tools", label: "Tools", icon: Wrench },
    { id: "schedules", label: "Schedules", icon: Calendar },
    { id: "gateway", label: "Gateway", icon: Radio },
    { id: "kanban", label: "Kanban", icon: Layout },
    { id: "office", label: "Office", icon: Brain },
  ] },
];
const SETTINGS_ITEM: NavItem = { id: "settings", label: "Settings", icon: Settings };

const MOCK_PROVIDERS: ProviderInfo[] = [
  { id: "openrouter", label: "OpenRouter", capabilities: { streaming: true, reasoning: true, vision: true, toolUse: true, maxContextTokens: 200000 }, models: [{ id: "deepseek/deepseek-v4", name: "DeepSeek V4" }] },
  { id: "anthropic", label: "Anthropic", capabilities: { streaming: true, reasoning: true, vision: true, toolUse: true, maxContextTokens: 200000 }, models: [{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" }, { id: "claude-opus-4-20250514", name: "Claude Opus 4" }] },
  { id: "deepseek", label: "DeepSeek", capabilities: { streaming: true, reasoning: true, vision: false, toolUse: true, maxContextTokens: 128000 }, models: [{ id: "deepseek-v4", name: "DeepSeek V4" }] },
  { id: "opencode-zen", label: "OpenCode Zen", capabilities: { streaming: true, reasoning: true, vision: false, toolUse: true, maxContextTokens: 128000 }, models: [{ id: "opencode/zen", name: "OpenCode Zen" }] },
  { id: "opencode-go", label: "OpenCode Go", capabilities: { streaming: true, reasoning: true, vision: false, toolUse: true, maxContextTokens: 128000 }, models: [{ id: "opencode/go", name: "OpenCode Go" }] },
  { id: "openai", label: "OpenAI", capabilities: { streaming: true, reasoning: true, vision: true, toolUse: true, maxContextTokens: 128000 }, models: [{ id: "gpt-4o", name: "GPT-4o" }] },
  { id: "google", label: "Google Gemini", capabilities: { streaming: true, reasoning: true, vision: true, toolUse: true, maxContextTokens: 1000000 }, models: [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }] },
];

let tabCounter = 1;
function createTab(providerId: ProviderId = "opencode-zen"): ChatTab {
  return { id: `tab-${tabCounter++}`, name: `Chat ${tabCounter - 1}`, providerId, modelId: "" };
}

export default function App() {
  const [activeScreen, setActiveScreen] = useState<NavScreen>("chat");
  const [tabs, setTabs] = useState<ChatTab[]>([createTab("opencode-zen")]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [providers] = useState<ProviderInfo[]>(MOCK_PROVIDERS);
  const [collapsed, setCollapsed] = useState(false);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; mode: string }>({ ok: false, mode: "local" });

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Live connection status for the sidebar footer — poll every 10s.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await window.hermes.testConnection();
        if (!cancelled && r) setConnStatus({ ok: !!r.ok, mode: r.mode || "local" });
      } catch {
        if (!cancelled) setConnStatus(s => ({ ...s, ok: false }));
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const connLabel = connStatus.mode.charAt(0).toUpperCase() + connStatus.mode.slice(1);

  const handleNewTab = useCallback(() => {
    const tab = createTab(activeTab.providerId);
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    setActiveScreen("chat");
  }, [activeTab.providerId]);

  const handleCloseTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) { const fresh = createTab(); setActiveTabId(fresh.id); return [fresh]; }
      if (activeTabId === id) setActiveTabId(next[next.length - 1].id);
      return next;
    });
  }, [activeTabId]);

  const handleUpdateProvider = useCallback((tabId: string, providerId: ProviderId) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, providerId, modelId: "" } : t));
  }, []);
  const handleUpdateModel = useCallback((tabId: string, modelId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, modelId } : t));
  }, []);

  const renderScreen = () => {
    switch (activeScreen) {
      case "chat": return <ChatView tab={activeTab} providers={providers} allTabs={tabs} onClose={handleCloseTab} onNewTab={handleNewTab} onSelectTab={setActiveTabId} onUpdateProvider={handleUpdateProvider} onUpdateModel={handleUpdateModel} />;
      case "sessions": return <SessionsView />;
      case "profiles": return <ProfilesView />;
      case "providers": return <ProvidersView providers={providers} />;
      case "skills": return <SkillsView />;
      case "models": return <ModelsView />;
      case "memory": return <MemoryView />;
      case "soul": return <SoulEditor />;
      case "tools": return <ToolsView />;
      case "schedules": return <SchedulesView />;
      case "gateway": return <GatewayView />;
      case "kanban": return <KanbanView />;
      case "office": return <OfficeView />;
      case "settings": return <SettingsView />;
      default: return null;
    }
  };

  const renderNav = (item: NavItem) => {
    const active = activeScreen === item.id;
    return (
      <button key={item.id} className={cx("ui-nav no-drag", collapsed && "justify-center px-0")} data-active={active}
        onClick={() => setActiveScreen(item.id)} title={collapsed ? item.label : undefined}>
        <item.icon size={17} className="shrink-0" strokeWidth={active ? 2.2 : 1.9} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  return (
    <div className="ui-shell flex overflow-hidden">
      <aside className={cx("ui-sidebar flex flex-col shrink-0 transition-[width] duration-200", collapsed ? "w-[58px]" : "w-[232px]")}>
        <div className="h-[38px] shrink-0 drag" />
        <div className={cx("flex items-center h-12 drag", collapsed ? "justify-center px-0" : "gap-2.5 px-4")}>
          <BrandMark size={collapsed ? 22 : 25} />
          {!collapsed && <HermesWordmark />}
          {!collapsed && <span className="ml-auto ui-tag ui-tag-gold no-drag">PRO</span>}
        </div>
        {!collapsed && <hr className="ui-divider-gold mx-4 mt-1 mb-0.5" />}

        <div className={cx("no-drag", collapsed ? "px-2 pt-2 pb-1 flex justify-center" : "px-3 pt-2 pb-1")}>
          {collapsed ? (
            <button className="ui-iconbtn" title="New chat" onClick={handleNewTab}><Plus size={18} /></button>
          ) : (
            <button className="ui-btn ui-btn-primary ui-btn-sm w-full" onClick={handleNewTab}>
              <Plus size={15} strokeWidth={2.4} /> New chat
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-2.5">
          {NAV_GROUPS.map((g, gi) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              {!collapsed
                ? <div className="ui-navgroup-label">{g.label}</div>
                : gi > 0 && <div className="mx-auto my-1 h-px w-5 bg-[var(--border)]" />}
              {g.items.map(renderNav)}
            </div>
          ))}
        </nav>

        <div className="px-2.5 py-2 border-t border-[var(--border)] flex flex-col gap-0.5">
          {!collapsed && (
            <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1 no-drag">
              <BrandMark size={22} glow={false} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium text-[var(--text)] truncate leading-tight">Hermes Agent</div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] mt-0.5"><StatusDot color={connStatus.ok ? "var(--success)" : "var(--error)"} /> {connLabel} · {connStatus.ok ? "Connected" : "Disconnected"}</div>
              </div>
            </div>
          )}
          {renderNav(SETTINGS_ITEM)}
          <button className={cx("ui-nav no-drag", collapsed && "justify-center px-0")} onClick={() => setCollapsed(c => !c)} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <PanelLeft size={17} className="shrink-0" /> : <PanelLeftClose size={17} className="shrink-0" />}
            {!collapsed && <span className="truncate">Collapse</span>}
          </button>
        </div>
      </aside>

      <main className="ui-main flex-1 min-w-0 overflow-hidden">
        <div key={activeScreen} className="pane-swap">{renderScreen()}</div>
      </main>
    </div>
  );
}
