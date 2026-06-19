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
