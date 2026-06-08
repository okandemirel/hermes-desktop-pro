export const COMPOSER_TEXTAREA_MAX_HEIGHT = 168;

export function syncComposerTextareaHeight(
  textarea: HTMLTextAreaElement,
  maxHeight = COMPOSER_TEXTAREA_MAX_HEIGHT,
): void {
  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}
