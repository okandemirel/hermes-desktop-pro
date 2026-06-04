import { useMemo, useState } from "react";
import { Brain, Plus, Trash2, Check, Pencil } from "lucide-react";
import {
  Screen, Card, Button, IconButton, Input, Select, Field, Tag,
  SearchInput, EmptyState, Modal,
} from "../../ui";

// ─── Types ──────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  category: Category;
  createdAt: number;
}

type Category = "Identity" | "Preferences" | "Project" | "System";

const MAX_ENTRIES = 500;
const CATEGORIES: Category[] = ["Identity", "Preferences", "Project", "System"];
const FILTERS = ["All", ...CATEGORIES] as const;

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ─── Mock data ──────────────────────────────────────────────

const MOCK_MEMORIES: MemoryEntry[] = [
  { id: "m1", key: "user_name", value: "Alex Mercer", category: "Identity", createdAt: Date.now() - HOUR * 2 },
  { id: "m2", key: "user_role", value: "Staff Software Engineer at a fintech startup.", category: "Identity", createdAt: Date.now() - DAY * 1 },
  { id: "m3", key: "communication_style", value: "Prefers concise, direct answers with code-first examples and no preamble.", category: "Identity", createdAt: Date.now() - DAY * 2 },
  { id: "m4", key: "preferred_language", value: "TypeScript — strict mode, no implicit any, ESM modules only.", category: "Preferences", createdAt: Date.now() - HOUR * 6 },
  { id: "m5", key: "code_style", value: "2-space indent, single quotes, trailing commas, functional over OOP.", category: "Preferences", createdAt: Date.now() - DAY * 1 },
  { id: "m6", key: "timezone", value: "America/New_York (UTC-5) — schedule meetings after 10am.", category: "Preferences", createdAt: Date.now() - DAY * 4 },
  { id: "m7", key: "response_format", value: "Markdown with fenced code blocks; tables for comparisons.", category: "Preferences", createdAt: Date.now() - DAY * 5 },
  { id: "m8", key: "project_dir", value: "~/dev/hermes-desktop-pro — Electron + React + Vite monorepo.", category: "Project", createdAt: Date.now() - HOUR * 3 },
  { id: "m9", key: "stack", value: "Electron, React 19, Tailwind v4, Zustand, SQLite (FTS5).", category: "Project", createdAt: Date.now() - DAY * 2 },
  { id: "m10", key: "conventions", value: "Conventional commits, trunk-based, PRs squash-merged to main.", category: "Project", createdAt: Date.now() - DAY * 6 },
  { id: "m11", key: "model_default", value: "claude-sonnet-4 with 200K context; fall back to gpt-4o for vision.", category: "System", createdAt: Date.now() - DAY * 1 },
  { id: "m12", key: "redaction", value: "Strip API keys, tokens, and emails before sending to providers.", category: "System", createdAt: Date.now() - DAY * 7 },
];

// ─── Component ──────────────────────────────────────────────

export default function MemoryView() {
  const [memories, setMemories] = useState<MemoryEntry[]>(MOCK_MEMORIES);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  // Add memory form
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState<Category>(CATEGORIES[0]);

  // Edit + delete
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const usedPct = Math.round((memories.length / MAX_ENTRIES) * 100);
  const categoryCount = new Set(memories.map(m => m.category)).size;

  const filtered = useMemo(() => memories.filter(m => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q);
    const matchesFilter = filter === "All" || m.category === filter;
    return matchesSearch && matchesFilter;
  }), [memories, search, filter]);

  const closeAdd = () => { setShowAdd(false); setNewKey(""); setNewValue(""); setNewCategory(CATEGORIES[0]); };

  const handleAddMemory = () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setMemories(prev => [{
      id: `mem${Date.now()}`,
      key: newKey.trim(),
      value: newValue.trim(),
      category: newCategory,
      createdAt: Date.now(),
    }, ...prev]);
    closeAdd();
  };

  const startEdit = (entry: MemoryEntry) => { setEditingId(entry.id); setEditValue(entry.value); };
  const saveEdit = (id: string) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, value: editValue.trim() || m.value } : m));
    setEditingId(null); setEditValue("");
  };
  const handleDelete = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
    setDeleteConfirm(null);
    if (editingId === id) { setEditingId(null); setEditValue(""); }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Screen
      icon={<Brain size={19} />}
      title="Memory"
      sub="Persistent context for your agent — what Hermes remembers about you across sessions."
      actions={
        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowAdd(true)}>
          Add Memory
        </Button>
      }
    >
      {/* Slim capacity line */}
      <Card pad className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="text-[13px] text-[var(--text-2)]">
            <span className="font-semibold text-[var(--text)]">{memories.length}</span> of {MAX_ENTRIES} memories
            <span className="text-[var(--text-3)]"> · {categoryCount} categories</span>
          </span>
          <span className="text-[12px] font-mono text-[var(--text-3)]">{usedPct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-[var(--surface-3)]">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(usedPct, 2)}%`, background: "var(--accent)" }} />
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
        <Select className="w-auto" value={filter} onChange={e => setFilter(e.target.value as (typeof FILTERS)[number])}>
          {FILTERS.map(f => <option key={f} value={f}>{f}</option>)}
        </Select>
      </div>

      {/* Memory grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Brain size={24} />}
          title={search.trim() || filter !== "All" ? "No matching memories" : "No memories yet"}
          sub={
            search.trim() || filter !== "All"
              ? "Try a different search term or category."
              : "Add memory entries to give your agent persistent context."
          }
          action={<Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowAdd(true)}>Add Memory</Button>}
        />
      ) : (
        <div className="ui-grid stagger">
          {filtered.map(entry => (
            <Card key={entry.id} pad interactive className="group flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <code className="text-[13px] font-mono font-semibold truncate text-[var(--accent-text)]">{entry.key}</code>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => startEdit(entry)} title="Edit"><Pencil size={14} /></IconButton>
                  <IconButton danger onClick={() => setDeleteConfirm(entry.id)} title="Delete"><Trash2 size={14} /></IconButton>
                </div>
              </div>

              {editingId === entry.id ? (
                <Input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEdit(entry.id); if (e.key === "Escape") { setEditingId(null); setEditValue(""); } }}
                  onBlur={() => saveEdit(entry.id)}
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-[var(--text-2)] line-clamp-2">{entry.value}</p>
              )}

              <div className="flex items-center gap-2 mt-auto pt-3.5">
                <Tag>{entry.category}</Tag>
                <span className="text-[11.5px] font-mono text-[var(--text-3)]">{formatDate(entry.createdAt)}</span>
              </div>
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
            <Button variant="primary" leftIcon={<Check size={15} />} disabled={!newKey.trim() || !newValue.trim()} onClick={handleAddMemory}>
              Save Entry
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Key">
            <Input className="font-mono" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. user_name" />
          </Field>
          <Field label="Value">
            <Input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="What should the agent remember?" />
          </Field>
          <Field label="Category">
            <Select value={newCategory} onChange={e => setNewCategory(e.target.value as Category)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Memory Entry?"
        width={400}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-2)] leading-relaxed">
          This will permanently remove this memory entry. The agent will lose this context.
        </p>
      </Modal>
    </Screen>
  );
}
