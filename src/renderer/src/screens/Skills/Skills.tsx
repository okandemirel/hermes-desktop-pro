import { useState, useMemo } from "react";
import { Brain, Search, Trash2, Download, Sparkles, Check, Package } from "lucide-react";
import { Screen, Card, Button, Badge, Tag, SectionLabel, Input, EmptyState, IconChip, cx } from "../../ui";

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

  const bundled = filtered.filter(s => s.isBundled);
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
    }, 800);
  };

  return (
    <Screen
      icon={<Brain size={19} />}
      title="Skills"
      sub={`Extend your agent with reusable skills and workflows — ${installedCount} of ${skills.length} installed.`}
      actions={<Badge variant="success"><Check size={11} /> {installedCount} active</Badge>}
    >
      {/* Install + search toolbar */}
      <Card pad className="flex flex-col gap-3">
        <SectionLabel className="flex items-center gap-1.5">
          <Download size={12} /> Install New Skill
        </SectionLabel>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Input
            value={installId}
            onChange={e => setInstallId(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleInstall(); }}
            placeholder="Enter a skill name or URL to install…"
            className="flex-1"
          />
          <Button
            variant="primary"
            onClick={handleInstall}
            disabled={!installId.trim() || installing}
            leftIcon={<Download size={15} />}
          >
            {installing ? "Installing…" : "Install"}
          </Button>
        </div>
        <div className="ui-search">
          <Search size={16} className="shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search skills by name, tag, or description…"
          />
        </div>
      </Card>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Brain size={24} />}
            title="No skills found"
            sub={query ? "Try a different search term." : "Install your first skill above."}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8 mt-6 fade-in">
          {bundled.length > 0 && (
            <Section
              title="Bundled Skills"
              subtitle="Core skills included with Hermes Agent"
              icon={<Sparkles size={15} />}
              count={bundled.length}
              skills={bundled}
              onToggle={toggleInstall}
            />
          )}

          {custom.length > 0 && (
            <Section
              title="Custom Skills"
              subtitle="Community and custom installed skills"
              icon={<Package size={15} />}
              count={custom.length}
              skills={custom}
              onToggle={toggleInstall}
            />
          )}
        </div>
      )}
    </Screen>
  );
}

// ─── Section sub-component ──────────────────────────────────

function Section({
  title,
  subtitle,
  icon,
  count,
  skills,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  skills: Skill[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <IconChip>{icon}</IconChip>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-[var(--text)]">{title}</h2>
            <Badge variant="accent">{count}</Badge>
          </div>
          <p className="text-[12.5px] text-[var(--text-2)]">{subtitle}</p>
        </div>
      </div>
      <div className="ui-grid stagger">
        {skills.map(skill => (
          <SkillCard key={skill.id} skill={skill} onToggle={onToggle} />
        ))}
      </div>
    </div>
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
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{skill.name}</h3>
            <span className="text-[11px] font-mono shrink-0 text-[var(--text-3)]">v{skill.version}</span>
          </div>
          <p className="text-[11.5px] text-[var(--text-3)]">{skill.author}</p>
        </div>
        {skill.installed && (
          <Badge variant="success"><Check size={11} /> Installed</Badge>
        )}
      </div>

      {/* Description */}
      <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">{skill.description}</p>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {skill.tags.map(tag => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      {/* Action */}
      <div className="mt-auto pt-3.5 border-t border-[var(--border)]">
        <Button
          variant={skill.installed ? "danger" : "primary"}
          size="sm"
          className="w-full"
          onClick={() => onToggle(skill.id)}
          leftIcon={skill.installed ? <Trash2 size={14} /> : <Download size={14} />}
        >
          {skill.installed ? "Remove" : "Install"}
        </Button>
      </div>
    </Card>
  );
}
