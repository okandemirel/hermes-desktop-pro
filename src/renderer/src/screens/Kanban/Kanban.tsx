import { useState } from "react";
import {
  Layout, Plus, MoreHorizontal, Calendar, MessageSquare,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, Badge, Tag, StatusDot, SectionLabel,
  SearchInput, EmptyState, IconChip,
} from "../../ui";

type Status = "todo" | "in_progress" | "review" | "done";
type Priority = "low" | "medium" | "high" | "urgent";

interface KanbanTask {
  id: string;
  title: string;
  status: Status;
  assignee: string;
  priority: Priority;
  tags: string[];
  comments: number;
  dueDate: string;
  labelColor: string;
}

const COLUMNS: { id: Status; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "var(--text-3)" },
  { id: "in_progress", label: "In Progress", color: "var(--accent)" },
  { id: "review", label: "Review", color: "var(--warning)" },
  { id: "done", label: "Done", color: "var(--success)" },
];

const MOCK_TASKS: KanbanTask[] = [
  { id: "1", title: "Set up CI/CD pipeline", status: "todo", assignee: "Okan", priority: "high", tags: ["devops", "release"], comments: 3, dueDate: "Jun 9", labelColor: "var(--error)" },
  { id: "2", title: "Fix memory leak in worker", status: "todo", assignee: "Mira", priority: "urgent", tags: ["bug", "backend"], comments: 2, dueDate: "Jun 6", labelColor: "var(--error)" },
  { id: "3", title: "Provider rate-limit backoff", status: "todo", assignee: "Theo", priority: "medium", tags: ["backend"], comments: 1, dueDate: "Jun 12", labelColor: "var(--warning)" },
  { id: "4", title: "Onboarding tour", status: "todo", assignee: "Lena", priority: "low", tags: ["frontend", "ux"], comments: 0, dueDate: "Jun 20", labelColor: "var(--text-3)" },

  { id: "5", title: "Implement user authentication", status: "in_progress", assignee: "Alice", priority: "high", tags: ["backend", "security"], comments: 5, dueDate: "Jun 7", labelColor: "var(--error)" },
  { id: "6", title: "Write API documentation", status: "in_progress", assignee: "Bob", priority: "medium", tags: ["docs"], comments: 1, dueDate: "Jun 11", labelColor: "var(--warning)" },
  { id: "7", title: "Streaming token renderer", status: "in_progress", assignee: "Theo", priority: "high", tags: ["frontend", "perf"], comments: 7, dueDate: "Jun 8", labelColor: "var(--accent)" },
  { id: "8", title: "Skills marketplace search", status: "in_progress", assignee: "Mira", priority: "medium", tags: ["search"], comments: 2, dueDate: "Jun 14", labelColor: "var(--warning)" },

  { id: "9", title: "Design system components", status: "review", assignee: "Lena", priority: "medium", tags: ["design"], comments: 8, dueDate: "Jun 6", labelColor: "var(--accent)" },
  { id: "10", title: "Database migration v2.1", status: "review", assignee: "Alice", priority: "high", tags: ["database"], comments: 6, dueDate: "Jun 5", labelColor: "var(--error)" },
  { id: "11", title: "Telemetry opt-in flow", status: "review", assignee: "Bob", priority: "low", tags: ["privacy"], comments: 3, dueDate: "Jun 10", labelColor: "var(--text-3)" },

  { id: "12", title: "Add dark mode support", status: "done", assignee: "Lena", priority: "low", tags: ["frontend"], comments: 4, dueDate: "Jun 2", labelColor: "var(--text-3)" },
  { id: "13", title: "OpenCode provider adapter", status: "done", assignee: "Theo", priority: "high", tags: ["providers"], comments: 9, dueDate: "Jun 1", labelColor: "var(--accent)" },
  { id: "14", title: "Window vibrancy polish", status: "done", assignee: "Okan", priority: "medium", tags: ["native"], comments: 5, dueDate: "May 30", labelColor: "var(--success)" },
];

const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: "var(--error)",
  high: "var(--error)",
  medium: "var(--warning)",
  low: "var(--text-3)",
};

export default function KanbanView() {
  const [tasks] = useState<KanbanTask[]>(MOCK_TASKS);
  const [filter, setFilter] = useState("");

  const q = filter.toLowerCase().trim();
  const filteredTasks = q
    ? tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.includes(q)))
    : tasks;

  return (
    <Screen
      icon={<Layout size={19} />}
      title="Kanban Board"
      sub="Durable multi-agent board — tasks the agent can pick up and finish on its own."
      actions={
        <>
          <SearchInput value={filter} onChange={setFilter} placeholder="Filter cards…" className="w-[220px]" />
          <Button variant="primary" leftIcon={<Plus size={15} />}>New Task</Button>
        </>
      }
    >
      {filteredTasks.length === 0 ? (
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
              const colTasks = filteredTasks.filter(t => t.status === col.id);
              return (
                <div
                  key={col.id}
                  className="flex-1 min-w-[272px] flex flex-col rounded-[14px] bg-[var(--surface-3)] border border-[var(--border)]"
                  style={{ boxShadow: "var(--edge)" }}
                >
                  {/* Column header — title · count · add */}
                  <div className="flex items-center gap-2 px-3.5 h-[46px] shrink-0">
                    <StatusDot color={col.color} pulse={col.id === "in_progress"} />
                    <SectionLabel>{col.label}</SectionLabel>
                    <Badge className="tabular-nums">{colTasks.length}</Badge>
                    <IconButton className="ml-auto" title="Add a card to this list"><Plus size={15} /></IconButton>
                  </div>

                  {/* Vertical stack of simple cards */}
                  <div className="flex flex-col gap-2.5 px-2.5 pb-2.5 stagger">
                    {colTasks.map(task => (
                      <Card key={task.id} pad interactive className="group relative flex flex-col gap-2 overflow-hidden !p-3">
                        {/* colored top label strip */}
                        <span className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: task.labelColor }} />

                        {/* tags row + card menu */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          {task.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
                          <IconButton
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Card options"
                          >
                            <MoreHorizontal size={15} />
                          </IconButton>
                        </div>

                        {/* title */}
                        <h4 className="text-[13.5px] font-medium text-[var(--text)] leading-snug">{task.title}</h4>

                        {/* compact footer — priority dot · assignee · due · comments */}
                        <div className="flex items-center gap-2.5 text-[11.5px] text-[var(--text-3)]">
                          <StatusDot color={PRIORITY_COLOR[task.priority]} />
                          <IconChip className="w-[20px] h-[20px] rounded-[6px] text-[10.5px] font-semibold">
                            {task.assignee.charAt(0)}
                          </IconChip>
                          <span className="flex items-center gap-1" title={`Due ${task.dueDate}`}>
                            <Calendar size={12} /> {task.dueDate}
                          </span>
                          {task.comments > 0 && (
                            <span className="ml-auto flex items-center gap-1 tabular-nums">
                              <MessageSquare size={12} /> {task.comments}
                            </span>
                          )}
                        </div>
                      </Card>
                    ))}

                    {/* Trello-style "Add a card" affordance */}
                    <Button variant="ghost" size="sm" leftIcon={<Plus size={14} />} className="w-full justify-start text-[var(--text-3)]">
                      Add a card
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Screen>
  );
}
