import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
} from "electron";
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

import icon from "../../resources/icon.png?asset";

// Type assertion for the preload API
declare const HERMES_PRELOAD_API: HermesAPI;

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Hermes Desktop Pro",
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
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
}

// ─── App lifecycle ────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.hermes.desktop-pro");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
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
