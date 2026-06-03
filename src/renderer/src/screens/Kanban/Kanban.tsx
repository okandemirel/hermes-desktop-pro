import { useState } from "react";
import { Layout, Plus, MoreHorizontal, Clock, User, MessageSquare, Tag, GripVertical } from "lucide-react";

interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "review" | "done";
  assignee?: string;
  priority: "low" | "medium" | "high";
  tags: string[];
  comments: number;
}

const COLUMNS = [
  { id: "todo", label: "To Do", color: "#6B7280" },
  { id: "in_progress", label: "In Progress", color: "#0A84FF" },
  { id: "review", label: "Review", color: "#F59E0B" },
  { id: "done", label: "Done", color: "#30D158" },
] as const;

const MOCK_TASKS: KanbanTask[] = [
  { id: "1", title: "Set up CI/CD pipeline", description: "Configure GitHub Actions for multi-arch builds", status: "todo", priority: "high", tags: ["devops"], comments: 3 },
  { id: "2", title: "Implement user authentication", description: "Add JWT-based auth with refresh tokens", status: "in_progress", assignee: "alice", priority: "high", tags: ["backend", "security"], comments: 5 },
  { id: "3", title: "Write API documentation", description: "OpenAPI spec for REST endpoints", status: "in_progress", assignee: "bob", priority: "medium", tags: ["docs"], comments: 1 },
  { id: "4", title: "Design system components", description: "Create reusable UI component library", status: "review", priority: "medium", tags: ["frontend", "design"], comments: 8 },
  { id: "5", title: "Fix memory leak in worker", description: "Worker process not releasing buffer after long runs", status: "todo", priority: "high", tags: ["bug", "backend"], comments: 2 },
  { id: "6", title: "Add dark mode support", description: "Implement theme switching with CSS variables", status: "done", priority: "low", tags: ["frontend"], comments: 4 },
  { id: "7", title: "Database migration v2.1", description: "Schema changes for multi-tenancy", status: "review", assignee: "alice", priority: "high", tags: ["backend", "database"], comments: 6 },
];

export default function KanbanView() {
  const [tasks] = useState<KanbanTask[]>(MOCK_TASKS);
  const [filter, setFilter] = useState("");

  const filteredTasks = filter
    ? tasks.filter(t => t.title.toLowerCase().includes(filter.toLowerCase()) || t.tags.some(tag => tag.includes(filter.toLowerCase())))
    : tasks;

  const priorityColor = (p: string) => p === "high" ? "text-red-400 bg-red-400/10" : p === "medium" ? "text-yellow-400 bg-yellow-400/10" : "text-white/30 bg-white/5";

  return (
    <div className="flex flex-col h-full bg-[#0D0D0D]">
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white mb-1">Kanban Board</h1>
          <p className="text-sm text-white/40">Multi-agent task coordination</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter tasks..."
            className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-[#0A84FF]/50 w-48"
          />
          <button className="flex items-center gap-2 px-4 py-2 bg-[#0A84FF] text-white rounded-xl text-sm font-medium hover:bg-[#0A84FF]/90 transition-colors">
            <Plus size={16} />
            New Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-[900px]">
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            return (
              <div key={col.id} className="flex-1 flex flex-col min-w-[240px]">
                <div className="flex items-center gap-2 mb-3 px-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                  <h3 className="text-sm font-semibold text-white/80">{col.label}</h3>
                  <span className="text-[11px] text-white/25 ml-auto">{colTasks.length}</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {colTasks.map(task => (
                    <div key={task.id} className="group p-4 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-white/10 cursor-pointer transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${priorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                        <button className="p-1 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all">
                          <MoreHorizontal size={14} className="text-white/30" />
                        </button>
                      </div>
                      <h4 className="text-sm font-medium text-white mb-1.5">{task.title}</h4>
                      <p className="text-xs text-white/35 mb-3 line-clamp-2">{task.description}</p>
                      <div className="flex items-center gap-2 mb-3">
                        {task.tags.map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/30">{tag}</span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[11px] text-white/25">
                          <span className="flex items-center gap-1"><MessageSquare size={11} /> {task.comments}</span>
                          {task.assignee && (
                            <span className="flex items-center gap-1"><User size={11} /> {task.assignee}</span>
                          )}
                        </div>
                        <Clock size={12} className="text-white/15" />
                      </div>
                    </div>
                  ))}
                  <button className="w-full p-3 rounded-xl border border-dashed border-white/5 text-white/20 text-xs hover:border-white/10 hover:text-white/40 transition-all">
                    <Plus size={14} className="inline mr-1" />
                    Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
