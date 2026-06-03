import { useState } from "react";
import { FileText, Eye, EyeOff, Pencil, Download, RotateCcw, AlertTriangle, BookOpen } from "../../components/Icons";

const DEFAULT_SOUL = `# Hermes Agent — SOUL.md

## Identity
You are **Hermes Agent**, a helpful, knowledgeable AI assistant. You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful.

## Personality
- **Tone**: Professional yet approachable, warm but concise
- **Style**: Direct answers with optional elaboration when helpful
- **Values**: Accuracy, clarity, user empowerment

## Capabilities
- Answer questions across diverse domains
- Write and debug code in multiple languages
- Execute system operations via tools
- Learn and adapt from conversation context

## Boundaries
- Never fabricate information — say "I don't know" when uncertain
- Respect user privacy and data
- Refuse harmful or unethical requests
`;

export default function SoulEditor() {
  const [content, setContent] = useState(DEFAULT_SOUL);
  const [isEditing, setIsEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const handleSave = () => {
    setSaved(true);
    setIsEditing(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setContent(DEFAULT_SOUL);
    setShowResetConfirm(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setPreviewMode(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="px-8 py-5 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}
          >
            <BookOpen size={17} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
              Agent Soul
            </h1>
            <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Define your agent&apos;s personality and behavior
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <Pencil size={13} /> Edit
            </button>
          ) : (
            <>
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
                style={{
                  background: previewMode ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                  color: previewMode ? "var(--accent)" : "var(--text-secondary)",
                  border: `1px solid ${previewMode ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {previewMode ? <Eye size={13} /> : <EyeOff size={13} />}
                {previewMode ? "Previewing" : "Preview"}
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                <RotateCcw size={13} /> Reset
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <Download size={13} /> {saved ? "Saved!" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reset confirmation toast */}
      {showResetConfirm && (
        <div
          className="mx-8 mt-4 rounded-xl p-4 flex items-center justify-between animate-fade-in"
          style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)" }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} style={{ color: "var(--error)" }} />
            <div>
              <p className="text-[12px] font-medium" style={{ color: "var(--error)" }}>
                Reset to default personality?
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                This will replace your current SOUL.md with the default version. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors"
              style={{ background: "var(--error)", color: "#fff" }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div
        className="mx-8 mt-4 rounded-xl p-4 flex items-start gap-3"
        style={{ background: "var(--accent-subtle)", border: "1px solid rgba(0, 63, 122, 0.2)" }}
      >
        <FileText size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <div>
          <p className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
            What is SOUL.md?
          </p>
          <p className="text-[11.5px] leading-relaxed mt-1" style={{ color: "var(--text-secondary)" }}>
            SOUL.md is the core personality file that defines how your Hermes Agent thinks, communicates, and behaves. It
            sets the agent&apos;s identity, tone, values, and boundaries — shaping every interaction. Changes take effect
            immediately after saving.
          </p>
        </div>
      </div>

      {/* Editor / Preview area */}
      <div className="flex-1 overflow-hidden mx-8 mt-4 mb-6">
        {previewMode ? (
          <div
            className="h-full overflow-y-auto rounded-xl p-6"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <div
              className="prose prose-invert max-w-none text-[13px] leading-relaxed whitespace-pre-wrap font-mono"
              style={{ color: "var(--text-primary)" }}
            >
              {content}
            </div>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={!isEditing}
            className="w-full h-full resize-none rounded-xl p-6 font-mono text-[13px] leading-relaxed outline-none transition-colors"
            style={{
              background: "var(--bg-secondary)",
              color: isEditing ? "var(--text-primary)" : "var(--text-secondary)",
              border: `1px solid ${isEditing ? "var(--accent)" : "var(--border)"}`,
              opacity: isEditing ? 1 : 0.7,
            }}
            placeholder="Write your agent's personality here..."
            spellCheck={false}
          />
        )}
      </div>

      {/* Footer stats */}
      <div
        className="px-8 py-3 flex items-center gap-5 flex-shrink-0"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="font-mono font-medium" style={{ color: "var(--text-secondary)" }}>
            {charCount.toLocaleString()}
          </span>{" "}
          characters
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="font-mono font-medium" style={{ color: "var(--text-secondary)" }}>
            {wordCount.toLocaleString()}
          </span>{" "}
          words
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="font-mono font-medium" style={{ color: "var(--text-secondary)" }}>
            {content.split("\n").length.toLocaleString()}
          </span>{" "}
          lines
        </span>
        <div className="flex-1" />
        <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          {isEditing ? "Editing" : "Read-only"} · SOUL.md
        </span>
      </div>
    </div>
  );
}
