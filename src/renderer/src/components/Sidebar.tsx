// Sidebar is no longer used — navigation is integrated into App.tsx.
// Keeping this file as a reference/fallback.
import { MessageSquare, History, Server, Users, Settings, Sun, Moon } from "./Icons";

export type ViewId = "chat" | "sessions" | "providers" | "profiles" | "settings";

interface Props { activeView: ViewId; onNavigate: (v: ViewId) => void; theme: "dark"|"light"; onToggleTheme: () => void }

const NAV: Array<{id:ViewId;label:string;icon:typeof MessageSquare}> = [
  {id:"chat",label:"Chat",icon:MessageSquare},{id:"sessions",label:"Sessions",icon:History},
  {id:"providers",label:"Providers",icon:Server},{id:"profiles",label:"Profiles",icon:Users},
  {id:"settings",label:"Settings",icon:Settings},
];

export function Sidebar({ activeView, onNavigate, theme, onToggleTheme }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="sidebar-brand-name">Hermes Pro</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(item => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              className={`sidebar-nav-item${active ? " active" : ""}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button onClick={onToggleTheme} className="sidebar-nav-item" style={{width:"100%"}}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>
    </aside>
  );
}
