import { useState } from "react";
import { MessageSquare, Clock, ArrowRight, Trash2 } from "lucide-react";
import { Screen, SearchInput, SectionLabel, Card, Badge, IconChip, IconButton, EmptyState } from "../ui";

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

  const totalMessages = sessions.reduce((s, x) => s + x.messageCount, 0);

  return (
    <Screen
      icon={<MessageSquare size={19} />}
      title="Sessions"
      sub="Browse and search your conversation history — full-text search across every message."
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="accent">{filtered.length} session{filtered.length !== 1 ? "s" : ""}</Badge>
          <Badge variant="neutral">{totalMessages.toLocaleString()} messages</Badge>
        </div>
      }
    >
      <div className="mb-7">
        <SearchInput value={search} onChange={setSearch} placeholder="Search sessions with FTS5…" />
      </div>

      {Object.entries(grouped).map(([label, items]) => (
        <div key={label} className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <SectionLabel>{label}</SectionLabel>
            <Badge variant="neutral">{items.length}</Badge>
          </div>
          <div className="flex flex-col gap-2.5 stagger">
            {items.map(s => (
              <Card key={s.id} interactive pad onClick={() => {}} className="group flex items-start gap-4">
                <IconChip><MessageSquare size={18} /></IconChip>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{s.title}</h3>
                    <Badge variant="neutral">{s.profile}</Badge>
                    <Badge variant="accent" className="font-mono">{s.model}</Badge>
                  </div>
                  <p className="text-[13px] text-[var(--text-2)] line-clamp-1 mb-2.5">{s.preview}</p>
                  <div className="flex items-center gap-4 text-[11.5px] text-[var(--text-3)]">
                    <span className="flex items-center gap-1.5"><MessageSquare size={12} /> {s.messageCount} messages</span>
                    <span className="flex items-center gap-1.5 font-mono"><Clock size={12} /> {s.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <IconButton title="Open session"><ArrowRight size={15} /></IconButton>
                  <IconButton danger title="Delete session"><Trash2 size={15} /></IconButton>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={24} />}
          title="No sessions found"
          sub="Try a different search term."
        />
      )}
    </Screen>
  );
}
