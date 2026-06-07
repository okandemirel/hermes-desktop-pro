import { useState, useEffect, useCallback, useMemo, type MouseEvent } from "react";
import { createPortal } from "react-dom";
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
type KanbanMenu = { taskId: string; left: number; top: number };

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

function KanbanLoadingBoard(): React.JSX.Element {
  return (
    <div className="ui-kanban-loading">
      <div className="ui-kanban-loading-head">
        <div>
          <SectionLabel>Board Sync</SectionLabel>
          <strong>Loading task lanes</strong>
        </div>
        <Badge variant="accent">
          <StatusDot color="var(--accent)" pulse />
          Fetching
        </Badge>
      </div>
      <div className="ui-kanban-loading-board">
        {COLUMNS.map((column) => (
          <div key={column.id} className="ui-kanban-loading-column">
            <div className="ui-kanban-loading-title">
              <StatusDot color={column.color} />
              <span>{column.label}</span>
            </div>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KanbanView() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<KanbanMenu | null>(null);

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
      setCommentCounts({});
      setUnsupported(false);
      setError("");
      // Comment counts come from per-task detail; fetch them in the background
      // so the board does not stay stuck in a loading skeleton.
      const counts: Record<string, number> = {};
      void Promise.all(
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
      ).then(() => setCommentCounts(counts));
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

  useEffect(() => {
    if (!menu) return;
    const closeMenu = () => setMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".ui-kanban-card-menu, .ui-kanban-card-menu-trigger")) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  useEffect(() => {
    setMenu(null);
  }, [filter, loading]);

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

  const boardStats = useMemo(() => {
    const active = tasks.filter((task) => columnForStatus(task.status) === "in_progress").length;
    const review = tasks.filter((task) => columnForStatus(task.status) === "review").length;
    const blocked = tasks.filter((task) => (task.status || "").toLowerCase() === "blocked").length;
    const urgent = tasks.filter((task) => priorityBucket(task.priority) === "urgent").length;
    return { total: tasks.length, active, review, blocked, urgent };
  }, [tasks]);

  const menuTask = useMemo(
    () => (menu ? tasks.find((task) => task.id === menu.taskId) ?? null : null),
    [menu, tasks],
  );

  const resetForm = () => {
    setFormTitle("");
    setFormBody("");
    setFormAssignee("");
    setFormPriority("0");
  };

  const openCreate = () => {
    setError("");
    setMenu(null);
    resetForm();
    setShowForm(true);
  };

  const toggleCardMenu = (task: KanbanTask, event: MouseEvent<HTMLButtonElement>) => {
    if (menu?.taskId === task.id) {
      setMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 150;
    setMenu({
      taskId: task.id,
      left: Math.min(Math.max(12, rect.right - menuWidth), window.innerWidth - menuWidth - 12),
      top: Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12),
    });
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
    setMenu(null);
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
      className="ui-kanban-screen"
      icon={<Layout size={19} />}
      kicker="Task Board"
      title="Kanban Board"
      sub="Durable multi-agent board — tasks the agent can pick up and finish on its own."
      actions={
        <div className="ui-kanban-actions">
          <SearchInput value={filter} onChange={setFilter} placeholder="Filter cards…" className="ui-kanban-search" />
          <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openCreate}>New Task</Button>
        </div>
      }
    >
      {error && (
        <div className="ui-kanban-error">{error}</div>
      )}

      {loading ? (
        <KanbanLoadingBoard />
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
        <>
          <div className="ui-kanban-command-strip">
            <Card className="ui-kanban-stat-card">
              <span>Cards</span>
              <strong>{boardStats.total}</strong>
            </Card>
            <Card className="ui-kanban-stat-card">
              <span>Active</span>
              <strong>{boardStats.active}</strong>
            </Card>
            <Card className="ui-kanban-stat-card">
              <span>Review</span>
              <strong>{boardStats.review}</strong>
            </Card>
            <Card className="ui-kanban-stat-card" active={boardStats.blocked > 0 || boardStats.urgent > 0}>
              <span>Risk</span>
              <strong>{boardStats.blocked + boardStats.urgent}</strong>
            </Card>
          </div>

          <div className="ui-kanban-scroll">
            <div className="ui-kanban-board">
            {COLUMNS.map(col => {
              const colTasks = filteredTasks.filter(t => columnForStatus(t.status) === col.id);
              const isActive = col.id === "in_progress";
              return (
                <div
                  key={col.id}
                  className="ui-kanban-column"
                  aria-label={`${col.label} lane`}
                >
                  {/* Column header — title · count · add. The active "In Progress" column carries the gold thread. */}
                  <div className="ui-kanban-column-head">
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
                  <div className="ui-kanban-card-stack stagger">
                    {colTasks.map(task => {
                      const bucket = priorityBucket(task.priority);
                      const comments = commentCounts[task.id] ?? 0;
                      const assigneeInitial = (task.assignee || "?").charAt(0).toUpperCase();
                      return (
                      <Card
                        key={task.id}
                        pad
                        interactive
                        className="ui-kanban-task-card group"
                      >
                        {/* Priority rail stays quiet while matching the footer dot. */}
                        <span
                          className="absolute left-0 top-0 bottom-0"
                          style={{
                            width: PRIORITY_STRIP[bucket].height,
                            opacity: PRIORITY_STRIP[bucket].opacity,
                            background: PRIORITY_COLOR[bucket],
                          }}
                        />

                        {/* status row + card menu */}
                        <div className="ui-kanban-card-status">
                          <span className="ui-kanban-card-status-label" title={task.status}>{task.status}</span>
                          <div className="ml-auto">
                            <IconButton
                              className="ui-kanban-card-menu-trigger"
                              title="Card options"
                              aria-expanded={menu?.taskId === task.id}
                              onClick={(event) => toggleCardMenu(task, event)}
                            >
                              <MoreHorizontal size={15} />
                            </IconButton>
                          </div>
                        </div>

                        {/* title */}
                        <h4 className="ui-kanban-card-title" title={task.title}>{task.title}</h4>

                        {/* body preview — kept short so cards stay compact */}
                        {task.body && (
                          <p className="ui-kanban-card-body">{task.body}</p>
                        )}

                        {/* compact footer — priority dot · assignee · comments */}
                        <div className="ui-kanban-card-footer">
                          <StatusDot color={PRIORITY_COLOR[bucket]} />
                          <IconChip className="w-[20px] h-[20px] rounded-[6px] text-[10.5px] font-semibold">
                            {assigneeInitial}
                          </IconChip>
                          <span className="truncate" title={task.assignee || "Unassigned"}>
                            {task.assignee || "Unassigned"}
                          </span>
                          {comments > 0 && (
                            <span className="ui-kanban-card-comments ml-auto flex items-center gap-1 tabular-nums">
                              <MessageSquare size={12} /> {comments}
                            </span>
                          )}
                        </div>
                      </Card>
                      );
                    })}

                    {colTasks.length === 0 && (
                      <div className="ui-kanban-empty-lane">
                        <span>No cards</span>
                        <small>Ready for the next task</small>
                      </div>
                    )}

                    {/* "Add a card" affordance — tinted down so empty columns recede rather than compete */}
                    <Button variant="ghost" size="sm" leftIcon={<Plus size={14} />} onClick={openCreate} className="ui-kanban-add-card w-full justify-start text-[var(--text-3)] opacity-50 hover:opacity-100 transition-opacity">
                      Add a card
                    </Button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {menu && menuTask && createPortal((
            <div
              className="ui-kanban-card-menu"
              role="menu"
              aria-label="Card actions"
              style={{ left: menu.left, top: menu.top }}
            >
              <button type="button" role="menuitem" className="ui-kanban-menu-item ui-menu-item" disabled={busy} onClick={() => assignToMe(menuTask)}>
                <UserPlus size={13} /> Assign to me
              </button>
              <button type="button" role="menuitem" className="ui-kanban-menu-item ui-menu-item" disabled={busy} onClick={() => completeTask(menuTask)}>
                <Check size={13} /> Mark complete
              </button>
              {(menuTask.status || "").toLowerCase() === "blocked" ? (
                <button type="button" role="menuitem" className="ui-kanban-menu-item ui-menu-item" disabled={busy} onClick={() => unblockTask(menuTask)}>
                  <RotateCcw size={13} /> Unblock
                </button>
              ) : (
                <button type="button" role="menuitem" className="ui-kanban-menu-item ui-menu-item" disabled={busy} onClick={() => blockTask(menuTask)}>
                  <Ban size={13} /> Block
                </button>
              )}
              <button type="button" role="menuitem" className="ui-kanban-menu-item ui-kanban-menu-item-danger ui-menu-item" disabled={busy} onClick={() => archiveTask(menuTask)}>
                <Trash2 size={13} /> Archive
              </button>
            </div>
          ), document.body)}
        </>
      )}

      {/* New task modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New Task"
        kicker="Board Intake"
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
        <div className="ui-modal-form ui-kanban-modal-form">
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
