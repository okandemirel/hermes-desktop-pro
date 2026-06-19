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
