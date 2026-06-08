import { describe, expect, it, vi } from "vitest";
import { transcribeOpenAIAudio } from "./voice";

describe("voice transcription", () => {
  it("posts recorded audio to OpenAI transcription endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ text: "Voice transcript" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const result = await transcribeOpenAIAudio({
      audio: new Uint8Array([1, 2, 3]),
      apiKey: "test-key",
      fetchImpl,
      mimeType: "audio/webm",
    });

    expect(result.text).toBe("Voice transcript");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: expect.any(FormData),
      }),
    );
  });

  it("fails clearly when no API key is configured", async () => {
    await expect(transcribeOpenAIAudio({
      audio: new Uint8Array([1]),
      apiKey: "",
      fetchImpl: vi.fn(),
      mimeType: "audio/webm",
    })).rejects.toThrow("Voice input is not configured");
  });

  it("routes transcription through the selected provider when provider credentials are present", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ text: "Provider transcript" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const result = await transcribeOpenAIAudio({
      audio: new Uint8Array([1, 2, 3]),
      apiKey: "opencode-key",
      baseUrl: "https://opencode.ai/zen/v1",
      fetchImpl,
      mimeType: "audio/webm",
    });

    expect(result.text).toBe("Provider transcript");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://opencode.ai/zen/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer opencode-key" }),
      }),
    );
  });
});
