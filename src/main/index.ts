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
  listProfiles,
  getActiveProfileName,
} from "./config";

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
  ipcMain.handle("list-profiles", () => listProfiles());

  // Chat streaming events (placeholder)
  ipcMain.on("chat-abort", () => {
    // handled by stream controller in future version
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
