import { describe, it, expect } from "vitest";
import { parseCrossProfileAsk, detectProfileMention } from "./crossProfileAsk";

const PROFILES = ["default", "appstore-analyst", "ChiefOperator"];

describe("parseCrossProfileAsk", () => {
  it("parses /ask <profile> <message>", () => {
    expect(parseCrossProfileAsk("/ask appstore-analyst summarize Q2", PROFILES)).toEqual({
      profile: "appstore-analyst",
      message: "summarize Q2",
    });
  });
  it("parses @profile <message>", () => {
    expect(parseCrossProfileAsk("@appstore-analyst hi there", PROFILES)).toEqual({
      profile: "appstore-analyst",
      message: "hi there",
    });
  });
  it("matches case-insensitively and returns the canonical name", () => {
    expect(parseCrossProfileAsk("/ask chiefoperator go", PROFILES)).toEqual({
      profile: "ChiefOperator",
      message: "go",
    });
  });
  it("returns null for an unknown profile", () => {
    expect(parseCrossProfileAsk("/ask nobody hello", PROFILES)).toBeNull();
  });
  it("returns null for plain text", () => {
    expect(parseCrossProfileAsk("just a normal message", PROFILES)).toBeNull();
  });
  it("returns null when there is no message after the profile", () => {
    expect(parseCrossProfileAsk("/ask appstore-analyst", PROFILES)).toBeNull();
    expect(parseCrossProfileAsk("@appstore-analyst   ", PROFILES)).toBeNull();
  });
});

describe("detectProfileMention", () => {
  it("detects an /ask mention in progress", () => {
    expect(detectProfileMention("/ask app")).toEqual({ mode: "ask", query: "app" });
    expect(detectProfileMention("/ask ")).toEqual({ mode: "ask", query: "" });
  });
  it("detects an @ mention in progress", () => {
    expect(detectProfileMention("@chief")).toEqual({ mode: "mention", query: "chief" });
    expect(detectProfileMention("@")).toEqual({ mode: "mention", query: "" });
  });
  it("returns null once a full ask is typed", () => {
    expect(detectProfileMention("/ask app hello")).toBeNull();
    expect(detectProfileMention("@app hello")).toBeNull();
  });
  it("returns null for normal input", () => {
    expect(detectProfileMention("hello world")).toBeNull();
  });
});
