import { describe, it, expect } from "vitest";
import {
  MAX_DEPTH,
  TOOLS,
  cleanCliOutput,
  validateProfileName,
  evaluateGuardrails,
} from "../../resources/mcp-bridge/lib.mjs";

describe("cleanCliOutput", () => {
  it("strips ANSI, box-drawing chrome, banner and session_id lines", () => {
    const raw = "[32m╭─ box\nsession_id: abc123\n⚕ Hermes\nHello there[0m\n";
    expect(cleanCliOutput(raw)).toBe("Hello there");
  });
  it("strips real ESC-prefixed ANSI sequences", () => {
    expect(cleanCliOutput("\x1b[32mHello\x1b[0m")).toBe("Hello");
  });
  it("returns empty string for empty input", () => {
    expect(cleanCliOutput("")).toBe("");
  });
});

describe("validateProfileName", () => {
  const known = ["default", "analyst"];
  it("accepts a known profile", () => expect(validateProfileName("analyst", known)).toBe(true));
  it("rejects unknown profiles", () => expect(validateProfileName("ghost", known)).toBe(false));
  it("rejects flag-like and path-like names", () => {
    expect(validateProfileName("-rf", known)).toBe(false);
    expect(validateProfileName("../etc", known)).toBe(false);
    expect(validateProfileName("a/b", known)).toBe(false);
  });
});

describe("evaluateGuardrails", () => {
  it("allows a first-hop call and increments depth + appends chain", () => {
    const g = evaluateGuardrails("analyst", {});
    expect(g.allowed).toBe(true);
    expect(g.childEnv.HERMES_ASK_DEPTH).toBe("1");
    expect(g.childEnv.HERMES_ASK_CHAIN).toBe("analyst");
  });
  it(`refuses at depth ${MAX_DEPTH}`, () => {
    const g = evaluateGuardrails("x", { HERMES_ASK_DEPTH: String(MAX_DEPTH) });
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/depth/);
  });
  it("refuses a cycle (target already in chain)", () => {
    const g = evaluateGuardrails("analyst", { HERMES_ASK_CHAIN: "analyst" });
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/cycle/);
  });
  it("appends to an existing chain", () => {
    const g = evaluateGuardrails("b", { HERMES_ASK_DEPTH: "1", HERMES_ASK_CHAIN: "a" });
    expect(g.allowed).toBe(true);
    expect(g.childEnv.HERMES_ASK_CHAIN).toBe("a,b");
  });
});

describe("TOOLS", () => {
  it("exposes exactly list_profiles and ask_profile", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["list_profiles", "ask_profile"]);
    const ask = TOOLS.find((t) => t.name === "ask_profile");
    expect(ask!.inputSchema.required).toEqual(["profile", "message"]);
  });
});
