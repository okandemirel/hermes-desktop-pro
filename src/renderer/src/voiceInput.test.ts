import { describe, expect, it } from "vitest";
import { mergeVoiceTranscript, voiceErrorMessage, voiceStatusLabel } from "./voiceInput";

describe("voice input helpers", () => {
  it("adds a transcript to the existing composer draft without sending it", () => {
    expect(mergeVoiceTranscript("", "Draft this plan")).toBe("Draft this plan");
    expect(mergeVoiceTranscript("Summarize", "the report")).toBe("Summarize the report");
    expect(mergeVoiceTranscript("Summarize\n", "the report")).toBe("Summarize\nthe report");
  });

  it("uses explicit labels for each voice state", () => {
    expect(voiceStatusLabel("idle")).toBe("Voice input");
    expect(voiceStatusLabel("requesting")).toBe("Requesting microphone");
    expect(voiceStatusLabel("recording")).toBe("Stop recording");
    expect(voiceStatusLabel("transcribing")).toBe("Transcribing voice");
  });

  it("keeps the actionable provider key list in voice configuration errors", () => {
    expect(voiceErrorMessage(new Error(
      "Voice input is not configured. Set one of: OPENCODE_ZEN_API_KEY, OPENAI_API_KEY.",
    ))).toContain("OPENCODE_ZEN_API_KEY");
  });
});
