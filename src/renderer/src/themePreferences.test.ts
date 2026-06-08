import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAppearancePreferences,
  readAppearancePreferences,
  resolveThemePreference,
} from "./themePreferences";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-pref");
  document.documentElement.removeAttribute("style");
  vi.unstubAllGlobals();
});

describe("appearance preferences", () => {
  it("applies and persists theme plus accent tokens", () => {
    applyAppearancePreferences({ theme: "light", accent: "#0A84FF" });

    expect(readAppearancePreferences()).toEqual({ theme: "light", accent: "#0A84FF" });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themePref).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#0A84FF");
    expect(document.documentElement.style.getPropertyValue("--accent-rgb")).toBe("10, 132, 255");
    expect(document.documentElement.style.getPropertyValue("--accent-weak")).toContain("10, 132, 255");
  });

  it("resolves system theme from media query when available", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    expect(resolveThemePreference("system")).toBe("light");
  });
});
