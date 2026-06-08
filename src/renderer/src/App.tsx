import { useState, useCallback, useEffect, useRef } from "react";
import {
  MessageSquare, Clock, User, Brain, Cpu, HardDrive,
  Heart, Wrench, Calendar, Radio, Layout, Box, Package,
  CalendarClock, PanelLeftClose, PanelLeft, Plus, FileText, Bell, HelpCircle, SlidersHorizontal, Settings, RefreshCw, Download,
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
import type { AppUpdateStatus, ChatTab, DispatchMode, ProfileDispatchTarget, ProviderId, ProviderInfo } from "@shared/types";
import { getAllProviders } from "@shared/providers";
import { sessionHistoryToChatMessages } from "./sessionHistory";

type NavScreen = "chat" | "sessions" | "profiles" | "providers" | "skills" | "models" | "memory" | "soul" | "tools" | "schedules" | "cronJobs" | "gateway" | "kanban" | "office" | "settings";
type NavItem = { id: NavScreen; label: string; icon: typeof MessageSquare; shortcut?: string };
type SidebarSession = {
  id: string;
  title: string;
  startedAt: number;
};
type SidebarSessionSource = {
  id: string;
  title: string | null;
  startedAt: number;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Navigation", items: [
    { id: "chat", label: "Chat", icon: MessageSquare, shortcut: "⌘1" },
    { id: "sessions", label: "Sessions", icon: Clock, shortcut: "⌘2" },
    { id: "tools", label: "Tools", icon: Wrench, shortcut: "⌘3" },
  ] },
  { label: "Agents", items: [
    { id: "profiles", label: "Profiles", icon: User },
    { id: "skills", label: "Skills", icon: Package },
    { id: "soul", label: "Soul", icon: Heart },
  ] },
  { label: "Knowledge", items: [
    { id: "memory", label: "Memory", icon: HardDrive },
    { id: "models", label: "Models", icon: Box },
  ] },
  { label: "Integrations", items: [
    { id: "providers", label: "Providers", icon: Cpu },
    { id: "gateway", label: "Gateway", icon: Radio },
    { id: "office", label: "Office", icon: Brain },
  ] },
  { label: "Operations", items: [
    { id: "schedules", label: "Schedules", icon: Calendar },
    { id: "cronJobs", label: "Cron Jobs", icon: CalendarClock },
    { id: "kanban", label: "Kanban", icon: Layout },
    { id: "settings", label: "Settings", icon: Settings },
  ] },
];

let tabCounter = 1;
function createTab(providerId: ProviderId = "opencode-zen"): ChatTab {
  return { id: `tab-${tabCounter++}`, name: `Chat ${tabCounter - 1}`, providerId, modelId: "" };
}

function sidebarSessionTitle(id: string, title: string | null): string {
  const trimmed = (title || "").trim();
  return trimmed || `Session ${id.slice(-6)}`;
}

function sidebarSessionMeta(startedAt: number): string {
  if (!startedAt) return "";
  const date = new Date(startedAt * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const key = date.toISOString().slice(0, 10);
  if (key === today.toISOString().slice(0, 10)) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (key === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function App() {
  const [activeScreen, setActiveScreen] = useState<NavScreen>("chat");
  const [tabs, setTabs] = useState<ChatTab[]>([createTab("opencode-zen")]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [providers] = useState<ProviderInfo[]>(getAllProviders);
  const [collapsed, setCollapsed] = useState(false);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; mode: string }>({ ok: false, mode: "local" });
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [recentSessions, setRecentSessions] = useState<SidebarSession[]>([]);
  const navRefs = useRef<Record<NavScreen, HTMLButtonElement | null>>({} as Record<NavScreen, HTMLButtonElement | null>);

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

  useEffect(() => {
    if (collapsed) return;
    const node = navRefs.current[activeScreen];
    const scroller = node?.closest(".ui-sidebar-nav");
    if (!node || !scroller) return;
    const itemRect = node.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    if (itemRect.top < scrollRect.top || itemRect.bottom > scrollRect.bottom) {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeScreen, collapsed]);

  useEffect(() => {
    let cancelled = false;
    window.hermes.listSessions(5, 0)
      .then((rows: SidebarSessionSource[]) => {
        if (cancelled) return;
        setRecentSessions((rows || []).map(row => ({
          id: row.id,
          title: sidebarSessionTitle(row.id, row.title),
          startedAt: row.startedAt,
        })));
      })
      .catch(() => {
        if (!cancelled) setRecentSessions([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.hermes.getAppUpdateStatus()
      .then((status: AppUpdateStatus) => {
        if (!cancelled) setUpdateStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setUpdateStatus({
            phase: "error",
            currentVersion: "",
            canCheck: true,
            canInstall: false,
            message: "Update status is unavailable.",
          });
        }
      });
    const unsubscribe = window.hermes.onAppUpdateStatus((status: AppUpdateStatus) => {
      if (!cancelled) setUpdateStatus(status);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
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
      if (prev.length <= 1) return prev;
      const closingIndex = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        const fallbackIndex = Math.max(0, Math.min(closingIndex, next.length - 1));
        setActiveTabId(next[fallbackIndex].id);
      }
      return next;
    });
  }, [activeTabId]);

  const handleUpdateProvider = useCallback((tabId: string, providerId: ProviderId) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, providerId, modelId: "" } : t));
  }, []);
  const handleUpdateModel = useCallback((tabId: string, modelId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, modelId } : t));
  }, []);

  const handleUpdateDispatch = useCallback((tabId: string, mode: DispatchMode, targets: ProfileDispatchTarget[]) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, dispatchMode: mode, dispatchTargets: targets } : t));
  }, []);

  const handleAppUpdate = useCallback(async () => {
    try {
      const next = updateStatus?.phase === "downloaded"
        ? await window.hermes.installAppUpdate()
        : await window.hermes.checkForAppUpdates();
      setUpdateStatus(next);
    } catch (error) {
      setUpdateStatus(prev => ({
        phase: "error",
        currentVersion: prev?.currentVersion || "",
        canCheck: true,
        canInstall: false,
        message: error instanceof Error ? error.message : "Update check failed.",
      }));
    }
  }, [updateStatus?.phase]);

  const renderUpdateButton = () => {
    const phase = updateStatus?.phase || "idle";
    const active = ["checking", "available", "downloading", "downloaded", "installing", "error"].includes(phase);
    const busy = phase === "checking" || phase === "available" || phase === "downloading" || phase === "installing";
    const title = updateStatus?.message || (
      phase === "downloaded" ? "Install downloaded update" : "Check for updates"
    );
    const Icon = phase === "downloaded" ? Download : RefreshCw;

    return (
      <button
        className={cx("ui-sidebar-update no-drag", active && "is-active", phase === "downloaded" && "is-ready", phase === "error" && "is-error")}
        onClick={handleAppUpdate}
        title={title}
        disabled={busy}
        aria-label={title}
      >
        <Icon size={14.5} className={busy ? "animate-spin" : undefined} />
      </button>
    );
  };

  // Open a stored session in Chat: open a fresh tab seeded with the session id
  // (useChatStream resumes from tab.sessionId) and switch to the Chat screen.
  const handleResumeSession = useCallback(async (sessionId: string, title?: string) => {
    const existing = tabs.find(t => t.sessionId === sessionId);
    if (existing?.messages?.length) {
      setActiveTabId(existing.id);
      setActiveScreen("chat");
      return;
    }

    const providerId = activeTab.providerId;
    if (existing) {
      setActiveTabId(existing.id);
      setActiveScreen("chat");
    }

    let messages: ChatTab["messages"] = [];
    try {
      const history = await window.hermes.getSessionMessages(sessionId);
      messages = sessionHistoryToChatMessages(sessionId, history);
    } catch {
      messages = [];
    }

    if (existing) {
      setTabs(prev => prev.map(t => (
        t.id === existing.id
          ? { ...t, name: title || t.name, messages }
          : t
      )));
      return;
    }

    const tab: ChatTab = {
      ...createTab(providerId),
      sessionId,
      name: title || "Resumed chat",
      messages,
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    setActiveScreen("chat");
  }, [activeTab.providerId, tabs]);

  const renderScreen = () => {
    switch (activeScreen) {
      case "chat": return <ChatView tab={activeTab} providers={providers} allTabs={tabs} onClose={handleCloseTab} onNewTab={handleNewTab} onSelectTab={setActiveTabId} onUpdateProvider={handleUpdateProvider} onUpdateModel={handleUpdateModel} onUpdateDispatch={handleUpdateDispatch} onOpenTools={() => setActiveScreen("tools")} onOpenMemory={() => setActiveScreen("memory")} onOpenModels={() => setActiveScreen("models")} onOpenSessions={() => setActiveScreen("sessions")} onOpenSettings={() => setActiveScreen("settings")} />;
      case "sessions": return <SessionsView onResumeSession={handleResumeSession} onNewSession={handleNewTab} />;
      case "profiles": return <ProfilesView />;
      case "providers": return <ProvidersView providers={providers} />;
      case "skills": return <SkillsView />;
      case "models": return <ModelsView />;
      case "memory": return <MemoryView />;
      case "soul": return <SoulEditor />;
      case "tools": return <ToolsView />;
      case "schedules": return <SchedulesView />;
      case "cronJobs": return <SettingsView initialSection="cronJobs" standaloneSection />;
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
        ref={node => { navRefs.current[item.id] = node; }}
        onClick={() => setActiveScreen(item.id)} title={collapsed ? item.label : undefined}>
        <item.icon size={17} className="shrink-0" strokeWidth={active ? 2.2 : 1.9} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && item.shortcut && <span className="ui-nav-shortcut">{item.shortcut}</span>}
      </button>
    );
  };

  const renderCompactSectionDivider = (index: number) => (
    collapsed && index > 0 ? <div className="mx-auto my-1 h-px w-5 bg-[var(--border)]" /> : null
  );

  return (
    <div className="ui-shell flex overflow-hidden">
      <div className="ui-window-title drag">Hermes Desktop Pro</div>
      <aside className={cx("ui-sidebar flex flex-col shrink-0 transition-[width] duration-200", collapsed ? "w-[68px]" : "w-[276px]")}>
        <div className="h-[30px] shrink-0 drag" />
        <div className={cx("ui-sidebar-brand drag", collapsed ? "justify-center px-0" : "gap-3 px-6")}>
          <BrandMark size={collapsed ? 22 : 25} />
          {!collapsed && <HermesWordmark size={22} />}
          {!collapsed && <span className="ml-auto ui-tag ui-tag-gold no-drag">PRO</span>}
          {!collapsed && renderUpdateButton()}
          {!collapsed && (
            <button className="ui-sidebar-collapse no-drag" onClick={() => setCollapsed(true)} title="Collapse">
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>

        <div className={cx("no-drag ui-sidebar-new-wrap", collapsed ? "px-2 flex justify-center" : "px-6")}>
          {collapsed ? (
            <button className="ui-iconbtn" title="New chat" onClick={handleNewTab}><Plus size={18} /></button>
          ) : (
            <button className="ui-sidebar-new ui-btn ui-btn-secondary ui-btn-sm w-full" onClick={handleNewTab}>
              <Plus size={17} strokeWidth={2.2} /> New chat <span className="ml-auto ui-nav-shortcut">⌘N</span>
            </button>
          )}
        </div>

        <nav className="ui-sidebar-nav flex-1 min-h-0 overflow-y-auto flex flex-col">
          {NAV_GROUPS.map((g, gi) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              {!collapsed ? <div className="ui-navgroup-label">{g.label}</div> : renderCompactSectionDivider(gi)}
              {g.items.map(renderNav)}
            </div>
          ))}

          {!collapsed && (
            <div className="ui-sidebar-recents flex flex-col gap-0.5">
              <div className="ui-navgroup-label">Recent Sessions</div>
              {recentSessions.map(session => (
                <button
                  key={session.id}
                  className="ui-recent-session no-drag"
                  onClick={() => {
                    handleResumeSession(session.id, session.title);
                  }}
                >
                  <FileText size={14} className="shrink-0" />
                  <span className="truncate">{session.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--text-3)]">{sidebarSessionMeta(session.startedAt)}</span>
                </button>
              ))}
              <button className="ui-recent-session no-drag" onClick={() => setActiveScreen("sessions")}>
                <span className="truncate">View all sessions</span>
              </button>
            </div>
          )}
        </nav>

        <div className="ui-sidebar-footer">
          {!collapsed && (
            <button className="ui-connection-card no-drag" onClick={() => setActiveScreen("gateway")}>
              <span className="ui-connection-orb"><StatusDot color={connStatus.ok ? "var(--success)" : "var(--warning)"} pulse={connStatus.ok} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[var(--text)] truncate leading-tight">{connStatus.ok ? "Connected" : "Disconnected"}</div>
                <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">{connStatus.ok ? "All systems operational" : `${connLabel} unavailable`}</div>
              </div>
              <StatusDot color={connStatus.ok ? "var(--success)" : "var(--error)"} />
            </button>
          )}
          <div className="ui-sidebar-footer-actions no-drag">
            <button onClick={() => setActiveScreen("settings")} title="Settings"><SlidersHorizontal size={17} /></button>
            <button onClick={() => setActiveScreen("schedules")} title="Activity"><Bell size={17} /></button>
            <button onClick={() => setActiveScreen("tools")} title="Help"><HelpCircle size={17} /></button>
            <button className="ui-footer-identity" onClick={() => setActiveScreen("chat")} title="Hermes">H</button>
            {collapsed && <button onClick={() => setCollapsed(false)} title="Expand"><PanelLeft size={17} /></button>}
          </div>
        </div>
      </aside>

      <main className="ui-main flex-1 min-w-0 overflow-hidden" data-screen={activeScreen}>
        <div key={activeScreen} className="pane-swap">{renderScreen()}</div>
      </main>
    </div>
  );
}
