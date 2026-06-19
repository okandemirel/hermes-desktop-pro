import type { ChatMessage } from "@shared/types";

/**
 * Build the user/assistant history replayed to the backend for a send. Excludes
 * cross-profile-ask turns (viaProfile) so a one-shot ask to another profile
 * never leaks into a later turn's prompt context for the active profile.
 */
export function buildSendHistory(
  messages: ChatMessage[],
): Array<{ role: string; content: string }> {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && !m.viaProfile)
    .map((m) => ({ role: m.role, content: m.content }));
}
