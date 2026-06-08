import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
} from "electron";
import type { IpcMainInvokeEvent, Rectangle, WebContents } from "electron";
import type {
  AppMenuCommand,
  CronJobUpdateInput,
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchStreamEvent,
  ProfileDispatchTarget,
} from "@shared/types";
import { join } from "path";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import {
  loadConfigYaml,
  saveConfigYaml,
  getHermesHome,
  getModelConfig,
  setModelConfig,
  getEnvValue,
  setEnvValue,
  getPlatformEnabled,
  setPlatformEnabled,
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
  restartGateway,
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
import { transcribeVoiceInput } from "./voice";

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
  sshGetPlatformEnabled,
  sshSetPlatformEnabled,
  sshGatewayStatus,
  sshReadLogs,
} from "./ssh-remote";

import {
  readLogs,
  checkInstallStatus,
  isHermesInstalled,
  runInstall,
  getHermesVersion,
  runHermesDoctor,
  type InstallProgress,
} from "./installer";

import { discoverProviderModels } from "./model-discovery";

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

import {
  listCronJobs,
  createCronJob,
  removeCronJob,
  updateCronJob,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
} from "./cronjobs";

import {
  listBoards as kanbanListBoards,
  currentBoard as kanbanCurrentBoard,
  listTasks as kanbanListTasks,
  getTask as kanbanGetTask,
  createTask as kanbanCreateTask,
  assignTask as kanbanAssignTask,
  completeTask as kanbanCompleteTask,
  blockTask as kanbanBlockTask,
  unblockTask as kanbanUnblockTask,
  archiveTask as kanbanArchiveTask,
  commentTask as kanbanCommentTask,
  type CreateTaskInput,
} from "./kanban";

import { OfficeViewManager } from "./office-view";
import { createDarwinApplicationMenuTemplate } from "./app-menu";
import { recordDispatchSessionMetadata } from "./session-metadata";
import {
  checkForAppUpdates,
  registerAppUpdateIpc,
  scheduleInitialAppUpdateCheck,
} from "./app-updater";

import icon from "../../resources/icon.png?asset";

const APP_NAME = "Hermes Desktop Pro";
const APP_ID = "com.hermes.desktop-pro";

app.setName(APP_NAME);
process.title = APP_NAME;

let retainedMainWindow: BrowserWindow | null = null;
const officeViewManager = new OfficeViewManager();

function revealMainWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return;
  if (process.platform === "darwin") {
    app.setActivationPolicy("regular");
    app.dock?.show();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.center();
  mainWindow.moveTop();
  mainWindow.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: true,
    title: APP_NAME,
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
      webviewTag: false,
    },
  });
  retainedMainWindow = mainWindow;

  mainWindow.once("ready-to-show", () => revealMainWindow(mainWindow));
  mainWindow.webContents.once("did-finish-load", () => revealMainWindow(mainWindow));
  setTimeout(() => revealMainWindow(mainWindow), 1200);

  mainWindow.on("closed", () => {
    if (retainedMainWindow === mainWindow) retainedMainWindow = null;
    officeViewManager.destroy(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

function getMainCommandWindow(): BrowserWindow {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (retainedMainWindow && !retainedMainWindow.isDestroyed()) return retainedMainWindow;
  const existing = BrowserWindow.getAllWindows().find(window => !window.isDestroyed());
  if (existing) return existing;
  return createWindow();
}

function sendAppMenuCommand(command: AppMenuCommand): void {
  const target = getMainCommandWindow();
  revealMainWindow(target);

  const send = (): void => {
    if (!target.isDestroyed()) target.webContents.send("app-menu-command", command);
  };

  if (target.webContents.isLoading()) {
    target.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

function checkForUpdatesFromMenu(): void {
  const target = getMainCommandWindow();
  revealMainWindow(target);
  void checkForAppUpdates();
}

function openHermesHomeFromMenu(): void {
  void shell.openPath(getHermesHome());
}

// ─── IPC Handlers ─────────────────────────────────────

// Abort handle for the chat currently streaming to the renderer, or null when
// idle. Set after sendMessage() resolves its handle; cleared on done/error or
// when the renderer goes away mid-stream.
let currentChatAbort: (() => void) | null = null;

interface DispatchAbortHandle {
  dispatchId: string;
  profileName: string;
  sender: WebContents;
  abort: () => void;
}

const dispatchAborters = new Map<string, DispatchAbortHandle>();

// Guards the install-hermes IPC against concurrent runs (a double-click would
// otherwise double-spawn the install script).
let installInProgress = false;

function dispatchRunId(dispatchId: string, profileName: string): string {
  return `${dispatchId}-${profileName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function emitDispatch(sender: WebContents, payload: DispatchStreamEvent): boolean {
  if (sender.isDestroyed()) return false;
  try {
    sender.send("dispatch-event", payload);
    return true;
  } catch {
    return false;
  }
}

async function prepareChatTransport(profile?: string): Promise<void> {
  if (!isRemoteMode() && !isGatewayRunning(profile)) {
    startGateway(profile);
  }

  const conn = getConnectionConfig();
  if (conn.mode === "ssh" && conn.ssh.host) {
    await ensureSshTunnelIfNeeded();
    setSshRemoteApiKey(await sshReadRemoteApiKey(conn.ssh));
  }
}

async function runDispatchTarget(
  event: IpcMainInvokeEvent,
  dispatchId: string,
  runId: string,
  message: string,
  target: ProfileDispatchTarget,
  options: DispatchMessageOptions,
): Promise<string | undefined> {
  const profileName = target.profileName;
  const sender = event.sender;

  await prepareChatTransport(profileName);
  emitDispatch(sender, {
    dispatchId,
    runId,
    profileName,
    kind: "started",
    timestamp: Date.now(),
  });

  return await new Promise((resolve) => {
    let sessionId: string | undefined;
    sendMessage(
      message,
      {
        onChunk: text => emitDispatch(sender, {
          dispatchId,
          runId,
          profileName,
          kind: "chunk",
          text,
          timestamp: Date.now(),
        }),
        onReasoningChunk: text => emitDispatch(sender, {
          dispatchId,
          runId,
          profileName,
          kind: "reasoning",
          text,
          timestamp: Date.now(),
        }),
        onToolProgress: tool => emitDispatch(sender, {
          dispatchId,
          runId,
          profileName,
          kind: "tool",
          tool,
          timestamp: Date.now(),
        }),
        onUsage: usage => emitDispatch(sender, {
          dispatchId,
          runId,
          profileName,
          kind: "usage",
          usage,
          timestamp: Date.now(),
        }),
        onError: error => {
          dispatchAborters.delete(runId);
          emitDispatch(sender, {
            dispatchId,
            runId,
            profileName,
            kind: "error",
            error,
            timestamp: Date.now(),
          });
          resolve(sessionId);
        },
        onDone: sid => {
          sessionId = sid;
          dispatchAborters.delete(runId);
          emitDispatch(sender, {
            dispatchId,
            runId,
            profileName,
            kind: "done",
            sessionId: sid,
            timestamp: Date.now(),
          });
          resolve(sessionId);
        },
      },
      profileName,
      options.resumeSessionByProfile?.[profileName],
      options.history,
      options.attachments as Attachment[] | undefined,
      options.contextFolder,
      { temperature: options.temperature },
    )
      .then(handle => {
        dispatchAborters.set(runId, {
          dispatchId,
          profileName,
          sender,
          abort: handle.abort,
        });
      })
      .catch(err => {
        dispatchAborters.delete(runId);
        emitDispatch(sender, {
          dispatchId,
          runId,
          profileName,
          kind: "error",
          error: String(err?.message ?? err),
          timestamp: Date.now(),
        });
        resolve(sessionId);
      });
  });
}

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
    "read-logs",
    (_event, logFile?: string, lines?: number) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh)
        return sshReadLogs(conn.ssh, logFile, lines);
      return readLogs(logFile, lines);
    },
  );

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

  // Model discovery — fetch the provider's /models for autocomplete. Always a
  // network call from the desktop itself, so no SSH proxy (runs locally even
  // in remote/SSH connection modes).
  ipcMain.handle(
    "discover-provider-models",
    (
      _event,
      provider: string,
      baseUrl: string | undefined,
      apiKey: string | undefined,
      profile?: string,
    ) => {
      return discoverProviderModels(provider, baseUrl, apiKey, profile);
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
        temperature?: number;
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
          { temperature: options.temperature },
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

  ipcMain.handle(
    "dispatch-message",
    async (
      event,
      message: string,
      options: DispatchMessageOptions,
    ): Promise<DispatchMessageResult> => {
      const dispatchId = options.dispatchId || `dispatch-${Date.now()}-${randomUUID()}`;
      const seen = new Set<string>();
      const targets = (options.targets.length > 0 ? options.targets : [{ profileName: "default", isPrimary: true }])
        .filter(target => {
          const name = target.profileName.trim();
          if (!name || seen.has(name)) return false;
          seen.add(name);
          return true;
        })
        .map((target, index, all) => ({
          ...target,
          isPrimary: all.some(item => item.isPrimary) ? !!target.isPrimary : index === 0,
        }));
      const sessionIdsByProfile: Record<string, string | undefined> = {};

      const runOne = async (target: ProfileDispatchTarget): Promise<void> => {
        const runId = dispatchRunId(dispatchId, target.profileName);
        sessionIdsByProfile[target.profileName] = await runDispatchTarget(
          event,
          dispatchId,
          runId,
          message,
          target,
          options,
        );
      };

      const executeDispatch = async () => {
        for (const target of targets) {
          emitDispatch(event.sender, {
            dispatchId,
            runId: dispatchRunId(dispatchId, target.profileName),
            profileName: target.profileName,
            kind: "queued",
            timestamp: Date.now(),
          });
        }

        if (options.mode === "parallel") {
          await Promise.all(targets.map(runOne));
          return;
        }

        if (options.mode === "hybrid") {
          const primary = targets.find(target => target.isPrimary) || targets[0];
          const secondary = targets.filter(target => target.profileName !== primary.profileName);
          await runOne(primary);
          await Promise.all(secondary.map(runOne));
          return;
        }

        for (const target of targets) {
          await runOne(target);
        }
      };

      setImmediate(() => {
        void executeDispatch().finally(() => {
          try {
            recordDispatchSessionMetadata({
              dispatchId,
              mode: options.mode,
              targets,
              sessionIdsByProfile,
            });
          } catch {
            // Metadata powers desktop session badges only; dispatch itself is done.
          }
        });
      });
      return { dispatchId, sessionIdsByProfile };
    },
  );

  ipcMain.handle(
    "transcribe-voice-input",
    (
      _event,
      audio: ArrayBuffer | Uint8Array,
      mimeType?: string,
      request?: string | { profile?: string; provider?: string; baseUrl?: string; model?: string },
    ) => transcribeVoiceInput(audio, mimeType, request),
  );

  ipcMain.on("chat-abort", () => {
    currentChatAbort?.();
    currentChatAbort = null;
  });

  ipcMain.on("dispatch-abort", (_event, dispatchId?: string, runId?: string) => {
    const abortRun = (key: string, handle: DispatchAbortHandle) => {
      handle.abort();
      dispatchAborters.delete(key);
      emitDispatch(handle.sender, {
        dispatchId: handle.dispatchId,
        runId: key,
        profileName: handle.profileName,
        kind: "aborted",
        timestamp: Date.now(),
      });
    };

    if (runId) {
      const handle = dispatchAborters.get(runId);
      if (handle) abortRun(runId, handle);
      return;
    }

    for (const [key, handle] of Array.from(dispatchAborters.entries())) {
      if (!dispatchId || handle.dispatchId === dispatchId) {
        abortRun(key, handle);
      }
    }
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
  ipcMain.handle("gateway-status", async () => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) {
      const running = await sshGatewayStatus(conn.ssh);
      return { running, ready: running };
    }
    return { running: isGatewayRunning(), ready: isApiReady() };
  });
  ipcMain.handle("gateway-start", () => startGateway());
  ipcMain.handle("gateway-stop", () => {
    stopGateway();
    return true;
  });

  // Platform toggles (config.yaml platforms section)
  ipcMain.handle("get-platform-enabled", (_event, profile?: string) => {
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh)
      return sshGetPlatformEnabled(conn.ssh, profile);
    return getPlatformEnabled(profile);
  });
  ipcMain.handle(
    "set-platform-enabled",
    async (_event, platform: string, enabled: boolean, profile?: string) => {
      const conn = getConnectionConfig();
      if (conn.mode === "ssh" && conn.ssh) {
        await sshSetPlatformEnabled(conn.ssh, platform, enabled, profile);
        return true;
      }
      setPlatformEnabled(platform, enabled, profile);
      // Restart gateway so it picks up the new platform config
      if (isGatewayRunning(profile)) {
        restartGateway(profile);
      }
      return true;
    },
  );

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

  // Office 3D runtime (local mode only) ────────────────
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

  // Native Office view: a Hermes-owned local workspace surface.
  ipcMain.handle("office-view-show", (event, url: string, bounds: Rectangle) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) return { success: false, error: "Office window is not available." };
    return officeViewManager.show(owner, url, bounds);
  });
  ipcMain.handle("office-view-set-bounds", (event, bounds: Rectangle) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) return { success: false, error: "Office window is not available." };
    return officeViewManager.setBounds(owner, bounds);
  });
  ipcMain.handle("office-view-hide", () => {
    officeViewManager.hide();
    return { success: true };
  });
  ipcMain.handle("office-view-reload", () => {
    officeViewManager.reload();
    return { success: true };
  });

  // ── Install wizard (first-run, local mode) ──────────────
  ipcMain.handle("check-hermes-installed", () => checkInstallStatus());
  ipcMain.handle("get-hermes-version", () => getHermesVersion());
  ipcMain.handle("run-doctor", () => runHermesDoctor());

  ipcMain.handle("install-hermes", async (event) => {
    // Refuse concurrent installs — a second click would double-run the script.
    if (installInProgress) {
      return { success: false, error: "Install already in progress." };
    }
    if (isHermesInstalled()) {
      return { success: true };
    }
    installInProgress = true;
    const safeSend = (progress: InstallProgress): void => {
      if (event.sender.isDestroyed()) return;
      try {
        event.sender.send("install-progress", progress);
      } catch {
        /* renderer went away mid-install */
      }
    };
    try {
      await runInstall(safeSend);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    } finally {
      installInProgress = false;
    }
  });

  // ── Schedules / Cron (cron/jobs.json + hermes cron CLI / gateway API) ──
  // The cronjobs module branches internally between local file/CLI and the
  // remote gateway over the tunnel — these handlers stay thin (no mode branch).
  ipcMain.handle(
    "list-cron-jobs",
    (_event, includeDisabled?: boolean, profile?: string) =>
      listCronJobs(includeDisabled, profile),
  );
  ipcMain.handle(
    "create-cron-job",
    (
      _event,
      schedule: string,
      prompt?: string,
      name?: string,
      deliver?: string,
      profile?: string,
    ) => createCronJob(schedule, prompt, name, deliver, profile),
  );
  ipcMain.handle("remove-cron-job", (_event, jobId: string, profile?: string) =>
    removeCronJob(jobId, profile),
  );
  ipcMain.handle(
    "update-cron-job",
    (_event, jobId: string, input: CronJobUpdateInput, profile?: string) =>
      updateCronJob(jobId, input, profile),
  );
  ipcMain.handle("pause-cron-job", (_event, jobId: string, profile?: string) =>
    pauseCronJob(jobId, profile),
  );
  ipcMain.handle("resume-cron-job", (_event, jobId: string, profile?: string) =>
    resumeCronJob(jobId, profile),
  );
  ipcMain.handle(
    "trigger-cron-job",
    (_event, jobId: string, profile?: string) =>
      triggerCronJob(jobId, profile),
  );

  // ── Kanban (hermes kanban CLI / SSH tunnel / remote-only) ──
  // The kanban module owns the local/ssh/remote-only mode branch; these
  // handlers stay thin pass-throughs.
  ipcMain.handle("kanban-list-boards", (_event, profile?: string) =>
    kanbanListBoards(false, profile),
  );
  ipcMain.handle("kanban-current-board", (_event, profile?: string) =>
    kanbanCurrentBoard(profile),
  );
  ipcMain.handle(
    "kanban-list-tasks",
    (
      _event,
      filters?: {
        status?: string;
        assignee?: string;
        tenant?: string;
        includeArchived?: boolean;
        profile?: string;
      },
    ) => kanbanListTasks(filters ?? {}),
  );
  ipcMain.handle("kanban-get-task", (_event, id: string, profile?: string) =>
    kanbanGetTask(id, profile),
  );
  ipcMain.handle(
    "kanban-create-task",
    (_event, input: CreateTaskInput, profile?: string) =>
      kanbanCreateTask(input, profile),
  );
  ipcMain.handle(
    "kanban-assign-task",
    (_event, id: string, assignee: string | null, profile?: string) =>
      kanbanAssignTask(id, assignee, profile),
  );
  ipcMain.handle(
    "kanban-complete-task",
    (_event, id: string, result?: string, profile?: string) =>
      kanbanCompleteTask(id, result, profile),
  );
  ipcMain.handle(
    "kanban-block-task",
    (_event, id: string, reason?: string, profile?: string) =>
      kanbanBlockTask(id, reason, profile),
  );
  ipcMain.handle("kanban-unblock-task", (_event, id: string, profile?: string) =>
    kanbanUnblockTask(id, profile),
  );
  ipcMain.handle("kanban-archive-task", (_event, id: string, profile?: string) =>
    kanbanArchiveTask(id, profile),
  );
  ipcMain.handle(
    "kanban-comment-task",
    (_event, id: string, body: string, profile?: string) =>
      kanbanCommentTask(id, body, profile),
  );

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
  app.setName(APP_NAME);
  electronApp.setAppUserModelId(APP_ID);

  if (process.platform === "darwin") {
    app.dock?.setIcon(icon);
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      copyright: "Copyright Hermes Desktop Pro",
      iconPath: icon,
    });
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // macOS app menu
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        createDarwinApplicationMenuTemplate(APP_NAME, {
          sendCommand: sendAppMenuCommand,
          checkForUpdates: checkForUpdatesFromMenu,
          openExternal: url => {
            void shell.openExternal(url);
          },
          openHermesHome: openHermesHomeFromMenu,
        }),
      ),
    );
  }

  registerIpcHandlers();
  registerAppUpdateIpc();
  createWindow();
  scheduleInitialAppUpdateCheck();

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
