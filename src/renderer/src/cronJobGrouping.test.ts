import { describe, expect, it } from "vitest";
import type { CronJob, ProfileInfo } from "@shared/types";
import { groupCronJobsByProfile, getCronJobOperationProfile } from "./cronJobGrouping";

function profile(name: string, patch: Partial<ProfileInfo> = {}): ProfileInfo {
  return {
    name,
    path: `/tmp/${name}`,
    isActive: name === "default",
    isDefault: name === "default",
    skillCount: 0,
    model: "",
    provider: "",
    hasEnv: false,
    hasSoul: false,
    gatewayRunning: false,
    ...patch,
  };
}

function job(id: string, patch: Partial<CronJob> = {}): CronJob {
  return {
    id,
    name: id,
    profile: null,
    schedule: "0 9 * * *",
    prompt: "",
    state: "active",
    enabled: true,
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    repeat: null,
    deliver: ["local"],
    skills: [],
    script: null,
    ...patch,
  };
}

describe("cron job grouping", () => {
  it("groups jobs by declared profile and preserves the operation source profile", () => {
    const profiles = [profile("default"), profile("marketanalyst"), profile("chiefoperator")];

    const groups = groupCronJobsByProfile(profiles, [
      {
        profile: profiles[0],
        jobs: [
          job("market-digest", { profile: "marketanalyst", sourceProfile: "default" }),
          job("operator-report", { profile: "chiefoperator", sourceProfile: "default" }),
        ],
      },
      {
        profile: profiles[1],
        jobs: [job("market-digest", { profile: "marketanalyst", sourceProfile: "marketanalyst" })],
      },
    ]);

    expect(groups.find(group => group.profile.name === "default")?.jobs).toHaveLength(0);
    expect(groups.find(group => group.profile.name === "marketanalyst")?.jobs).toEqual([
      expect.objectContaining({
        id: "market-digest",
        profile: "marketanalyst",
        sourceProfile: "default",
      }),
    ]);
    expect(groups.find(group => group.profile.name === "chiefoperator")?.jobs).toEqual([
      expect.objectContaining({
        id: "operator-report",
        profile: "chiefoperator",
        sourceProfile: "default",
      }),
    ]);
  });

  it("uses the source profile for edit, pause, resume, and delete actions", () => {
    expect(
      getCronJobOperationProfile("marketanalyst", job("market-digest", {
        profile: "marketanalyst",
        sourceProfile: "default",
      })),
    ).toBe("default");

    expect(
      getCronJobOperationProfile("marketanalyst", job("direct-market-job", {
        profile: "marketanalyst",
      })),
    ).toBe("marketanalyst");
  });
});
