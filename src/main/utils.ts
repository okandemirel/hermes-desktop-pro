import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";
import { getHermesHome } from "./config";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*[a-zA-Z]|\x1B\][^\x07]*\x07|\x1B\(B|\r/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

const PROFILE_NAME_RE = /^[a-z0-9_][a-z0-9_-]{0,63}$/;
export const PROFILE_NAME_ERROR =
  "Profile names may contain lowercase letters, numbers, underscores, and hyphens, and cannot start with a hyphen.";

export function isValidNamedProfileName(profile: unknown): profile is string {
  return typeof profile === "string" && PROFILE_NAME_RE.test(profile);
}

export function isValidProfileName(profile: unknown): profile is string {
  return profile === "default" || isValidNamedProfileName(profile);
}

export function normalizeProfileName(profile?: unknown): string | undefined {
  if (profile === undefined || profile === "" || profile === "default") {
    return undefined;
  }

  if (!isValidNamedProfileName(profile)) {
    throw new Error(PROFILE_NAME_ERROR);
  }

  return profile;
}

export function profileHome(profile?: unknown): string {
  const normalized = normalizeProfileName(profile);
  return normalized
    ? join(getHermesHome(), "profiles", normalized)
    : getHermesHome();
}

export function profilePaths(profile?: unknown): {
  envFile: string;
  configFile: string;
  home: string;
} {
  const home = profileHome(profile);
  return {
    home,
    envFile: join(home, ".env"),
    configFile: join(home, "config.yaml"),
  };
}

function pidIsAlive(pid: number): boolean {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code !== "ESRCH";
  }
}

function getProcessImageNameWin(pid: number): string | null {
  if (process.platform !== "win32") return null;
  if (!pid || !Number.isFinite(pid)) return null;
  try {
    const output = execFileSync(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { encoding: "utf-8", timeout: 5000, windowsHide: true },
    );
    const m = output.match(/^"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function pidIsAliveAs(
  pid: number,
  expectedImagePrefixes: string[],
): boolean {
  if (!pidIsAlive(pid)) return false;
  if (process.platform !== "win32") return true;
  const image = getProcessImageNameWin(pid);
  if (!image) return true;
  const lower = image.toLowerCase();
  return expectedImagePrefixes.some((prefix) =>
    lower.startsWith(prefix.toLowerCase()),
  );
}

export function safeWriteFile(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tempPath = join(
    dir,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`,
  );

  let tempWritten = false;
  try {
    writeFileSync(tempPath, content, "utf-8");
    tempWritten = true;
    renameSync(tempPath, filePath);
  } catch (err) {
    if (tempWritten) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup. Preserve the original write/rename error.
      }
    }
    throw err;
  }
}

export function getActiveProfileNameSync(): string {
  try {
    const activeFile = join(getHermesHome(), "active_profile");
    if (!existsSync(activeFile)) return "default";
    const name = readFileSync(activeFile, "utf-8").trim();
    return name || "default";
  } catch {
    return "default";
  }
}

/**
 * Resolve the session database for the currently active profile. The
 * default profile uses ~/.hermes/state.db; named profiles use
 * ~/.hermes/profiles/<name>/state.db. The desktop's Sessions feature
 * used to read the root state.db unconditionally, so named-profile users
 * saw an empty or wrong session list (issue #311).
 */
export function activeStateDbPath(): string {
  return join(profileHome(getActiveProfileNameSync()), "state.db");
}
