import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTab, ProviderInfo } from "@shared/types";
import ChatView from "./ChatView";

const hookMocks = vi.hoisted(() => {
  const sendMessage = vi.fn();
  const abortStream = vi.fn();
  const abortDispatch = vi.fn();
  const useChatStream = vi.fn(() => ({
    messages: [],
    isStreaming: false,
    runState: null,
    dispatchRunState: null,
    sendMessage,
    abortStream,
    abortDispatch,
  }));

  return { useChatStream, sendMessage, abortStream, abortDispatch };
});

vi.mock("../hooks/useChatStream", () => ({
  useChatStream: hookMocks.useChatStream,
}));

const provider: ProviderInfo = {
  id: "openai",
  label: "OpenAI",
  capabilities: {
    streaming: true,
    reasoning: true,
    vision: true,
    toolUse: true,
    maxContextTokens: 128000,
  },
  models: [{ id: "gpt-4o", name: "GPT-4o" }],
};

const tab: ChatTab = {
  id: "tab-1",
  name: "New chat",
  providerId: "openai",
  modelId: "gpt-4o",
  messages: [],
};

function installHermesMock() {
  const hermes = {
    listProfiles: vi.fn().mockResolvedValue([]),
    getToolsets: vi.fn().mockResolvedValue([]),
    getConfigValue: vi.fn().mockResolvedValue(0.3),
    setToolsetEnabled: vi.fn().mockResolvedValue(true),
    setConfigValue: vi.fn().mockResolvedValue(true),
    selectAttachments: vi.fn().mockResolvedValue({
      attachments: [{
        id: "att-1",
        kind: "text-file",
        name: "notes.txt",
        mime: "text/plain",
        size: 12,
        text: "hello world",
      }],
      errors: [],
    }),
  };

  Object.defineProperty(window, "hermes", {
    value: hermes,
    configurable: true,
  });

  return hermes;
}

function renderChatView(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ChatView
        tab={tab}
        providers={[provider]}
        allTabs={[tab]}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
        onUpdateProvider={vi.fn()}
        onUpdateModel={vi.fn()}
      />,
    );
  });

  return { container, root };
}

describe("ChatView attachments", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    hookMocks.useChatStream.mockClear();
    hookMocks.sendMessage.mockClear();
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it("opens the attachment picker instead of writing the /attach command", async () => {
    const hermes = installHermesMock();
    ({ container, root } = renderChatView());

    const attachButton = container.querySelector<HTMLButtonElement>('button[title="Attach"]');
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(attachButton).not.toBeNull();
    expect(textarea).not.toBeNull();

    await act(async () => {
      attachButton?.click();
    });

    expect(hermes.selectAttachments).toHaveBeenCalledOnce();
    expect(textarea?.value).toBe("");
  });

  it("sends selected attachments with the next message", async () => {
    installHermesMock();
    ({ container, root } = renderChatView());

    const attachButton = container.querySelector<HTMLButtonElement>('button[title="Attach"]');
    await act(async () => {
      attachButton?.click();
    });

    expect(container.textContent).toContain("notes.txt");

    const sendButton = container.querySelector<HTMLButtonElement>('button[aria-label="Send"]');
    await act(async () => {
      sendButton?.click();
    });

    expect(hookMocks.sendMessage).toHaveBeenCalledWith("", {
      attachments: [expect.objectContaining({ id: "att-1", name: "notes.txt" })],
    });
  });
});
