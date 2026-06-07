/**
 * Kanban reader — local Hermes CLI (`hermes kanban …`) with SSH-tunnel and
 * remote-only branching. Ported from the validated reference module; data
 * shapes come from "@shared/types".
 *
 * Branching (per export):
 *   - SSH tunnel  → sshRunKanban (remote `hermes kanban` over sshExec)
 *   - local       → spawn HERMES_PYTHON with hermesCliArgs()
 *   - remote-only → unsupportedInRemote() (plain HTTP+API key cannot reach
 *                   the kanban API; the renderer keys its "switch modes"
 *                   screen off result.unsupportedMode)
 */

import { execFile, ExecFileOptions } from "child_process";
import { join } from "path";
import {
  HERMES_HOME,
  HERMES_PYTHON,
  hermesCliArgs,
  getEnhancedPath,
} from "./installer";
import { isRemoteOnlyMode } from "./hermes";
import { getConnectionConfig } from "./config";
import { sshRunKanban, sshListClaw3dHqTasks } from "./ssh-remote";
import { END_OF_OPTIONS, isSafePositional, isValidIdSlug } from "./cli-safety";
import type {
  KanbanTask,
  KanbanBoard,
  KanbanTaskDetail,
  KanbanResult,
} from "@shared/types";

const KANBAN_TIMEOUT_MS = 20000;

interface RunOpts {
  profile?: string;
  parseJson?: boolean;
  timeoutMs?: number;
}

async function runKanban(
  args: string[],
  opts: RunOpts = {},
): Promise<KanbanResult<unknown>> {
  // SSH tunnel mode: dispatch to the remote Hermes CLI over SSH.
  const conn = getConnectionConfig();
  if (conn.mode === "ssh" && conn.ssh) {
    return sshRunKanban(conn.ssh, args, {
      profile: opts.profile,
      parseJson: opts.parseJson,
      timeoutMs: opts.timeoutMs,
    });
  }

  const cliArgs = hermesCliArgs();
  if (opts.profile && opts.profile !== "default") {
    cliArgs.push("-p", opts.profile);
  }
  cliArgs.push("kanban", ...args);

  const execOpts: ExecFileOptions = {
    cwd: join(HERMES_HOME, "hermes-agent"),
    timeout: opts.timeoutMs ?? KANBAN_TIMEOUT_MS,
    env: { ...process.env, PATH: getEnhancedPath() },
    maxBuffer: 16 * 1024 * 1024,
  };

  return new Promise((resolve) => {
    execFile(HERMES_PYTHON, cliArgs, execOpts, (err, stdout, stderr) => {
      const out = (stdout || "").toString();
      if (err) {
        resolve({
          success: false,
          error: (stderr || err.message || "").toString().trim(),
          stdout: out,
        });
        return;
      }
      if (opts.parseJson) {
        try {
          resolve({ success: true, data: JSON.parse(out), stdout: out });
        } catch (parseErr) {
          resolve({
            success: false,
            error: `Failed to parse JSON from 'hermes kanban': ${(parseErr as Error).message}`,
            stdout: out,
          });
        }
        return;
      }
      resolve({ success: true, stdout: out });
    });
  });
}

export function unsupportedInRemote<T>(): KanbanResult<T> {
  return {
    success: false,
    unsupportedMode: true,
    error:
      "Kanban requires either a local Hermes install or SSH tunnel mode. " +
      "Plain remote (HTTP+API key) mode does not yet expose the kanban API. " +
      "Switch to SSH tunnel mode in Settings to use the board against a remote Hermes.",
  };
}

export async function listBoards(
  includeArchived = false,
  profile?: string,
): Promise<KanbanResult<KanbanBoard[]>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  const args = ["boards", "list", "--json"];
  if (includeArchived) args.push("--all");
  const res = await runKanban(args, { profile, parseJson: true });
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: res.data as KanbanBoard[] };
}

export async function currentBoard(
  profile?: string,
): Promise<KanbanResult<string>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  const res = await runKanban(["boards", "show"], { profile });
  if (!res.success) return { success: false, error: res.error };
  const slug = (res.stdout || "").trim();
  return { success: true, data: slug };
}

export async function switchBoard(
  slug: string,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!slug) return { success: false, error: "Missing board slug" };
  if (!isValidIdSlug(slug)) return { success: false, error: "Invalid board slug" };
  const res = await runKanban(["boards", "switch", END_OF_OPTIONS, slug], {
    profile,
  });
  return { success: res.success, error: res.error };
}

export async function createBoard(
  slug: string,
  name?: string,
  switchAfter = false,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!slug) return { success: false, error: "Missing board slug" };
  if (!isValidIdSlug(slug)) return { success: false, error: "Invalid board slug" };
  const args = ["boards", "create"];
  if (name) args.push("--name", name);
  if (switchAfter) args.push("--switch");
  // user-controlled slug last, after the end-of-options separator
  args.push(END_OF_OPTIONS, slug);
  const res = await runKanban(args, { profile });
  return { success: res.success, error: res.error };
}

export async function listTasks(
  opts: {
    status?: string;
    assignee?: string;
    tenant?: string;
    includeArchived?: boolean;
    profile?: string;
  } = {},
): Promise<KanbanResult<KanbanTask[]>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  const args = ["list", "--json"];
  if (opts.status) args.push("--status", opts.status);
  if (opts.assignee) args.push("--assignee", opts.assignee);
  if (opts.tenant) args.push("--tenant", opts.tenant);
  if (opts.includeArchived) args.push("--archived");
  const res = await runKanban(args, { profile: opts.profile, parseJson: true });
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: res.data as KanbanTask[] };
}

export async function getTask(
  taskId: string,
  profile?: string,
): Promise<KanbanResult<KanbanTaskDetail>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!taskId) return { success: false, error: "Missing task ID" };
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  const res = await runKanban(["show", "--json", END_OF_OPTIONS, taskId], {
    profile,
    parseJson: true,
  });
  if (!res.success) return { success: false, error: res.error };
  return { success: true, data: res.data as KanbanTaskDetail };
}

export interface CreateTaskInput {
  title: string;
  body?: string;
  assignee?: string;
  priority?: number;
  tenant?: string;
  workspace?: string; // "scratch" | "worktree" | "dir:<path>"
  triage?: boolean;
  skills?: string[];
  maxRetries?: number;
}

export async function createTask(
  input: CreateTaskInput,
  profile?: string,
): Promise<KanbanResult<{ id: string }>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!input.title?.trim()) {
    return { success: false, error: "Title is required" };
  }
  // The title is a user-controlled positional. Reject a leading `-` so it
  // cannot be smuggled as a flag (it also goes after `--` below).
  if (!isSafePositional(input.title)) {
    return { success: false, error: "Title must not start with '-'" };
  }
  const args = ["create"];
  if (input.body) args.push("--body", input.body);
  if (input.assignee) args.push("--assignee", input.assignee);
  if (input.priority !== undefined)
    args.push("--priority", String(input.priority));
  if (input.tenant) args.push("--tenant", input.tenant);
  if (input.workspace) args.push("--workspace", input.workspace);
  if (input.triage) args.push("--triage");
  if (input.maxRetries !== undefined)
    args.push("--max-retries", String(input.maxRetries));
  for (const skill of input.skills || []) {
    args.push("--skill", skill);
  }
  args.push("--json");
  // user-controlled title last, after the end-of-options separator
  args.push(END_OF_OPTIONS, input.title);

  const res = await runKanban(args, { profile, parseJson: true });
  if (!res.success) return { success: false, error: res.error };
  const data = res.data as { id?: string };
  return { success: true, data: { id: data?.id || "" } };
}

export async function assignTask(
  taskId: string,
  assignee: string | null,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  const assigneeArg = assignee || "none";
  if (!isSafePositional(assigneeArg)) {
    return { success: false, error: "Invalid assignee" };
  }
  const res = await runKanban(
    ["assign", END_OF_OPTIONS, taskId, assigneeArg],
    { profile },
  );
  return { success: res.success, error: res.error };
}

export async function completeTask(
  taskId: string,
  result?: string,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  const args = ["complete"];
  if (result) args.push("--result", result);
  args.push(END_OF_OPTIONS, taskId);
  const res = await runKanban(args, { profile });
  return { success: res.success, error: res.error };
}

export async function blockTask(
  taskId: string,
  reason?: string,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  if (reason !== undefined && reason !== "" && !isSafePositional(reason)) {
    return { success: false, error: "Reason must not start with '-'" };
  }
  const args = ["block", END_OF_OPTIONS, taskId];
  if (reason) args.push(reason);
  const res = await runKanban(args, { profile });
  return { success: res.success, error: res.error };
}

export async function unblockTask(
  taskId: string,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  const res = await runKanban(["unblock", END_OF_OPTIONS, taskId], { profile });
  return { success: res.success, error: res.error };
}

export async function archiveTask(
  taskId: string,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  const res = await runKanban(["archive", END_OF_OPTIONS, taskId], { profile });
  return { success: res.success, error: res.error };
}

export async function commentTask(
  taskId: string,
  body: string,
  profile?: string,
): Promise<KanbanResult<void>> {
  if (isRemoteOnlyMode()) return unsupportedInRemote();
  if (!body.trim()) return { success: false, error: "Empty comment" };
  if (!isValidIdSlug(taskId)) return { success: false, error: "Invalid task ID" };
  if (!isSafePositional(body)) {
    return { success: false, error: "Comment must not start with '-'" };
  }
  const res = await runKanban(["comment", END_OF_OPTIONS, taskId, body], {
    profile,
  });
  return { success: res.success, error: res.error };
}

// Read-only virtual board: Office runtime headquarters task board, stored at
// ~/.openclaw/claw3d/task-manager/tasks.json on the remote. Only available in
// SSH tunnel mode — there is no equivalent local store for the Office HQ list.
export async function listClaw3dHqTasks(): Promise<KanbanResult<KanbanTask[]>> {
  const conn = getConnectionConfig();
  if (conn.mode !== "ssh" || !conn.ssh) {
    return {
      success: false,
      error:
        "Office HQ board is only available in SSH tunnel mode. Switch the connection mode in Settings to view it.",
    };
  }
  const res = await sshListClaw3dHqTasks(conn.ssh);
  if (!res.success) {
    return { success: false, error: res.error };
  }
  return { success: true, data: res.tasks ?? [] };
}
