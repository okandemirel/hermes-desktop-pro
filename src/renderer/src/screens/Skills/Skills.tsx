import { useState, useMemo } from "react";
import { Brain, Search, Plus, Trash2, Download, Sparkles } from "../../components/Icons";

// ─── Missing icons defined locally ──────────────────────────

function SvgIcon({ paths, circle, size = 16, style }: { paths: string[]; circle?: [number, number, number]; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {circle && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
const Package = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon paths={["M16.5 9.4 7.55 4.24", "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.29 7 12 12l8.71-5", "M12 22V12"]} {...p} />;

// ─── Types ──────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  author: string;
  isBundled: boolean;
  installed: boolean;
}

// ─── Mock data ──────────────────────────────────────────────

const MOCK_SKILLS: Skill[] = [
  { id: "hermes-agent", name: "Hermes Agent Config", description: "Configure Hermes Agent settings, profiles, and preferences", version: "1.0.0", tags: ["core", "config"], author: "Nous Research", isBundled: true, installed: true },
  { id: "code-interpreter", name: "Code Interpreter", description: "Execute Python, JavaScript, and shell code in a sandboxed environment", version: "2.1.3", tags: ["code", "sandbox", "python"], author: "Nous Research", isBundled: true, installed: true },
  { id: "file-browser", name: "File Browser", description: "Browse, read, write, and manage files on your system", version: "1.5.0", tags: ["files", "system", "io"], author: "Nous Research", isBundled: true, installed: true },
  { id: "web-search", name: "Web Search", description: "Search the web using multiple search engines and extract results", version: "3.0.1", tags: ["search", "web", "api"], author: "Community", isBundled: false, installed: true },
  { id: "git-assistant", name: "Git Assistant", description: "Intelligent Git operations with PR review and branch management", version: "1.2.0", tags: ["git", "vcs", "devops"], author: "Community", isBundled: false, installed: true },
  { id: "image-gen", name: "Image Generator", description: "Generate and edit images using DALL-E, Stable Diffusion, and Midjourney", version: "0.9.1", tags: ["image", "ai", "creative"], author: "Community", isBundled: false, installed: false },
  { id: "pdf-tools", name: "PDF Tools", description: "Extract text, merge, split, and analyze PDF documents", version: "2.0.0", tags: ["pdf", "documents", "parser"], author: "Community", isBundled: false, installed: false },
  { id: "database-explorer", name: "Database Explorer", description: "Connect to and query SQL and NoSQL databases with schema introspection", version: "1.8.2", tags: ["database", "sql", "nosql"], author: "Community", isBundled: false, installed: false },
];

// ─── Component ──────────────────────────────────────────────

export default function SkillsView() {
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<Skill[]>(MOCK_SKILLS);
  const [installId, setInstallId] = useState("");
  const [installing, setInstalling] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return skills;
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q)) ||
      s.author.toLowerCase().includes(q)
    );
  }, [query, skills]);

  const bundled = filtered.filter(s => s.isBundled);
  const custom = filtered.filter(s => !s.isBundled);
  const installedCount = skills.filter(s => s.installed).length;

  const toggleInstall = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, installed: !s.installed } : s));
  };

  const handleInstall = () => {
    const name = installId.trim();
    if (!name) return;
    setInstalling(true);
    setTimeout(() => {
      const newSkill: Skill = {
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        description: "Custom installed skill",
        version: "0.1.0",
        tags: ["custom"],
        author: "Custom",
        isBundled: false,
        installed: true,
      };
      setSkills(prev => [...prev, newSkill]);
      setInstallId("");
      setInstalling(false);
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "#0D0D0D" }}>
      {/* Header */}
      <div className="px-8 py-5 flex-shrink-0 mac-drag-region" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.15)" }}>
              <Brain size={18} style={{ color: "#0A84FF" }} />
            </div>
            <div>
              <h1 className="text-[15px] font-bold" style={{ color: "#fff" }}>Skills</h1>
              <p className="text-[11.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                {installedCount} of {skills.length} installed
              </p>
            </div>
          </div>
        </div>
        <div className="relative max-w-md mac-no-drag">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search skills by name, tag, or description..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-[12px] outline-none transition-colors"
            style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#0A84FF"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#1A1A1A" }}>
                <Brain size={40} style={{ color: "rgba(255,255,255,0.2)" }} />
              </div>
              <h2 className="text-[16px] font-semibold mb-1" style={{ color: "#fff" }}>No skills found</h2>
              <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {query ? "Try a different search term" : "Install your first skill below"}
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-6 px-8 space-y-8">
            {/* Bundled Skills */}
            {bundled.length > 0 && (
              <Section
                title="Bundled Skills"
                subtitle="Core skills included with Hermes Agent"
                icon={<Sparkles size={14} style={{ color: "#0A84FF" }} />}
                skills={bundled}
                onToggle={toggleInstall}
              />
            )}

            {/* Custom Skills */}
            {custom.length > 0 && (
              <Section
                title="Custom Skills"
                subtitle="Community and custom installed skills"
                icon={<Package size={14} style={{ color: "rgba(255,255,255,0.55)" }} />}
                skills={custom}
                onToggle={toggleInstall}
              />
            )}
          </div>
        )}
      </div>

      {/* Install new skill */}
      <div className="flex-shrink-0 px-8 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0D0D0D" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 mb-2">
            <Download size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
            <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Install New Skill</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={installId}
              onChange={e => setInstallId(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleInstall(); }}
              placeholder="Enter skill name or URL..."
              className="flex-1 rounded-lg px-3 py-2 text-[12px] outline-none transition-colors"
              style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#0A84FF"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
            <button
              onClick={handleInstall}
              disabled={!installId.trim() || installing}
              className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
              style={{
                background: installId.trim() ? "#0A84FF" : "#242424",
                color: "#fff",
                opacity: installId.trim() ? 1 : 0.5,
                cursor: installId.trim() ? "pointer" : "not-allowed",
              }}
            >
              {installing ? (
                <span className="inline-flex gap-1" style={{ padding: "2px 0" }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "typingBounce 1.2s infinite" }} />
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "typingBounce 1.2s infinite", animationDelay: "0.15s" }} />
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "typingBounce 1.2s infinite", animationDelay: "0.3s" }} />
                </span>
              ) : (
                <><Download size={13} /> Install</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section sub-component ──────────────────────────────────

function Section({
  title,
  subtitle,
  icon,
  skills,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  skills: Skill[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: "#fff" }}>{title}</h2>
          <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {skills.map(skill => (
          <SkillCard key={skill.id} skill={skill} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

// ─── Skill card sub-component ───────────────────────────────

function SkillCard({ skill, onToggle }: { skill: Skill; onToggle: (id: string) => void }) {
  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 animate-slide-up flex items-start gap-3"
      style={{
        background: "#242424",
        border: `1px solid ${skill.installed ? "rgba(10,132,255,0.12)" : "rgba(255,255,255,0.05)"}`,
      }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: skill.installed ? "rgba(10,132,255,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${skill.installed ? "rgba(10,132,255,0.15)" : "rgba(255,255,255,0.06)"}` }}>
        {skill.isBundled ? <Sparkles size={15} style={{ color: skill.installed ? "#0A84FF" : "rgba(255,255,255,0.3)" }} /> : <Package size={15} style={{ color: skill.installed ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="text-[13px] font-semibold truncate" style={{ color: "#fff" }}>{skill.name}</h3>
          <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>v{skill.version}</span>
        </div>
        <p className="text-[11.5px] mb-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{skill.description}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9.5px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{skill.author}</span>
          {skill.tags.map(tag => (
            <span key={tag} className="text-[9.5px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => onToggle(skill.id)}
        className={`rounded-lg px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 flex-shrink-0 transition-all ${skill.installed ? "" : ""}`}
        style={{
          background: skill.installed ? "transparent" : "#0A84FF",
          color: skill.installed ? "rgba(255,255,255,0.4)" : "#fff",
          border: skill.installed ? "1px solid rgba(255,255,255,0.1)" : "none",
        }}
        onMouseEnter={e => {
          if (skill.installed) {
            e.currentTarget.style.background = "rgba(239,68,68,0.15)";
            e.currentTarget.style.color = "#ef4444";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)";
          } else {
            e.currentTarget.style.background = "#0070E0";
          }
        }}
        onMouseLeave={e => {
          if (skill.installed) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          } else {
            e.currentTarget.style.background = "#0A84FF";
          }
        }}
      >
        {skill.installed ? <><Trash2 size={11} /> Remove</> : <><Download size={11} /> Install</>}
      </button>
    </div>
  );
}
