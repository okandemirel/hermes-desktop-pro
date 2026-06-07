import type { Attachment, ChatMessage, ToolCall } from "@shared/types";

export type SessionHistoryItem =
  | {
      kind: "user";
      id: number;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    }
  | {
      kind: "assistant";
      id: number;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    }
  | {
      kind: "reasoning";
      id: number;
      assistantId: number;
      text: string;
      timestamp: number;
    }
  | {
      kind: "tool_call";
      id: number;
      assistantId: number;
      callId: string;
      name: string;
      args: string;
      timestamp: number;
    }
  | {
      kind: "tool_result";
      id: number;
      callId: string;
      name: string;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    };

function normalizeTimestamp(timestamp: number): number | undefined {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function messageId(sessionId: string, role: ChatMessage["role"], id: number): string {
  return `${sessionId}-${role}-${id}`;
}

export function sessionHistoryToChatMessages(
  sessionId: string,
  items: SessionHistoryItem[] = [],
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const assistantsByDbId = new Map<number, ChatMessage>();
  const toolCallsById = new Map<string, ToolCall>();

  const ensureAssistant = (assistantId: number, timestamp: number): ChatMessage => {
    const existing = assistantsByDbId.get(assistantId);
    if (existing) return existing;
    const created: ChatMessage = {
      id: messageId(sessionId, "assistant", assistantId),
      role: "assistant",
      content: "",
      timestamp: normalizeTimestamp(timestamp),
    };
    assistantsByDbId.set(assistantId, created);
    messages.push(created);
    return created;
  };

  for (const item of items) {
    if (item.kind === "user") {
      messages.push({
        id: messageId(sessionId, "user", item.id),
        role: "user",
        content: item.content,
        timestamp: normalizeTimestamp(item.timestamp),
        ...(item.attachments ? { attachments: item.attachments } : {}),
      });
      continue;
    }

    if (item.kind === "assistant") {
      const assistant = ensureAssistant(item.id, item.timestamp);
      assistant.content = item.content;
      assistant.timestamp = normalizeTimestamp(item.timestamp);
      if (item.attachments) assistant.attachments = item.attachments;
      continue;
    }

    if (item.kind === "reasoning") {
      const assistant = ensureAssistant(item.assistantId, item.timestamp);
      assistant.reasoning = assistant.reasoning
        ? `${assistant.reasoning}\n\n${item.text}`
        : item.text;
      continue;
    }

    if (item.kind === "tool_call") {
      const assistant = ensureAssistant(item.assistantId, item.timestamp);
      const toolCall: ToolCall = {
        callId: item.callId,
        name: item.name,
        args: item.args,
      };
      assistant.toolCalls = [...(assistant.toolCalls || []), toolCall];
      toolCallsById.set(item.callId, toolCall);
      continue;
    }

    const toolCall = toolCallsById.get(item.callId);
    if (toolCall) {
      toolCall.result = item.content;
      continue;
    }

    messages.push({
      id: messageId(sessionId, "tool", item.id),
      role: "tool",
      content: item.content,
      timestamp: normalizeTimestamp(item.timestamp),
      ...(item.attachments ? { attachments: item.attachments } : {}),
    });
  }

  return messages.filter((message) => (
    message.content ||
    message.reasoning ||
    (message.toolCalls && message.toolCalls.length > 0) ||
    (message.attachments && message.attachments.length > 0)
  ));
}
