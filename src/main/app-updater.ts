import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import type { AppUpdateStatus } from "@shared/types";

const UPDATE_STATUS_CHANNEL = "app-update-status";
const GH_OWNER = "okandemirel";
const GH_REPO = "hermes-desktop-pro";
const RELEASES_URL = `https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest`;

let initialized = false;
let checkPromise: Promise<AppUpdateStatus> | null = null;
let status: AppUpdateStatus = createBaseStatus("idle");
let silentUpdateCheck = false;
let initialCheckTimer: NodeJS.Timeout | null = null;

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

// macOS auto-update (Squirrel.Mac) requires a signed + notarized build. These
// builds are unsigned (no Apple Developer certificate), so macOS cannot self-
// install — we surface a download link instead. Linux (AppImage) and Windows
// install through electron-updater normally.
function canSelfInstall(): boolean {
  return process.platform !== "darwin";
}

function configureUpdater(): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: GH_OWNER,
    repo: GH_REPO,
  });

  autoUpdater.on("checking-for-update", () => {
    if (silentUpdateCheck) return;
    publishStatus({
      phase: "checking",
      percent: undefined,
      downloadUrl: undefined,
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
      message: `Version ${info.version} is available.`,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    if (silentUpdateCheck) {
      status = createBaseStatus("idle");
      return;
    }
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
    if (silentUpdateCheck) {
      status = createBaseStatus("idle");
      return;
    }
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

export async function checkForAppUpdates(options: { silent?: boolean } = {}): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    return publishStatus(createBaseStatus("unsupported"));
  }

  configureUpdater();

  if (status.phase === "downloaded" || status.phase === "installing") {
    return status;
  }

  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    const previousSilentCheck = silentUpdateCheck;
    silentUpdateCheck = Boolean(options.silent);
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result?.isUpdateAvailable) return status;
      if (!canSelfInstall()) {
        // Unsigned macOS build: surface the update with a download link instead
        // of attempting a Squirrel install that will fail signature checks.
        const version = result.updateInfo?.version;
        return publishStatus({
          phase: "manual-download",
          availableVersion: version,
          downloadUrl: RELEASES_URL,
          percent: undefined,
          canCheck: true,
          canInstall: false,
          message: version
            ? `Version ${version} is available — click to download.`
            : "An update is available — click to download.",
        });
      }
      publishStatus({
        phase: "downloading",
        canCheck: false,
        canInstall: false,
        message: "Downloading update...",
      });
      await autoUpdater.downloadUpdate();
      return status;
    } catch (error) {
      if (options.silent) {
        status = createBaseStatus("idle");
        return status;
      }
      return publishStatus({
        phase: "error",
        canCheck: true,
        canInstall: false,
        message: messageFromError(error),
      });
    } finally {
      silentUpdateCheck = previousSilentCheck;
      checkPromise = null;
    }
  })();

  return checkPromise;
}

export function scheduleInitialAppUpdateCheck(delayMs = 7000): void {
  if (!app.isPackaged || initialCheckTimer) return;
  configureUpdater();
  initialCheckTimer = setTimeout(() => {
    initialCheckTimer = null;
    if (status.phase === "idle" || status.phase === "not-available") {
      void checkForAppUpdates({ silent: true });
    }
  }, delayMs);
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

export async function openAppUpdateDownload(): Promise<AppUpdateStatus> {
  const url = status.downloadUrl || RELEASES_URL;
  await shell.openExternal(url);
  return status;
}

export function registerAppUpdateIpc(): void {
  configureUpdater();
  ipcMain.handle("app-update-status", () => getAppUpdateStatus());
  ipcMain.handle("app-update-check", () => checkForAppUpdates());
  ipcMain.handle("app-update-install", () => installAppUpdate());
  ipcMain.handle("app-update-open-download", () => openAppUpdateDownload());
}
