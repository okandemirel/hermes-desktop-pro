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
