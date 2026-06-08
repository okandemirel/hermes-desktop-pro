import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Clock, ArrowRight, Trash2, Plus, Search, History, Database, Users } from "lucide-react";
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
  profileName?: string;
  profileNames?: string[];
  dispatchMode?: string;
  primaryProfile?: string;
};
type SearchShape = {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
  profileName?: string;
  profileNames?: string[];
  dispatchMode?: string;
  primaryProfile?: string;
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
  profileName: string;
  profileNames: string[];
  dispatchMode?: string;
  primaryProfile?: string;
}

function titleFor(id: string, title: string | null): string {
  const trimmed = (title || "").trim();
  if (trimmed) return trimmed;
  return `Session ${id.slice(-6)}`;
}

function shortSessionId(id: string): string {
  return id.slice(-6);
}

function normalizeProfiles(profileName?: string, profileNames?: string[]): string[] {
  const names = [
    ...(profileNames || []),
    profileName || "",
  ].map((name) => name.trim()).filter(Boolean);
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? unique : ["default"];
}

function profileSummaryLabel(profiles: string[]): string {
  if (profiles.length <= 1) return profiles[0] || "default";
  if (profiles.length === 2) return `${profiles[0]} + ${profiles[1]}`;
  return `${profiles[0]} +${profiles.length - 1}`;
}

function profileSummaryTitle(profiles: string[], dispatchMode?: string, primaryProfile?: string): string {
  const mode = dispatchMode ? `${dispatchMode} run` : "Session profile";
  const primary = primaryProfile ? `Primary: ${primaryProfile}. ` : "";
  return `${mode}. ${primary}Profiles: ${profiles.join(", ")}`;
}

function fromSummary(s: SummaryShape): SessionRow {
  const profileNames = normalizeProfiles(s.profileName, s.profileNames);
  return {
    id: s.id,
    title: titleFor(s.id, s.title),
    source: s.source || "cli",
    model: s.model || "",
    messageCount: s.messageCount,
    startedAt: s.startedAt,
    snippet: "",
    profileName: s.profileName || profileNames[0],
    profileNames,
    dispatchMode: s.dispatchMode,
    primaryProfile: s.primaryProfile,
  };
}

function fromSearch(r: SearchShape): SessionRow {
  const profileNames = normalizeProfiles(r.profileName, r.profileNames);
  return {
    id: r.sessionId,
    title: titleFor(r.sessionId, r.title),
    source: r.source || "cli",
    model: r.model || "",
    messageCount: r.messageCount,
    startedAt: r.startedAt,
    snippet: r.snippet || "",
    profileName: r.profileName || profileNames[0],
    profileNames,
    dispatchMode: r.dispatchMode,
    primaryProfile: r.primaryProfile,
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
      <p className="ui-sessions-snippet">
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
      className="ui-sessions-console"
      kicker="Conversation History"
      icon={<MessageSquare size={19} />}
      title="Sessions"
      sub="Browse and search your conversation history — full-text search across every message."
      actions={
        <div className="ui-sessions-actions">
          <Badge variant="neutral">{list.length} session{list.length !== 1 ? "s" : ""}</Badge>
          <Badge variant="neutral">{totalMessages.toLocaleString()} messages</Badge>
          <Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={() => onNewSession?.()}>New session</Button>
        </div>
      }
    >
      <div className="ui-sessions-shell">
        <Card pad className="ui-sessions-hero mint-in mint-in-1">
          <div className="ui-sessions-hero-mark">
            <History size={26} />
          </div>
          <div className="ui-sessions-hero-copy">
            <div className="ui-eyebrow">History Index</div>
            <h2>{sessions.length} stored conversation{sessions.length !== 1 ? "s" : ""}</h2>
            <p>Search runs against the local session index and keeps matched snippets intact.</p>
          </div>
          <div className="ui-sessions-metrics">
            <div>
              <span>Sessions</span>
              <strong>{sessions.length}</strong>
            </div>
            <div>
              <span>Messages</span>
              <strong>{totalMessages.toLocaleString()}</strong>
            </div>
            <div>
              <span>Results</span>
              <strong>{list.length}</strong>
            </div>
          </div>
        </Card>

        <div className="ui-sessions-toolbar mint-in mint-in-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search sessions with FTS5..."
            className="ui-sessions-search"
          />
          <Badge variant={searching ? "accent" : "neutral"}>
            <Search size={12} />
            {searching ? "Search mode" : "Grouped"}
          </Badge>
        </div>

      {hero && (
        <div className="ui-sessions-feature mint-in mint-in-3">
          <Card
            interactive
            pad
            onClick={() => onResumeSession?.(hero.id, hero.title)}
            className="ui-sessions-feature-card"
          >
            <div className="ui-sessions-feature-icon">
              <MessageSquare size={21} />
            </div>
            <div className="ui-sessions-feature-copy">
              <div className="ui-eyebrow">Continue where you left off</div>
              <h2>{hero.title}</h2>
              <div className="ui-sessions-meta">
                <Badge variant="neutral">{hero.source}</Badge>
                {hero.model && <Badge variant="accent" className="font-mono">{hero.model}</Badge>}
                <span className="ui-sessions-id-chip">#{shortSessionId(hero.id)}</span>
                <span
                  className="ui-sessions-profile-chip"
                  title={profileSummaryTitle(hero.profileNames, hero.dispatchMode, hero.primaryProfile)}
                >
                  <Users size={12} />
                  <strong>{hero.profileNames.length > 1 ? "Team" : "Profile"}</strong>
                  <em>{profileSummaryLabel(hero.profileNames)}</em>
                </span>
                {hero.dispatchMode && hero.profileNames.length > 1 && <Badge variant="neutral" className="font-mono">{hero.dispatchMode}</Badge>}
                <span className="flex items-center gap-1.5"><MessageSquare size={12} /> {hero.messageCount} messages</span>
                <span className="flex items-center gap-1.5 font-mono"><Clock size={12} /> {dateLabel(hero.startedAt)}</span>
              </div>
            </div>
            <div className="ui-sessions-card-actions">
              <Button variant="primary" size="sm" leftIcon={<ArrowRight size={15} />} onClick={e => { e.stopPropagation(); onResumeSession?.(hero.id, hero.title); }}>Resume</Button>
              <IconButton danger title="Delete session" disabled={deleting === hero.id} onClick={e => { e.stopPropagation(); void handleDelete(hero.id); }}><Trash2 size={15} /></IconButton>
            </div>
          </Card>
        </div>
      )}

        <div className="ui-sessions-list">
          {Object.entries(grouped).map(([label, items]) => (
            <section key={label} className="ui-sessions-section">
              <div className="ui-sessions-section-head">
                <SectionLabel>{label}</SectionLabel>
                <Badge variant="neutral">{items.length}</Badge>
              </div>
              <div className="ui-sessions-rows stagger">
                {items.map(s => (
                  <Card key={s.id} interactive pad onClick={() => onResumeSession?.(s.id, s.title)} className="ui-sessions-row">
                    <div className="ui-sessions-row-icon">
                      <Database size={16} />
                    </div>
                    <div className="ui-sessions-row-copy">
                      <div className="ui-sessions-row-title">
                        <h3>{s.title}</h3>
                        <span className="ui-sessions-id-chip">#{shortSessionId(s.id)}</span>
                        <Badge variant="neutral">{s.source}</Badge>
                        {s.model && <Badge variant="neutral" className="font-mono">{s.model}</Badge>}
                      </div>
                  {searching && s.snippet ? (
                    <Snippet text={s.snippet} />
                  ) : null}
                      <div className="ui-sessions-meta">
                        <span
                          className="ui-sessions-profile-chip"
                          title={profileSummaryTitle(s.profileNames, s.dispatchMode, s.primaryProfile)}
                        >
                          <Users size={12} />
                          <strong>{s.profileNames.length > 1 ? "Team" : "Profile"}</strong>
                          <em>{profileSummaryLabel(s.profileNames)}</em>
                        </span>
                        {s.dispatchMode && s.profileNames.length > 1 && <Badge variant="neutral" className="font-mono">{s.dispatchMode}</Badge>}
                        <span className="flex items-center gap-1.5"><MessageSquare size={12} /> {s.messageCount} messages</span>
                        <span className="flex items-center gap-1.5 font-mono"><Clock size={12} /> {dateLabel(s.startedAt)}</span>
                      </div>
                    </div>
                    <div className="ui-sessions-card-actions">
                      <IconButton title="Open session" onClick={e => { e.stopPropagation(); onResumeSession?.(s.id, s.title); }}><ArrowRight size={15} /></IconButton>
                      <IconButton danger title="Delete session" disabled={deleting === s.id} onClick={e => { e.stopPropagation(); void handleDelete(s.id); }}><Trash2 size={15} /></IconButton>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>

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
      </div>
    </Screen>
  );
}
