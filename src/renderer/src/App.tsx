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
import WelcomeView from "./screens/Welcome/Welcome";
import InstallView from "./screens/Install/Install";
import { BrandMark, HermesWordmark } from "./components/BrandMark";
import { cx, StatusDot } from "./ui";
import type { AppMenuCommand, AppUpdateStatus, ChatTab, DispatchMode, ProfileDispatchTarget, ProviderId, ProviderInfo } from "@shared/types";
import { getAllProviders } from "@shared/providers";
import { sessionHistoryToChatMessages } from "./sessionHistory";
import {
  applyAppearancePreferences,
  readAppearancePreferences,
  type ThemePreference,
} from "./themePreferences";
import type { SettingsSectionId } from "./components/SettingsView";

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

const MENU_SCREEN_COMMANDS: Partial<Record<AppMenuCommand, NavScreen>> = {
  "show-chat": "chat",
  "show-sessions": "sessions",
  "show-profiles": "profiles",
  "show-tools": "tools",
  "show-skills": "skills",
  "show-soul": "soul",
  "show-memory": "memory",
  "show-models": "models",
  "show-providers": "providers",
  "show-gateway": "gateway",
  "show-office": "office",
  "show-schedules": "schedules",
  "show-cron-jobs": "cronJobs",
  "show-kanban": "kanban",
};

const MENU_SETTINGS_COMMANDS: Partial<Record<AppMenuCommand, SettingsSectionId>> = {
  "show-settings": "general",
  "show-settings-general": "general",
  "show-settings-network": "network",
  "show-settings-providers": "providers",
  "show-settings-appearance": "appearance",
  "show-settings-backup": "backup",
  "show-settings-diagnostics": "diagnostics",
};

const MENU_THEME_COMMANDS: Partial<Record<AppMenuCommand, ThemePreference>> = {
  "set-theme-dark": "dark",
  "set-theme-light": "light",
  "set-theme-system": "system",
};

const MENU_ACCENT_COMMANDS: Partial<Record<AppMenuCommand, string>> = {
  "set-accent-gold": "#E7B84E",
  "set-accent-green": "#30D158",
  "set-accent-blue": "#0A84FF",
  "set-accent-purple": "#BF5AF2",
};

const SIDEBAR_LABEL_FADE_IN_DELAY_MS = 80;

const ONBOARDED_KEY = "hermes:onboarded";
type ChatReadiness = Awaited<ReturnType<typeof window.hermes.getChatReadiness>>;
type OnboardStep = "welcome" | "install";

function readOnboardedFlag(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboardedFlag(): void {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  } catch { /* ignore storage failures */ }
}

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
  const [sidebarLabelsVisible, setSidebarLabelsVisible] = useState(true);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; mode: string }>({ ok: false, mode: "local" });
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  // First-run onboarding gate: null until readiness resolves (no flash).
  const [readiness, setReadiness] = useState<ChatReadiness | null>(null);
  const [onboardDismissed, setOnboardDismissed] = useState(readOnboardedFlag);
  const [onboardStep, setOnboardStep] = useState<OnboardStep>("welcome");
  const [recentSessions, setRecentSessions] = useState<SidebarSession[]>([]);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("general");
  const navRefs = useRef<Record<NavScreen, HTMLButtonElement | null>>({} as Record<NavScreen, HTMLButtonElement | null>);
  const sidebarTimers = useRef<number[]>([]);
  // Latest committed tabs (read after awaits to avoid stale-closure misrouting)
  // and a monotonic token so only the most recent resume commits.
  const tabsRef = useRef(tabs);
  const resumeTokenRef = useRef(0);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const clearSidebarTimers = useCallback(() => {
    sidebarTimers.current.forEach(timer => window.clearTimeout(timer));
    sidebarTimers.current = [];
  }, []);

  const scheduleSidebarTimer = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      sidebarTimers.current = sidebarTimers.current.filter(active => active !== timer);
      callback();
    }, delay);
    sidebarTimers.current.push(timer);
  }, []);

  const setSidebarExpanded = useCallback((expanded: boolean) => {
    clearSidebarTimers();
    if (expanded) {
      setCollapsed(false);
      setSidebarLabelsVisible(false);
      scheduleSidebarTimer(() => setSidebarLabelsVisible(true), SIDEBAR_LABEL_FADE_IN_DELAY_MS);
      return;
    }

    setSidebarLabelsVisible(false);
    setCollapsed(true);
  }, [clearSidebarTimers, scheduleSidebarTimer]);

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded(collapsed);
  }, [collapsed, setSidebarExpanded]);

  useEffect(() => clearSidebarTimers, [clearSidebarTimers]);

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

  // First-run gate: resolve chat readiness on mount. Re-checked after any setup
  // action so a successful config dismisses the gate automatically.
  const recheckReadiness = useCallback(async () => {
    try {
      const r = await window.hermes.getChatReadiness();
      setReadiness(r);
      return r;
    } catch {
      const fallback: ChatReadiness = { ready: false, via: "none", reason: "Readiness check failed." };
      setReadiness(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => { void recheckReadiness(); }, [recheckReadiness]);

  const dismissOnboarding = useCallback(() => {
    markOnboardedFlag();
    setOnboardDismissed(true);
  }, []);

  // Remote / provider setup, or a finished local install: persist the flag,
  // re-check readiness, and drop into the app.
  const finishOnboarding = useCallback(() => {
    markOnboardedFlag();
    setOnboardDismissed(true);
    void recheckReadiness();
  }, [recheckReadiness]);

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

  const refreshRecents = useCallback(() => {
    window.hermes.listSessions(5, 0)
      .then((rows: SidebarSessionSource[]) => {
        setRecentSessions((rows || []).map(row => ({
          id: row.id,
          title: sidebarSessionTitle(row.id, row.title),
          startedAt: row.startedAt,
        })));
      })
      .catch(() => { /* keep last known recents */ });
  }, []);

  useEffect(() => { refreshRecents(); }, [refreshRecents]);

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

  // Write a freshly-resolved backend session id back onto its tab so resuming
  // the same conversation focuses this live tab instead of opening a duplicate,
  // and refresh the sidebar so new chats show up under Recent Sessions.
  const handleUpdateSession = useCallback((tabId: string, sessionId: string) => {
    setTabs(prev => prev.map(t => (t.id === tabId && t.sessionId !== sessionId ? { ...t, sessionId } : t)));
    refreshRecents();
  }, [refreshRecents]);

  const openSettings = useCallback((section: SettingsSectionId = "general") => {
    setSettingsSection(section);
    setActiveScreen("settings");
  }, []);

  const updateAppearance = useCallback((patch: Partial<{ theme: ThemePreference; accent: string }>) => {
    const next = applyAppearancePreferences({
      ...readAppearancePreferences(),
      ...patch,
    });
    window.dispatchEvent(new CustomEvent("hermes:appearance-updated", { detail: next }));
  }, []);

  useEffect(() => {
    return window.hermes.onAppMenuCommand((command: AppMenuCommand) => {
      if (command === "new-chat") {
        handleNewTab();
        return;
      }

      if (command === "toggle-sidebar") {
        toggleSidebar();
        return;
      }

      const theme = MENU_THEME_COMMANDS[command];
      if (theme) {
        updateAppearance({ theme });
        return;
      }

      const accent = MENU_ACCENT_COMMANDS[command];
      if (accent) {
        updateAppearance({ accent });
        return;
      }

      const settings = MENU_SETTINGS_COMMANDS[command];
      if (settings) {
        openSettings(settings);
        return;
      }

      const screen = MENU_SCREEN_COMMANDS[command];
      if (screen) setActiveScreen(screen);
    });
  }, [handleNewTab, openSettings, toggleSidebar, updateAppearance]);

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

  const renderUpdateButton = (placement: "brand" | "dock" = "brand") => {
    const phase = updateStatus?.phase || "idle";
    const active = ["checking", "available", "downloading", "downloaded", "installing", "error"].includes(phase);
    const busy = phase === "checking" || phase === "available" || phase === "downloading" || phase === "installing";
    const canInteract = phase === "downloaded"
      ? updateStatus?.canInstall !== false
      : updateStatus?.canCheck !== false;
    const title = updateStatus?.message || (
      phase === "downloaded" ? "Install downloaded update" : "Check for updates"
    );
    const Icon = phase === "downloaded" ? Download : RefreshCw;

    return (
      <button
        className={cx("ui-sidebar-update no-drag", placement === "dock" && "is-compact", active && "is-active", phase === "downloaded" && "is-ready", phase === "error" && "is-error")}
        onClick={handleAppUpdate}
        title={placement === "dock" ? undefined : title}
        disabled={busy || !canInteract}
        aria-label={title}
      >
        <Icon size={14.5} className={busy ? "animate-spin" : undefined} />
      </button>
    );
  };

  // Open a stored session in Chat: open a fresh tab seeded with the session id
  // (useChatStream resumes from tab.sessionId) and switch to the Chat screen.
  const handleResumeSession = useCallback(async (sessionId: string, title?: string) => {
    setActiveScreen("chat");
    // Already open with content → just focus it, no reload needed.
    const open = tabsRef.current.find(t => t.sessionId === sessionId && t.messages?.length);
    if (open) { setActiveTabId(open.id); return; }

    // Guard against out-of-order IPC resolution: only the most recent resume
    // commits. Without this, clicking session B while A's load is in flight let
    // whichever read resolved LAST win the active tab ("sometimes doesn't load").
    const token = ++resumeTokenRef.current;
    let messages: ChatTab["messages"] = [];
    try {
      const history = await window.hermes.getSessionMessages(sessionId);
      messages = sessionHistoryToChatMessages(sessionId, history);
    } catch {
      messages = [];
    }
    if (token !== resumeTokenRef.current) return;

    // Re-derive the target from the LATEST tabs (not the pre-await snapshot) and
    // de-dup by sessionId so rapid clicks can't spawn duplicate tabs.
    const existing = tabsRef.current.find(t => t.sessionId === sessionId);
    if (existing) {
      setTabs(prev => prev.map(t => (t.id === existing.id ? { ...t, name: title || t.name, messages } : t)));
      setActiveTabId(existing.id);
      return;
    }
    const tab: ChatTab = {
      ...createTab(activeTab.providerId),
      sessionId,
      name: title || "Resumed chat",
      messages,
    };
    setTabs(prev => (prev.some(t => t.sessionId === sessionId) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  }, [activeTab.providerId]);

  const renderScreen = () => {
    switch (activeScreen) {
      case "chat": return <ChatView tab={activeTab} providers={providers} allTabs={tabs} onClose={handleCloseTab} onNewTab={handleNewTab} onSelectTab={setActiveTabId} onUpdateProvider={handleUpdateProvider} onUpdateModel={handleUpdateModel} onUpdateDispatch={handleUpdateDispatch} onUpdateSession={handleUpdateSession} onOpenTools={() => setActiveScreen("tools")} onOpenMemory={() => setActiveScreen("memory")} onOpenModels={() => setActiveScreen("models")} onOpenSessions={() => setActiveScreen("sessions")} onOpenSettings={() => setActiveScreen("settings")} />;
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
      case "settings": return <SettingsView initialSection={settingsSection} />;
      default: return null;
    }
  };

  const renderNav = (item: NavItem) => {
    const active = activeScreen === item.id;
    return (
      <button key={item.id} className={cx("ui-nav no-drag", collapsed && "is-compact")} data-active={active}
        ref={node => { navRefs.current[item.id] = node; }}
        onClick={() => setActiveScreen(item.id)} aria-label={collapsed ? item.label : undefined}>
        <item.icon size={17} className="shrink-0" strokeWidth={active ? 2.2 : 1.9} />
        <span className="ui-nav-label truncate">{item.label}</span>
        {item.shortcut && <span className="ui-nav-shortcut">{item.shortcut}</span>}
      </button>
    );
  };

  // First-run onboarding gate. Only mounts once readiness has resolved AND the
  // backend isn't chat-ready AND the user hasn't dismissed it — so the shell
  // never flashes before readiness loads.
  if (readiness !== null && !readiness.ready && !onboardDismissed) {
    return (
      <div className="ui-shell flex overflow-hidden">
        <div className="ui-window-title drag">Hermes Desktop Pro</div>
        <main className="ui-main flex-1 min-w-0 overflow-hidden">
          {onboardStep === "install" ? (
            <InstallView
              onComplete={finishOnboarding}
              onBack={() => setOnboardStep("welcome")}
            />
          ) : (
            <WelcomeView
              onContinueLocal={() => setOnboardStep("install")}
              onContinueRemote={finishOnboarding}
              onContinueProvider={finishOnboarding}
              onSkip={dismissOnboarding}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="ui-shell flex overflow-hidden">
      <div className="ui-window-title drag">Hermes Desktop Pro</div>
      <aside
        className={cx("ui-sidebar flex flex-col shrink-0", collapsed ? "w-[72px] is-collapsed" : "w-[276px]")}
        data-labels-visible={sidebarLabelsVisible ? "true" : "false"}
      >
        <div className="h-[30px] shrink-0 drag" />
        <div className="ui-sidebar-brand drag is-expanded">
          <BrandMark size={25} />
          <span className="ui-sidebar-label-fade ui-sidebar-wordmark"><HermesWordmark size={22} /></span>
          <span className="ml-auto ui-tag ui-tag-gold no-drag ui-sidebar-label-fade">PRO</span>
          <button className="ui-sidebar-collapse no-drag ui-sidebar-label-fade" onClick={() => setSidebarExpanded(false)} aria-label="Collapse sidebar">
            <PanelLeftClose size={17} />
          </button>
        </div>

        <div className={cx("no-drag ui-sidebar-new-wrap", collapsed ? "is-compact" : "is-expanded")}>
          <button className="ui-sidebar-new ui-btn ui-btn-secondary ui-btn-sm w-full" onClick={handleNewTab} aria-label="New chat">
            <Plus size={17} strokeWidth={2.2} /> <span className="ui-sidebar-label-fade">New chat</span> <span className="ml-auto ui-nav-shortcut ui-sidebar-label-fade">⌘N</span>
          </button>
        </div>

        <nav className="ui-sidebar-nav flex-1 min-h-0 overflow-y-auto flex flex-col">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <div className="ui-navgroup-label ui-sidebar-label-fade">{g.label}</div>
              {g.items.map(renderNav)}
            </div>
          ))}

          {!collapsed && (
            <div className="ui-sidebar-recents flex flex-col gap-0.5 ui-sidebar-label-fade">
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
            <button className="ui-connection-card no-drag ui-sidebar-label-fade" onClick={() => setActiveScreen("gateway")}>
              <span className="ui-connection-orb"><StatusDot color={connStatus.ok ? "var(--success)" : "var(--warning)"} pulse={connStatus.ok} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[var(--text)] truncate leading-tight">{connStatus.ok ? "Connected" : "Disconnected"}</div>
                <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">{connStatus.ok ? "All systems operational" : `${connLabel} unavailable`}</div>
              </div>
              <StatusDot color={connStatus.ok ? "var(--success)" : "var(--error)"} />
            </button>
          )}
          {collapsed ? (
            <div className="ui-sidebar-footer-compact no-drag">
              {renderUpdateButton("dock")}
              <button className="ui-sidebar-expand" onClick={() => setSidebarExpanded(true)} aria-label="Expand sidebar">
                <PanelLeft size={17} />
              </button>
            </div>
          ) : (
            <div className="ui-sidebar-footer-actions no-drag ui-sidebar-label-fade">
              {renderUpdateButton("dock")}
              <button onClick={() => setActiveScreen("settings")} aria-label="Settings"><SlidersHorizontal size={17} /></button>
              <button onClick={() => setActiveScreen("schedules")} aria-label="Activity"><Bell size={17} /></button>
              <button onClick={() => setActiveScreen("tools")} aria-label="Help"><HelpCircle size={17} /></button>
              <button className="ui-footer-identity" onClick={() => setActiveScreen("chat")} aria-label="Hermes">H</button>
            </div>
          )}
        </div>
      </aside>

      <main className="ui-main flex-1 min-w-0 overflow-hidden" data-screen={activeScreen}>
        <div key={activeScreen} className="pane-swap">{renderScreen()}</div>
      </main>
    </div>
  );
}
