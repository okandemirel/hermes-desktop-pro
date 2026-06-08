import type { MenuItemConstructorOptions } from "electron";
import type { AppMenuCommand } from "@shared/types";

export function createDarwinApplicationMenuTemplate(
  appName: string,
  options: {
    sendCommand?: (command: AppMenuCommand) => void;
    checkForUpdates?: () => void;
    openExternal?: (url: string) => void;
    openHermesHome?: () => void;
  } = {},
): MenuItemConstructorOptions[] {
  const command = (value: AppMenuCommand) => (): void => {
    options.sendCommand?.(value);
  };

  const open = (url: string) => (): void => {
    options.openExternal?.(url);
  };

  return [
    {
      label: appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Check for Updates...",
          click: () => options.checkForUpdates?.(),
        },
        {
          label: "Settings...",
          accelerator: "CommandOrControl+,",
          click: command("show-settings"),
        },
        {
          label: "Appearance",
          submenu: [
            { label: "Dark", click: command("set-theme-dark") },
            { label: "Light", click: command("set-theme-light") },
            { label: "System", click: command("set-theme-system") },
            { type: "separator" },
            { label: "Gold Accent", click: command("set-accent-gold") },
            { label: "Green Accent", click: command("set-accent-green") },
            { label: "Blue Accent", click: command("set-accent-blue") },
            { label: "Purple Accent", click: command("set-accent-purple") },
          ],
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CommandOrControl+N",
          click: command("new-chat"),
        },
        {
          label: "Show Sessions",
          click: command("show-sessions"),
        },
        { type: "separator" },
        {
          label: "Open Hermes Home",
          click: () => options.openHermesHome?.(),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Navigate",
      submenu: [
        {
          label: "Chat",
          accelerator: "CommandOrControl+1",
          click: command("show-chat"),
        },
        {
          label: "Sessions",
          accelerator: "CommandOrControl+2",
          click: command("show-sessions"),
        },
        {
          label: "Tools",
          accelerator: "CommandOrControl+3",
          click: command("show-tools"),
        },
        { type: "separator" },
        { label: "Profiles", click: command("show-profiles") },
        { label: "Skills", click: command("show-skills") },
        { label: "Soul", click: command("show-soul") },
        { label: "Memory", click: command("show-memory") },
        { label: "Models", click: command("show-models") },
        { type: "separator" },
        { label: "Providers", click: command("show-providers") },
        { label: "Gateway", click: command("show-gateway") },
        { label: "Office", click: command("show-office") },
        { type: "separator" },
        { label: "Schedules", click: command("show-schedules") },
        { label: "Cron Jobs", click: command("show-cron-jobs") },
        { label: "Kanban", click: command("show-kanban") },
        { label: "Settings", click: command("show-settings") },
      ],
    },
    {
      label: "Settings",
      submenu: [
        { label: "General", click: command("show-settings-general") },
        { label: "Network", click: command("show-settings-network") },
        { label: "Providers", click: command("show-settings-providers") },
        { label: "Appearance", click: command("show-settings-appearance") },
        { label: "Backup", click: command("show-settings-backup") },
        { label: "Diagnostics", click: command("show-settings-diagnostics") },
        { type: "separator" },
        { label: "Cron Jobs", click: command("show-cron-jobs") },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CommandOrControl+B",
          click: command("toggle-sidebar"),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
        { type: "separator" },
        { role: "front" },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Hermes Desktop Pro on GitHub",
          click: open("https://github.com/okandemirel/hermes-desktop-pro"),
        },
        {
          label: "Releases",
          click: open("https://github.com/okandemirel/hermes-desktop-pro/releases"),
        },
        {
          label: "Release Setup Guide",
          click: open("https://github.com/okandemirel/hermes-desktop-pro/blob/main/docs/RELEASE.md"),
        },
        { type: "separator" },
        {
          label: "Diagnostics",
          click: command("show-settings-diagnostics"),
        },
      ],
    },
  ];
}
