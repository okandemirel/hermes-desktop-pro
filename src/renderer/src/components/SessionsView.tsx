import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Clock, ArrowRight, Trash2, Plus } from "lucide-react";
import { Screen, SearchInput, SectionLabel, Card, Badge, Button, IconButton, EmptyState } from "../ui";

// Structural shapes returned by the preload bridge. The list path mirrors
// SessionSummary minus `preview` (the backend always sends ""); the search
// path mirrors SessionSearchResult. Declared locally so the normalizers
// accept the preload's narrower return types without a lossy cast.
type SummaryShape = {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
};
type SearchShape = {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
};

interface SessionsViewProps {
  onResumeSession?: (sessionId: string, title?: string) => void;
  onNewSession?: () => void;
}

// A single render-ready row, normalized from either listSessions
// (SessionSummary) or searchSessions (SessionSearchResult). The backend has
// no per-session "preview"; search supplies a `snippet` instead.
interface SessionRow {
  id: string;
  title: string;
  source: string;
  model: string;
  messageCount: number;
  startedAt: number; // unix seconds (agent state.db)
  snippet: string;
}

function titleFor(id: string, title: string | null): string {
  const trimmed = (title || "").trim();
  if (trimmed) return trimmed;
  return `Session ${id.slice(-6)}`;
}

function fromSummary(s: SummaryShape): SessionRow {
  return {
    id: s.id,
    title: titleFor(s.id, s.title),
    source: s.source || "cli",
    model: s.model || "",
    messageCount: s.messageCount,
    startedAt: s.startedAt,
    snippet: "",
  };
}

function fromSearch(r: SearchShape): SessionRow {
  return {
    id: r.sessionId,
    title: titleFor(r.sessionId, r.title),
    source: r.source || "cli",
    model: r.model || "",
    messageCount: r.messageCount,
    startedAt: r.startedAt,
    snippet: r.snippet || "",
  };
}

function dayKey(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function groupLabel(unixSeconds: number): string {
  const key = dayKey(unixSeconds);
  if (!key) return "Earlier";
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function dateLabel(unixSeconds: number): string {
  return dayKey(unixSeconds) || "—";
}

// Renders the FTS snippet, turning the agent's <<…>> match markers into
// highlighted spans. Falls back to plain text when no markers are present.
function Snippet({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(<<[^>]*>>)/g).filter(Boolean);
  return (
    <p className="text-[13px] text-[var(--text-2)] line-clamp-1 mb-2.5">
      {parts.map((p, i) =>
        p.startsWith("<<") && p.endsWith(">>") ? (
          <mark key={i} className="bg-[var(--accent-weak)] text-[var(--accent-text)] rounded px-0.5">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export default function SessionsView({ onResumeSession, onNewSession }: SessionsViewProps) {
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [results, setResults] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await window.hermes.listSessions(100, 0);
      setSessions((rows || []).map(fromSummary));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Server-side FTS search, debounced. An empty query clears results so the
  // grouped local list shows through.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const id = setTimeout(async () => {
      try {
        const rows = await window.hermes.searchSessions(q, 30);
        if (seq === searchSeq.current) {
          setResults((rows || []).map(fromSearch));
        }
      } catch {
        if (seq === searchSeq.current) setResults([]);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [search]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(id);
      try {
        await window.hermes.deleteSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        setResults((prev) => prev.filter((s) => s.id !== id));
      } finally {
        setDeleting(null);
      }
    },
    [],
  );

  const searching = search.trim().length > 0;
  const list = searching ? results : sessions;

  // The one signature moment: feature the most recent session as a pinned hero,
  // then group the remainder calmly below. When searching, no hero — results stay flat.
  const hero = !searching ? list[0] : undefined;
  const rest = hero ? list.slice(1) : list;

  const grouped = rest.reduce((acc, s) => {
    const label = groupLabel(s.startedAt);
    (acc[label] ??= []).push(s);
    return acc;
  }, {} as Record<string, SessionRow[]>);

  const totalMessages = sessions.reduce((sum, x) => sum + x.messageCount, 0);

  return (
    <Screen
      kicker="Conversation History"
      icon={<MessageSquare size={19} />}
      title="Sessions"
      sub="Browse and search your conversation history — full-text search across every message."
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{list.length} session{list.length !== 1 ? "s" : ""}</Badge>
          <Badge variant="neutral">{totalMessages.toLocaleString()} messages</Badge>
          <Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={() => onNewSession?.()}>New session</Button>
        </div>
      }
    >
      <div className="mb-7">
        <SearchInput value={search} onChange={setSearch} placeholder="Search sessions with FTS5…" />
      </div>

      {hero && (
        <div className="mb-8 mint-in mint-in-1">
          <Card
            interactive
            pad
            onClick={() => onResumeSession?.(hero.id, hero.title)}
            className="group relative overflow-hidden flex items-start gap-5 border-l-2 border-l-[var(--accent)] pl-5"
          >
            <div className="flex-1 min-w-0">
              <div className="ui-eyebrow">Continue where you left off</div>
              <h2 className="serif text-[22px] leading-tight text-[var(--text)] truncate mb-2">{hero.title}</h2>
              <div className="flex items-center gap-4 text-[11.5px] text-[var(--text-3)] mt-2">
                <Badge variant="neutral">{hero.source}</Badge>
                {hero.model && <Badge variant="accent" className="font-mono">{hero.model}</Badge>}
                <span className="flex items-center gap-1.5"><MessageSquare size={12} /> {hero.messageCount} messages</span>
                <span className="flex items-center gap-1.5 font-mono"><Clock size={12} /> {dateLabel(hero.startedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 self-center">
              <Button variant="primary" size="sm" leftIcon={<ArrowRight size={15} />} onClick={e => { e.stopPropagation(); onResumeSession?.(hero.id, hero.title); }}>Resume</Button>
              <IconButton danger title="Delete session" disabled={deleting === hero.id} onClick={e => { e.stopPropagation(); void handleDelete(hero.id); }}><Trash2 size={15} /></IconButton>
            </div>
          </Card>
        </div>
      )}

      {Object.entries(grouped).map(([label, items]) => (
        <div key={label} className="mb-7">
          <div className="flex items-center gap-2 mb-1.5">
            <SectionLabel>{label}</SectionLabel>
            <Badge variant="neutral">{items.length}</Badge>
          </div>
          <hr className="ui-divider-gold mb-3" />
          <div className="flex flex-col gap-2.5 stagger">
            {items.map(s => (
              <Card key={s.id} interactive pad onClick={() => onResumeSession?.(s.id, s.title)} className="group flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{s.title}</h3>
                    <Badge variant="neutral">{s.source}</Badge>
                    {s.model && <Badge variant="neutral" className="font-mono">{s.model}</Badge>}
                  </div>
                  {searching && s.snippet ? (
                    <Snippet text={s.snippet} />
                  ) : null}
                  <div className="flex items-center gap-4 text-[11.5px] text-[var(--text-3)]">
                    <span className="flex items-center gap-1.5"><MessageSquare size={12} /> {s.messageCount} messages</span>
                    <span className="flex items-center gap-1.5 font-mono"><Clock size={12} /> {dateLabel(s.startedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <IconButton title="Open session" onClick={e => { e.stopPropagation(); onResumeSession?.(s.id, s.title); }}><ArrowRight size={15} /></IconButton>
                  <IconButton danger title="Delete session" disabled={deleting === s.id} onClick={e => { e.stopPropagation(); void handleDelete(s.id); }}><Trash2 size={15} /></IconButton>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {error && list.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={24} />}
          title="Couldn't load sessions"
          sub={error}
        />
      )}

      {!error && !loading && list.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={24} />}
          title={searching ? "No sessions found" : "No sessions yet"}
          sub={searching ? "Try a different search term." : "Your conversations will appear here once you start chatting."}
        />
      )}
    </Screen>
  );
}
