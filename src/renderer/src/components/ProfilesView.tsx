import { useState } from "react";
import { User, Plus, Copy, Trash2, Settings, Check, X, HardDrive, Folder, Terminal, Globe, Zap } from "lucide-react";

interface Profile {
  id: string;
  name: string;
  isActive: boolean;
  configPath: string;
  modelCount: number;
  skillCount: number;
  lastUsed: string;
  provider: string;
}

const MOCK_PROFILES: Profile[] = [
  { id: "default", name: "Default", isActive: true, configPath: "~/.hermes/config.yaml", modelCount: 5, skillCount: 23, lastUsed: "2026-06-03", provider: "deepseek" },
  { id: "work", name: "Work", isActive: false, configPath: "~/.hermes/profiles/work/config.yaml", modelCount: 3, skillCount: 12, lastUsed: "2026-06-02", provider: "anthropic" },
  { id: "experiments", name: "Experiments", isActive: false, configPath: "~/.hermes/profiles/experiments/config.yaml", modelCount: 8, skillCount: 7, lastUsed: "2026-05-28", provider: "openrouter" },
];

export default function ProfilesView() {
  const [profiles, setProfiles] = useState<Profile[]>(MOCK_PROFILES);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = newName.toLowerCase().replace(/\s+/g, "-");
    setProfiles([...profiles, {
      id, name: newName, isActive: false,
      configPath: `~/.hermes/profiles/${id}/config.yaml`,
      modelCount: cloneFrom ? profiles.find(p => p.id === cloneFrom)?.modelCount ?? 0 : 0,
      skillCount: cloneFrom ? profiles.find(p => p.id === cloneFrom)?.skillCount ?? 0 : 0,
      lastUsed: new Date().toISOString().slice(0, 10), provider: "openrouter"
    }]);
    setShowCreate(false); setNewName(""); setCloneFrom("");
  };

  const handleActivate = (id: string) => {
    setProfiles(profiles.map(p => ({ ...p, isActive: p.id === id })));
  };

  const handleDelete = (id: string) => {
    if (id === "default") return;
    setProfiles(profiles.filter(p => p.id !== id));
  };

  const handleRename = (id: string) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, name: editName } : p));
    setEditingId(null);
  };

  const handleClone = (id: string) => {
    const src = profiles.find(p => p.id === id);
    if (!src) return;
    const newId = `${id}-clone-${Date.now().toString(36)}`;
    setProfiles([...profiles, { ...src, id: newId, name: `${src.name} (Copy)`, isActive: false, configPath: `~/.hermes/profiles/${newId}/config.yaml` }]);
  };

  return (
    <div className="flex flex-col h-full bg-[#0D0D0D]">
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white mb-1">Profiles</h1>
          <p className="text-sm text-white/40">Manage isolated Hermes environments</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[#0A84FF] text-white rounded-xl text-sm font-medium hover:bg-[#0A84FF]/90 transition-colors">
          <Plus size={16} />
          New Profile
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Create form */}
        {showCreate && (
          <div className="mb-6 p-5 rounded-xl bg-[#1A1A1A] border border-[#0A84FF]/20">
            <h3 className="text-sm font-medium text-white mb-4">Create New Profile</h3>
            <div className="flex gap-3 mb-3">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Profile name..."
                className="flex-1 bg-[#0D0D0D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-[#0A84FF]/50"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
              <select
                value={cloneFrom}
                onChange={e => setCloneFrom(e.target.value)}
                className="bg-[#0D0D0D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/60 outline-none"
              >
                <option value="">Empty profile</option>
                {profiles.map(p => <option key={p.id} value={p.id}>Clone: {p.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!newName.trim()} className="px-4 py-2 bg-[#0A84FF] text-white rounded-lg text-sm font-medium hover:bg-[#0A84FF]/90 disabled:opacity-30 transition-all">
                Create
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(""); setCloneFrom(""); }} className="px-4 py-2 bg-white/5 text-white/60 rounded-lg text-sm hover:bg-white/10 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Profile cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.map(p => (
            <div key={p.id} className={`relative rounded-xl border transition-all ${p.isActive ? "border-[#0A84FF]/30 bg-[#0A84FF]/5" : "border-white/5 bg-[#1A1A1A] hover:border-white/10"}`}>
              {p.isActive && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] text-[10px] font-medium flex items-center gap-1">
                  <Check size={10} /> Active
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.isActive ? "bg-[#0A84FF]/20" : "bg-white/5"}`}>
                    <User size={18} className={p.isActive ? "text-[#0A84FF]" : "text-white/40"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="bg-[#0D0D0D] border border-white/10 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-[#0A84FF]/50 w-32"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                        />
                        <button onClick={() => handleRename(p.id)} className="p-1 text-[#0A84FF] hover:bg-[#0A84FF]/10 rounded"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-white/30 hover:text-white/60 rounded"><X size={14} /></button>
                      </div>
                    ) : (
                      <h3 className="text-sm font-medium text-white">{p.name}</h3>
                    )}
                    <p className="text-[11px] text-white/30 mt-0.5">{p.configPath}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0D0D0D]">
                    <Brain size={14} className="text-white/25" />
                    <span className="text-xs text-white/50">{p.modelCount} models</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0D0D0D]">
                    <Folder size={14} className="text-white/25" />
                    <span className="text-xs text-white/50">{p.skillCount} skills</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/25">Last used: {p.lastUsed}</span>
                  <div className="flex items-center gap-1">
                    {!p.isActive && (
                      <button onClick={() => handleActivate(p.id)} className="px-3 py-1.5 rounded-lg bg-[#0A84FF]/10 text-[#0A84FF] text-xs font-medium hover:bg-[#0A84FF]/20 transition-colors">
                        Activate
                      </button>
                    )}
                    <button onClick={() => handleClone(p.id)} className="p-2 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/50 transition-colors" title="Clone">
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                      className="p-2 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/50 transition-colors" title="Rename"
                    >
                      <Settings size={13} />
                    </button>
                    {p.id !== "default" && (
                      <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg hover:bg-white/5 text-white/25 hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Brain({ size, className }: { size?: number; className?: string }) {
  return (
    <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}
