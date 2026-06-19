import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { safeWriteFile } from "./utils";

/**
 * Desktop-local session store for DIRECT-mode chats (BYO-key provider path).
 * These conversations never touch the gateway's state.db, so without this they
 * would vanish on restart and never appear in the Sessions list. The store is a
 * single JSON file keyed by the `desk-…` session id minted by the direct
 * transports; the full conversation is re-written each turn (idempotent).
 */

export interface DesktopSessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DesktopSession {
  id: string;
  title: string;
  startedAt: number; // unix seconds (matches the gateway convention)
  updatedAt: number; // unix seconds
  model: string;
  messages: DesktopSessionMessage[];
}

function storePath(): string {
  return join(HERMES_HOME, "desktop-sessions.json");
}

function readStore(): Record<string, DesktopSession> {
  try {
    if (!existsSync(storePath())) return {};
    const parsed = JSON.parse(readFileSync(storePath(), "utf-8"));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, DesktopSession>)
      : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, DesktopSession>): void {
  try {
    safeWriteFile(storePath(), JSON.stringify(store, null, 2));
  } catch {
    /* best-effort — direct-mode persistence must never break a send */
  }
}

/** True for ids minted by the direct-provider transports (`desk-<ms>-<uuid>`). */
export function isDesktopSessionId(id: string): boolean {
  return typeof id === "string" && id.startsWith("desk-");
}

/**
 * Persist a direct-mode conversation (overwrite by id). Title is the first user
 * line, fixed once set; startedAt is preserved across turns.
 */
export function saveDesktopSession(
  id: string,
  model: string,
  messages: DesktopSessionMessage[],
): void {
  if (!isDesktopSessionId(id) || messages.length === 0) return;
  const store = readStore();
  const now = Math.floor(Date.now() / 1000);
  const firstUser = messages.find((m) => m.role === "user");
  const title =
    store[id]?.title ||
    (firstUser ? firstUser.content.replace(/\s+/g, " ").trim().slice(0, 80) : "") ||
    "Direct chat";
  store[id] = {
    id,
    title,
    startedAt: store[id]?.startedAt || now,
    updatedAt: now,
    model: model || store[id]?.model || "",
    messages,
  };
  writeStore(store);
}

export function listDesktopSessions(): DesktopSession[] {
  return Object.values(readStore()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}

export function getDesktopSession(id: string): DesktopSession | null {
  return readStore()[id] || null;
}

export function deleteDesktopSession(id: string): { requested: number; deleted: number } {
  const store = readStore();
  if (!store[id]) return { requested: 1, deleted: 0 };
  delete store[id];
  writeStore(store);
  return { requested: 1, deleted: 1 };
}

/** Renderer-facing history items (sessionHistoryToChatMessages-compatible). */
export function desktopSessionHistory(
  id: string,
): Array<{ kind: "user" | "assistant"; id: number; content: string; timestamp: number }> {
  const s = getDesktopSession(id);
  if (!s) return [];
  return s.messages.map((m, i) => ({
    kind: m.role,
    id: i,
    content: m.content,
    // Distinct increasing timestamps keep ordering stable through the mapper.
    timestamp: (s.startedAt + i) * 1000,
  }));
}

/** Summary rows for the Sessions list (SessionSummary-compatible subset). */
export function desktopSessionSummaries(): Array<{
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
  profileName: string;
  profileNames: string[];
}> {
  return listDesktopSessions().map((s) => ({
    id: s.id,
    source: "desktop",
    startedAt: s.startedAt,
    endedAt: s.updatedAt,
    messageCount: s.messages.length,
    model: s.model,
    title: s.title,
    preview: "",
    profileName: "default",
    profileNames: ["default"],
  }));
}

/** Search rows for the Sessions search (SearchResult-compatible subset). */
export function searchDesktopSessions(query: string): Array<{
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
  profileName: string;
  profileNames: string[];
}> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listDesktopSessions()
    .filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q)),
    )
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      startedAt: s.startedAt,
      source: "desktop",
      messageCount: s.messages.length,
      model: s.model,
      snippet: "",
      profileName: "default",
      profileNames: ["default"],
    }));
}
