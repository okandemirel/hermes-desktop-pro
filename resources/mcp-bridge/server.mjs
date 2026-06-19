// Standalone, zero-dependency stdio MCP server shipped with Hermes Desktop Pro.
// The hermes-agent spawns this (configured via config.yaml mcp_servers). It
// exposes list_profiles + ask_profile, letting a profile's agent hand a one-shot
// task to another profile. ask_profile shells the bundled hermes CLI.
import { spawn } from "node:child_process";
import {
  cleanCliOutput,
  enumerateProfiles,
  evaluateGuardrails,
  validateProfileName,
  TOOLS,
} from "./lib.mjs";

const HERMES_HOME = process.env.HERMES_HOME || "";
const BRIDGE_PYTHON = process.env.HERMES_DESKTOP_BRIDGE_PYTHON || "";
const BRIDGE_REPO = process.env.HERMES_DESKTOP_BRIDGE_REPO || "";
let BRIDGE_CLI_ARGS = [];
try {
  BRIDGE_CLI_ARGS = JSON.parse(process.env.HERMES_DESKTOP_BRIDGE_CLI_ARGS || "[]");
  if (!Array.isArray(BRIDGE_CLI_ARGS)) BRIDGE_CLI_ARGS = [];
} catch {
  BRIDGE_CLI_ARGS = [];
}

const SERVER_INFO = { name: "hermes-desktop", version: "1.0.0" };

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
function toolText(text, isError = false) {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function runProfileCli(profile, message, childEnv) {
  return new Promise((resolve) => {
    const args = [
      ...BRIDGE_CLI_ARGS,
      "-p",
      profile,
      "chat",
      "-q",
      message,
      "-Q",
      "--source",
      "mcp-bridge",
    ];
    let out = "";
    let err = "";
    let done = false;
    const finish = (text) => {
      if (done) return;
      done = true;
      resolve(text);
    };
    const child = spawn(BRIDGE_PYTHON, args, {
      cwd: BRIDGE_REPO || undefined,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish("ask_profile timed out after 120s.");
    }, 120000);
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finish(`ask_profile failed to start: ${e.message}`);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const cleaned = cleanCliOutput(out);
      if (cleaned) finish(cleaned);
      else if (code === 0) finish("(no output)");
      else finish(`ask_profile exited with code ${code}: ${cleanCliOutput(err).slice(0, 300)}`);
    });
  });
}

async function callTool(name, args) {
  if (name === "list_profiles") {
    return toolText(enumerateProfiles(HERMES_HOME).join("\n") || "default");
  }
  if (name === "ask_profile") {
    const profile = String((args && args.profile) || "");
    const message = String((args && args.message) || "");
    if (!message) return toolText("ask_profile requires a non-empty message.", true);
    const known = enumerateProfiles(HERMES_HOME);
    if (!validateProfileName(profile, known)) {
      return toolText(`Unknown or invalid profile: "${profile}". Use list_profiles to see valid names.`, true);
    }
    const guard = evaluateGuardrails(profile, process.env);
    if (!guard.allowed) return toolText(`ask_profile refused: ${guard.reason}`, true);
    const text = await runProfileCli(profile, message, { ...process.env, ...guard.childEnv });
    return toolText(text);
  }
  return toolText(`Unknown tool: ${name}`, true);
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: (params && params.protocolVersion) || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "ping") {
    reply(id, {});
    return;
  }
  if (method === "tools/list") {
    reply(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    try {
      reply(id, await callTool(params && params.name, (params && params.arguments) || {}));
    } catch (e) {
      replyError(id, -32603, `Internal error: ${e.message}`);
    }
    return;
  }
  if (id !== undefined && id !== null) replyError(id, -32601, `Method not found: ${method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    void handle(msg);
  }
});
process.stdin.on("end", () => process.exit(0));
