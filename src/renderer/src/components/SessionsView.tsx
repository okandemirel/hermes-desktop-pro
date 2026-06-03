import { useState } from "react";
import { Search, MessageSquare, Calendar, Clock, ArrowRight, Trash2, FolderOpen } from "lucide-react";

interface Session {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  date: string;
  profile: string;
  model: string;
}

const MOCK_SESSIONS: Session[] = [
  { id: "1", title: "Building a React component library", preview: "Let's create a comprehensive component library with TypeScript support...", messageCount: 24, date: "2026-06-03", profile: "default", model: "deepseek-v4" },
  { id: "2", title: "Python data pipeline optimization", preview: "The current pipeline is processing about 500 records per second, we need to...", messageCount: 18, date: "2026-06-02", profile: "work", model: "claude-sonnet-4" },
  { id: "3", title: "Docker compose setup for microservices", preview: "We need to orchestrate 5 services with proper networking and volume mounts...", messageCount: 32, date: "2026-06-02", profile: "default", model: "deepseek-v4" },
  { id: "4", title: "Writing unit tests for API endpoints", preview: "The auth middleware tests need to cover JWT expiration and refresh token flows...", messageCount: 15, date: "2026-06-01", profile: "default", model: "gpt-4o" },
  { id: "5", title: "Kubernetes deployment manifest review", preview: "Let's review the deployment config for the new staging environment...", messageCount: 41, date: "2026-05-31", profile: "work", model: "claude-sonnet-4" },
  { id: "6", title: "Frontend state management with Zustand", preview: "We should migrate from Redux to Zustand for simpler state management...", messageCount: 12, date: "2026-05-30", profile: "default", model: "deepseek-v4" },
  { id: "7", title: "CI/CD pipeline GitHub Actions setup", preview: "The workflow needs to handle multi-arch builds and deployment to ECR...", messageCount: 28, date: "2026-05-29", profile: "work", model: "claude-sonnet-4" },
];

export default function SessionsView() {
  const [search, setSearch] = useState("");
  const [sessions] = useState<Session[]>(MOCK_SESSIONS);

  const filtered = sessions.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.preview.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, s) => {
    const label = s.date === new Date().toISOString().slice(0, 10) ? "Today"
      : s.date === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? "Yesterday"
      : new Date(s.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    (acc[label] ??= []).push(s);
    return acc;
  }, {} as Record<string, Session[]>);

  return (
    <div className="flex flex-col h-full bg-[#0D0D0D]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/5">
        <h1 className="text-xl font-semibold text-white mb-1">Sessions</h1>
        <p className="text-sm text-white/40">Browse and search your conversation history</p>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-white/5">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions with FTS5..."
            className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#0A84FF]/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 mt-2 text-[11px] text-white/25">
          <span>{filtered.length} sessions</span>
          <span>·</span>
          <span>{sessions.reduce((s, x) => s + x.messageCount, 0).toLocaleString()} messages total</span>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {Object.entries(grouped).map(([label, items]) => (
          <div key={label} className="mb-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/25 mb-3">{label}</div>
            <div className="space-y-2">
              {items.map(s => (
                <div
                  key={s.id}
                  className="group flex items-start gap-4 p-4 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-[#0A84FF]/20 hover:bg-[#1A1A1A]/80 cursor-pointer transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare size={18} className="text-[#0A84FF]/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white truncate">{s.title}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/30 shrink-0">{s.profile}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/30 shrink-0">{s.model}</span>
                    </div>
                    <p className="text-xs text-white/35 line-clamp-1 mb-2">{s.preview}</p>
                    <div className="flex items-center gap-3 text-[11px] text-white/25">
                      <span className="flex items-center gap-1"><MessageSquare size={11} /> {s.messageCount} messages</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {s.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-[#0A84FF] transition-colors">
                      <ArrowRight size={14} />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <FolderOpen size={48} className="text-white/10 mb-4" />
            <p className="text-sm text-white/30">No sessions found</p>
            <p className="text-xs text-white/15 mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
}
