import { describe, expect, it } from "vitest";
import { sessionHistoryToChatMessages, type SessionHistoryItem } from "./sessionHistory";

describe("sessionHistoryToChatMessages", () => {
  it("hydrates visible session history into chat messages", () => {
    const messages = sessionHistoryToChatMessages("session-1", [
      { kind: "user", id: 1, content: "Merhaba", timestamp: 1_714_000_000 },
      { kind: "assistant", id: 2, content: "Selam", timestamp: 1_714_000_001 },
    ]);

    expect(messages).toEqual([
      {
        id: "session-1-user-1",
        role: "user",
        content: "Merhaba",
        timestamp: 1_714_000_000_000,
      },
      {
        id: "session-1-assistant-2",
        role: "assistant",
        content: "Selam",
        timestamp: 1_714_000_001_000,
      },
    ]);
  });

  it("preserves reasoning and tool results on the assistant bubble", () => {
    const history: SessionHistoryItem[] = [
      { kind: "user", id: 1, content: "Ara", timestamp: 1_714_000_000 },
      { kind: "reasoning", id: 2, assistantId: 2, text: "Plan yapılıyor", timestamp: 1_714_000_001 },
      { kind: "assistant", id: 2, content: "Sonuç hazır", timestamp: 1_714_000_001 },
      { kind: "tool_call", id: 2, assistantId: 2, callId: "call-1", name: "search", args: "{\"q\":\"x\"}", timestamp: 1_714_000_001 },
      { kind: "tool_result", id: 3, callId: "call-1", name: "search", content: "bulundu", timestamp: 1_714_000_002 },
    ];

    const messages = sessionHistoryToChatMessages("session-2", history);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: "session-2-assistant-2",
      role: "assistant",
      content: "Sonuç hazır",
      reasoning: "Plan yapılıyor",
      toolCalls: [
        {
          callId: "call-1",
          name: "search",
          args: "{\"q\":\"x\"}",
          result: "bulundu",
        },
      ],
    });
  });
});
