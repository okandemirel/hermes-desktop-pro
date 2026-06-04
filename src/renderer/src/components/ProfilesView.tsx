import { useState, useEffect, useCallback } from "react";
import {
  User, Plus, Copy, Trash2, Check, X, Brain, Sparkles,
  Database, FileText, Wrench, Power,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, IconChip, Badge, Input, Field, Select,
  Modal, EmptyState, StatusDot, SectionLabel,
} from "../ui";
import type { ProfileInfo } from "@shared/types";

// Both the local reader ({success,error}) and the SSH proxy (boolean) reach
// the renderer through one preload method. Normalize to a uniform result so
// the UI can surface the real error message when one exists.
function asResult(r: { success: boolean; error?: string } | boolean): {
  ok: boolean;
  error?: string;
} {
  if (typeof r === "boolean") return { ok: r };
  return { ok: r.success, error: r.error };
}

export default function ProfilesView() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [cloneDefault, setCloneDefault] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await window.hermes.listProfiles();
      setProfiles(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeCreate = () => {
    setShowCreate(false);
    setNewName("");
    setCloneDefault("");
    setCreateError(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreateError(null);
    setBusy("create");
    try {
      const res = asResult(
        await window.hermes.createProfile(name, cloneDefault === "default"),
      );
      if (!res.ok) {
        setCreateError(res.error || "Failed to create profile.");
        return;
      }
      closeCreate();
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create profile.");
    } finally {
      setBusy(null);
    }
  };

  // Clone duplicates the default profile's config, models, skills and memory
  // into a freshly named workspace (the backend only clones from default).
  const handleClone = async (name: string) => {
    setBusy(name);
    try {
      const base = name.replace(/[^a-z0-9_-]/g, "") || "profile";
      const dest = `${base}-copy-${Date.now().toString(36)}`;
      const res = asResult(await window.hermes.createProfile(dest, true));
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  };

  const handleActivate = async (name: string) => {
    setBusy(name);
    try {
      await window.hermes.setActiveProfile(name);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (name: string) => {
    setBusy(name);
    setDeleteTarget(null);
    try {
      const res = asResult(await window.hermes.deleteProfile(name));
      if (res.ok) {
        await load();
      } else {
        setError(res.error || "Failed to delete profile.");
      }
    } finally {
      setBusy(null);
    }
  };

  const active = profiles.find((p) => p.isActive);
  const others = profiles.filter((p) => !p.isActive);

  const summaryFor = (p: ProfileInfo): string => {
    const bits: string[] = [];
    bits.push(p.isDefault ? "Default workspace" : "Isolated workspace");
    bits.push(`${p.skillCount} skill${p.skillCount !== 1 ? "s" : ""}`);
    if (p.hasSoul) bits.push("custom soul");
    bits.push(p.hasEnv ? "keys configured" : "no keys yet");
    return bits.join(" · ");
  };

  return (
    <Screen
      kicker="Workspace Profiles"
      icon={<User size={19} />}
      title="Profiles"
      sub={`${profiles.length} isolated Hermes workspace${profiles.length !== 1 ? "s" : ""} — each its own config, models, skills and memory.`}
      actions={<Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New Profile</Button>}
    >
      {error && profiles.length === 0 ? (
        <EmptyState
          icon={<User size={22} />}
          title="Couldn't load profiles"
          sub={error}
          action={<Button variant="primary" onClick={() => void load()}>Retry</Button>}
        />
      ) : !loading && profiles.length === 0 ? (
        <EmptyState
          icon={<User size={22} />}
          title="No profiles yet"
          sub="Create an isolated Hermes environment to keep models, skills and config separate."
          action={<Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New Profile</Button>}
        />
      ) : (
        <>
          {/* ── Signature hero: the current workspace, struck in gold ── */}
          {active && (
            <Card pad className="mint-in mint-in-1 relative overflow-hidden">
              <div className="flex items-start gap-5">
                <span className="ui-stamp shrink-0" style={{ width: 66, height: 66, borderRadius: "50%" }}>
                  <User size={26} className="text-[var(--accent-text)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="ui-eyebrow">Current workspace</div>
                  <div className="flex items-center gap-3">
                    <h2 className="serif text-[27px] leading-none text-[var(--text)] truncate">{active.name}</h2>
                    <Badge variant="success"><StatusDot color="var(--success)" pulse /> Active</Badge>
                    {active.isDefault && <Badge variant="neutral">Default</Badge>}
                  </div>
                  <p className="text-[13.5px] text-[var(--text-2)] mt-2.5 max-w-xl">{summaryFor(active)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton onClick={() => void handleClone(active.name)} title="Clone" disabled={busy === active.name}><Copy size={15} /></IconButton>
                </div>
              </div>

              <hr className="ui-divider-gold my-5" />

              <div className="flex items-center gap-6 text-[12px] text-[var(--text-3)] flex-wrap">
                {active.model && <span className="flex items-center gap-1.5 font-mono"><Brain size={13} /> {active.model}</span>}
                <span className="flex items-center gap-1.5 font-mono capitalize"><Sparkles size={13} /> {active.provider || "auto"}</span>
                <span className="flex items-center gap-1.5 font-mono"><Wrench size={13} /> {active.skillCount} skill{active.skillCount !== 1 ? "s" : ""}</span>
                <span className="flex items-center gap-1.5 font-mono"><Database size={13} /> {active.hasSoul ? "soul on" : "no soul"}</span>
                <span className="flex items-center gap-1.5 font-mono">
                  <Power size={13} /> {active.gatewayRunning ? "gateway up" : "gateway down"}
                </span>
              </div>
            </Card>
          )}

          {/* ── The quieter ledger of the remaining profiles ── */}
          {others.length > 0 && (
            <>
              <SectionLabel className="mt-9 mb-3.5 block">Other profiles · {others.length}</SectionLabel>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 stagger">
                {others.map((p) => (
                  <Card key={p.name} pad interactive className="group flex items-start gap-3">
                    <IconChip className="!bg-[var(--surface-3)] !text-[var(--text-3)] !border-[var(--border)]">
                      <User size={18} />
                    </IconChip>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{p.name}</h3>
                        {p.isDefault && <Badge variant="neutral">Default</Badge>}
                        {p.gatewayRunning && <StatusDot color="var(--success)" pulse />}
                      </div>
                      <p className="text-[13px] text-[var(--text-2)] line-clamp-1 mt-1.5">{summaryFor(p)}</p>
                      <div className="flex items-center gap-4 text-[11.5px] text-[var(--text-3)] mt-2">
                        {p.model && <span className="flex items-center gap-1.5 font-mono"><Brain size={12} /> {p.model}</span>}
                        <span className="flex items-center gap-1.5 font-mono capitalize"><Sparkles size={12} /> {p.provider || "auto"}</span>
                        <span className="flex items-center gap-1.5 font-mono"><FileText size={12} /> {p.skillCount} skill{p.skillCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="sm" disabled={busy === p.name} onClick={() => void handleActivate(p.name)}>Activate</Button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconButton onClick={() => void handleClone(p.name)} title="Clone" disabled={busy === p.name}><Copy size={15} /></IconButton>
                        {!p.isDefault && (
                          <IconButton danger onClick={() => setDeleteTarget(p.name)} title="Delete" disabled={busy === p.name}><Trash2 size={15} /></IconButton>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Create profile modal */}
      <Modal
        open={showCreate}
        onClose={closeCreate}
        title="Create New Profile"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>Cancel</Button>
            <Button variant="primary" leftIcon={<Check size={15} />} disabled={!newName.trim() || busy === "create"} onClick={() => void handleCreate()}>Create Profile</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Profile Name" hint="Lowercase letters, numbers, underscores and hyphens.">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. work"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            />
          </Field>
          <Field label="Start From" hint="Clone the default profile to inherit its models, skills and config.">
            <Select value={cloneDefault} onChange={(e) => setCloneDefault(e.target.value)}>
              <option value="">Empty profile</option>
              <option value="default">Clone from default</option>
            </Select>
          </Field>
          {createError && (
            <p className="text-[12.5px] text-[var(--error)]">{createError}</p>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Profile"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => deleteTarget && void handleDelete(deleteTarget)}>Delete Profile</Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-2)]">
          Permanently delete the <span className="font-semibold text-[var(--text)]">{deleteTarget}</span> profile?
          Its config, models, skills, memory and saved keys are erased from disk. This cannot be undone.
        </p>
      </Modal>
    </Screen>
  );
}
