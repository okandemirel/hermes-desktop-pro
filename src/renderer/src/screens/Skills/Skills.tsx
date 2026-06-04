import { useState, useMemo, useEffect, useCallback } from "react";
import { Brain, Trash2, Download, Sparkles, Check, Package, X } from "lucide-react";
import { Screen, Card, Button, IconButton, Badge, Tag, Field, Input, SearchInput, EmptyState, IconChip, Modal, cx } from "../../ui";
import type { InstalledSkill, SkillSearchResult } from "@shared/types";

// ─── View model ─────────────────────────────────────────────
//
// The backend gives two shapes — InstalledSkill{name,category,description,path}
// and SkillSearchResult{name,description,category,source,installed}. Neither
// carries the mock's version/tags/author, so those fields are dropped. We fold
// both lists into one card model keyed by name and surface `category` (the one
// real grouping field) where the mock used to show author/version/tags.

interface SkillCardModel {
  name: string;
  description: string;
  category: string;
  source: string; // "" for installed-only, "bundled" for browse entries
  installed: boolean;
  path?: string; // present for installed skills (for the detail/remove path)
}

// ─── Component ──────────────────────────────────────────────

export default function SkillsView() {
  const [query, setQuery] = useState("");
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [bundled, setBundled] = useState<SkillSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [installId, setInstallId] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [actionName, setActionName] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadInstalled = useCallback(async () => {
    const list = await window.hermes.listInstalledSkills();
    setInstalled(list);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [inst, bnd] = await Promise.all([
        window.hermes.listInstalledSkills(),
        window.hermes.listBundledSkills(),
      ]);
      setInstalled(inst);
      setBundled(bnd);
    } catch {
      // honest empty state on failure — no mock fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const installedNames = useMemo(
    () => new Set(installed.map((s) => s.name.toLowerCase())),
    [installed],
  );

  // Fold both backend lists into one keyed card collection. Installed skills
  // win on identity; bundled entries that are already installed are de-duped.
  const skills = useMemo<SkillCardModel[]>(() => {
    const out: SkillCardModel[] = installed.map((s) => ({
      name: s.name,
      description: s.description,
      category: s.category,
      source: "",
      installed: true,
      path: s.path,
    }));
    for (const b of bundled) {
      if (installedNames.has(b.name.toLowerCase())) continue;
      out.push({
        name: b.name,
        description: b.description,
        category: b.category,
        source: b.source || "bundled",
        installed: false,
      });
    }
    return out;
  }, [installed, bundled, installedNames]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return skills;
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }, [query, skills]);

  // The first installed skill is promoted as the screen's signature anchor —
  // a real entry, not a hardcoded one. Hidden when nothing is installed yet.
  const heroSkill = installed[0] ?? null;
  const heroVisible = heroSkill
    ? filtered.some(s => s.installed && s.name === heroSkill.name)
    : false;

  const bundledCards = filtered.filter(s => !s.installed);
  const installedCards = filtered.filter(
    s => s.installed && !(heroVisible && heroSkill && s.name === heroSkill.name),
  );
  const installedCount = installed.length;
  const totalCount = installed.length + bundled.filter(b => !installedNames.has(b.name.toLowerCase())).length;

  // Install by name/identifier — real async CLI: spinner, honest error, refresh.
  const doInstall = useCallback(async (identifier: string) => {
    setActionName(identifier);
    setError("");
    const result = await window.hermes.installSkill(identifier);
    setActionName(null);
    if (result.success) {
      await loadInstalled();
      return true;
    }
    setError(result.error || "Install failed.");
    return false;
  }, [loadInstalled]);

  const doUninstall = useCallback(async (name: string) => {
    setActionName(name);
    setError("");
    const result = await window.hermes.uninstallSkill(name);
    setActionName(null);
    if (result.success) {
      await loadInstalled();
    } else {
      setError(result.error || "Uninstall failed.");
    }
  }, [loadInstalled]);

  const handleInstallFromModal = async () => {
    const name = installId.trim();
    if (!name) return;
    setInstalling(true);
    const ok = await doInstall(name);
    setInstalling(false);
    if (ok) {
      setInstallId("");
      setInstallOpen(false);
    }
  };

  return (
    <Screen
      icon={<Brain size={19} />}
      kicker="Agent Skills"
      title="Skills"
      sub={`Extend your agent with reusable skills and workflows — ${installedCount} of ${totalCount} installed.`}
      actions={<Badge variant="success"><Check size={11} /> {installedCount} active</Badge>}
    >
      <hr className="ui-divider-gold mt-5 mb-7 mint-in mint-in-1" />

      {/* ── Honest error banner ── */}
      {error && (
        <Card pad className="mb-6 mint-in mint-in-1 flex items-start gap-3 !border-[var(--error)]/40">
          <Badge variant="error" className="shrink-0">Error</Badge>
          <p className="text-[12.5px] text-[var(--text-2)] whitespace-pre-wrap flex-1 min-w-0">{error}</p>
          <IconButton onClick={() => setError("")} title="Dismiss" aria-label="Dismiss error">
            <X size={15} />
          </IconButton>
        </Card>
      )}

      {/* ── Signature: first installed skill, struck as the focal hero ── */}
      {heroSkill && heroVisible && (
        <Card pad className="mb-8 mint-in mint-in-1 flex items-center gap-5">
          <span className="ui-stamp w-[58px] h-[58px] rounded-full text-[var(--accent-text)]">
            <Sparkles size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="ui-eyebrow">{heroSkill.category || "Installed Skill"}</div>
            <h2 className="serif text-[var(--text)] leading-none" style={{ fontSize: "clamp(24px, 2.6vw, 31px)", letterSpacing: "-0.012em" }}>
              {heroSkill.name}
            </h2>
            {heroSkill.description && (
              <p className="text-[12.5px] text-[var(--text-2)] mt-2.5 max-w-xl">{heroSkill.description}</p>
            )}
          </div>
          <Badge variant="accent" className="self-start shrink-0"><Check size={11} /> Installed</Badge>
        </Card>
      )}

      {/* ── Search + install, on one calm line ── */}
      <div className="flex flex-wrap items-center gap-3 mb-7 mint-in mint-in-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search skills by name, category, or description…"
          className="flex-1 min-w-[240px] max-w-[440px]"
        />
        <Button variant="primary" onClick={() => setInstallOpen(true)} leftIcon={<Download size={15} />}>
          Install Skill
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <EmptyState
          icon={<Brain size={24} />}
          title="Loading skills…"
          sub="Reading installed and bundled skills."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Brain size={24} />}
          title="No skills found"
          sub={query ? "Try a different search term." : "Install your first skill above."}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {installedCards.length > 0 && (
            <Section
              title="Installed Skills"
              subtitle="Skills available to your agent"
              count={installedCards.length}
              skills={installedCards}
              actionName={actionName}
              onInstall={doInstall}
              onUninstall={doUninstall}
              className="mint-in mint-in-3"
            />
          )}

          {bundledCards.length > 0 && (
            <Section
              title="Browse Skills"
              subtitle="Bundled skills you can install"
              count={bundledCards.length}
              skills={bundledCards}
              actionName={actionName}
              onInstall={doInstall}
              onUninstall={doUninstall}
              className="mint-in mint-in-4"
            />
          )}
        </div>
      )}

      {/* ── Install modal ── */}
      <Modal
        open={installOpen}
        onClose={() => { if (!installing) { setInstallOpen(false); setError(""); } }}
        title="Install New Skill"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setInstallOpen(false); setError(""); }} disabled={installing}>Cancel</Button>
            <Button variant="primary" onClick={handleInstallFromModal} disabled={!installId.trim() || installing} leftIcon={<Download size={15} />}>
              {installing ? "Installing…" : "Install"}
            </Button>
          </>
        }
      >
        <Field label="Skill name or identifier" hint="Enter a registry name to install via the hermes skills CLI.">
          <Input
            autoFocus
            value={installId}
            onChange={e => setInstallId(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleInstallFromModal(); }}
            placeholder="e.g. concept-diagrams"
            disabled={installing}
          />
        </Field>
        {error && (
          <p className="text-[12px] text-[var(--error)] mt-3 whitespace-pre-wrap">{error}</p>
        )}
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
  actionName,
  onInstall,
  onUninstall,
  className,
}: {
  title: string;
  subtitle: string;
  count: number;
  skills: SkillCardModel[];
  actionName: string | null;
  onInstall: (id: string) => void | Promise<unknown>;
  onUninstall: (name: string) => void | Promise<unknown>;
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
          <SkillCard
            key={`${skill.category}/${skill.name}`}
            skill={skill}
            busy={actionName === skill.name}
            onInstall={onInstall}
            onUninstall={onUninstall}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Skill card sub-component ───────────────────────────────

function SkillCard({
  skill,
  busy,
  onInstall,
  onUninstall,
}: {
  skill: SkillCardModel;
  busy: boolean;
  onInstall: (id: string) => void | Promise<unknown>;
  onUninstall: (name: string) => void | Promise<unknown>;
}) {
  const isBundled = skill.source === "bundled";
  return (
    <Card pad interactive active={skill.installed} className="flex flex-col gap-3.5">
      {/* Head */}
      <div className="flex items-start gap-3">
        <IconChip className={cx(!skill.installed && "!bg-[var(--surface-3)] !text-[var(--text-3)] !border-[var(--border)]")}>
          {skill.installed ? <Sparkles size={18} /> : <Package size={18} />}
        </IconChip>
        <div className="flex-1 min-w-0">
          <h3 className="serif text-[16px] leading-tight text-[var(--text)] truncate">{skill.name}</h3>
          {skill.category && (
            <p className="text-[11.5px] text-[var(--text-3)] truncate">{skill.category}</p>
          )}
        </div>
        {skill.installed ? (
          <IconButton danger disabled={busy} onClick={() => onUninstall(skill.name)} title="Remove skill" aria-label="Remove skill">
            <Trash2 size={15} />
          </IconButton>
        ) : (
          <Button variant="primary" size="sm" disabled={busy} onClick={() => onInstall(skill.name)} leftIcon={<Download size={13} />}>
            {busy ? "Installing…" : "Install"}
          </Button>
        )}
      </div>

      {/* Description */}
      {skill.description && (
        <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">{skill.description}</p>
      )}

      {/* Category tag */}
      {skill.category && (
        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
          <Tag>{skill.category}</Tag>
          {isBundled && <Tag>bundled</Tag>}
        </div>
      )}
    </Card>
  );
}
