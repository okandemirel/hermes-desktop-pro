import type {
  AgentRunEvent,
  AgentRunEventKind,
  DispatchMode,
  DispatchRunState,
  DispatchStreamEvent,
  ProfileDispatchTarget,
  ProfileRunState,
} from "@shared/types";

export function profileRunId(dispatchId: string, profileName: string): string {
  return `${dispatchId}-${profileName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function eventStatus(kind: DispatchStreamEvent["kind"]): AgentRunEvent["status"] {
  if (kind === "error" || kind === "aborted") return "error";
  if (kind === "done" || kind === "usage") return "done";
  return "running";
}

function agentKind(kind: DispatchStreamEvent["kind"]): AgentRunEventKind {
  if (kind === "queued" || kind === "started") return "start";
  if (kind === "chunk") return "output";
  if (kind === "aborted") return "abort";
  return kind;
}

function agentEventFromDispatch(event: DispatchStreamEvent): AgentRunEvent {
  const labelByKind: Record<DispatchStreamEvent["kind"], string> = {
    queued: "Queued",
    started: "Run started",
    chunk: "Generating response",
    reasoning: "Reasoning trace",
    tool: "Tool progress",
    usage: "Token usage recorded",
    done: "Run complete",
    error: "Run stopped with error",
    aborted: "Run aborted",
  };
  return {
    id: `${event.runId}-${event.kind}-${event.timestamp}`,
    kind: agentKind(event.kind),
    label: labelByKind[event.kind],
    detail: event.error || event.tool || event.text,
    status: eventStatus(event.kind),
    timestamp: event.timestamp,
    tokens: event.usage?.totalTokens,
  };
}

export function normalizeDispatchTargets(
  targets: ProfileDispatchTarget[],
  fallbackProfileName: string,
): ProfileDispatchTarget[] {
  const source = targets.length > 0 ? targets : [{ profileName: fallbackProfileName }];
  const seen = new Set<string>();
  const unique = source.filter(target => {
    const name = target.profileName.trim();
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  const fallback = unique.length > 0 ? unique : [{ profileName: fallbackProfileName }];
  const declaredPrimaryIndex = fallback.findIndex(target => target.isPrimary);
  const primaryIndex = declaredPrimaryIndex >= 0 ? declaredPrimaryIndex : 0;
  return fallback.map((target, index) => ({
    ...target,
    label: target.label || target.profileName,
    isPrimary: index === primaryIndex,
  }));
}

export function createDispatchRunState(
  dispatchId: string,
  mode: DispatchMode,
  prompt: string,
  targets: ProfileDispatchTarget[],
  startedAt = Date.now(),
): DispatchRunState {
  const profileRuns: ProfileRunState[] = targets.map(target => {
    const runId = profileRunId(dispatchId, target.profileName);
    return {
      runId,
      profileName: target.profileName,
      assistantMessageId: `${runId}-assistant`,
      status: "idle",
      content: "",
      events: [],
    };
  });
  return {
    dispatchId,
    mode,
    prompt,
    targets,
    status: "running",
    startedAt,
    profileRuns,
  };
}

export function applyDispatchEvent(state: DispatchRunState, event: DispatchStreamEvent): DispatchRunState {
  if (event.dispatchId !== state.dispatchId) return state;

  let changed = false;
  const profileRuns = state.profileRuns.map(run => {
    if (run.runId !== event.runId || run.profileName !== event.profileName) return run;
    changed = true;
    const events = [...run.events, agentEventFromDispatch(event)];
    if (event.kind === "chunk") {
      return { ...run, status: "running" as const, content: run.content + (event.text || ""), events };
    }
    if (event.kind === "reasoning") {
      return { ...run, status: "running" as const, reasoning: `${run.reasoning || ""}${event.text || ""}`, events };
    }
    if (event.kind === "usage") {
      return { ...run, usage: event.usage, events };
    }
    if (event.kind === "done") {
      return { ...run, status: "done" as const, sessionId: event.sessionId || run.sessionId, endedAt: event.timestamp, events };
    }
    if (event.kind === "error") {
      return { ...run, status: "error" as const, error: event.error, endedAt: event.timestamp, events };
    }
    if (event.kind === "aborted") {
      return { ...run, status: "aborted" as const, endedAt: event.timestamp, events };
    }
    return { ...run, status: "running" as const, startedAt: run.startedAt || event.timestamp, events };
  });

  if (!changed) return state;
  const allSettled = profileRuns.every(run => run.status === "done" || run.status === "error" || run.status === "aborted");
  return {
    ...state,
    profileRuns,
    status: allSettled ? "done" : "running",
    endedAt: allSettled ? event.timestamp : state.endedAt,
  };
}

export function sendLabelForDispatch(mode: DispatchMode, targetCount: number): string {
  if (mode === "single" || targetCount <= 1) return "Send";
  if (mode === "sequential") return `Send to ${targetCount} profiles`;
  if (mode === "parallel") return `Run ${targetCount} parallel`;
  return `Run primary + ${Math.max(0, targetCount - 1)}`;
}
