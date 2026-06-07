import { useState, useEffect, useCallback } from "react";
import {
  User, Plus, Copy, Trash2, Check, X, Brain, Sparkles,
  Database, FileText, Wrench, Power,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, IconChip, Badge, Input, Field, Select,
  Modal, EmptyState, StatusDot, SectionLabel, SearchInput,
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
  const [query, setQuery] = useState("");
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
  const gatewayCount = profiles.filter((p) => p.gatewayRunning).length;
  const totalSkills = profiles.reduce((sum, p) => sum + p.skillCount, 0);

  const summaryFor = (p: ProfileInfo): string => {
    const bits: string[] = [];
    bits.push(p.isDefault ? "Default workspace" : "Isolated workspace");
    bits.push(`${p.skillCount} skill${p.skillCount !== 1 ? "s" : ""}`);
    if (p.hasSoul) bits.push("custom soul");
    bits.push(p.hasEnv ? "keys configured" : "no keys yet");
    return bits.join(" · ");
  };
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOthers = normalizedQuery
    ? others.filter((p) => [
        p.name,
        p.model,
        p.provider,
        summaryFor(p),
      ].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : others;

  return (
    <Screen
      className="ui-profiles-console"
      kicker="Workspace Profiles"
      icon={<User size={19} />}
      title="Profiles"
      sub={`${profiles.length} isolated Hermes workspace${profiles.length !== 1 ? "s" : ""} — each its own config, models, skills and memory.`}
      actions={<Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New Profile</Button>}
    >
      <div className="ui-profiles-shell">
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
            {active && (
              <Card pad className="ui-profiles-hero mint-in mint-in-1">
                <div className="ui-profiles-hero-mark">
                  <User size={26} />
                </div>
                <div className="ui-profiles-hero-copy">
                  <div className="ui-eyebrow">Current Workspace</div>
                  <div className="ui-profiles-title-line">
                    <h2>{active.name}</h2>
                    <Badge variant="success"><StatusDot color="var(--success)" pulse /> Active</Badge>
                    {active.isDefault && <Badge variant="neutral">Default</Badge>}
                  </div>
                  <p>{summaryFor(active)}</p>
                  <div className="ui-profiles-hero-meta">
                    {active.model && <span><Brain size={13} /> {active.model}</span>}
                    <span><Sparkles size={13} /> {active.provider || "auto"}</span>
                    <span><Wrench size={13} /> {active.skillCount} skill{active.skillCount !== 1 ? "s" : ""}</span>
                    <span><Database size={13} /> {active.hasSoul ? "soul on" : "no soul"}</span>
                    <span><Power size={13} /> {active.gatewayRunning ? "gateway up" : "gateway down"}</span>
                  </div>
                </div>
                <div className="ui-profiles-metrics">
                  <div>
                    <span>Profiles</span>
                    <strong>{profiles.length}</strong>
                  </div>
                  <div>
                    <span>Skills</span>
                    <strong>{totalSkills}</strong>
                  </div>
                  <div>
                    <span>Gateway</span>
                    <strong>{gatewayCount}</strong>
                  </div>
                </div>
                <div className="ui-profiles-hero-actions">
                  <IconButton onClick={() => void handleClone(active.name)} title="Clone" disabled={busy === active.name}><Copy size={15} /></IconButton>
                </div>
              </Card>
            )}

            {others.length > 0 && (
              <section className="ui-profiles-ledger mint-in mint-in-2">
                <div className="ui-profiles-ledger-head">
                  <div className="ui-profiles-ledger-title">
                    <SectionLabel>Other profiles</SectionLabel>
                    <Badge variant="neutral">{visibleOthers.length}/{others.length}</Badge>
                  </div>
                  <SearchInput
                    className="ui-profiles-search"
                    value={query}
                    onChange={setQuery}
                    placeholder="Search profile, model, provider..."
                  />
                </div>
                {visibleOthers.length === 0 ? (
                  <Card pad className="ui-profiles-empty">
                    <strong>No matching profiles</strong>
                    <p>Clear the search to show all isolated workspaces.</p>
                  </Card>
                ) : (
                  <div className="ui-profiles-grid stagger">
                    {visibleOthers.map((p) => (
                      <Card
                        key={p.name}
                        pad
                        interactive
                        className="ui-profiles-card"
                        onClick={() => void handleActivate(p.name)}
                      >
                        <div className="ui-profiles-card-main">
                          <IconChip className="ui-profiles-card-icon">
                            <User size={18} />
                          </IconChip>
                          <div className="ui-profiles-card-copy">
                            <div className="ui-profiles-card-title">
                              <h3>{p.name}</h3>
                              {p.isDefault && <Badge variant="neutral">Default</Badge>}
                              {p.gatewayRunning && (
                                <Badge variant="success">
                                  <StatusDot color="var(--success)" pulse /> Gateway
                                </Badge>
                              )}
                            </div>
                            <p>{summaryFor(p)}</p>
                          </div>
                        </div>
                        <div className="ui-profiles-card-meta">
                          <span title={p.model || "No model"}><Brain size={12} /> {p.model || "No model"}</span>
                          <span title={p.provider || "auto"}><Sparkles size={12} /> {p.provider || "auto"}</span>
                          <span><FileText size={12} /> {p.skillCount} skill{p.skillCount !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="ui-profiles-card-actions">
                          <Button variant="ghost" size="sm" disabled={busy === p.name} onClick={(event) => { event.stopPropagation(); void handleActivate(p.name); }}>Activate</Button>
                          <IconButton onClick={(event) => { event.stopPropagation(); void handleClone(p.name); }} title="Clone" disabled={busy === p.name}><Copy size={15} /></IconButton>
                          {!p.isDefault && (
                            <IconButton danger onClick={(event) => { event.stopPropagation(); setDeleteTarget(p.name); }} title="Delete" disabled={busy === p.name}><Trash2 size={15} /></IconButton>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
              </div>

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
        <div className="ui-modal-form">
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
          {createError && <div className="ui-modal-alert" role="alert">{createError}</div>}
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
        <div className="ui-confirm-panel ui-confirm-danger">
          <span className="ui-confirm-icon"><Trash2 size={18} /></span>
          <div className="ui-confirm-copy">
            <strong>Delete {deleteTarget}?</strong>
            <p>
              Its config, models, skills, memory and saved keys are erased from disk. This cannot be undone.
            </p>
          </div>
        </div>
      </Modal>
    </Screen>
  );
}
