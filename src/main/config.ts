import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import * as YAML from "yaml";
import { HERMES_HOME } from "./installer";

function hermesHome(): string {
  return HERMES_HOME;
}

function configPath(profile?: string): string {
  const home = hermesHome();
  if (profile && profile !== "default") {
    return join(home, "profiles", profile, "config.yaml");
  }
  return join(home, "config.yaml");
}

export function loadConfigYaml(profile?: string): Record<string, any> {
  const path = configPath(profile);
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return YAML.parse(content) || {};
    }
  } catch {}
  return {};
}

export function saveConfigYaml(
  key: string,
  value: any,
  profile?: string,
): void {
  const path = configPath(profile);
  const config = loadConfigYaml(profile);
  const parts = key.split(".");
  let current: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(config), "utf-8");
}

export function getHermesHome(): string {
  return HERMES_HOME;
}

export function getModelConfig(
  profile?: string,
): { model: string; provider: string; baseUrl: string } {
  const config = loadConfigYaml(profile);
  return {
    model: config.model?.default || "",
    provider: config.model?.provider || "auto",
    baseUrl: config.model?.base_url || "",
  };
}

export function setModelConfig(
  model: string,
  provider: string,
  baseUrl: string,
  profile?: string,
): void {
  saveConfigYaml("model.default", model, profile);
  saveConfigYaml("model.provider", provider, profile);
  saveConfigYaml("model.base_url", baseUrl, profile);
}

export function getEnvValue(
  key: string,
  profile?: string,
): string | undefined {
  const home = hermesHome();
  const envPath =
    profile && profile !== "default"
      ? join(home, "profiles", profile, ".env")
      : join(home, ".env");
  try {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (trimmed.startsWith(key + "=")) {
          return trimmed
            .slice(key.length + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {}
  return undefined;
}

export function setEnvValue(
  key: string,
  value: string,
  profile?: string,
): void {
  const home = hermesHome();
  const envPath =
    profile && profile !== "default"
      ? join(home, "profiles", profile, ".env")
      : join(home, ".env");
  mkdirSync(dirname(envPath), { recursive: true });

  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, "utf-8").split("\n");
  }

  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(key + "=") || trimmed.startsWith("# " + key + "=")) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(`${key}=${value}`);
  }

  writeFileSync(envPath, lines.join("\n"), "utf-8");
}

export function listProfiles(): string[] {
  const home = hermesHome();
  const profilesDir = join(home, "profiles");
  const profiles = ["default"];
  try {
    if (existsSync(profilesDir)) {
      const { readdirSync } = require("fs");
      for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          profiles.push(entry.name);
        }
      }
    }
  } catch {}
  return profiles;
}

export function getActiveProfileName(): string {
  const home = hermesHome();
  const profileFile = join(home, "active_profile");
  try {
    if (existsSync(profileFile)) {
      return readFileSync(profileFile, "utf-8").trim() || "default";
    }
  } catch {}
  return "default";
}
