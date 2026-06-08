import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  mode: "local" as "local" | "remote" | "ssh",
  sshOutput: "",
  sshCalls: [] as { command: string; stdin?: string }[],
}));

vi.mock("./hermes", () => ({
  isRemoteMode: () => mockState.mode !== "local",
  getApiUrl: () => "http://127.0.0.1:8642",
  getRemoteAuthHeader: () => ({}),
  normaliseRemoteUrl: (url: string) => url,
}));

vi.mock("./config", () => ({
  getConnectionConfig: () => ({
    mode: mockState.mode,
    remoteUrl: "",
    apiKey: "",
    ssh: {
      host: "example.test",
      port: 22,
      username: "hermes",
      keyPath: "~/.ssh/id_rsa",
      remotePort: 8642,
      localPort: 18642,
    },
  }),
}));

vi.mock("./ssh-remote", () => ({
  buildRemoteHermesCmd: (args: string[]) => `hermes ${JSON.stringify(args)}`,
  sshExec: (_config: unknown, command: string, stdin?: string) => {
    mockState.sshCalls.push({ command, stdin });
    return Promise.resolve(mockState.sshOutput);
  },
}));

vi.mock("./installer", () => ({
  HERMES_HOME: "/tmp/hermes-test-home",
  HERMES_PYTHON: "/tmp/hermes-test-home/hermes-agent/venv/bin/python",
  hermesCliArgs: () => [],
}));

vi.mock("./utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils")>();
  const path = await import("path");
  return {
    ...actual,
    profileHome: (profile?: string) =>
      profile && profile !== "default"
        ? path.join(mockState.hermesHome, "profiles", profile)
        : mockState.hermesHome,
  };
});

describe("updateCronJob", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-cron-test-"));
    mockState.mode = "local";
    mockState.sshOutput = "";
    mockState.sshCalls = [];
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  it("updates a local profile cron job without changing sibling jobs", async () => {
    const profileHome = join(mockState.hermesHome, "profiles", "marketanalyst");
    const cronDir = join(profileHome, "cron");
    mkdirSync(cronDir, { recursive: true });
    const jobsFile = join(cronDir, "jobs.json");
    writeFileSync(
      jobsFile,
      JSON.stringify(
        {
          jobs: [
            {
              id: "keep-me",
              name: "Keep",
              schedule: { value: "0 9 * * *" },
              prompt: "Do not change",
              deliver: ["local"],
              enabled: true,
            },
            {
              id: "job-1",
              name: "Old name",
              schedule: { value: "*/30 * * * *" },
              prompt: "Old prompt",
              deliver: ["local"],
              enabled: true,
            },
          ],
        },
        null,
        2,
      ),
    );

    const cronjobs = await import("./cronjobs");
    expect(cronjobs.updateCronJob).toBeTypeOf("function");

    const result = await cronjobs.updateCronJob(
      "job-1",
      {
        name: "New name",
        schedule: "0 */2 * * *",
        prompt: "New prompt",
        deliver: "telegram",
      },
      "marketanalyst",
    );

    expect(result).toEqual({ success: true });
    const parsed = JSON.parse(readFileSync(jobsFile, "utf-8"));
    expect(parsed.jobs[0]).toMatchObject({
      id: "keep-me",
      name: "Keep",
      prompt: "Do not change",
    });
    expect(parsed.jobs[1]).toMatchObject({
      id: "job-1",
      name: "New name",
      prompt: "New prompt",
      deliver: ["telegram"],
    });
    expect(parsed.jobs[1].schedule).toEqual({ value: "0 */2 * * *" });
  });

  it("fetches cron jobs from the requested SSH profile", async () => {
    mockState.mode = "ssh";
    mockState.sshOutput = JSON.stringify({
      jobs: [
        {
          id: "ssh-job",
          name: "Remote profile job",
          schedule: { value: "0 10 * * *" },
          prompt: "Prepare remote market brief",
          deliver: ["email"],
          enabled: true,
        },
      ],
    });

    const cronjobs = await import("./cronjobs");
    const jobs = await cronjobs.listCronJobs(true, "marketanalyst");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "ssh-job",
      name: "Remote profile job",
      schedule: "0 10 * * *",
      prompt: "Prepare remote market brief",
      deliver: ["email"],
      state: "active",
    });
    expect(mockState.sshCalls[0]?.command).toBe("python3 -");
    expect(mockState.sshCalls[0]?.stdin).toContain('profile = "marketanalyst"');
    expect(mockState.sshCalls[0]?.stdin).toContain('profiles", profile');
  });

  it("preserves declared job profile while tracking the source profile", async () => {
    const cronDir = join(mockState.hermesHome, "cron");
    mkdirSync(cronDir, { recursive: true });
    const jobsFile = join(cronDir, "jobs.json");
    writeFileSync(
      jobsFile,
      JSON.stringify(
        {
          jobs: [
            {
              id: "market-digest",
              name: "Market digest",
              profile: "marketanalyst",
              schedule: { value: "0 9 * * *" },
              prompt: "Prepare the market digest",
              enabled: true,
            },
            {
              id: "operator-report",
              name: "Operator report",
              profile_name: "chiefoperator",
              schedule: { value: "0 10 * * *" },
              prompt: "Prepare the operator report",
              enabled: false,
            },
          ],
        },
        null,
        2,
      ),
    );

    const cronjobs = await import("./cronjobs");
    const jobs = await cronjobs.listCronJobs(true, "default");

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "market-digest",
        profile: "marketanalyst",
        sourceProfile: "default",
      }),
      expect.objectContaining({
        id: "operator-report",
        profile: "chiefoperator",
        sourceProfile: "default",
        state: "paused",
      }),
    ]);
  });
});
