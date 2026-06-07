import { describe, expect, it } from "vitest";
import type { DispatchStreamEvent, ProfileDispatchTarget } from "@shared/types";
import {
  applyDispatchEvent,
  createDispatchRunState,
  normalizeDispatchTargets,
  sendLabelForDispatch,
} from "./chatDispatch";

const targets: ProfileDispatchTarget[] = [
  { profileName: "default", isPrimary: true, label: "default" },
  { profileName: "marketanalyst", label: "marketanalyst" },
  { profileName: "chiefoperator", label: "chiefoperator" },
];

function dispatchEvent(
  profileName: string,
  runId: string,
  kind: DispatchStreamEvent["kind"],
  text = "",
): DispatchStreamEvent {
  return {
    dispatchId: "dispatch-1",
    runId,
    profileName,
    kind,
    text,
    timestamp: 1000,
  };
}

describe("chat dispatch reducer", () => {
  it("normalizes empty target selections to a single active profile target", () => {
    expect(normalizeDispatchTargets([], "default")).toEqual([
      { profileName: "default", isPrimary: true, label: "default" },
    ]);
  });

  it("keeps one primary target for hybrid mode", () => {
    const normalized = normalizeDispatchTargets(targets, "default");

    expect(normalized.filter(target => target.isPrimary)).toHaveLength(1);
    expect(normalized[0].profileName).toBe("default");
  });

  it("creates one profile run for each target", () => {
    const state = createDispatchRunState("dispatch-1", "parallel", "Plan this", targets, 1000);

    expect(state.profileRuns.map(run => run.profileName)).toEqual(["default", "marketanalyst", "chiefoperator"]);
    expect(state.profileRuns.every(run => run.status === "idle")).toBe(true);
  });

  it("applies chunk events only to the matching run id and profile", () => {
    const state = createDispatchRunState("dispatch-1", "parallel", "Plan this", targets, 1000);
    const updated = applyDispatchEvent(
      state,
      dispatchEvent("marketanalyst", "dispatch-1-marketanalyst", "chunk", "market reply"),
    );

    expect(updated.profileRuns.find(run => run.profileName === "marketanalyst")?.content).toBe("market reply");
    expect(updated.profileRuns.find(run => run.profileName === "default")?.content).toBe("");
  });

  it("ignores events from another dispatch id", () => {
    const state = createDispatchRunState("dispatch-1", "parallel", "Plan this", targets, 1000);
    const updated = applyDispatchEvent(
      state,
      { ...dispatchEvent("default", "dispatch-1-default", "chunk", "wrong"), dispatchId: "dispatch-2" },
    );

    expect(updated).toBe(state);
  });

  it("builds adaptive send labels", () => {
    expect(sendLabelForDispatch("single", 1)).toBe("Send");
    expect(sendLabelForDispatch("sequential", 3)).toBe("Send to 3 profiles");
    expect(sendLabelForDispatch("parallel", 3)).toBe("Run 3 parallel");
    expect(sendLabelForDispatch("hybrid", 3)).toBe("Run primary + 2");
  });
}
);
