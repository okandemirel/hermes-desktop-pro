import { useState } from "react";
import {
  User, Plus, Copy, Trash2, Settings, Check, X, Brain, Clock, MessageSquare,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, IconChip, Badge, Input, Field, Select,
  Modal, EmptyState, StatusDot, cx,
} from "../ui";

interface Profile {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  model: string;
  provider: string;
  lastUsed: string;
}

const MOCK_PROFILES: Profile[] = [
  {
    id: "default", name: "Default", description: "Primary day-to-day workspace with the full toolset enabled.",
    isActive: true, model: "deepseek-v4", provider: "deepseek", lastUsed: "2026-06-03",
  },
  {
    id: "work", name: "Work", description: "Locked-down profile for client repos — audit logging on, web access off.",
    isActive: false, model: "claude-sonnet-4", provider: "anthropic", lastUsed: "2026-06-02",
  },
  {
    id: "experiments", name: "Experiments", description: "Sandbox for new models, prompts and skills before they graduate.",
    isActive: false, model: "deepseek-v4-preview", provider: "openrouter", lastUsed: "2026-05-28",
  },
  {
    id: "research", name: "Research", description: "Long-context reasoning setup tuned for literature review and synthesis.",
    isActive: false, model: "gpt-4o", provider: "openai", lastUsed: "2026-05-24",
  },
];

export default function ProfilesView() {
  const [profiles, setProfiles] = useState<Profile[]>(MOCK_PROFILES);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const closeCreate = () => { setShowCreate(false); setNewName(""); setCloneFrom(""); };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = newName.toLowerCase().replace(/\s+/g, "-");
    const src = cloneFrom ? profiles.find(p => p.id === cloneFrom) : undefined;
    setProfiles([...profiles, {
      id, name: newName, description: src ? `Cloned from ${src.name}.` : "Fresh, empty Hermes workspace.",
      isActive: false,
      model: src?.model ?? "deepseek-v4",
      provider: src?.provider ?? "openrouter",
      lastUsed: new Date().toISOString().slice(0, 10),
    }]);
    closeCreate();
  };

  const handleActivate = (id: string) => setProfiles(profiles.map(p => ({ ...p, isActive: p.id === id })));
  const handleDelete = (id: string) => { if (id !== "default") setProfiles(profiles.filter(p => p.id !== id)); };
  const handleRename = (id: string) => { setProfiles(profiles.map(p => p.id === id ? { ...p, name: editName } : p)); setEditingId(null); };
  const handleClone = (id: string) => {
    const src = profiles.find(p => p.id === id);
    if (!src) return;
    const newId = `${id}-clone-${Date.now().toString(36)}`;
    setProfiles([...profiles, { ...src, id: newId, name: `${src.name} (Copy)`, isActive: false }]);
  };

  const active = profiles.find(p => p.isActive);

  return (
    <Screen
      icon={<User size={19} />}
      title="Profiles"
      sub="Each profile is an isolated Hermes workspace — its own config, models, skills and memory."
      actions={<Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New Profile</Button>}
    >
      <p className="text-[12.5px] text-[var(--text-3)] mb-6">
        {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
        {active && <> · <span className="text-[var(--text-2)]">{active.name}</span> active</>}
      </p>

      {profiles.length === 0 ? (
        <EmptyState
          icon={<User size={22} />}
          title="No profiles yet"
          sub="Create an isolated Hermes environment to keep models, skills and config separate."
          action={<Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New Profile</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 stagger">
          {profiles.map(p => (
            <Card key={p.id} pad interactive active={p.isActive} className="group flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <IconChip className={cx(!p.isActive && "!bg-[var(--surface-3)] !text-[var(--text-3)] !border-[var(--border)]")}>
                  <User size={18} />
                </IconChip>
                <div className="min-w-0 flex-1">
                  {editingId === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="!h-8 text-[13px]"
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handleRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <IconButton onClick={() => handleRename(p.id)} title="Save"><Check size={15} /></IconButton>
                      <IconButton onClick={() => setEditingId(null)} title="Cancel"><X size={15} /></IconButton>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{p.name}</h3>
                      {p.isActive
                        ? <Badge variant="success"><StatusDot color="var(--success)" pulse /> Active</Badge>
                        : <Badge variant="neutral"><StatusDot color="var(--text-3)" /> Idle</Badge>}
                    </div>
                  )}
                  <p className="text-[13px] text-[var(--text-2)] line-clamp-1 mt-1.5">{p.description}</p>
                  <div className="flex items-center gap-4 text-[11.5px] text-[var(--text-3)] mt-2">
                    <span className="flex items-center gap-1.5 font-mono"><Brain size={12} /> {p.model}</span>
                    <span className="flex items-center gap-1.5 font-mono"><Clock size={12} /> {p.lastUsed}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!p.isActive && (
                    <Button variant="secondary" size="sm" leftIcon={<MessageSquare size={13} />} onClick={() => handleActivate(p.id)}>Activate</Button>
                  )}
                  <IconButton onClick={() => handleClone(p.id)} title="Clone"><Copy size={15} /></IconButton>
                  <IconButton onClick={() => { setEditingId(p.id); setEditName(p.name); }} title="Rename"><Settings size={15} /></IconButton>
                  {p.id !== "default" && (
                    <IconButton danger onClick={() => handleDelete(p.id)} title="Delete"><Trash2 size={15} /></IconButton>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create profile modal */}
      <Modal
        open={showCreate}
        onClose={closeCreate}
        title="Create New Profile"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>Cancel</Button>
            <Button variant="primary" leftIcon={<Check size={15} />} disabled={!newName.trim()} onClick={handleCreate}>Create Profile</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Profile Name">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Work"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
          </Field>
          <Field label="Start From" hint="Clone an existing profile to inherit its models, skills and config.">
            <Select value={cloneFrom} onChange={e => setCloneFrom(e.target.value)}>
              <option value="">Empty profile</option>
              {profiles.map(p => <option key={p.id} value={p.id}>Clone: {p.name}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </Screen>
  );
}
