import { useEffect, useState } from "react";
import {
  BookOpen, Pencil, RotateCcw, Check, X, Brain, ShieldCheck,
  MessageSquare, Sparkles, FileText, Target,
} from "lucide-react";
import {
  Screen, Button, Modal, cx, Card, Badge, StatusDot, SectionLabel, IconChip,
} from "../../ui";

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

function stripMarkdownComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/* Parse the SOUL markdown into title + well-spaced ## sections for a calm reading column. */
function parseSoul(md: string) {
  const lines = md.split("\n");
  let title = "";
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  const loose: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      current = { heading: line.slice(3).trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      loose.push(line);
    }
  }
  if (sections.length === 0 && loose.length > 0) {
    sections.push({ heading: "Persona", body: loose });
  }
  return { title, sections };
}

/* Render the lightweight inline markdown we use (**bold**) + bullet/paragraph blocks
   as a calm, well-spaced reading document. */
function renderBody(body: string[]) {
  const text = stripMarkdownComments(body.join("\n"));
  if (!text) {
    return (
      <p className="ui-soul-muted">
        No written guidance yet. Use Edit to define tone, boundaries, and operating principles.
      </p>
    );
  }
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
  const visibleContent = stripMarkdownComments(content);
  const wordCount = visibleContent ? visibleContent.split(/\s+/).length : 0;
  const bulletCount = visibleContent.split("\n").filter((line) => line.trim().startsWith("- ")).length;
  const characterCount = visibleContent.length;
  const hasBoundaries = /boundar|privacy|harm|refuse|uncertain|fabricate/i.test(visibleContent);
  const primaryPrinciples = sections.slice(0, 4);

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
      <div className="ui-soul-shell">
        <Card className="ui-soul-hero">
          <div className="ui-soul-mark">
            <Brain size={30} />
            <span />
          </div>
          <div className="ui-soul-hero-copy">
            <div className="ui-eyebrow">Operational Persona</div>
            <h2>{title || "Hermes Agent Persona"}</h2>
            <p>
              The active behavior contract loaded into every conversation. Keep it concise,
              opinionated, and explicit enough for repeatable agent decisions.
            </p>
          </div>
          <div className="ui-soul-hero-metrics">
            <div>
              <span>Words</span>
              <strong>{wordCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Sections</span>
              <strong>{sections.length}</strong>
            </div>
            <div>
              <span>Guards</span>
              <strong>{hasBoundaries ? "On" : "Review"}</strong>
            </div>
          </div>
        </Card>

        <div className="ui-soul-layout">
          <aside className="ui-soul-rail">
            <Card pad className="ui-soul-status-card">
              <div className="ui-soul-status-head">
                <IconChip><FileText size={17} /></IconChip>
                <div>
                  <SectionLabel>Source</SectionLabel>
                  <strong>SOUL.md</strong>
                </div>
                <Badge variant="success" className="ml-auto">
                  <StatusDot color="var(--success)" pulse />
                  Live
                </Badge>
              </div>
              <div className="ui-soul-facts">
                <div><span>Characters</span><strong>{characterCount.toLocaleString()}</strong></div>
                <div><span>Bullets</span><strong>{bulletCount}</strong></div>
              </div>
              <p>Loaded fresh for every conversation and editable without changing provider or model setup.</p>
            </Card>

            <Card pad className="ui-soul-principles">
              <SectionLabel>Principle Map</SectionLabel>
              <div className="ui-soul-principle-list">
                {primaryPrinciples.map((sec, index) => (
                  <div key={sec.heading}>
                    <span>{index + 1}</span>
                    <strong>{sec.heading}</strong>
                  </div>
                ))}
                {primaryPrinciples.length === 0 && (
                  <div>
                    <span>1</span>
                    <strong>Add sections to define behavior</strong>
                  </div>
                )}
              </div>
            </Card>

            <Card pad className="ui-soul-guard-card">
              <div className="ui-soul-guard-row">
                <ShieldCheck size={17} />
                <span>Privacy and uncertainty boundaries</span>
                <StatusDot color={hasBoundaries ? "var(--success)" : "var(--warning)"} pulse={hasBoundaries} />
              </div>
              <div className="ui-soul-guard-row">
                <MessageSquare size={17} />
                <span>Conversation tone contract</span>
                <StatusDot color="var(--accent)" />
              </div>
              <div className="ui-soul-guard-row">
                <Target size={17} />
                <span>Task execution posture</span>
                <StatusDot color="var(--accent)" />
              </div>
            </Card>
          </aside>

          <main className="ui-soul-document">
            {isEditing ? (
              <div className="ui-soul-editor-card">
                <div className="ui-soul-editor-head">
                  <SectionLabel>Edit Contract</SectionLabel>
                  <Badge variant="accent">
                    <Sparkles size={13} />
                    Draft mode
                  </Badge>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="ui-soul-textarea"
                  placeholder="Write your agent's personality here..."
                  spellCheck={false}
                  autoFocus
                />
              </div>
            ) : (
              <article className="ui-soul-paper fade-in">
                <div className="ui-soul-paper-head">
                  <div>
                    <code className="ui-kbd font-mono">SOUL.md</code>
                    <span>Loaded fresh for every conversation</span>
                  </div>
                  <Badge variant={hasBoundaries ? "success" : "warning"}>
                    {hasBoundaries ? "Guarded" : "Needs guardrails"}
                  </Badge>
                </div>
                {title && <h1>{title}</h1>}
                <div className="ui-soul-section-stack">
                  {sections.map((sec, i) => (
                    <section key={i} className="ui-soul-section">
                      <h2>{sec.heading}</h2>
                      <div>{renderBody(sec.body)}</div>
                    </section>
                  ))}
                </div>
              </article>
            )}

            {isEditing && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className={cx("ui-soul-reset no-drag")}
              >
                <RotateCcw size={13} />
                Reset to default personality
              </button>
            )}
          </main>
        </div>
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
        <div className="ui-confirm-panel ui-confirm-danger">
          <span className="ui-confirm-icon"><RotateCcw size={18} /></span>
          <div className="ui-confirm-copy">
            <strong>Reset persona?</strong>
            <p>
              This immediately resets SOUL.md to the default and overwrites your saved persona. This cannot be undone.
            </p>
          </div>
        </div>
      </Modal>
    </Screen>
  );
}
