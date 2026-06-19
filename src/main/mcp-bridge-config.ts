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
