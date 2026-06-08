import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { DispatchMode, ProfileDispatchTarget } from "@shared/types";
import { profileHome, safeWriteFile } from "./utils";

export interface SessionRunMetadata {
  sessionId: string;
  profileName: string;
  profileNames: string[];
  dispatchId?: string;
  dispatchMode?: DispatchMode;
  primaryProfile?: string;
  updatedAt: number;
}

type SessionRunMetadataStore = Record<string, SessionRunMetadata>;

function metadataFilePath(): string {
  return join(profileHome("default"), "desktop", "session-runs.json");
}

export function readSessionRunMetadata(): SessionRunMetadataStore {
  const file = metadataFilePath();
  try {
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SessionRunMetadataStore;
  } catch {
    return {};
  }
}

function writeSessionRunMetadata(store: SessionRunMetadataStore): void {
  safeWriteFile(metadataFilePath(), JSON.stringify(store));
}

function uniqueProfiles(targets: ProfileDispatchTarget[]): string[] {
  const names = targets
    .map((target) => target.profileName.trim())
    .filter(Boolean);
  return Array.from(new Set(names.length > 0 ? names : ["default"]));
}

export function sessionRunMetadataFor(
  store: SessionRunMetadataStore,
  sessionId: string,
  fallbackProfileName: string,
): Pick<SessionRunMetadata, "profileName" | "profileNames" | "dispatchMode" | "primaryProfile"> {
  const existing = store[sessionId];
  if (existing) {
    const profileNames = existing.profileNames.length > 0 ? existing.profileNames : [existing.profileName];
    return {
      profileName: existing.profileName || fallbackProfileName,
      profileNames,
      dispatchMode: existing.dispatchMode,
      primaryProfile: existing.primaryProfile,
    };
  }

  return {
    profileName: fallbackProfileName,
    profileNames: [fallbackProfileName],
  };
}

export function recordDispatchSessionMetadata(input: {
  dispatchId: string;
  mode: DispatchMode;
  targets: ProfileDispatchTarget[];
  sessionIdsByProfile: Record<string, string | undefined>;
}): void {
  const store = readSessionRunMetadata();
  const profileNames = uniqueProfiles(input.targets);
  const primaryProfile =
    input.targets.find((target) => target.isPrimary)?.profileName || profileNames[0];
  const updatedAt = Math.floor(Date.now() / 1000);

  for (const profileName of profileNames) {
    const sessionId = input.sessionIdsByProfile[profileName];
    if (!sessionId) continue;
    store[sessionId] = {
      sessionId,
      profileName,
      profileNames,
      dispatchId: input.dispatchId,
      dispatchMode: input.mode,
      primaryProfile,
      updatedAt,
    };
  }

  writeSessionRunMetadata(store);
}
