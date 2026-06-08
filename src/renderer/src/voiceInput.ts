export type VoiceInputStatus = "idle" | "requesting" | "recording" | "transcribing";

export function mergeVoiceTranscript(current: string, transcript: string): string {
  const cleanTranscript = transcript.replace(/\s+/g, " ").trim();
  if (!cleanTranscript) return current;
  if (!current.trim()) return cleanTranscript;
  return /\s$/.test(current) ? `${current}${cleanTranscript}` : `${current} ${cleanTranscript}`;
}

export function voiceStatusLabel(status: VoiceInputStatus): string {
  if (status === "requesting") return "Requesting microphone";
  if (status === "recording") return "Stop recording";
  if (status === "transcribing") return "Transcribing voice";
  return "Voice input";
}

export function supportedVoiceMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find(type => MediaRecorder.isTypeSupported(type));
}

export function voiceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/permission|notallowed|denied/i.test(message)) return "Microphone permission is required for voice input.";
  if (/not configured/i.test(message)) return message;
  if (/api key/i.test(message)) return "Voice input needs a transcription API key.";
  if (/no text|empty/i.test(message)) return "No speech was detected. Please try again.";
  return "Voice input is not available right now.";
}
