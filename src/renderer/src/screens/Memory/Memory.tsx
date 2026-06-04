import { useEffect, useMemo, useState } from "react";
import { Brain, Plus, Trash2, Check, Pencil, X } from "lucide-react";
import {
  Screen, Card, Button, IconButton, Textarea, Field,
  SearchInput, EmptyState, Modal,
} from "../../ui";
import type { MemoryInfo, MemoryEntry } from "@shared/types";

// ─── Component ──────────────────────────────────────────────
//
// Wired to the real backend: a single MEMORY.md of indexed, free-text
// entries (no key/value/category — that was mock invention). The hero
// reports how much of the character budget the agent's recall occupies.

export default function MemoryView() {
  const [info, setInfo] = useState<MemoryInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Add memory form
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Edit + delete (keyed by entry index — the backend's identity)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const data = await window.hermes.readMemory();
      setInfo(data);
      setError(null);
    } catch {
      setError("Could not load memory.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await window.hermes.readMemory();
        if (active) setInfo(data);
      } catch {
        if (active) setError("Could not load memory.");
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const entries = info?.memory.entries ?? [];
  const charCount = info?.memory.charCount ?? 0;
  const charLimit = info?.memory.charLimit ?? 0;
  const usedPct = charLimit > 0 ? Math.round((charCount / charLimit) * 100) : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.content.toLowerCase().includes(q));
  }, [entries, search]);

  const closeAdd = () => {
    setShowAdd(false);
    setNewContent("");
    setAddError(null);
  };

  const handleAddMemory = async () => {
    const content = newContent.trim();
    if (!content) return;
    const res = await window.hermes.addMemoryEntry(content);
    if (!res.success) {
      setAddError(res.error ?? "Could not add entry.");
      return;
    }
    closeAdd();
    await refresh();
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingIndex(entry.index);
    setEditValue(entry.content);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
    setEditError(null);
  };

  const saveEdit = async (index: number) => {
    const content = editValue.trim();
    if (!content) {
      cancelEdit();
      return;
    }
    const res = await window.hermes.updateMemoryEntry(index, content);
    if (!res.success) {
      setEditError(res.error ?? "Could not save entry.");
      return;
    }
    cancelEdit();
    await refresh();
  };

  const handleDelete = async (index: number) => {
    await window.hermes.removeMemoryEntry(index);
    setDeleteConfirm(null);
    if (editingIndex === index) cancelEdit();
    await refresh();
  };

  return (
    <Screen
      icon={<Brain size={19} />}
      kicker="Agent Recall"
      title="Memory"
      sub={
        <>
          Persistent context for your agent — what Hermes remembers about you
          across sessions, stored in <code className="ui-kbd">MEMORY.md</code>.
        </>
      }
      actions={
        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowAdd(true)}>
          Add Memory
        </Button>
      }
    >
      <hr className="ui-divider-gold mt-5 mb-7 mint-in mint-in-1" />

      {/* ── Signature: recall budget, struck as the editorial hero ── */}
      <Card pad className="mb-8 mint-in mint-in-1 flex items-center gap-5">
        <span className="ui-stamp w-[58px] h-[58px] rounded-full text-[var(--accent-text)]">
          <Brain size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="ui-eyebrow">Recall Budget</div>
          <h2 className="serif text-[var(--text)] leading-none" style={{ fontSize: "clamp(24px, 2.6vw, 31px)", letterSpacing: "-0.012em" }}>
            {charCount.toLocaleString()}<span className="text-[var(--text-3)]"> / {charLimit.toLocaleString()}</span> chars
          </h2>
          <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-[var(--surface-3)]">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(Math.max(usedPct, 2), 100)}%`, background: "var(--gold-grad)" }} />
          </div>
        </div>
        <div className="self-start shrink-0 text-right">
          <div className="serif text-[22px] leading-none text-[var(--accent-text)]">{usedPct}%</div>
          <div className="text-[11px] text-[var(--text-3)] mt-1.5">{entries.length} {entries.length === 1 ? "entry" : "entries"}</div>
        </div>
      </Card>

      {/* Single control row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search memories…"
          className="flex-1 min-w-[240px]"
        />
      </div>

      {/* Memory grid */}
      {error ? (
        <EmptyState
          icon={<Brain size={24} />}
          title="Could not load memory"
          sub="Hermes could not read MEMORY.md. Check your connection and try again."
        />
      ) : !loaded ? (
        <EmptyState icon={<Brain size={24} />} title="Loading memory…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Brain size={24} />}
          title={search.trim() ? "No matching memories" : "No memories yet"}
          sub={
            search.trim()
              ? "Try a different search term."
              : "Add memory entries to give your agent persistent context."
          }
          action={
            !search.trim() ? (
              <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowAdd(true)}>Add Memory</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="ui-grid stagger">
          {filtered.map((entry) => (
            <Card key={entry.index} pad interactive className="group flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <span className="text-[11.5px] font-mono text-[var(--text-3)]">#{entry.index + 1}</span>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingIndex === entry.index ? (
                    <>
                      <IconButton onClick={() => saveEdit(entry.index)} title="Save"><Check size={14} /></IconButton>
                      <IconButton onClick={cancelEdit} title="Cancel"><X size={14} /></IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton onClick={() => startEdit(entry)} title="Edit"><Pencil size={14} /></IconButton>
                      <IconButton danger onClick={() => setDeleteConfirm(entry.index)} title="Delete"><Trash2 size={14} /></IconButton>
                    </>
                  )}
                </div>
              </div>

              {editingIndex === entry.index ? (
                <>
                  <Textarea
                    autoFocus
                    rows={4}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                  />
                  {editError && (
                    <p className="text-[12px] text-[var(--error)] mt-2">{editError}</p>
                  )}
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-[var(--text-2)] whitespace-pre-wrap">{entry.content}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add memory modal */}
      <Modal
        open={showAdd}
        onClose={closeAdd}
        title="New Memory Entry"
        footer={
          <>
            <Button variant="secondary" onClick={closeAdd}>Cancel</Button>
            <Button variant="primary" leftIcon={<Check size={15} />} disabled={!newContent.trim()} onClick={handleAddMemory}>
              Save Entry
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="What should the agent remember?">
            <Textarea
              autoFocus
              rows={5}
              value={newContent}
              onChange={(e) => { setNewContent(e.target.value); setAddError(null); }}
              placeholder="e.g. Prefers concise, code-first answers with no preamble."
            />
          </Field>
          {addError && (
            <p className="text-[12px] text-[var(--error)]">{addError}</p>
          )}
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Memory Entry?"
        width={400}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => deleteConfirm !== null && handleDelete(deleteConfirm)}>Delete</Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-2)] leading-relaxed">
          This permanently removes this entry from MEMORY.md. The agent will lose this context.
        </p>
      </Modal>
    </Screen>
  );
}
