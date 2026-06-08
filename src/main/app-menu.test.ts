import { describe, expect, it } from "vitest";
import { createDarwinApplicationMenuTemplate } from "./app-menu";

describe("macOS application menu", () => {
  it("includes standard Edit roles so focused chat text fields keep native shortcuts", () => {
    const template = createDarwinApplicationMenuTemplate("Hermes Desktop Pro");
    const editMenu = template.find(item => item.label === "Edit");

    expect(editMenu).toBeTruthy();
    expect(editMenu?.submenu).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "undo" }),
      expect.objectContaining({ role: "redo" }),
      expect.objectContaining({ role: "cut" }),
      expect.objectContaining({ role: "copy" }),
      expect.objectContaining({ role: "paste" }),
      expect.objectContaining({ role: "selectAll" }),
    ]));
  });
});
