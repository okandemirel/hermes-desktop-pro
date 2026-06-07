import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getToolsets, setToolsetEnabled } from "./tools";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
}));

vi.mock("./utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils")>();
  return {
    ...actual,
    profileHome: () => mockState.hermesHome,
  };
});

describe("toolset config persistence", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-tools-test-"));
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  it("creates config.yaml when toggling from default toolset state", () => {
    expect(getToolsets().find((toolset) => toolset.key === "web")?.enabled).toBe(true);

    expect(setToolsetEnabled("web", false)).toBe(true);

    const content = readFileSync(join(mockState.hermesHome, "config.yaml"), "utf-8");
    expect(content).toContain("platform_toolsets:");
    expect(content).toContain("cli:");
    expect(content).not.toContain("- web");
    expect(getToolsets().find((toolset) => toolset.key === "web")?.enabled).toBe(false);
    expect(getToolsets().find((toolset) => toolset.key === "browser")?.enabled).toBe(true);
  });
});
