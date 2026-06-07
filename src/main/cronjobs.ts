import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { HERMES_HOME, HERMES_PYTHON, hermesCliArgs } from "./installer";
import { isValidProfileName, profileHome, safeWriteFile } from "./utils";
import { END_OF_OPTIONS, isSafePositional, isValidIdSlug } from "./cli-safety";
import {
  isRemoteMode,
  getApiUrl,
  getRemoteAuthHeader,
  normaliseRemoteUrl,
} from "./hermes";
import { getConnectionConfig } from "./config";
import { buildRemoteHermesCmd, sshExec } from "./ssh-remote";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import type { CronJob, CronJobUpdateInput } from "@shared/types";
import type { SshConfig } from "./ssh-tunnel";

function jobsFilePath(profile?: string): string {
  return join(profileHome(profile), "cron", "jobs.json");
}

function sshConfig(): SshConfig | null {
  const conn = getConnectionConfig();
  return conn.mode === "ssh" && conn.ssh ? conn.ssh : null;
}

function ensureValidProfile(profile?: string): boolean {
  return profile === undefined || profile === "" || isValidProfileName(profile);
}

function normalizeJob(job: Record<string, unknown>): CronJob | null {
  if (!job.id) return null;
  const enabled = job.enabled !== false;
  let state: CronJob["state"] = "active";
  if (job.state === "paused" || !enabled) state = "paused";
  else if (job.state === "completed") state = "completed";
  const schedule = job.schedule as { value?: string } | string | undefined;
  return {
    id: String(job.id),
    name: (job.name as string) || "(unnamed)",
    schedule:
      (job.schedule_display as string) ||
      (typeof schedule === "object" ? schedule?.value : schedule) ||
      "?",
    prompt: (job.prompt as string) || "",
    state,
    enabled,
    next_run_at: (job.next_run_at as string) || null,
    last_run_at: (job.last_run_at as string) || null,
    last_status: (job.last_status as string) || null,
    last_error: (job.last_error as string) || null,
    repeat: (job.repeat as CronJob["repeat"]) || null,
    deliver: Array.isArray(job.deliver)
      ? (job.deliver as string[])
      : job.deliver
        ? [job.deliver as string]
        : ["local"],
    skills:
      (job.skills as string[]) || (job.skill ? [job.skill as string] : []),
    script: (job.script as string) || null,
  };
}

async function remoteFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getRemoteAuthHeader(),
    ...((init.headers as Record<string, string>) || {}),
  };
  const apiUrl = await getCronApiUrl(headers);
  return fetch(`${apiUrl}${path}`, { ...init, headers });
}

async function getCronApiUrl(headers: Record<string, string>): Promise<string> {
  try {
    return getApiUrl();
  } catch (err) {
    const conn = getConnectionConfig();
    if (conn.mode !== "ssh" || !conn.ssh?.localPort) throw err;

    // Schedules/Cron can be opened without first running the Chat path that
    // starts/refreshes the in-process SSH tunnel state. As a narrow fallback for
    // that screen, probe the configured/default local SSH port before using it.
    // This port may be stale if startSshTunnel() had to choose a different free
    // port, so a failed /health check preserves getApiUrl()'s original error
    // instead of sending authenticated API requests to an unrelated service.
    const fallbackUrl = normaliseRemoteUrl(
      `http://127.0.0.1:${conn.ssh.localPort}`,
    );
    if (await isCronFallbackHealthy(fallbackUrl, headers)) return fallbackUrl;
    throw err;
  }
}

async function isCronFallbackHealthy(
  apiUrl: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${apiUrl}/health`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function remoteJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function sshReadCronJobs(profile?: string): Promise<CronJob[]> {
  const config = sshConfig();
  if (!config) return [];
  if (!ensureValidProfile(profile)) return [];
  const profileLiteral = JSON.stringify(profile || "default");
  const script = `
import json, os
profile = ${profileLiteral}
home = os.path.expanduser("~/.hermes")
if profile and profile != "default":
    home = os.path.join(home, "profiles", profile)
path = os.path.join(home, "cron", "jobs.json")
if not os.path.exists(path):
    print(json.dumps({"jobs": []}))
else:
    with open(path, "r", encoding="utf-8") as handle:
        print(handle.read())
`;
  try {
    const content = await sshExec(config, "python3 -", script, 15000);
    const parsed = JSON.parse(content.trim() || "{\"jobs\": []}");
    const raw = Array.isArray(parsed) ? parsed : parsed.jobs || [];
    const jobs: CronJob[] = [];
    for (const job of raw) {
      const normalized = normalizeJob(job);
      if (normalized) jobs.push(normalized);
    }
    return jobs;
  } catch (err) {
    console.error("[CRON] SSH list error:", err);
    return [];
  }
}

function runSshCronCommand(
  args: string[],
  profile?: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const config = sshConfig();
  if (!config) {
    return Promise.resolve({ success: false, output: "", error: "SSH is not configured" });
  }
  if (!ensureValidProfile(profile)) {
    return Promise.resolve({ success: false, output: "", error: "Invalid profile name" });
  }
  const cliArgs = [];
  if (profile && profile !== "default") cliArgs.push("-p", profile);
  cliArgs.push("cron", ...args);
  return sshExec(config, buildRemoteHermesCmd(cliArgs), undefined, 15000)
    .then(output => ({ success: true, output }))
    .catch((err: Error) => ({ success: false, output: "", error: err.message }));
}

async function updateSshCronJob(
  jobId: string,
  input: CronJobUpdateInput,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  const config = sshConfig();
  if (!config) return { success: false, error: "SSH is not configured" };
  if (!ensureValidProfile(profile)) return { success: false, error: "Invalid profile name" };
  if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
  if (input.schedule !== undefined && !input.schedule.trim()) {
    return { success: false, error: "Schedule is required" };
  }

  const payloadLiteral = JSON.stringify(JSON.stringify({
    profile: profile || "default",
    jobId,
    input,
  }));
  const script = `
import json, os, tempfile
payload = json.loads(${payloadLiteral})
profile = payload.get("profile") or "default"
job_id = payload.get("jobId") or ""
updates = payload.get("input") or {}
home = os.path.expanduser("~/.hermes")
if profile != "default":
    home = os.path.join(home, "profiles", profile)
path = os.path.join(home, "cron", "jobs.json")
if not os.path.exists(path):
    print(json.dumps({"success": False, "error": "Cron jobs file not found"}))
    raise SystemExit(0)
with open(path, "r", encoding="utf-8") as handle:
    parsed = json.load(handle)
jobs = parsed if isinstance(parsed, list) else parsed.get("jobs", [])
target = None
for job in jobs:
    if isinstance(job, dict) and str(job.get("id", "")) == job_id:
        target = job
        break
if target is None:
    print(json.dumps({"success": False, "error": "Cron job not found"}))
    raise SystemExit(0)
if "name" in updates:
    target["name"] = (updates.get("name") or "").strip() or "(unnamed)"
if "prompt" in updates:
    target["prompt"] = updates.get("prompt") or ""
if "schedule" in updates:
    schedule_value = (updates.get("schedule") or "").strip()
    current = target.get("schedule")
    if isinstance(current, dict):
        current["value"] = schedule_value
        target["schedule"] = current
    else:
        target["schedule"] = {"value": schedule_value}
    target["schedule_display"] = schedule_value
if "deliver" in updates:
    raw = updates.get("deliver")
    values = raw if isinstance(raw, list) else [raw]
    cleaned = []
    for value in values:
        for part in str(value or "").split(","):
            part = part.strip()
            if part:
                cleaned.append(part)
    target["deliver"] = cleaned or ["local"]
os.makedirs(os.path.dirname(path), exist_ok=True)
fd, temp_path = tempfile.mkstemp(prefix=".jobs.", suffix=".tmp", dir=os.path.dirname(path))
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(parsed, handle, indent=2)
        handle.write("\\n")
    os.replace(temp_path, path)
finally:
    if os.path.exists(temp_path):
        os.unlink(temp_path)
print(json.dumps({"success": True}))
`;

  try {
    const out = await sshExec(config, "python3 -", script, 15000);
    const result = JSON.parse(out.trim() || "{\"success\": false, \"error\": \"No SSH response\"}") as { success?: boolean; error?: string };
    return result.success ? { success: true } : { success: false, error: result.error || "Cron job could not be saved" };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Read cron jobs from the jobs.json file (async to avoid blocking the main process).
 * In remote mode, fetches from the Hermes API server's /api/jobs endpoint instead.
 */
export async function listCronJobs(
  includeDisabled = true,
  profile?: string,
): Promise<CronJob[]> {
  const ssh = sshConfig();
  if (ssh) {
    const jobs = await sshReadCronJobs(profile);
    return includeDisabled ? jobs : jobs.filter(job => job.enabled);
  }

  if (isRemoteMode()) {
    try {
      const qs = includeDisabled ? "?include_disabled=true" : "";
      const res = await remoteFetch(`/api/jobs${qs}`);
      if (!res.ok) {
        console.error("[CRON] remote list failed:", await remoteJsonError(res));
        return [];
      }
      const body = (await res.json()) as { jobs?: Record<string, unknown>[] };
      const raw = body.jobs || [];
      const jobs: CronJob[] = [];
      for (const job of raw) {
        const normalized = normalizeJob(job);
        if (!normalized) continue;
        if (!includeDisabled && !normalized.enabled) continue;
        jobs.push(normalized);
      }
      return jobs;
    } catch (err) {
      console.error("[CRON] remote list error:", err);
      return [];
    }
  }

  const filePath = jobsFilePath(profile);
  if (!existsSync(filePath)) return [];

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const raw = Array.isArray(parsed) ? parsed : parsed.jobs || [];
    const jobs: CronJob[] = [];

    for (const job of raw) {
      const normalized = normalizeJob(job);
      if (!normalized) continue;
      if (!includeDisabled && !normalized.enabled) continue;
      jobs.push(normalized);
    }

    return jobs;
  } catch (err) {
    console.error("[CRON] Failed to read jobs file:", err);
    return [];
  }
}

/**
 * Run a hermes cron CLI command and return the result.
 */
function runCronCommand(
  args: string[],
  profile?: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const cliArgs = hermesCliArgs();
  if (profile && profile !== "default") {
    cliArgs.push("-p", profile);
  }
  cliArgs.push("cron", ...args);

  return new Promise((resolve) => {
    execFile(
      HERMES_PYTHON,
      cliArgs,
      {
        cwd: join(HERMES_HOME, "hermes-agent"),
        timeout: 15000,
        ...HIDDEN_SUBPROCESS_OPTIONS,
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            success: false,
            output: stdout || "",
            error: stderr || err.message,
          });
        } else {
          resolve({ success: true, output: stdout || "" });
        }
      },
    );
  });
}

export async function createCronJob(
  schedule: string,
  prompt?: string,
  name?: string,
  deliver?: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (sshConfig()) {
    if (!isSafePositional(schedule)) {
      return { success: false, error: "Schedule must not start with '-'" };
    }
    if (prompt && !isSafePositional(prompt)) {
      return { success: false, error: "Prompt must not start with '-'" };
    }
    const args = ["create"];
    if (name) args.push("--name", name);
    if (deliver) args.push("--deliver", deliver);
    args.push(END_OF_OPTIONS, schedule);
    if (prompt) args.push(prompt);
    const result = await runSshCronCommand(args, profile);
    return { success: result.success, error: result.error };
  }

  if (isRemoteMode()) {
    try {
      const res = await remoteFetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "",
          schedule,
          prompt: prompt || "",
          deliver: deliver || "local",
        }),
      });
      if (!res.ok) {
        return { success: false, error: await remoteJsonError(res) };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // `schedule` and `prompt` are user-controlled positionals. Reject a leading
  // `-` so neither can be smuggled as a flag, and pass them after `--`.
  if (!isSafePositional(schedule)) {
    return { success: false, error: "Schedule must not start with '-'" };
  }
  if (prompt && !isSafePositional(prompt)) {
    return { success: false, error: "Prompt must not start with '-'" };
  }
  const args = ["create"];
  if (name) args.push("--name", name);
  if (deliver) args.push("--deliver", deliver);
  args.push(END_OF_OPTIONS, schedule);
  if (prompt) args.push(prompt);

  const result = await runCronCommand(args, profile);
  return { success: result.success, error: result.error };
}

export async function removeCronJob(
  jobId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!jobId) return { success: false, error: "Missing job ID" };
  if (sshConfig()) {
    if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
    const result = await runSshCronCommand(["remove", END_OF_OPTIONS, jobId], profile);
    return { success: result.success, error: result.error };
  }
  if (isRemoteMode()) {
    try {
      const res = await remoteFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        return { success: false, error: await remoteJsonError(res) };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
  if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
  const result = await runCronCommand(["remove", END_OF_OPTIONS, jobId], profile);
  return { success: result.success, error: result.error };
}

function normaliseDeliverInput(deliver: string | string[] | undefined): string[] | undefined {
  if (deliver === undefined) return undefined;
  const values = Array.isArray(deliver) ? deliver : [deliver];
  const cleaned = values
    .flatMap(value => String(value).split(","))
    .map(value => value.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["local"];
}

function applyCronJobUpdate(
  job: Record<string, unknown>,
  input: CronJobUpdateInput,
): void {
  if (input.name !== undefined) job.name = input.name.trim() || "(unnamed)";
  if (input.prompt !== undefined) job.prompt = input.prompt;

  if (input.schedule !== undefined) {
    const scheduleValue = input.schedule.trim();
    const currentSchedule = job.schedule;
    if (
      currentSchedule &&
      typeof currentSchedule === "object" &&
      !Array.isArray(currentSchedule)
    ) {
      job.schedule = { ...(currentSchedule as Record<string, unknown>), value: scheduleValue };
    } else {
      job.schedule = { value: scheduleValue };
    }
    job.schedule_display = scheduleValue;
  }

  const deliver = normaliseDeliverInput(input.deliver);
  if (deliver) job.deliver = deliver;
}

export async function updateCronJob(
  jobId: string,
  input: CronJobUpdateInput,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!jobId) return { success: false, error: "Missing job ID" };
  if (sshConfig()) return updateSshCronJob(jobId, input, profile);

  if (isRemoteMode()) {
    try {
      const res = await remoteFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        return { success: false, error: await remoteJsonError(res) };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
  if (input.schedule !== undefined && !input.schedule.trim()) {
    return { success: false, error: "Schedule is required" };
  }

  const filePath = jobsFilePath(profile);
  if (!existsSync(filePath)) return { success: false, error: "Cron jobs file not found" };

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    const rawJobs = Array.isArray(parsed)
      ? parsed
      : (parsed as { jobs?: unknown[] }).jobs || [];
    const jobs = rawJobs.filter(
      (job): job is Record<string, unknown> =>
        !!job && typeof job === "object" && !Array.isArray(job),
    );
    const job = jobs.find(candidate => String(candidate.id || "") === jobId);
    if (!job) return { success: false, error: "Cron job not found" };

    applyCronJobUpdate(job, input);
    safeWriteFile(filePath, JSON.stringify(parsed, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function remoteJobAction(
  jobId: string,
  action: "pause" | "resume" | "run",
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await remoteFetch(
      `/api/jobs/${encodeURIComponent(jobId)}/${action}`,
      { method: "POST" },
    );
    if (!res.ok) {
      return { success: false, error: await remoteJsonError(res) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function pauseCronJob(
  jobId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!jobId) return { success: false, error: "Missing job ID" };
  if (sshConfig()) {
    if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
    const result = await runSshCronCommand(["pause", END_OF_OPTIONS, jobId], profile);
    return { success: result.success, error: result.error };
  }
  if (isRemoteMode()) return remoteJobAction(jobId, "pause");
  if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
  const result = await runCronCommand(["pause", END_OF_OPTIONS, jobId], profile);
  return { success: result.success, error: result.error };
}

export async function resumeCronJob(
  jobId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!jobId) return { success: false, error: "Missing job ID" };
  if (sshConfig()) {
    if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
    const result = await runSshCronCommand(["resume", END_OF_OPTIONS, jobId], profile);
    return { success: result.success, error: result.error };
  }
  if (isRemoteMode()) return remoteJobAction(jobId, "resume");
  if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
  const result = await runCronCommand(["resume", END_OF_OPTIONS, jobId], profile);
  return { success: result.success, error: result.error };
}

export async function triggerCronJob(
  jobId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!jobId) return { success: false, error: "Missing job ID" };
  if (sshConfig()) {
    if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
    const result = await runSshCronCommand(["run", END_OF_OPTIONS, jobId], profile);
    return { success: result.success, error: result.error };
  }
  if (isRemoteMode()) return remoteJobAction(jobId, "run");
  if (!isValidIdSlug(jobId)) return { success: false, error: "Invalid job ID" };
  const result = await runCronCommand(["run", END_OF_OPTIONS, jobId], profile);
  return { success: result.success, error: result.error };
}
