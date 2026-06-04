import { useEffect, useState } from "react";
import { BookOpen, Pencil, RotateCcw, Check, X } from "lucide-react";
import { Screen, Button, Modal, cx } from "../../ui";

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

/* Parse the SOUL markdown into title + well-spaced ## sections for a calm reading column. */
function parseSoul(md: string) {
  const lines = md.split("\n");
  let title = "";
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      current = { heading: line.slice(3).trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return { title, sections };
}

/* Render the lightweight inline markdown we use (**bold**) + bullet/paragraph blocks
   as a calm, well-spaced reading document. */
function renderBody(body: string[]) {
  const text = body.join("\n").trim();
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);

  return (
    <div className="flex flex-col gap-3.5">
      {blocks.map((block, bi) => {
        const rows = block.split("\n").filter((r) => r.trim());
        const isList = rows.every((r) => r.trim().startsWith("- "));

        if (isList) {
          return (
            <ul key={bi} className="flex flex-col gap-2">
              {rows.map((r, ri) => (
                <li key={ri} className="flex gap-2.5 leading-[1.65]">
                  <span className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{renderInline(r.trim().slice(2))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="leading-[1.7]">
            {renderInline(block.replace(/\n/g, " "))}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-[var(--text)] font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function SoulEditor() {
  const [content, setContent] = useState(DEFAULT_SOUL);
  const [draft, setDraft] = useState(content);
  const [isEditing, setIsEditing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load the real SOUL.md from the backend on mount. A non-empty file becomes
  // the editor content; an empty/missing file keeps the local template above as
  // the starting point. If the read fails the editor stays usable on the
  // default — no crash, no mock state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await window.hermes.readSoul();
        if (active && s && s.trim()) {
          setContent(s);
          setDraft(s);
        }
      } catch {
        // keep the default template; editor remains usable
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { title, sections } = parseSoul(content);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const startEdit = () => {
    setDraft(content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    await window.hermes.writeSoul(draft);
    setContent(draft);
    setIsEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCancel = () => {
    setDraft(content);
    setIsEditing(false);
  };

  const handleReset = async () => {
    const def = await window.hermes.resetSoul();
    setContent(def);
    setDraft(def);
    setShowResetConfirm(false);
  };

  return (
    <Screen
      icon={<BookOpen size={19} />}
      kicker="Persona & Principles"
      title="Agent Soul"
      sub={
        <>
          Your agent&apos;s personality, tone, and behavior — defined in{" "}
          <code className="ui-kbd">SOUL.md</code>.
        </>
      }
      actions={
        !isEditing ? (
          <Button variant="secondary" leftIcon={<Pencil size={15} />} onClick={startEdit}>
            Edit
          </Button>
        ) : (
          <>
            <Button variant="ghost" leftIcon={<X size={15} />} onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              leftIcon={saved ? <Check size={15} /> : undefined}
              onClick={handleSave}
            >
              {saved ? "Saved" : "Save"}
            </Button>
          </>
        )
      }
    >
      {/* Comfortable reading / editing column */}
      <div className="mx-auto" style={{ maxWidth: 720 }}>
        {/* Quiet meta strip — source · length · last edited */}
        <div className="flex items-center gap-2.5 text-[11.5px] text-[var(--text-3)] mb-7">
          <code className="ui-kbd font-mono">SOUL.md</code>
          <span className="text-[var(--border-2)]">·</span>
          <span>
            <span className="font-mono text-[var(--text-2)]">{wordCount.toLocaleString()}</span> words
          </span>
          <span className="text-[var(--border-2)]">·</span>
          <span>Loaded fresh for every conversation</span>
        </div>

        {isEditing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="ui-textarea w-full min-h-[520px] !rounded-[14px] font-mono !text-[13.5px] !leading-[1.7] p-5 ui-card-active"
            placeholder="Write your agent's personality here…"
            spellCheck={false}
            autoFocus
          />
        ) : (
          <article className="fade-in">
            {title && (
              <h1 className="serif !text-[27px] !font-normal !mt-0 !mb-9 text-[var(--text)] leading-tight">
                {title}
              </h1>
            )}
            <div className="flex flex-col gap-9">
              {sections.map((sec, i) => (
                <section key={i}>
                  <h2 className="ui-section-label !text-[var(--accent-text)] !text-[11.5px] !mb-3.5 !mt-0">
                    {sec.heading}
                  </h2>
                  <div className="text-[14px] text-[var(--text-2)]">{renderBody(sec.body)}</div>
                </section>
              ))}
            </div>
          </article>
        )}

        {/* Reset — quiet, only while editing */}
        {isEditing && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className={cx(
              "flex items-center gap-1.5 mt-4 text-[12px] text-[var(--text-3)]",
              "hover:text-[var(--text-2)] transition-colors no-drag"
            )}
          >
            <RotateCcw size={13} />
            Reset to default personality
          </button>
        )}
      </div>

      {/* Reset confirmation */}
      <Modal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset to default personality?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" leftIcon={<RotateCcw size={13} />} onClick={handleReset}>
              Reset
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
          This immediately resets SOUL.md to the default and overwrites your saved persona. This
          cannot be undone.
        </p>
      </Modal>
    </Screen>
  );
}
