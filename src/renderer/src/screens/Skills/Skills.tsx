import { useState, useMemo } from "react";
import { Brain, Trash2, Download, Sparkles, Check, Package } from "lucide-react";
import { Screen, Card, Button, IconButton, Badge, Tag, Field, Input, SearchInput, EmptyState, IconChip, Modal, cx } from "../../ui";

// ─── Types ──────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  author: string;
  isBundled: boolean;
  installed: boolean;
}

// ─── Mock data ──────────────────────────────────────────────

const MOCK_SKILLS: Skill[] = [
  { id: "hermes-agent", name: "Hermes Agent Config", description: "Configure Hermes Agent settings, profiles, and preferences", version: "1.0.0", tags: ["core", "config"], author: "Nous Research", isBundled: true, installed: true },
  { id: "code-interpreter", name: "Code Interpreter", description: "Execute Python, JavaScript, and shell code in a sandboxed environment", version: "2.1.3", tags: ["code", "sandbox", "python"], author: "Nous Research", isBundled: true, installed: true },
  { id: "file-browser", name: "File Browser", description: "Browse, read, write, and manage files on your system", version: "1.5.0", tags: ["files", "system", "io"], author: "Nous Research", isBundled: true, installed: true },
  { id: "web-search", name: "Web Search", description: "Search the web using multiple search engines and extract results", version: "3.0.1", tags: ["search", "web", "api"], author: "Community", isBundled: false, installed: true },
  { id: "git-assistant", name: "Git Assistant", description: "Intelligent Git operations with PR review and branch management", version: "1.2.0", tags: ["git", "vcs", "devops"], author: "Community", isBundled: false, installed: true },
  { id: "image-gen", name: "Image Generator", description: "Generate and edit images using DALL-E, Stable Diffusion, and Midjourney", version: "0.9.1", tags: ["image", "ai", "creative"], author: "Community", isBundled: false, installed: false },
  { id: "pdf-tools", name: "PDF Tools", description: "Extract text, merge, split, and analyze PDF documents", version: "2.0.0", tags: ["pdf", "documents", "parser"], author: "Community", isBundled: false, installed: false },
  { id: "database-explorer", name: "Database Explorer", description: "Connect to and query SQL and NoSQL databases with schema introspection", version: "1.8.2", tags: ["database", "sql", "nosql"], author: "Community", isBundled: false, installed: false },
];

// ─── Component ──────────────────────────────────────────────

export default function SkillsView() {
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<Skill[]>(MOCK_SKILLS);
  const [installId, setInstallId] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return skills;
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q)) ||
      s.author.toLowerCase().includes(q)
    );
  }, [query, skills]);

  // The house skill — promoted as the screen's single signature anchor.
  const houseSkill = skills.find(s => s.id === "hermes-agent");
  const houseVisible = filtered.some(s => s.id === "hermes-agent");

  const bundled = filtered.filter(s => s.isBundled && s.id !== "hermes-agent");
  const custom = filtered.filter(s => !s.isBundled);
  const installedCount = skills.filter(s => s.installed).length;

  const toggleInstall = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, installed: !s.installed } : s));
  };

  const handleInstall = () => {
    const name = installId.trim();
    if (!name) return;
    setInstalling(true);
    setTimeout(() => {
      const newSkill: Skill = {
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        description: "Custom installed skill",
        version: "0.1.0",
        tags: ["custom"],
        author: "Custom",
        isBundled: false,
        installed: true,
      };
      setSkills(prev => [...prev, newSkill]);
      setInstallId("");
      setInstalling(false);
      setInstallOpen(false);
    }, 800);
  };

  return (
    <Screen
      icon={<Brain size={19} />}
      kicker="Agent Skills"
      title="Skills"
      sub={`Extend your agent with reusable skills and workflows — ${installedCount} of ${skills.length} installed.`}
      actions={<Badge variant="success"><Check size={11} /> {installedCount} active</Badge>}
    >
      <hr className="ui-divider-gold mt-5 mb-7 mint-in mint-in-1" />

      {/* ── Signature: the house skill, struck as the focal hero ── */}
      {houseSkill && houseVisible && (
        <Card pad className="mb-8 mint-in mint-in-1 flex items-center gap-5">
          <span className="ui-stamp w-[58px] h-[58px] rounded-full text-[var(--accent-text)]">
            <Sparkles size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="ui-eyebrow">Core Skill</div>
            <h2 className="serif text-[var(--text)] leading-none" style={{ fontSize: "clamp(24px, 2.6vw, 31px)", letterSpacing: "-0.012em" }}>
              {houseSkill.name}
            </h2>
            <p className="text-[12.5px] text-[var(--text-2)] mt-2.5 max-w-xl">{houseSkill.description}</p>
          </div>
          <Badge variant="accent" className="self-start shrink-0"><Check size={11} /> Bundled</Badge>
        </Card>
      )}

      {/* ── Search + install, on one calm line ── */}
      <div className="flex flex-wrap items-center gap-3 mb-7 mint-in mint-in-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search skills by name, tag, or description…"
          className="flex-1 min-w-[240px] max-w-[440px]"
        />
        <Button variant="primary" onClick={() => setInstallOpen(true)} leftIcon={<Download size={15} />}>
          Install Skill
        </Button>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Brain size={24} />}
          title="No skills found"
          sub={query ? "Try a different search term." : "Install your first skill above."}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {bundled.length > 0 && (
            <Section
              title="Bundled Skills"
              subtitle="Core skills included with Hermes Agent"
              count={bundled.length}
              skills={bundled}
              onToggle={toggleInstall}
              className="mint-in mint-in-3"
            />
          )}

          {custom.length > 0 && (
            <Section
              title="Custom Skills"
              subtitle="Community and custom installed skills"
              count={custom.length}
              skills={custom}
              onToggle={toggleInstall}
              className="mint-in mint-in-4"
            />
          )}
        </div>
      )}

      {/* ── Install modal ── */}
      <Modal
        open={installOpen}
        onClose={() => { if (!installing) setInstallOpen(false); }}
        title="Install New Skill"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInstallOpen(false)} disabled={installing}>Cancel</Button>
            <Button variant="primary" onClick={handleInstall} disabled={!installId.trim() || installing} leftIcon={<Download size={15} />}>
              {installing ? "Installing…" : "Install"}
            </Button>
          </>
        }
      >
        <Field label="Skill name or URL" hint="Paste a registry name or a Git URL to install.">
          <Input
            autoFocus
            value={installId}
            onChange={e => setInstallId(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleInstall(); }}
            placeholder="e.g. web-scraper or https://…"
          />
        </Field>
      </Modal>
    </Screen>
  );
}

// ─── Section sub-component ──────────────────────────────────

function Section({
  title,
  subtitle,
  count,
  skills,
  onToggle,
  className,
}: {
  title: string;
  subtitle: string;
  count: number;
  skills: Skill[];
  onToggle: (id: string) => void;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline gap-3">
        <h2 className="serif text-[20px] leading-none text-[var(--text)]">{title}</h2>
        <Badge variant="accent">{count}</Badge>
        <p className="text-[12.5px] text-[var(--text-3)] truncate">{subtitle}</p>
      </div>
      <hr className="ui-divider-gold mt-3 mb-5" />
      <div className="ui-grid stagger">
        {skills.map(skill => (
          <SkillCard key={skill.id} skill={skill} onToggle={onToggle} />
        ))}
      </div>
    </section>
  );
}

// ─── Skill card sub-component ───────────────────────────────

function SkillCard({ skill, onToggle }: { skill: Skill; onToggle: (id: string) => void }) {
  return (
    <Card pad interactive active={skill.installed} className="flex flex-col gap-3.5">
      {/* Head */}
      <div className="flex items-start gap-3">
        <IconChip className={cx(!skill.installed && "!bg-[var(--surface-3)] !text-[var(--text-3)] !border-[var(--border)]")}>
          {skill.isBundled ? <Sparkles size={18} /> : <Package size={18} />}
        </IconChip>
        <div className="flex-1 min-w-0">
          <h3 className="serif text-[16px] leading-tight text-[var(--text)] truncate">{skill.name}</h3>
          <p className="text-[11.5px] text-[var(--text-3)]">
            {skill.author} <span className="font-mono text-[var(--text-3)]">· v{skill.version}</span>
          </p>
        </div>
        {skill.installed ? (
          <IconButton danger onClick={() => onToggle(skill.id)} title="Remove skill" aria-label="Remove skill">
            <Trash2 size={15} />
          </IconButton>
        ) : (
          <Button variant="primary" size="sm" onClick={() => onToggle(skill.id)} leftIcon={<Download size={13} />}>
            Install
          </Button>
        )}
      </div>

      {/* Description */}
      <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">{skill.description}</p>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
        {skill.tags.map(tag => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>
    </Card>
  );
}
