import { describe, it, expect } from "vitest";
import { buildSendHistory } from "./chatHistory";
import type { ChatMessage } from "@shared/types";

const msg = (over: Partial<ChatMessage>): ChatMessage => ({ id: "x", role: "user", content: "c", ...over });

describe("buildSendHistory", () => {
  it("includes user and assistant turns", () => {
    expect(buildSendHistory([msg({ role: "user", content: "hi" }), msg({ role: "assistant", content: "yo" })]))
      .toEqual([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]);
  });
  it("excludes tool turns", () => {
    expect(buildSendHistory([msg({ role: "tool", content: "t" })])).toEqual([]);
  });
  it("excludes cross-profile (viaProfile) turns so they don't leak into later prompts", () => {
    expect(buildSendHistory([
      msg({ role: "user", content: "normal" }),
      msg({ role: "user", content: "asked analyst", viaProfile: "analyst" }),
      msg({ role: "assistant", content: "analyst reply", viaProfile: "analyst" }),
      msg({ role: "assistant", content: "normal reply" }),
    ])).toEqual([{ role: "user", content: "normal" }, { role: "assistant", content: "normal reply" }]);
  });
});
