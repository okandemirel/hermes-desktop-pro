import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { AppMenuCommand } from "@shared/types";
import { createDarwinApplicationMenuTemplate } from "./app-menu";

function submenu(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  return Array.isArray(item?.submenu) ? item.submenu : [];
}

function findItem(
  items: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (item.label === label) return item;
    const nested = findItem(submenu(item), label);
    if (nested) return nested;
  }
  return undefined;
}

function click(item: MenuItemConstructorOptions | undefined): void {
  item?.click?.({} as never, undefined as never, {} as never);
}

describe("macOS application menu", () => {
  it("includes standard Edit roles so focused chat text fields keep native shortcuts", () => {
    const template = createDarwinApplicationMenuTemplate("Hermes Desktop Pro");
    const editMenu = template.find(item => item.label === "Edit");

    expect(editMenu).toBeTruthy();
    expect(submenu(editMenu)).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "undo" }),
      expect.objectContaining({ role: "redo" }),
      expect.objectContaining({ role: "cut" }),
      expect.objectContaining({ role: "copy" }),
      expect.objectContaining({ role: "paste" }),
      expect.objectContaining({ role: "selectAll" }),
    ]));
  });

  it("adds working app, navigation, settings, view, window, and help menus", () => {
    const sent: AppMenuCommand[] = [];
    const template = createDarwinApplicationMenuTemplate("Hermes Desktop Pro", {
      sendCommand: command => sent.push(command),
    });

    expect(template.map(item => item.label ?? item.role)).toEqual([
      "Hermes Desktop Pro",
      "File",
      "Edit",
      "Navigate",
      "Settings",
      "View",
      "Window",
      "help",
    ]);

    click(findItem(template, "New Chat"));
    const settingsMenu = template.find(item => item.label === "Settings");
    click(findItem(submenu(settingsMenu), "Appearance"));
    click(findItem(template, "Cron Jobs"));
    click(findItem(template, "Toggle Sidebar"));

    expect(sent).toEqual([
      "new-chat",
      "show-settings-appearance",
      "show-cron-jobs",
      "toggle-sidebar",
    ]);
  });

  it("routes native app actions to update, external links, and Hermes home handlers", () => {
    const checkForUpdates = vi.fn();
    const openExternal = vi.fn();
    const openHermesHome = vi.fn();
    const template = createDarwinApplicationMenuTemplate("Hermes Desktop Pro", {
      checkForUpdates,
      openExternal,
      openHermesHome,
    });

    click(findItem(template, "Check for Updates..."));
    click(findItem(template, "Open Hermes Home"));
    click(findItem(template, "Releases"));

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(openHermesHome).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(
      "https://github.com/okandemirel/hermes-desktop-pro/releases",
    );
  });
});
