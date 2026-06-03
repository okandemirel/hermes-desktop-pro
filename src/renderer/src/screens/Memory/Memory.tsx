import { useState } from "react";
import { Brain, Database, Plus, Trash2, User, Info, X, Check, ChevronDown } from "../../components/Icons";

// ─── Missing icons defined locally ──────────────────────────
function SvgIcon({ paths, circle, size = 16, style }: { paths: string[]; circle?: [number, number, number]; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {circle && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
const Edit3 = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon paths={["M12 20h9", "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"]} {...p} />;
const HardDrive = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon paths={["M22 12H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z", "M6 16h.01", "M10 16h.01"]} {...p} />;
const Bookmark = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon paths={["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"]} {...p} />;

// ─── Types ──────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  category: string;
  createdAt: number;
}

interface UserPreference {
  key: string;
  value: string;
}

const MEMORY_PROVIDERS = ["Built-in", "Honcho", "Mem0", "MemGPT", "Zep", "Custom"];
const MAX_ENTRIES = 500;
const CATEGORIES = ["General", "Personal", "Work", "Preferences", "Facts"];

// ─── Mock data ──────────────────────────────────────────────

const MOCK_MEMORIES: MemoryEntry[] = [
  { id: "mem1", key: "user_name", value: "Alex", category: "Personal", createdAt: Date.now() - 86400000 },
  { id: "mem2", key: "preferred_language", value: "TypeScript", category: "Preferences", createdAt: Date.now() - 172800000 },
  { id: "mem3", key: "project_dir", value: "/home/alex/projects", category: "Work", createdAt: Date.now() - 259200000 },
  { id: "mem4", key: "favorite_color", value: "Blue", category: "Personal", createdAt: Date.now() - 345600000 },
  { id: "mem5", key: "timezone", value: "America/New_York", category: "Preferences", createdAt: Date.now() - 432000000 },
  { id: "mem6", key: "python_version", value: "3.11", category: "Facts", createdAt: Date.now() - 518400000 },
];

const MOCK_PROFILE: UserPreference[] = [
  { key: "Name", value: "Alex" },
  { key: "Role", value: "Software Engineer" },
  { key: "Location", value: "New York, USA" },
  { key: "Timezone", value: "UTC-5 (Eastern)" },
  { key: "Preferred Editor", value: "VS Code" },
  { key: "Language", value: "English" },
  { key: "Theme", value: "Dark" },
  { key: "Notifications", value: "Enabled" },
];

// ─── Component ──────────────────────────────────────────────

export default function MemoryView() {
  const [tab, setTab] = useState<"memory" | "profile">("memory");
  const [memories, setMemories] = useState<MemoryEntry[]>(MOCK_MEMORIES);
  const [profile, setProfile] = useState<UserPreference[]>(MOCK_PROFILE);
  const [provider, setProvider] = useState(MEMORY_PROVIDERS[0]);
  const [providerOpen, setProviderOpen] = useState(false);

  // Add memory form
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const usedPct = Math.round((memories.length / MAX_ENTRIES) * 100);
  const capacityColor = usedPct > 80 ? "#ef4444" : usedPct > 60 ? "#f59e0b" : "#0A84FF";

  const handleAddMemory = () => {
    if (!newKey.trim() || !newValue.trim()) return;
    const entry: MemoryEntry = {
      id: `mem${Date.now()}`,
      key: newKey.trim(),
      value: newValue.trim(),
      category: newCategory,
      createdAt: Date.now(),
    };
    setMemories(prev => [entry, ...prev]);
    setNewKey(""); setNewValue(""); setNewCategory(CATEGORIES[0]); setShowAdd(false);
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditValue(entry.value);
  };

  const saveEdit = (id: string) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, value: editValue.trim() } : m));
    setEditingId(null);
    setEditValue("");
  };

  const handleDelete = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
    setDeleteConfirm(null);
    if (editingId === id) { setEditingId(null); setEditValue(""); }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "#0D0D0D" }}>
      {/* Header */}
      <div className="px-8 py-5 flex-shrink-0 mac-drag-region" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.15)" }}>
            <Brain size={18} style={{ color: "#0A84FF" }} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold" style={{ color: "#fff" }}>Memory</h1>
            <p className="text-[11.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Persistent context for your agent</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mb-4 mac-no-drag">
          <button onClick={() => setTab("memory")}
            className="px-4 py-2 text-[12px] font-medium transition-all rounded-l-lg"
            style={{
              background: tab === "memory" ? "#0A84FF" : "#1A1A1A",
              color: tab === "memory" ? "#fff" : "rgba(255,255,255,0.55)",
              border: tab === "memory" ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}>
            <Brain size={13} className="inline mr-1.5" /> Memory
          </button>
          <button onClick={() => setTab("profile")}
            className="px-4 py-2 text-[12px] font-medium transition-all rounded-r-lg"
            style={{
              background: tab === "profile" ? "#0A84FF" : "#1A1A1A",
              color: tab === "profile" ? "#fff" : "rgba(255,255,255,0.55)",
              border: tab === "profile" ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}>
            <User size={13} className="inline mr-1.5" /> User Profile
          </button>
        </div>

        {/* Capacity indicator + Provider selector */}
        <div className="flex items-center gap-3 flex-wrap mac-no-drag">
          {/* Capacity bar */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <HardDrive size={13} style={{ color: "rgba(255,255,255,0.35)" }} />
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#1A1A1A" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${usedPct}%`, background: capacityColor }} />
            </div>
            <span className="text-[10.5px] font-mono flex-shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>
              {memories.length}/{MAX_ENTRIES}
            </span>
          </div>

          {/* Provider selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setProviderOpen(!providerOpen)}
              className="rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors"
              style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
              <Database size={12} />
              <span>{provider}</span>
              <ChevronDown size={10} />
            </button>
            {providerOpen && (
              <div className="absolute top-full right-0 mt-1 rounded-lg overflow-hidden z-10 shadow-lg min-w-[160px]"
                style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)" }}>
                {MEMORY_PROVIDERS.map(p => (
                  <button key={p}
                    onClick={() => { setProvider(p); setProviderOpen(false); }}
                    className="w-full text-left px-3 py-2 text-[11.5px] transition-colors"
                    style={{ color: p === provider ? "#0A84FF" : "rgba(255,255,255,0.7)", background: p === provider ? "rgba(10,132,255,0.08)" : "transparent" }}
                    onMouseEnter={e => { if (p !== provider) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (p !== provider) e.currentTarget.style.background = "transparent"; }}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-6 px-8">

          {/* ═══ MEMORY TAB ═══ */}
          {tab === "memory" && (
            <div className="space-y-4">
              {/* Add new entry button */}
              {!showAdd && (
                <button onClick={() => setShowAdd(true)}
                  className="w-full rounded-xl p-4 text-[12px] font-medium transition-all flex items-center justify-center gap-2"
                  style={{ background: "#1A1A1A", color: "rgba(255,255,255,0.4)", border: "1px dashed rgba(255,255,255,0.08)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
                  <Plus size={14} /> Add New Memory Entry
                </button>
              )}

              {/* Add form */}
              {showAdd && (
                <div className="rounded-xl p-4 animate-slide-up" style={{ background: "#242424", border: "1px solid rgba(10,132,255,0.12)" }}>
                  <div className="space-y-3">
                    <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key (e.g. user_name)"
                      className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors"
                      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#0A84FF"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                    <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Value"
                      className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors"
                      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#0A84FF"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                    <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors appearance-none cursor-pointer"
                      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleAddMemory} disabled={!newKey.trim() || !newValue.trim()}
                      className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
                      style={{ background: "#0A84FF", color: "#fff", opacity: newKey.trim() && newValue.trim() ? 1 : 0.5, cursor: newKey.trim() && newValue.trim() ? "pointer" : "not-allowed" }}>
                      <Check size={13} /> Save Entry
                    </button>
                    <button onClick={() => { setShowAdd(false); setNewKey(""); setNewValue(""); }}
                      className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all"
                      style={{ background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {memories.length === 0 && (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center animate-fade-in">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#1A1A1A" }}>
                      <Brain size={40} style={{ color: "rgba(255,255,255,0.2)" }} />
                    </div>
                    <h2 className="text-[16px] font-semibold mb-1" style={{ color: "#fff" }}>No memories yet</h2>
                    <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>Add memory entries to give your agent persistent context</p>
                  </div>
                </div>
              )}

              {/* Memory list */}
              {memories.map(entry => (
                <div key={entry.id}
                  className="rounded-xl p-4 transition-all duration-200 animate-slide-up"
                  style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Bookmark size={12} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                        <code className="text-[12px] font-mono font-medium truncate" style={{ color: "#0A84FF" }}>{entry.key}</code>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          {entry.category}
                        </span>
                      </div>
                      {editingId === entry.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(entry.id); if (e.key === "Escape") setEditingId(null); }}
                          onBlur={() => saveEdit(entry.id)}
                          className="w-full rounded-lg px-3 py-1.5 text-[12px] outline-none transition-colors mt-1"
                          style={{ background: "#1A1A1A", border: "1px solid #0A84FF", color: "#fff" }}
                        />
                      ) : (
                        <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{entry.value}</p>
                      )}
                      <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>{formatDate(entry.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(entry)}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => setDeleteConfirm(entry.id)}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ USER PROFILE TAB ═══ */}
          {tab === "profile" && (
            <div className="space-y-4">
              <div className="rounded-xl p-5" style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(10,132,255,0.1)" }}>
                    <User size={15} style={{ color: "#0A84FF" }} />
                  </div>
                  <div>
                    <h2 className="text-[13px] font-semibold" style={{ color: "#fff" }}>User Profile</h2>
                    <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>Preferences and identity used across sessions</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {profile.map((pref, i) => (
                    <div key={pref.key}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors"
                      style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                      <span className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>{pref.key}</span>
                      <span className="text-[12px] font-medium" style={{ color: "#fff" }}>{pref.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <button
                    className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all flex items-center gap-1.5"
                    style={{ background: "#0A84FF", color: "#fff" }}>
                    <Plus size={11} /> Add Field
                  </button>
                  <button
                    className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all flex items-center gap-1.5"
                    style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <Edit3 size={11} /> Edit
                  </button>
                </div>
              </div>

              {/* Profile info card */}
              <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "rgba(10,132,255,0.06)", border: "1px solid rgba(10,132,255,0.1)" }}>
                <Info size={14} style={{ color: "#0A84FF", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Profile information is shared with the agent to personalize responses. Fields marked sensitive are never sent to external providers.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setDeleteConfirm(null)}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4 animate-slide-up" style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold mb-2" style={{ color: "#fff" }}>Delete Memory Entry?</h3>
            <p className="text-[11.5px] mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
              This will permanently remove this memory entry. The agent will lose this context.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all"
                style={{ background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
                style={{ background: "#ef4444", color: "#fff" }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
