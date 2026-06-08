import { getEnvValue } from "./config";
import { providerApiKeyEnv, providerBaseUrl } from "../shared/providers";
import type { ProviderId } from "../shared/types";
import { CUSTOM_API_KEY_ENV, expectedEnvKeyForUrl } from "../shared/url-key-map";

export type VoiceTranscriptionResult = {
  text: string;
};

export type TranscribeOpenAIAudioOptions = {
  audio: ArrayBuffer | Uint8Array;
  apiKey: string | undefined;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  mimeType?: string;
  model?: string;
};

export type VoiceTranscriptionRequest = {
  profile?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
};

const OPENAI_TRANSCRIPTIONS_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

function extensionForMimeType(mimeType: string | undefined): string {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  return "webm";
}

function toUint8Array(audio: ArrayBuffer | Uint8Array): Uint8Array {
  return audio instanceof Uint8Array ? audio : new Uint8Array(audio);
}

export async function transcribeOpenAIAudio({
  audio,
  apiKey,
  baseUrl = OPENAI_TRANSCRIPTIONS_BASE_URL,
  fetchImpl = fetch,
  mimeType = "audio/webm",
  model = DEFAULT_TRANSCRIPTION_MODEL,
}: TranscribeOpenAIAudioOptions): Promise<VoiceTranscriptionResult> {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    throw new Error("Voice input is not configured. Set VOICE_TOOLS_OPENAI_KEY, OPENAI_API_KEY, or the selected provider API key.");
  }

  const bytes = toUint8Array(audio);
  if (bytes.byteLength === 0) {
    throw new Error("Voice input was empty. Please try recording again.");
  }

  const form = new FormData();
  const blobBytes = new Uint8Array(bytes);
  const blob = new Blob([blobBytes.buffer], { type: mimeType });
  const fileName = `hermes-voice.${extensionForMimeType(mimeType)}`;
  form.append("file", blob, fileName);
  form.append("model", model || DEFAULT_TRANSCRIPTION_MODEL);
  form.append("response_format", "json");

  const transcriptionsUrl = `${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const response = await fetchImpl(transcriptionsUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${trimmedKey}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Voice transcription failed (${response.status}).${detail ? ` ${detail}` : ""}`);
  }

  const payload = await response.json() as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) throw new Error("Voice transcription returned no text.");
  return { text };
}

function normalizeVoiceRequest(request?: string | VoiceTranscriptionRequest): VoiceTranscriptionRequest {
  if (!request) return {};
  if (typeof request === "string") return { profile: request };
  return request;
}

function readCredential(key: string, profile?: string): string {
  return (
    getEnvValue(key, profile) ||
    process.env[key] ||
    ""
  ).trim();
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function resolveVoiceCredential(
  request: VoiceTranscriptionRequest,
): { apiKey: string; baseUrl: string; model: string; expectedKeys: string[] } {
  const provider = request.provider?.trim() || "";
  const providerId = provider as ProviderId;
  const providerBase = provider ? providerBaseUrl(providerId) : "";
  const baseUrl = request.baseUrl?.trim() || providerBase || OPENAI_TRANSCRIPTIONS_BASE_URL;
  const providerKey = provider ? providerApiKeyEnv(providerId) : "";
  const urlKey = expectedEnvKeyForUrl(baseUrl);
  const expectedKeys = unique([
    "VOICE_TOOLS_OPENAI_KEY",
    "VOICE_OPENAI_API_KEY",
    providerKey,
    urlKey !== CUSTOM_API_KEY_ENV ? urlKey : undefined,
    CUSTOM_API_KEY_ENV,
    "OPENAI_API_KEY",
  ]);

  for (const key of expectedKeys) {
    const value = readCredential(key, request.profile);
    if (value) {
      return {
        apiKey: value,
        baseUrl: key === "VOICE_TOOLS_OPENAI_KEY" || key === "VOICE_OPENAI_API_KEY" || key === "OPENAI_API_KEY"
          ? OPENAI_TRANSCRIPTIONS_BASE_URL
          : baseUrl,
        model: request.model?.trim() || getEnvValue("VOICE_TRANSCRIBE_MODEL", request.profile) || DEFAULT_TRANSCRIPTION_MODEL,
        expectedKeys,
      };
    }
  }

  return {
    apiKey: "",
    baseUrl,
    model: request.model?.trim() || getEnvValue("VOICE_TRANSCRIBE_MODEL", request.profile) || DEFAULT_TRANSCRIPTION_MODEL,
    expectedKeys,
  };
}

export async function transcribeVoiceInput(
  audio: ArrayBuffer | Uint8Array,
  mimeType?: string,
  request?: string | VoiceTranscriptionRequest,
): Promise<VoiceTranscriptionResult> {
  const config = resolveVoiceCredential(normalizeVoiceRequest(request));
  if (!config.apiKey) {
    throw new Error(`Voice input is not configured. Set one of: ${config.expectedKeys.join(", ")}.`);
  }
  return transcribeOpenAIAudio({
    audio,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    mimeType,
    model: config.model,
  });
}
