# Stage 2A — `ask_profile` MCP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone zero-dependency Node stdio MCP server (`resources/mcp-bridge/`) exposing `list_profiles` + `ask_profile`, registered into a profile's `config.yaml` by the desktop, so the agent can autonomously hand a one-shot task to another profile (bounded by depth/cycle/timeout guardrails).

**Architecture:** The hermes-agent (an MCP client) spawns the bridge per its `mcp_servers` config. `ask_profile(profile, message)` validates + guardrails, then spawns the bundled hermes CLI one-shot for the target profile and returns its cleaned reply. The desktop's `mcp-bridge.ts` writes/removes the config block (opt-in) and restarts the gateway.

**Tech Stack:** Node ESM (zero-dep) for the bridge; TypeScript (main process) for the desktop side; Vitest; electron-builder.

## Global Constraints

- The bridge (`resources/mcp-bridge/*.mjs`) is **zero-dependency** plain Node ESM — it must NOT import anything from `src/` or any npm package (it ships standalone and runs under the agent).
- TypeScript strict for `src/` changes; `npm run typecheck` stays green; existing test suite stays green (127 → grows with new tests).
- Guardrails (verbatim): `MAX_DEPTH = 2`; depth via env `HERMES_ASK_DEPTH`; cycle via env `HERMES_ASK_CHAIN` (comma-separated); per-call timeout `120000` ms.
- Bridge env contract (written by the desktop): `HERMES_HOME`, `HERMES_DESKTOP_BRIDGE_PYTHON`, `HERMES_DESKTOP_BRIDGE_REPO`, `HERMES_DESKTOP_BRIDGE_CLI_ARGS` (JSON array). The agent spawns the bridge with `command = process.execPath` (the app binary) + env `ELECTRON_RUN_AS_NODE=1`.
- Feature is OFF by default; nothing is written to config until enabled.

---

### Task 1: Bridge pure helpers (`resources/mcp-bridge/lib.mjs`)

**Files:**
- Create: `resources/mcp-bridge/lib.mjs`
- Test: `src/main/mcpBridgeLib.test.ts` (imports the `.mjs` by relative path; Vitest already runs `src/main/*.test.ts`)

**Interfaces:**
- Produces: `MAX_DEPTH` (2), `TOOLS` (array of 2 tool defs), `cleanCliOutput(raw: string): string`, `validateProfileName(name, knownProfiles: string[]): boolean`, `evaluateGuardrails(targetProfile, env): { allowed: boolean, reason?: string, childEnv: Record<string,string> }`, `enumerateProfiles(hermesHome: string): string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/main/mcpBridgeLib.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_DEPTH,
  TOOLS,
  cleanCliOutput,
  validateProfileName,
  evaluateGuardrails,
} from "../../resources/mcp-bridge/lib.mjs";

describe("cleanCliOutput", () => {
  it("strips ANSI, box-drawing chrome, banner and session_id lines", () => {
    const raw = "[32m╭─ box\nsession_id: abc123\n⚕ Hermes\nHello there[0m\n";
    expect(cleanCliOutput(raw)).toBe("Hello there");
  });
  it("returns empty string for empty input", () => {
    expect(cleanCliOutput("")).toBe("");
  });
});

describe("validateProfileName", () => {
  const known = ["default", "analyst"];
  it("accepts a known profile", () => expect(validateProfileName("analyst", known)).toBe(true));
  it("rejects unknown profiles", () => expect(validateProfileName("ghost", known)).toBe(false));
  it("rejects flag-like and path-like names", () => {
    expect(validateProfileName("-rf", known)).toBe(false);
    expect(validateProfileName("../etc", known)).toBe(false);
    expect(validateProfileName("a/b", known)).toBe(false);
  });
});

describe("evaluateGuardrails", () => {
  it("allows a first-hop call and increments depth + appends chain", () => {
    const g = evaluateGuardrails("analyst", {});
    expect(g.allowed).toBe(true);
    expect(g.childEnv.HERMES_ASK_DEPTH).toBe("1");
    expect(g.childEnv.HERMES_ASK_CHAIN).toBe("analyst");
  });
  it(`refuses at depth ${MAX_DEPTH}`, () => {
    const g = evaluateGuardrails("x", { HERMES_ASK_DEPTH: String(MAX_DEPTH) });
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/depth/);
  });
  it("refuses a cycle (target already in chain)", () => {
    const g = evaluateGuardrails("analyst", { HERMES_ASK_CHAIN: "analyst" });
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/cycle/);
  });
  it("appends to an existing chain", () => {
    const g = evaluateGuardrails("b", { HERMES_ASK_DEPTH: "1", HERMES_ASK_CHAIN: "a" });
    expect(g.allowed).toBe(true);
    expect(g.childEnv.HERMES_ASK_CHAIN).toBe("a,b");
  });
});

describe("TOOLS", () => {
  it("exposes exactly list_profiles and ask_profile", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["list_profiles", "ask_profile"]);
    const ask = TOOLS.find((t) => t.name === "ask_profile");
    expect(ask.inputSchema.required).toEqual(["profile", "message"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mcpBridgeLib.test.ts`
Expected: FAIL — cannot find module `../../resources/mcp-bridge/lib.mjs`.

- [ ] **Step 3: Write the implementation**

Create `resources/mcp-bridge/lib.mjs`:

```js
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

const ANSI_RE = /\[[0-9;]*[A-Za-z]/g;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mcpBridgeLib.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/mcp-bridge/lib.mjs src/main/mcpBridgeLib.test.ts
git commit -m "feat: mcp-bridge pure helpers (guardrails, output cleaning, tools)"
```

---

### Task 2: The stdio MCP server (`resources/mcp-bridge/server.mjs`)

**Files:**
- Create: `resources/mcp-bridge/server.mjs`
- Test: `src/main/mcpBridgeServer.test.ts`

**Interfaces:**
- Consumes: everything from `lib.mjs` (Task 1).
- Produces: a runnable stdio MCP server. No importable API.

- [ ] **Step 1: Write the failing test**

Create `src/main/mcpBridgeServer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SERVER = join(__dirname, "../../resources/mcp-bridge/server.mjs");

function driveServer(env: Record<string, string>, messages: unknown[]): Promise<any[]> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses: any[] = [];
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (l) responses.push(JSON.parse(l));
      }
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
    setTimeout(() => {
      child.kill();
      resolve(responses);
    }, 3000);
  });
}

describe("mcp-bridge server.mjs", () => {
  it("handles initialize, tools/list, and ask_profile via a stubbed CLI", async () => {
    const home = mkdtempSync(join(tmpdir(), "hb-"));
    mkdirSync(join(home, "profiles", "analyst"), { recursive: true });
    const stub = join(home, "stub-cli.mjs");
    // The stub stands in for the hermes CLI: it ignores args and prints a reply.
    writeFileSync(stub, 'process.stdout.write("PONG from sub-profile\\n"); process.exit(0);\n');

    const env = {
      HERMES_HOME: home,
      HERMES_DESKTOP_BRIDGE_PYTHON: process.execPath,
      HERMES_DESKTOP_BRIDGE_CLI_ARGS: JSON.stringify([stub]),
      HERMES_DESKTOP_BRIDGE_REPO: home,
    };
    const out = await driveServer(env, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ask_profile", arguments: { profile: "analyst", message: "hi" } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ask_profile", arguments: { profile: "ghost", message: "hi" } } },
    ]);
    const byId = Object.fromEntries(out.filter((r) => r.id != null).map((r) => [r.id, r]));
    expect(byId[1].result.serverInfo.name).toBe("hermes-desktop");
    expect(byId[2].result.tools.map((t: any) => t.name)).toEqual(["list_profiles", "ask_profile"]);
    expect(byId[3].result.content[0].text).toContain("PONG from sub-profile");
    // unknown profile is refused with an error tool result
    expect(byId[4].result.isError).toBe(true);
    expect(byId[4].result.content[0].text).toMatch(/Unknown or invalid profile/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mcpBridgeServer.test.ts`
Expected: FAIL — `server.mjs` does not exist (spawn errors / no responses).

- [ ] **Step 3: Write the implementation**

Create `resources/mcp-bridge/server.mjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/mcpBridgeServer.test.ts`
Expected: PASS (initialize/tools.list/ask_profile + unknown-profile refusal).

- [ ] **Step 5: Commit**

```bash
git add resources/mcp-bridge/server.mjs src/main/mcpBridgeServer.test.ts
git commit -m "feat: mcp-bridge stdio server (list_profiles + ask_profile)"
```

---

### Task 3: Desktop config builder + integration module

**Files:**
- Create: `src/main/mcp-bridge-config.ts` (pure — no Electron/fs, so its test never imports Electron)
- Create: `src/main/mcp-bridge.ts` (Electron-bound)
- Test: `src/main/mcp-bridge-config.test.ts`

**Interfaces:**
- Consumes: `saveConfigYaml`, `loadConfigYaml` from `./config`; `HERMES_HOME`, `HERMES_PYTHON`, `HERMES_REPO`, `hermesCliArgs` from `./installer`; `restartGateway` from `./hermes`; Electron `app`.
- Produces (mcp-bridge-config.ts): `MCP_SERVER_KEY` (= "hermes-desktop"), `buildBridgeConfigBlock(opts): { command: string; args: string[]; env: Record<string,string> }` (pure). Produces (mcp-bridge.ts): `bridgeServerPath(): string`, `enableAskProfileBridge(profile?: string): void`, `disableAskProfileBridge(profile?: string): void`, `isAskProfileBridgeEnabled(profile?: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/main/mcp-bridge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBridgeConfigBlock } from "./mcp-bridge-config";

describe("buildBridgeConfigBlock", () => {
  it("builds an mcp_servers entry that runs the bridge via the app binary as node", () => {
    const block = buildBridgeConfigBlock({
      execPath: "/Applications/Hermes.app/Contents/MacOS/Hermes",
      serverPath: "/Applications/Hermes.app/Contents/Resources/mcp-bridge/server.mjs",
      hermesHome: "/Users/x/.hermes",
      python: "/Users/x/.hermes/bin/python",
      repo: "/Users/x/.hermes/hermes-agent",
      cliArgs: ["-m", "hermes"],
    });
    expect(block.command).toBe("/Applications/Hermes.app/Contents/MacOS/Hermes");
    expect(block.args).toEqual(["/Applications/Hermes.app/Contents/Resources/mcp-bridge/server.mjs"]);
    expect(block.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(block.env.HERMES_HOME).toBe("/Users/x/.hermes");
    expect(block.env.HERMES_DESKTOP_BRIDGE_PYTHON).toBe("/Users/x/.hermes/bin/python");
    expect(block.env.HERMES_DESKTOP_BRIDGE_REPO).toBe("/Users/x/.hermes/hermes-agent");
    expect(JSON.parse(block.env.HERMES_DESKTOP_BRIDGE_CLI_ARGS)).toEqual(["-m", "hermes"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/mcp-bridge-config.test.ts`
Expected: FAIL — cannot find `./mcp-bridge-config`.

- [ ] **Step 3: Write the implementation**

Create `src/main/mcp-bridge-config.ts` (pure — no Electron, so the test never pulls Electron in):

```ts
export const MCP_SERVER_KEY = "hermes-desktop";

/**
 * Build the `mcp_servers.hermes-desktop` block. The agent runs the bridge by
 * executing the app binary as Node (ELECTRON_RUN_AS_NODE=1) — no dependency on a
 * system `node`. Pure (no I/O) so it is unit-tested directly.
 */
export function buildBridgeConfigBlock(opts: {
  execPath: string;
  serverPath: string;
  hermesHome: string;
  python: string;
  repo: string;
  cliArgs: string[];
}): { command: string; args: string[]; env: Record<string, string> } {
  return {
    command: opts.execPath,
    args: [opts.serverPath],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      HERMES_HOME: opts.hermesHome,
      HERMES_DESKTOP_BRIDGE_PYTHON: opts.python,
      HERMES_DESKTOP_BRIDGE_REPO: opts.repo,
      HERMES_DESKTOP_BRIDGE_CLI_ARGS: JSON.stringify(opts.cliArgs),
    },
  };
}
```

Then create `src/main/mcp-bridge.ts` (Electron-bound; read `./config`, `./installer`, `./hermes` first to confirm the exact exports — they all exist):

```ts
import { app } from "electron";
import { join } from "path";
import { HERMES_HOME, HERMES_PYTHON, HERMES_REPO, hermesCliArgs } from "./installer";
import { loadConfigYaml, saveConfigYaml } from "./config";
import { restartGateway } from "./hermes";
import { MCP_SERVER_KEY, buildBridgeConfigBlock } from "./mcp-bridge-config";

/** Absolute path to the shipped bridge entry (dev vs packaged). */
export function bridgeServerPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "mcp-bridge", "server.mjs")
    : join(app.getAppPath(), "resources", "mcp-bridge", "server.mjs");
}

export function isAskProfileBridgeEnabled(profile?: string): boolean {
  const config = loadConfigYaml(profile);
  const servers = (config.mcp_servers as Record<string, unknown> | undefined) || {};
  return Boolean(servers[MCP_SERVER_KEY]);
}

export function enableAskProfileBridge(profile?: string): void {
  const block = buildBridgeConfigBlock({
    execPath: process.execPath,
    serverPath: bridgeServerPath(),
    hermesHome: HERMES_HOME,
    python: HERMES_PYTHON,
    repo: HERMES_REPO,
    cliArgs: hermesCliArgs([]),
  });
  // Re-write idempotently (path/binary can move across installs).
  saveConfigYaml(`mcp_servers.${MCP_SERVER_KEY}`, block, profile);
  restartGateway(profile);
}

export function disableAskProfileBridge(profile?: string): void {
  const config = loadConfigYaml(profile);
  const servers = (config.mcp_servers as Record<string, unknown> | undefined) || {};
  if (!servers[MCP_SERVER_KEY]) return;
  delete servers[MCP_SERVER_KEY];
  saveConfigYaml("mcp_servers", servers, profile);
  restartGateway(profile);
}
```

- [ ] **Step 4: Run test to verify it passes + typecheck**

Run: `npx vitest run src/main/mcp-bridge-config.test.ts && npx tsc --noEmit -p tsconfig.node.json`
Expected: test PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp-bridge-config.ts src/main/mcp-bridge.ts src/main/mcp-bridge-config.test.ts
git commit -m "feat: desktop mcp-bridge enable/disable + config block writer"
```

---

### Task 4: IPC + preload wiring

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `enableAskProfileBridge`, `disableAskProfileBridge`, `isAskProfileBridgeEnabled` (Task 3).
- Produces: `window.hermes.setAskProfileBridge(enabled: boolean, profile?: string): Promise<boolean>` and `window.hermes.getAskProfileBridgeEnabled(profile?: string): Promise<boolean>`.

- [ ] **Step 1: Add the import in main**

In `src/main/index.ts`, add after the `./desktop-sessions` import block:
```ts
import {
  enableAskProfileBridge,
  disableAskProfileBridge,
  isAskProfileBridgeEnabled,
} from "./mcp-bridge";
```

- [ ] **Step 2: Register IPC handlers**

In `src/main/index.ts`, immediately after the `ipcMain.handle("chat-readiness", …)` handler, add:
```ts
  ipcMain.handle("get-ask-profile-bridge", (_event, profile?: string) =>
    isAskProfileBridgeEnabled(profile),
  );
  ipcMain.handle(
    "set-ask-profile-bridge",
    (_event, enabled: boolean, profile?: string) => {
      if (enabled) enableAskProfileBridge(profile);
      else disableAskProfileBridge(profile);
      return isAskProfileBridgeEnabled(profile);
    },
  );
```

- [ ] **Step 3: Add preload methods**

In `src/preload/index.ts`, after the `getChatReadiness` method, add:
```ts
  getAskProfileBridgeEnabled: (profile?: string): Promise<boolean> =>
    ipcRenderer.invoke("get-ask-profile-bridge", profile),
  setAskProfileBridge: (enabled: boolean, profile?: string): Promise<boolean> =>
    ipcRenderer.invoke("set-ask-profile-bridge", enabled, profile),
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: clean (web + node).

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: IPC for enabling the ask_profile MCP bridge"
```

---

### Task 5: Package the bridge (`electron-builder.yml`)

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Inspect current packaging**

Run: `grep -nE "extraResources|files:|resources" electron-builder.yml`
Read the file to see how assets are already shipped.

- [ ] **Step 2: Add the bridge to extraResources**

In `electron-builder.yml`, add (or extend) the top-level `extraResources` list so the bridge lands at `process.resourcesPath/mcp-bridge`:
```yaml
extraResources:
  - from: resources/mcp-bridge
    to: mcp-bridge
    filter:
      - "**/*"
```
If an `extraResources:` key already exists, append the `- from: resources/mcp-bridge …` entry to it rather than adding a second key.

- [ ] **Step 3: Verify the renderer/main build still works**

Run: `npm run build`
Expected: clean (packaging itself is exercised by `build:mac`, but `build` must stay green).

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml
git commit -m "build: ship resources/mcp-bridge as extraResources"
```

---

### Task 6: Live end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Enable the bridge on the default profile and confirm config**

Use a short Node/Electron-driver (electron-screenshot-driver memory pattern) OR the running app: call `window.hermes.setAskProfileBridge(true)`, then confirm `~/.hermes/config.yaml` now has an `mcp_servers.hermes-desktop` block with `command` = the app binary and the four `HERMES_DESKTOP_BRIDGE_*`/`HERMES_HOME` env keys.

- [ ] **Step 3: Confirm the agent loads + can call the tool**

With the gateway restarted (enable does this), drive a chat to the active profile asking it to use `ask_profile` to query another profile (e.g. "Use ask_profile to ask the `<other>` profile to reply with the word pong, then tell me what it said."). Confirm the reply contains the other profile's answer. Confirm `~/.hermes/logs/mcp-stderr.log` shows no bridge errors.

- [ ] **Step 4: Confirm guardrails**

Temporarily set `HERMES_ASK_DEPTH=2` for a manual bridge invocation (or craft a 3-deep chain) and confirm `ask_profile` refuses with the depth message; confirm a self-ask (`ask_profile(sameProfile)` already in chain) refuses with the cycle message.

- [ ] **Step 5: Disable + confirm cleanup**

Call `window.hermes.setAskProfileBridge(false)`; confirm the `mcp_servers.hermes-desktop` block is removed from `config.yaml`.

No commit (verification only); record results in the progress ledger.

---

## Notes for the implementer

- The bridge is zero-dep and standalone — never import from `src/`. The pure helpers live in `lib.mjs` and are imported by both `server.mjs` and the Vitest test (by relative path).
- `hermesCliArgs([])` returns the CLI prefix the desktop uses to invoke the bundled CLI; the bridge splices `-p <profile> chat -q <message> -Q` after it. Keep this in sync with `sendMessageViaCli` in `hermes.ts`.
- Cycle detection tracks visited TARGET profiles (not the root); `MAX_DEPTH = 2` is the hard bound on chain length.
