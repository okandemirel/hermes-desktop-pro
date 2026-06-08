import { describe, expect, it } from "vitest";
import { syncComposerTextareaHeight } from "./composerAutosize";

function textareaWithScrollHeight(scrollHeight: number): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  Object.defineProperty(textarea, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  return textarea;
}

describe("composer autosize", () => {
  it("expands the textarea to fit short drafts", () => {
    const textarea = textareaWithScrollHeight(92);

    syncComposerTextareaHeight(textarea, 168);

    expect(textarea.style.height).toBe("92px");
    expect(textarea.style.overflowY).toBe("hidden");
  });

  it("caps long drafts and enables internal scrolling", () => {
    const textarea = textareaWithScrollHeight(260);

    syncComposerTextareaHeight(textarea, 168);

    expect(textarea.style.height).toBe("168px");
    expect(textarea.style.overflowY).toBe("auto");
  });
});
