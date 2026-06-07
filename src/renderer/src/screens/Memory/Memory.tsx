import { useEffect, useMemo, useState } from "react";
import { Brain, Plus, Trash2, Check, Pencil, X, Database, FileText } from "lucide-react";
import {
  Screen, Card, Button, IconButton, Textarea, Field,
  SearchInput, EmptyState, Modal, Badge,
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
      className="ui-memory-console"
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
      <div className="ui-memory-shell">
        <Card pad className="ui-memory-hero mint-in mint-in-1">
          <div className="ui-memory-hero-mark">
            <Brain size={26} />
          </div>
          <div className="ui-memory-hero-copy">
            <div className="ui-eyebrow">Recall Budget</div>
            <h2>
              {charCount.toLocaleString()}<span> / {charLimit.toLocaleString()}</span> chars
            </h2>
            <p>
              Persistent notes are stored as indexed free-text entries. Hermes uses them as durable context across sessions.
            </p>
            <div className="ui-memory-progress">
              <div style={{ width: `${Math.min(Math.max(usedPct, 2), 100)}%` }} />
            </div>
          </div>
          <div className="ui-memory-metrics">
            <div>
              <span>Used</span>
              <strong>{usedPct}%</strong>
            </div>
            <div>
              <span>Entries</span>
              <strong>{entries.length}</strong>
            </div>
            <div>
              <span>Visible</span>
              <strong>{filtered.length}</strong>
            </div>
          </div>
        </Card>

        <div className="ui-memory-toolbar mint-in mint-in-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search memories..."
            className="ui-memory-search"
          />
          <Badge variant="neutral">
            <Database size={12} />
            MEMORY.md
          </Badge>
        </div>

        {error ? (
          <EmptyState
            icon={<Brain size={24} />}
            title="Could not load memory"
            sub="Hermes could not read MEMORY.md. Check your connection and try again."
          />
        ) : !loaded ? (
          <EmptyState icon={<Brain size={24} />} title="Loading memory..." />
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
          <div className="ui-memory-grid stagger">
            {filtered.map((entry) => (
              <Card key={entry.index} pad interactive className="ui-memory-card">
                <div className="ui-memory-card-head">
                  <div>
                    <FileText size={14} />
                    <span>#{entry.index + 1}</span>
                  </div>
                  <div className="ui-memory-card-actions">
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
                  <p>{entry.content}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

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
        <div className="ui-modal-form">
          <Field label="What should the agent remember?">
            <Textarea
              autoFocus
              rows={5}
              value={newContent}
              onChange={(e) => { setNewContent(e.target.value); setAddError(null); }}
              placeholder="e.g. Prefers concise, code-first answers with no preamble."
            />
          </Field>
          {addError && <div className="ui-modal-alert" role="alert">{addError}</div>}
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
        <div className="ui-confirm-panel ui-confirm-danger">
          <span className="ui-confirm-icon"><Trash2 size={18} /></span>
          <div className="ui-confirm-copy">
            <strong>Delete memory entry?</strong>
            <p>This permanently removes this entry from MEMORY.md. The agent will lose this context.</p>
          </div>
        </div>
      </Modal>
    </Screen>
  );
}
