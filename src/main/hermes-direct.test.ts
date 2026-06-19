import { describe, it, expect } from "vitest";
import { resolveDirectApiKey, isOpenAiCompatibleEndpoint } from "./hermes";

describe("resolveDirectApiKey", () => {
  it("prefers the provider's registry env key", () => {
    const env = {
      OPENROUTER_API_KEY: "or-key",
      OPENAI_API_KEY: "oai-key",
      CUSTOM_API_KEY: "custom-key",
    };
    expect(
      resolveDirectApiKey("https://openrouter.ai/api/v1", "openrouter", env),
    ).toBe("or-key");
  });

  it("falls back to the URL-derived env key when the provider is custom/auto", () => {
    const env = { OPENAI_API_KEY: "oai-key" };
    expect(
      resolveDirectApiKey("https://api.openai.com/v1", "custom", env),
    ).toBe("oai-key");
    expect(
      resolveDirectApiKey("https://api.openai.com/v1", "auto", env),
    ).toBe("oai-key");
  });

  it("falls back to CUSTOM_API_KEY then OPENAI_API_KEY for unknown hosts", () => {
    expect(
      resolveDirectApiKey("https://proxy.internal/v1", undefined, {
        CUSTOM_API_KEY: "c",
      }),
    ).toBe("c");
    expect(
      resolveDirectApiKey("https://proxy.internal/v1", undefined, {
        OPENAI_API_KEY: "o",
      }),
    ).toBe("o");
  });

  it("returns empty string when no key is present", () => {
    expect(resolveDirectApiKey("https://api.groq.com/openai/v1", "groq", {})).toBe(
      "",
    );
  });
});

describe("isOpenAiCompatibleEndpoint", () => {
  it("rejects Anthropic and Google (non-OpenAI protocols)", () => {
    expect(isOpenAiCompatibleEndpoint("https://api.anthropic.com/v1")).toBe(
      false,
    );
    expect(
      isOpenAiCompatibleEndpoint(
        "https://generativelanguage.googleapis.com/v1beta",
      ),
    ).toBe(false);
  });

  it("accepts OpenAI-compatible providers and local servers", () => {
    for (const url of [
      "https://openrouter.ai/api/v1",
      "https://api.openai.com/v1",
      "https://api.groq.com/openai/v1",
      "https://api.deepseek.com/v1",
      "http://localhost:1234/v1",
    ]) {
      expect(isOpenAiCompatibleEndpoint(url)).toBe(true);
    }
  });
});
