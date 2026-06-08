import { describe, expect, it } from "vitest";
import { sessionRunMetadataFor } from "./session-metadata";

describe("session run metadata", () => {
  it("falls back to the profile that owns the session database", () => {
    expect(sessionRunMetadataFor({}, "session-1", "default")).toEqual({
      profileName: "default",
      profileNames: ["default"],
    });
  });

  it("describes the full profile team for dispatch sessions", () => {
    expect(sessionRunMetadataFor({
      "session-2": {
        sessionId: "session-2",
        profileName: "marketanalyst",
        profileNames: ["default", "marketanalyst", "chiefoperator"],
        dispatchMode: "parallel",
        primaryProfile: "default",
        updatedAt: 1,
      },
    }, "session-2", "default")).toEqual({
      profileName: "marketanalyst",
      profileNames: ["default", "marketanalyst", "chiefoperator"],
      dispatchMode: "parallel",
      primaryProfile: "default",
    });
  });
});
