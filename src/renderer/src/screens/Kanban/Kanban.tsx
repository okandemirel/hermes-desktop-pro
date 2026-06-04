import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Layout, Plus, MoreHorizontal, MessageSquare, Check, Ban, Trash2,
  UserPlus, RotateCcw,
} from "lucide-react";
import type { KanbanTask } from "@shared/types";
import {
  Screen, Card, Button, IconButton, Badge, StatusDot, SectionLabel,
  SearchInput, EmptyState, IconChip, Modal, Field, Input, Textarea, Select,
} from "../../ui";

// The four Hallmark columns. Each owns a set of backend status strings; unknown
// statuses fall through to "To Do" so nothing silently disappears.
type ColumnId = "todo" | "in_progress" | "review" | "done";

const COLUMNS: { id: ColumnId; label: string; color: string; statuses: string[] }[] = [
  { id: "todo", label: "To Do", color: "var(--text-3)", statuses: ["todo", "triage"] },
  { id: "in_progress", label: "In Progress", color: "var(--accent)", statuses: ["in_progress", "running", "active"] },
  { id: "review", label: "Review", color: "var(--warning)", statuses: ["review", "ready", "blocked"] },
  { id: "done", label: "Done", color: "var(--success)", statuses: ["done", "completed", "archived"] },
];

// Map a backend status string to one of the four columns. Unknown → "todo".
function columnForStatus(status: string): ColumnId {
  const s = (status || "").toLowerCase();
  const col = COLUMNS.find((c) => c.statuses.includes(s));
  return col ? col.id : "todo";
}

// Priority is a number on the backend (0 normal … 10 urgent). Bucket it for the
// card strip + footer dot so colour and weight always agree.
type PriorityBucket = "urgent" | "high" | "medium" | "low";

function priorityBucket(p: number): PriorityBucket {
  if (p >= 10) return "urgent";
  if (p >= 5) return "high";
  if (p > 0) return "medium";
  return "low";
}

const PRIORITY_COLOR: Record<PriorityBucket, string> = {
  urgent: "var(--error)",
  high: "var(--error)",
  medium: "var(--warning)",
  low: "var(--text-3)",
};

// Top-strip weight encodes priority intensity — a quiet hierarchy cue, not a new color.
const PRIORITY_STRIP: Record<PriorityBucket, { height: number; opacity: number }> = {
  urgent: { height: 4, opacity: 1 },
  high: { height: 3, opacity: 0.9 },
  medium: { height: 2.5, opacity: 0.7 },
  low: { height: 2, opacity: 0.45 },
};

export default function KanbanView() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // New-task form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formPriority, setFormPriority] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.hermes.kanbanListTasks();
      if (!res.success) {
        setTasks([]);
        setUnsupported(Boolean(res.unsupportedMode));
        setError(res.unsupportedMode ? "" : res.error || "Failed to load tasks.");
        return;
      }
      const list = res.data ?? [];
      setTasks(list);
      setUnsupported(false);
      setError("");
      // Comment counts come from per-task detail — best-effort, never blocks the board.
      const counts: Record<string, number> = {};
      await Promise.all(
        list.map(async (task: KanbanTask) => {
          try {
            const detail = await window.hermes.kanbanGetTask(task.id);
            if (detail.success && detail.data) {
              counts[task.id] = detail.data.comments?.length ?? 0;
            }
          } catch {
            /* leave count unset */
          }
        }),
      );
      setCommentCounts(counts);
    } catch (err) {
      setTasks([]);
      setUnsupported(false);
      setError((err as Error)?.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = filter.toLowerCase().trim();
  const filteredTasks = useMemo(() => {
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.assignee || "").toLowerCase().includes(q) ||
        (t.body || "").toLowerCase().includes(q),
    );
  }, [tasks, q]);

  const resetForm = () => {
    setFormTitle("");
    setFormBody("");
    setFormAssignee("");
    setFormPriority("0");
  };

  const openCreate = () => {
    setError("");
    resetForm();
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    setBusy(true);
    try {
      const res = await window.hermes.kanbanCreateTask({
        title: formTitle.trim(),
        body: formBody.trim() || undefined,
        assignee: formAssignee.trim() || undefined,
        priority: parseInt(formPriority, 10) || 0,
      });
      if (!res.success) {
        setError(res.error || "Failed to create task.");
        return;
      }
      setShowForm(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Card actions — each runs the matching op then reloads the board.
  const runAction = async (
    op: () => Promise<{ success: boolean; error?: string }>,
    failMsg: string,
  ) => {
    setBusy(true);
    setMenuFor(null);
    try {
      const res = await op();
      if (!res.success) {
        setError(res.error || failMsg);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const assignToMe = (task: KanbanTask) =>
    runAction(() => window.hermes.kanbanAssignTask(task.id, "me"), "Failed to assign task.");
  const completeTask = (task: KanbanTask) =>
    runAction(() => window.hermes.kanbanCompleteTask(task.id), "Failed to complete task.");
  const blockTask = (task: KanbanTask) =>
    runAction(() => window.hermes.kanbanBlockTask(task.id), "Failed to block task.");
  const unblockTask = (task: KanbanTask) =>
    runAction(() => window.hermes.kanbanUnblockTask(task.id), "Failed to unblock task.");
  const archiveTask = (task: KanbanTask) =>
    runAction(() => window.hermes.kanbanArchiveTask(task.id), "Failed to archive task.");

  return (
    <Screen
      icon={<Layout size={19} />}
      kicker="Task Board"
      title="Kanban Board"
      sub="Durable multi-agent board — tasks the agent can pick up and finish on its own."
      actions={
        <>
          <SearchInput value={filter} onChange={setFilter} placeholder="Filter cards…" className="w-[220px]" />
          <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openCreate}>New Task</Button>
        </>
      }
    >
      {/* gold-filament divider — separates the editorial header from the board (cohesion with Settings/Chat) */}
      <div className="ui-divider-gold mb-4" />

      {error && (
        <div className="mb-4 text-[12.5px] text-[var(--danger)]">{error}</div>
      )}

      {loading ? (
        <div className="text-[13px] text-[var(--text-3)] py-8">Loading board…</div>
      ) : unsupported ? (
        <EmptyState
          icon={<Layout size={22} />}
          title="Kanban needs local or SSH mode"
          sub="Plain remote (HTTP + API key) mode can't reach the kanban API yet. Switch to a local Hermes install or SSH tunnel mode in Settings to use the board."
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Layout size={22} />}
          title="No tasks yet"
          sub="Create your first task and the agent can pick it up and run it to completion."
          action={
            <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openCreate}>
              New Task
            </Button>
          }
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<Layout size={22} />}
          title="No matching cards"
          sub={`Nothing matches “${filter}”. Adjust your filter or create a new task.`}
          action={<Button variant="secondary" onClick={() => setFilter("")}>Clear filter</Button>}
        />
      ) : (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-4 items-start min-w-[1140px]">
            {COLUMNS.map(col => {
              const colTasks = filteredTasks.filter(t => columnForStatus(t.status) === col.id);
              const isActive = col.id === "in_progress";
              return (
                <div
                  key={col.id}
                  className="flex-1 min-w-[272px] flex flex-col rounded-[14px] bg-[var(--surface-3)] border border-[var(--border)]"
                  style={{ boxShadow: "var(--edge)" }}
                >
                  {/* Column header — title · count · add. The active "In Progress" column carries the gold thread. */}
                  <div className="relative flex items-center gap-2 px-3.5 h-[46px] shrink-0">
                    <StatusDot color={col.color} pulse={isActive} />
                    <SectionLabel>{col.label}</SectionLabel>
                    <Badge variant={isActive ? "accent" : "neutral"} className="tabular-nums">
                      {colTasks.length}
                    </Badge>
                    <IconButton className="ml-auto" title="Add a card to this list" onClick={openCreate}><Plus size={15} /></IconButton>
                    {isActive && (
                      <span className="ui-divider-gold absolute left-3.5 right-3.5 bottom-0" />
                    )}
                  </div>

                  {/* Vertical stack of simple cards */}
                  <div className="flex flex-col gap-2.5 px-2.5 pb-2.5 stagger">
                    {colTasks.map(task => {
                      const bucket = priorityBucket(task.priority);
                      const isBlocked = (task.status || "").toLowerCase() === "blocked";
                      const comments = commentCounts[task.id] ?? 0;
                      const assigneeInitial = (task.assignee || "?").charAt(0).toUpperCase();
                      return (
                      <Card key={task.id} pad interactive className="group relative flex flex-col gap-2 overflow-hidden !p-3">
                        {/* top strip encodes priority — colour from PRIORITY_COLOR, weight from PRIORITY_STRIP, so it always agrees with the footer dot */}
                        <span
                          className="absolute left-0 right-0 top-0"
                          style={{
                            height: PRIORITY_STRIP[bucket].height,
                            opacity: PRIORITY_STRIP[bucket].opacity,
                            background: PRIORITY_COLOR[bucket],
                          }}
                        />

                        {/* status row + card menu */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">{task.status}</span>
                          <div className="relative ml-auto">
                            <IconButton
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Card options"
                              onClick={() => setMenuFor(menuFor === task.id ? null : task.id)}
                            >
                              <MoreHorizontal size={15} />
                            </IconButton>
                            {menuFor === task.id && (
                              <div
                                className="absolute right-0 top-[26px] z-10 min-w-[170px] rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] py-1 text-[12.5px]"
                                style={{ boxShadow: "var(--shadow-pop, var(--edge))" }}
                              >
                                <button className="ui-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-40" disabled={busy} onClick={() => assignToMe(task)}>
                                  <UserPlus size={13} /> Assign to me
                                </button>
                                <button className="ui-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-40" disabled={busy} onClick={() => completeTask(task)}>
                                  <Check size={13} /> Mark complete
                                </button>
                                {isBlocked ? (
                                  <button className="ui-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-40" disabled={busy} onClick={() => unblockTask(task)}>
                                    <RotateCcw size={13} /> Unblock
                                  </button>
                                ) : (
                                  <button className="ui-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-40" disabled={busy} onClick={() => blockTask(task)}>
                                    <Ban size={13} /> Block
                                  </button>
                                )}
                                <button className="ui-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--danger)] hover:bg-[var(--surface-3)] disabled:opacity-40" disabled={busy} onClick={() => archiveTask(task)}>
                                  <Trash2 size={13} /> Archive
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* title */}
                        <h4 className="text-[13.5px] font-medium text-[var(--text)] leading-snug">{task.title}</h4>

                        {/* body preview — kept short so cards stay compact */}
                        {task.body && (
                          <p className="text-[12px] text-[var(--text-3)] leading-snug line-clamp-2">{task.body}</p>
                        )}

                        {/* compact footer — priority dot · assignee · comments */}
                        <div className="flex items-center gap-2.5 text-[11.5px] text-[var(--text-3)]">
                          <StatusDot color={PRIORITY_COLOR[bucket]} />
                          <IconChip className="w-[20px] h-[20px] rounded-[6px] text-[10.5px] font-semibold">
                            {assigneeInitial}
                          </IconChip>
                          <span className="truncate" title={task.assignee || "Unassigned"}>
                            {task.assignee || "Unassigned"}
                          </span>
                          {comments > 0 && (
                            <span className="ml-auto flex items-center gap-1 tabular-nums">
                              <MessageSquare size={12} /> {comments}
                            </span>
                          )}
                        </div>
                      </Card>
                      );
                    })}

                    {/* "Add a card" affordance — tinted down so empty columns recede rather than compete */}
                    <Button variant="ghost" size="sm" leftIcon={<Plus size={14} />} onClick={openCreate} className="w-full justify-start text-[var(--text-3)] opacity-50 hover:opacity-100 transition-opacity">
                      Add a card
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New task modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New Task"
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!formTitle.trim() || busy}>
              Create Task
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="What needs to be done?"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Optional details for the agent."
              rows={4}
            />
          </Field>
          <Field label="Assignee">
            <Input
              type="text"
              value={formAssignee}
              onChange={(e) => setFormAssignee(e.target.value)}
              placeholder="Optional — e.g. me"
            />
          </Field>
          <Field label="Priority">
            <Select value={formPriority} onChange={(e) => setFormPriority(e.target.value)}>
              <option value="0">Normal</option>
              <option value="1">Low</option>
              <option value="5">High</option>
              <option value="10">Urgent</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </Screen>
  );
}
