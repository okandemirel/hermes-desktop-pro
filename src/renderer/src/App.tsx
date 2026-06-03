import { useState, useCallback } from "react";
import {
  MessageSquare, Clock, User, Brain, Cpu, HardDrive,
  Heart, Wrench, Calendar, Radio, Layout, Settings, Zap, Box, Package, Search
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
import type { ChatTab, ProviderId, ProviderInfo } from "@shared/types";

type NavScreen = "chat" | "sessions" | "profiles" | "providers" | "skills" | "models" | "memory" | "soul" | "tools" | "schedules" | "gateway" | "kanban" | "office" | "settings";

const NAV_ITEMS: { id: NavScreen; label: string; icon: typeof MessageSquare; section?: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "sessions", label: "Sessions", icon: Clock },
  { id: "profiles", label: "Profiles", icon: User, section: "agents" },
  { id: "providers", label: "Providers", icon: Cpu },
  { id: "skills", label: "Skills", icon: Package },
  { id: "models", label: "Models", icon: Box },
  { id: "memory", label: "Memory", icon: HardDrive },
  { id: "soul", label: "Soul", icon: Heart },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "schedules", label: "Schedules", icon: Calendar },
  { id: "gateway", label: "Gateway", icon: Radio },
  { id: "kanban", label: "Kanban", icon: Layout },
  { id: "office", label: "Office", icon: Zap },
  { id: "settings", label: "Settings", icon: Settings, section: "bottom" },
];

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

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const handleNewTab = useCallback(() => {
    const tab = createTab(activeTab.providerId);
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    setActiveScreen("chat");
  }, [activeTab.providerId]);

  const handleCloseTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const fresh = createTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }
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

  const getActiveIcon = (id: NavScreen) => {
    const item = NAV_ITEMS.find(n => n.id === id);
    return item?.icon || MessageSquare;
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case "chat":
        return <ChatView tab={activeTab} providers={providers} allTabs={tabs}
          onClose={handleCloseTab} onNewTab={handleNewTab} onSelectTab={setActiveTabId}
          onUpdateProvider={handleUpdateProvider} onUpdateModel={handleUpdateModel} />;
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
      default: return <ChatView tab={activeTab} providers={providers} allTabs={tabs}
        onClose={handleCloseTab} onNewTab={handleNewTab} onSelectTab={setActiveTabId}
        onUpdateProvider={handleUpdateProvider} onUpdateModel={handleUpdateModel} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0D0D0D] overflow-hidden">
      {/* Sidebar */}
      <div className={`flex flex-col shrink-0 border-r border-white/5 bg-[#0D0D0D] transition-all duration-200 ${collapsed ? "w-[52px]" : "w-[220px]"}`}>
        {/* Traffic light spacer (macOS) */}
        <div className="h-[38px] shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />

        {/* Logo */}
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0A84FF] flex items-center justify-center shrink-0">
            <Zap size={14} className="text-white" fill="currentColor" />
          </div>
          {!collapsed && <span className="text-sm font-semibold text-white tracking-tight">Hermes Pro</span>}
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {NAV_ITEMS.filter(n => n.section !== "bottom").map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveScreen(item.id); if (item.id === "chat") setCollapsed(false); }}
              className={`w-full flex items-center gap-2.5 rounded-lg transition-all duration-150 ${
                collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"
              } ${
                activeScreen === item.id
                  ? "bg-[#0A84FF]/10 text-[#0A84FF]"
                  : "text-white/35 hover:text-white/60 hover:bg-white/5"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} className="shrink-0" />
              {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Bottom items */}
        <div className="px-2 py-2 border-t border-white/5 space-y-0.5">
          {NAV_ITEMS.filter(n => n.section === "bottom").map(item => (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`w-full flex items-center gap-2.5 rounded-lg transition-all duration-150 ${
                collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"
              } ${
                activeScreen === item.id
                  ? "bg-[#0A84FF]/10 text-[#0A84FF]"
                  : "text-white/35 hover:text-white/60 hover:bg-white/5"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} className="shrink-0" />
              {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
            </button>
          ))}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-white/20 hover:text-white/40 hover:bg-white/5 transition-all"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {!collapsed && <span className="text-[13px] font-medium truncate">Collapse</span>}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {renderScreen()}
      </div>
    </div>
  );
}
