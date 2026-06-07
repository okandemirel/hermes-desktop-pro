import { describe, expect, it } from "vitest";
import { clampOfficeBounds, isAllowedOfficeUrl } from "./office-view";

describe("isAllowedOfficeUrl", () => {
  it("allows local Office runtime URLs only", () => {
    expect(isAllowedOfficeUrl("http://127.0.0.1:3000/office")).toBe(true);
    expect(isAllowedOfficeUrl("http://localhost:4567/office")).toBe(true);
    expect(isAllowedOfficeUrl("http://[::1]:4567/office")).toBe(true);
    expect(isAllowedOfficeUrl("https://127.0.0.1:3000/office")).toBe(false);
    expect(isAllowedOfficeUrl("http://evil.example:3000/office")).toBe(false);
    expect(isAllowedOfficeUrl("http://127.0.0.1:80/office")).toBe(false);
    expect(isAllowedOfficeUrl("http://127.0.0.1:3000/settings")).toBe(false);
    expect(isAllowedOfficeUrl("http://127.0.0.1:3000/office-shell")).toBe(false);
  });
});

describe("clampOfficeBounds", () => {
  it("rejects unusable or invalid bounds", () => {
    expect(clampOfficeBounds({ width: 1280, height: 860 }, null)).toBeNull();
    expect(clampOfficeBounds({ width: 1280, height: 860 }, { x: 0, y: 0, width: 40, height: 80 })).toBeNull();
  });

  it("clamps bounds inside the BrowserWindow content area", () => {
    expect(clampOfficeBounds(
      { width: 1280, height: 860 },
      { x: 302, y: 108, width: 952, height: 728 },
    )).toEqual({ x: 302, y: 108, width: 952, height: 728 });

    expect(clampOfficeBounds(
      { width: 1280, height: 860 },
      { x: 1200, y: 800, width: 400, height: 400 },
    )).toBeNull();
  });
});
