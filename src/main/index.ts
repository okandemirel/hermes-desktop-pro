import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
} from "electron";
import type { WebContents } from "electron";
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import type { HermesAPI } from "../preload/index";

import {
  loadConfigYaml,
  saveConfigYaml,
  getHermesHome,
  getModelConfig,
  setModelConfig,
  getEnvValue,
  setEnvValue,
  getActiveProfileName,
  getConnectionConfig,
  getPublicConnectionConfig,
  setConnectionConfig,
} from "./config";

import {
  sendMessage,
  ensureSshTunnelIfNeeded,
  setSshRemoteApiKey,
  startGateway,
  stopGateway,
  isGatewayRunning,
  isApiReady,
  testRemoteConnection,
  isRemoteMode,
  notifyProfileSwitched,
} from "./hermes";

import {
  isSshTunnelActive,
  startSshTunnel,
  stopSshTunnel,
  testSshConnection,
} from "./ssh-tunnel";

import {
  sshReadRemoteApiKey,
  sshReadSoul,
  sshWriteSoul,
  sshResetSoul,
  sshGetToolsets,
  sshSetToolsetEnabled,
  sshReadMemory,
  sshAddMemoryEntry,
  sshUpdateMemoryEntry,
  sshRemoveMemoryEntry,
  sshWriteUserProfile,
  sshListModels,
  sshAddModel,
  sshRemoveModel,
  sshUpdateModel,
  sshListSessions,
  sshSearchSessions,
  sshGetSessionMessages,
  sshListProfiles,
  sshCreateProfile,
  sshDeleteProfile,
  sshListInstalledSkills,
  sshListBundledSkills,
  sshGetSkillContent,
  sshInstallSkill,
  sshUninstallSkill,
} from "./ssh-remote";

import {
  listSessions,
  searchSessions,
  getSessionMessages,
  deleteSession,
} from "./sessions";

import { readSoul, writeSoul, resetSoul } from "./soul";

import {
  listInstalledSkills,
  listBundledSkills,
  getSkillContent,
  installSkill,
  uninstallSkill,
} from "./skills";

import { getToolsets, setToolsetEnabled } from "./tools";

import {
  readMemory,
  addMemoryEntry,
  updateMemoryEntry,
  removeMemoryEntry,
  writeUserProfile,
} from "./memory";

import { listModels, addModel, removeModel, updateModel } from "./models";

import {
  listProfiles,
  createProfile,
  deleteProfile,
  setActiveProfile,
} from "./profiles";

import type { Attachment } from "../shared/attachments";

import {
  getClaw3dStatus,
  claw3dSetup,
  getClaw3dPort,
  setClaw3dPort,
  getClaw3dWsUrl,
  setClaw3dWsUrl,
  startClaw3dAll,
  stopClaw3dAll,
  getClaw3dLogs,
  type Claw3dSetupProgress,
} from "./claw3d";

import icon from "../../resources/icon.png?asset";

// Type assertion for the preload API
declare const HERMES_PRELOAD_API: HermesAPI;

// ─── Webview hardening ────────────────────────────────
// The Office screen embeds the external Claw3D app in a <webview> pointed at
// http://localhost:<port>. We only ever allow local HTTP origins and strip
// every privileged preference off the guest contents.

const LOCAL_WEBVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isAllowedWebviewUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string") return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (!LOCAL_WEBVIEW_HOSTS.has(url.hostname)) return false;
  const port = Number(url.port);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function hardenAttachedWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedWebviewUrl(url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAllowedWebviewUrl(url)) event.preventDefault();
  });
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Hermes Desktop Pro",
    icon,
    // ── Liquid glass: real macOS window vibrancy ──
    // The window itself is translucent; the desktop wallpaper shows through the
    // frosted panels. On Windows/Linux we keep a solid dark canvas instead.
    ...(isMac
      ? {
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
          backgroundColor: "#00000000",
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 14 },
        }
      : {
          backgroundColor: "#0E0E11",
        }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Office embeds the Claw3D app in a <webview>.
      webviewTag: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // Block untrusted webview attachments and strip privileged preferences off
  // the Claw3D guest contents before it loads.
  mainWindow.webContents.on(
    "will-attach-webview",
    (event, webPreferences, params) => {
      if (!isAllowedWebviewUrl(params.src)) {
        event.preventDefault();
        console.warn("[SECURITY] Blocked webview attachment for untrusted URL");
        return;
      }
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
    },
  );

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

// ─── IPC Handlers ─────────────────────────────────────

// Abort handle for the chat currently streaming to the renderer, or null when
// idle. Set after sendMessage() resolves its handle; cleared on done/error or
// when the renderer goes away mid-stream.
let currentChatAbort: (() => void) | null = null;

function registerIpcHandlers(): void {
  // Config
  ipcMain.handle("get-hermes-home", () => getHermesHome());

  ipcMain.handle("get-active-profile", () => getActiveProfileName());

  ipcMain.handle("read-env", (_event, profile?: string) => {
    const home = getHermesHome();
    const envPath =
      profile && profile !== "default"
        ? join(home, "profiles", profile, ".env")
        : join(home, ".env");
    try {
      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        const env: Record<string, string> = {};
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          env[trimmed.slice(0, eqIdx).trim()] = trimmed
            .slice(eqIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
        return env;
      }
    } catch {}
    return {};
  });

  ipcMain.handle(
    "get-config-value",
    (_event, key: string, profile?: string) => {
      const config = loadConfigYaml(profile);
      const parts = key.split(".");
      let current: any = config;
      for (const part of parts) {
        if (current && typeof current === "object") {
          current = current[part];
        } else {
          return undefined;
        }
      }
      return current;
    },
  );

  ipcMain.handle(
    "set-config-value",
    (_event, key: string, value: any, profile?: string) => {
      saveConfigYaml(key, value, profile);
      return true;
    },
  );

  // Model & provider
  ipcMain.handle(
    "get-model-config",
    (_event, profile?: string) => getModelConfig(profile),
  );

  ipcMain.handle(
    "set-model-config",
    (
      _event,
      model: string,
      provider: string,
      baseUrl: string,
      profile?: string,
    ) => {
      setModelConfig(model, provider, baseUrl, profile);
      return true;
    },
  );

  // Env vars
  ipcMain.handle(
    "get-env-value",
    (_event, key: string, profile?: string) => getEnvValue(key, profile),
  );

  ipcMain.handle(
    "set-env-value",
    (_event, key: string, value: string, profile?: string) => {
      setEnvValue(key, value, profile);
    },
  );

  // Profiles
  ipcMain.handle("list-profiles", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListProfiles(conn.ssh);
    return listProfiles();
  });
  ipcMain.handle("create-profile", (_event, name: string, clone: boolean) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshCreateProfile(conn.ssh, name, clone);
    return createProfile(name, clone);
  });
  ipcMain.handle("delete-profile", (_event, name: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshDeleteProfile(conn.ssh, name);
    return deleteProfile(name);
  });
  ipcMain.handle("set-active-profile", (_event, name: string) => {
    if (getConnectionConfig().mode !== "ssh") {
      setActiveProfile(name);
      // The desktop now follows this profile: chat/health resolve their URL
      // from the active profile's own port. Drop the cached health flag so the
      // next check probes the new gateway rather than the previous profile's.
      notifyProfileSwitched();
      // Bring the activated profile's own gateway up if it isn't already —
      // without stopping any other profile's gateway (their bots stay online).
      if (!isRemoteMode() && !isGatewayRunning(name)) {
        startGateway(name);
      }
    }
    return true;
  });

  // ── Soul (persona / SOUL.md) ──────────────────────────
  ipcMain.handle("read-soul", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshReadSoul(conn.ssh, profile);
    return readSoul(profile);
  });

  ipcMain.handle(
    "write-soul",
    (_event, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshWriteSoul(conn.ssh, content, profile);
      return writeSoul(content, profile);
    },
  );

  ipcMain.handle("reset-soul", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshResetSoul(conn.ssh, profile);
    return resetSoul(profile);
  });

  // ── Skills ────────────────────────────────────────────
  ipcMain.handle("list-installed-skills", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshListInstalledSkills(conn.ssh, profile);
    return listInstalledSkills(profile);
  });

  ipcMain.handle("list-bundled-skills", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListBundledSkills(conn.ssh);
    return listBundledSkills();
  });

  ipcMain.handle("get-skill-content", (_event, path: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshGetSkillContent(conn.ssh, path);
    return getSkillContent(path);
  });

  ipcMain.handle("install-skill", (_event, id: string, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshInstallSkill(conn.ssh, id);
    return installSkill(id, profile);
  });

  ipcMain.handle("uninstall-skill", (_event, name: string, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshUninstallSkill(conn.ssh, name);
    return uninstallSkill(name, profile);
  });

  // ── Tools (platform_toolsets.cli) ─────────────────────
  ipcMain.handle("get-toolsets", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshGetToolsets(conn.ssh, profile);
    return getToolsets(profile);
  });

  ipcMain.handle(
    "set-toolset-enabled",
    (_event, key: string, enabled: boolean, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshSetToolsetEnabled(conn.ssh, key, enabled, profile);
      return setToolsetEnabled(key, enabled, profile);
    },
  );

  // ── Memory (MEMORY.md entries + USER.md) ──────────────
  ipcMain.handle("read-memory", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshReadMemory(conn.ssh, profile);
    return readMemory(profile);
  });

  ipcMain.handle(
    "add-memory-entry",
    (_event, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshAddMemoryEntry(conn.ssh, content, profile);
      return addMemoryEntry(content, profile);
    },
  );

  ipcMain.handle(
    "update-memory-entry",
    (_event, index: number, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshUpdateMemoryEntry(conn.ssh, index, content, profile);
      return updateMemoryEntry(index, content, profile);
    },
  );

  ipcMain.handle(
    "remove-memory-entry",
    (_event, index: number, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshRemoveMemoryEntry(conn.ssh, index, profile);
      return removeMemoryEntry(index, profile);
    },
  );

  ipcMain.handle(
    "write-user-profile",
    (_event, content: string, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshWriteUserProfile(conn.ssh, content, profile);
      return writeUserProfile(content, profile);
    },
  );

  // ── Models (~/.hermes/models.json) ────────────────────
  ipcMain.handle("list-models", () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshListModels(conn.ssh);
    return listModels();
  });
  ipcMain.handle(
    "add-model",
    (
      _event,
      name: string,
      provider: string,
      model: string,
      baseUrl: string,
    ) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        return sshAddModel(conn.ssh, name, provider, model, baseUrl);
      }
      return addModel(name, provider, model, baseUrl);
    },
  );
  ipcMain.handle("remove-model", (_event, id: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) return sshRemoveModel(conn.ssh, id);
    return removeModel(id);
  });
  ipcMain.handle(
    "update-model",
    (_event, id: string, fields: Record<string, string>) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshUpdateModel(conn.ssh, id, fields);
      return updateModel(id, fields);
    },
  );

  // ── Sessions (state.db readonly + FTS) ────────────────
  ipcMain.handle("list-sessions", (_event, limit?: number, offset?: number) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshListSessions(conn.ssh, limit, offset);
    return listSessions(limit, offset);
  });

  ipcMain.handle("search-sessions", (_event, query: string, limit?: number) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshSearchSessions(conn.ssh, query, limit);
    return searchSessions(query, limit);
  });

  ipcMain.handle("get-session-messages", (_event, sessionId: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshGetSessionMessages(conn.ssh, sessionId);
    return getSessionMessages(sessionId);
  });

  // Deleting a session writes to the local state.db only (no SSH proxy —
  // matches reference semantics; remote/ssh modes simply no-op against the
  // local cache when the row isn't present).
  ipcMain.handle("delete-session", (_event, sessionId: string) => {
    return deleteSession(sessionId);
  });

  // ── Chat streaming ────────────────────────────────────
  ipcMain.handle(
    "send-message",
    async (
      event,
      message: string,
      options: {
        profile?: string;
        resumeSessionId?: string;
        history?: Array<{ role: string; content: string }>;
        attachments?: Attachment[];
        contextFolder?: string;
      } = {},
    ): Promise<{ response: string; sessionId?: string }> => {
      // Streaming sends to `event.sender` throw "Object has been destroyed" if
      // the renderer WebContents goes away mid-response (window closed,
      // reloaded, navigated). Guard every send; abort the in-flight chat the
      // first time a send fails — nobody is listening anymore.
      const safeSend = (channel: string, payload?: unknown): boolean => {
        if (event.sender.isDestroyed()) return false;
        try {
          event.sender.send(channel, payload);
          return true;
        } catch {
          return false;
        }
      };

      // Lazy-start the local gateway on first message (hermes.sendMessage does
      // not start it itself — it errors if unreachable).
      if (!isRemoteMode() && !isGatewayRunning(options.profile)) {
        startGateway(options.profile);
      }

      // SSH mode: ensure the tunnel is up and cache the remote API key so the
      // request authenticates. Never log the key.
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh.host) {
        await ensureSshTunnelIfNeeded();
        setSshRemoteApiKey(await sshReadRemoteApiKey(conn.ssh));
      }

      // Abort any previous in-flight chat before starting a new one.
      if (currentChatAbort) {
        currentChatAbort();
        currentChatAbort = null;
      }

      return await new Promise((resolve) => {
        let full = "";
        let sid: string | undefined;
        sendMessage(
          message,
          {
            onChunk: (t) => {
              full += t;
              if (!safeSend("stream-chunk", t) && currentChatAbort) {
                currentChatAbort();
              }
            },
            onReasoningChunk: (t) => {
              if (!safeSend("reasoning-chunk", t) && currentChatAbort) {
                currentChatAbort();
              }
            },
            onToolProgress: (tool) => safeSend("tool-progress", tool),
            onUsage: (u) => safeSend("stream-usage", u),
            onError: (e) => {
              currentChatAbort = null;
              safeSend("stream-error", e);
              resolve({ response: full, sessionId: sid });
            },
            onDone: (s) => {
              sid = s;
              currentChatAbort = null;
              safeSend("stream-done", s ?? "");
              resolve({ response: full, sessionId: sid });
            },
          },
          options.profile,
          options.resumeSessionId,
          options.history,
          options.attachments,
          options.contextFolder,
        )
          .then((handle) => {
            currentChatAbort = handle.abort;
          })
          .catch((err) => {
            currentChatAbort = null;
            safeSend("stream-error", String(err?.message ?? err));
            resolve({ response: full, sessionId: sid });
          });
      });
    },
  );

  ipcMain.on("chat-abort", () => {
    currentChatAbort?.();
    currentChatAbort = null;
  });

  // ── Connection config ─────────────────────────────────
  ipcMain.handle("get-connection-config", () => getPublicConnectionConfig());
  ipcMain.handle(
    "set-connection-config",
    (
      _e,
      input: {
        mode: "local" | "remote" | "ssh";
        remoteUrl?: string;
        apiKey?: string;
        ssh?: {
          host: string;
          port: number;
          username: string;
          keyPath: string;
          remotePort: number;
          localPort: number;
        };
      },
    ) => {
      setConnectionConfig(input);
      return getPublicConnectionConfig();
    },
  );

  ipcMain.handle(
    "test-connection",
    async (): Promise<{
      ok: boolean;
      mode: "local" | "remote" | "ssh";
      latencyMs: number;
      error?: string;
    }> => {
      const conn = getConnectionConfig();
      const started = Date.now();
      try {
        let ok = false;
        if (conn.mode === "ssh") {
          ok = await testSshConnection(conn.ssh);
        } else if (conn.mode === "remote") {
          ok = await testRemoteConnection(conn.remoteUrl, conn.apiKey);
        } else {
          ok = isApiReady() || isGatewayRunning();
        }
        return { ok, mode: conn.mode, latencyMs: Date.now() - started };
      } catch (err) {
        return {
          ok: false,
          mode: conn.mode,
          latencyMs: Date.now() - started,
          error: String((err as Error)?.message ?? err),
        };
      }
    },
  );

  // ── Gateway ───────────────────────────────────────────
  ipcMain.handle("gateway-status", () => ({
    running: isGatewayRunning(),
    ready: isApiReady(),
  }));
  ipcMain.handle("gateway-start", () => startGateway());
  ipcMain.handle("gateway-stop", () => {
    stopGateway();
    return true;
  });

  // ── SSH tunnel ────────────────────────────────────────
  ipcMain.handle("ssh-tunnel-active", () => isSshTunnelActive());
  ipcMain.handle("start-ssh-tunnel", async () => {
    await startSshTunnel(getConnectionConfig().ssh);
    return isSshTunnelActive();
  });
  ipcMain.handle("stop-ssh-tunnel", () => {
    stopSshTunnel();
    return true;
  });

  // Claw3D (local mode only) ───────────────────────────
  ipcMain.handle("claw3d-status", () => getClaw3dStatus());

  ipcMain.handle("claw3d-setup", async (event) => {
    try {
      await claw3dSetup((progress: Claw3dSetupProgress) => {
        event.sender.send("claw3d-setup-progress", progress);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("claw3d-get-port", () => getClaw3dPort());
  ipcMain.handle("claw3d-set-port", (_event, port: number) => {
    setClaw3dPort(port);
    return true;
  });
  ipcMain.handle("claw3d-get-ws-url", () => getClaw3dWsUrl());
  ipcMain.handle("claw3d-set-ws-url", (_event, url: string) => {
    setClaw3dWsUrl(url);
    return true;
  });

  ipcMain.handle("claw3d-start-all", (_event, profile?: string) =>
    startClaw3dAll(profile),
  );
  ipcMain.handle("claw3d-stop-all", () => {
    stopClaw3dAll();
    return true;
  });
  ipcMain.handle("claw3d-get-logs", () => getClaw3dLogs());

  // External links — open in the user's default browser.
  ipcMain.handle("open-external", (_event, url: string) => {
    // Only ever hand http(s) URLs to the OS — block file:, javascript:,
    // custom-scheme handlers, etc. (Electron shell.openExternal RCE vector).
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      return shell.openExternal(u.toString());
    } catch {
      /* reject malformed URLs */
    }
  });
}

// ─── App lifecycle ────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.hermes.desktop-pro");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Harden any webview guest contents the moment it's created (Office/Claw3D).
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() === "webview") {
      hardenAttachedWebContents(contents);
    }
  });

  // macOS app menu
  if (process.platform === "darwin") {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Hermes Desktop Pro",
        submenu: [
          { role: "about" as const },
          { type: "separator" as const },
          { role: "hide" as const },
          { role: "hideOthers" as const },
          { role: "unhide" as const },
          { type: "separator" as const },
          { role: "quit" as const },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  registerIpcHandlers();
  createWindow();

  // Auto-start the SSH tunnel on launch when SSH mode is configured, so the
  // first chat doesn't pay the tunnel-startup latency. Best effort: a failure
  // here is recoverable (the send-message handler re-ensures the tunnel).
  const c = getConnectionConfig();
  if (c.mode === "ssh" && c.ssh.host) {
    startSshTunnel(c.ssh).catch(() => {});
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopSshTunnel();
  stopGateway();
  stopClaw3dAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopSshTunnel();
  stopGateway();
  stopClaw3dAll();
});
