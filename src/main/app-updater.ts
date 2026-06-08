import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import type { AppUpdateStatus } from "@shared/types";

const UPDATE_STATUS_CHANNEL = "app-update-status";

let initialized = false;
let checkPromise: Promise<AppUpdateStatus> | null = null;
let status: AppUpdateStatus = createBaseStatus("idle");

function createBaseStatus(phase: AppUpdateStatus["phase"]): AppUpdateStatus {
  const canCheck = app.isPackaged;
  return {
    phase: canCheck ? phase : "unsupported",
    currentVersion: app.getVersion(),
    canCheck,
    canInstall: false,
    message: canCheck
      ? undefined
      : "Application updates are available from packaged builds only.",
  };
}

function publishStatus(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
  status = {
    ...status,
    ...patch,
    currentVersion: app.getVersion(),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(UPDATE_STATUS_CHANNEL, status);
    }
  }

  return status;
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Update check failed.";
}

function configureUpdater(): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "okandemirel",
    repo: "hermes-desktop-pro",
  });

  autoUpdater.on("checking-for-update", () => {
    publishStatus({
      phase: "checking",
      percent: undefined,
      canCheck: false,
      canInstall: false,
      message: "Checking for updates...",
    });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    publishStatus({
      phase: "available",
      availableVersion: info.version,
      canCheck: false,
      canInstall: false,
      message: `Version ${info.version} is available. Downloading...`,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    publishStatus({
      phase: "not-available",
      availableVersion: info.version,
      percent: undefined,
      canCheck: true,
      canInstall: false,
      message: "Hermes Desktop Pro is up to date.",
    });
  });

  autoUpdater.on("download-progress", (info: ProgressInfo) => {
    publishStatus({
      phase: "downloading",
      percent: Math.max(0, Math.min(100, info.percent || 0)),
      canCheck: false,
      canInstall: false,
      message: "Downloading update...",
    });
  });

  autoUpdater.on("update-downloaded", info => {
    publishStatus({
      phase: "downloaded",
      availableVersion: info.version,
      percent: 100,
      canCheck: true,
      canInstall: true,
      message: "Update is ready to install.",
    });
  });

  autoUpdater.on("error", error => {
    publishStatus({
      phase: "error",
      canCheck: true,
      canInstall: false,
      message: messageFromError(error),
    });
  });
}

export function getAppUpdateStatus(): AppUpdateStatus {
  if (!app.isPackaged) {
    status = createBaseStatus("unsupported");
  }
  return status;
}

export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    return publishStatus(createBaseStatus("unsupported"));
  }

  configureUpdater();

  if (status.phase === "downloaded" || status.phase === "installing") {
    return status;
  }

  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result?.isUpdateAvailable) return status;
      publishStatus({
        phase: "downloading",
        canCheck: false,
        canInstall: false,
        message: "Downloading update...",
      });
      await autoUpdater.downloadUpdate();
      return status;
    } catch (error) {
      return publishStatus({
        phase: "error",
        canCheck: true,
        canInstall: false,
        message: messageFromError(error),
      });
    } finally {
      checkPromise = null;
    }
  })();

  return checkPromise;
}

export async function installAppUpdate(): Promise<AppUpdateStatus> {
  if (status.phase !== "downloaded" || !status.canInstall) return status;
  publishStatus({
    phase: "installing",
    canCheck: false,
    canInstall: false,
    message: "Installing update and restarting...",
  });
  autoUpdater.quitAndInstall(false, true);
  return status;
}

export function registerAppUpdateIpc(): void {
  configureUpdater();
  ipcMain.handle("app-update-status", () => getAppUpdateStatus());
  ipcMain.handle("app-update-check", () => checkForAppUpdates());
  ipcMain.handle("app-update-install", () => installAppUpdate());
}
