import { readdirSync } from "node:fs";
import { join } from "node:path";

export const MAX_DEPTH = 2;

export const TOOLS = [
  {
    name: "list_profiles",
    description:
      "List the available Hermes profiles you can hand a task to with ask_profile.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ask_profile",
    description:
      "Send a one-shot task or question to another Hermes profile and return its reply. Use to delegate to a differently-configured profile.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Target profile name (see list_profiles)." },
        message: { type: "string", description: "The task or question to send to that profile." },
      },
      required: ["profile", "message"],
      additionalProperties: false,
    },
  },
];

const ANSI_RE = /\[[0-9;]*[A-Za-z]/g;
const NOISE_RE = [/^[╭╰│╮╯─┌┐└┘┤├┬┴┼]/, /⚕\s*Hermes/];

// Strip ANSI + the CLI's TUI chrome from one-shot stdout (mirrors the desktop's
// stripAnsi + NOISE_PATTERNS) so the tool returns clean assistant text.
export function cleanCliOutput(raw) {
  const text = String(raw || "").replace(ANSI_RE, "");
  const lines = text.replace(/session_id:\s*\S+\n?/g, "").split("\n");
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && NOISE_RE.some((re) => re.test(t))) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

// A profile name from the LLM is safe to pass to the CLI only if it is a known
// profile and cannot be smuggled as a flag or path.
export function validateProfileName(name, knownProfiles) {
  if (typeof name !== "string" || !name) return false;
  if (name.startsWith("-")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  return knownProfiles.includes(name);
}

// Depth + cycle guardrails carried through the spawn chain via env. Returns
// whether the call is allowed and the env additions for the child spawn.
export function evaluateGuardrails(targetProfile, env) {
  const depth = Number.parseInt(env.HERMES_ASK_DEPTH || "0", 10) || 0;
  const chain = (env.HERMES_ASK_CHAIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (depth >= MAX_DEPTH) {
    return { allowed: false, reason: `max ask_profile depth (${MAX_DEPTH}) reached`, childEnv: {} };
  }
  if (chain.includes(targetProfile)) {
    return {
      allowed: false,
      reason: `cycle detected (${[...chain, targetProfile].join(" -> ")})`,
      childEnv: {},
    };
  }
  return {
    allowed: true,
    childEnv: {
      HERMES_ASK_DEPTH: String(depth + 1),
      HERMES_ASK_CHAIN: [...chain, targetProfile].join(","),
    },
  };
}

// Enumerate profiles: every subdirectory of $HERMES_HOME/profiles plus "default".
export function enumerateProfiles(hermesHome) {
  const names = ["default"];
  if (!hermesHome) return names;
  try {
    for (const entry of readdirSync(join(hermesHome, "profiles"), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) names.push(entry.name);
    }
  } catch {
    /* no profiles dir */
  }
  return names;
}
