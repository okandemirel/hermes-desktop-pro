import { useState, useMemo, useEffect, useCallback } from "react";
import { Brain, Trash2, Download, Sparkles, Check, Package, X } from "lucide-react";
import { Screen, Card, Button, IconButton, Badge, Tag, Field, Input, SearchInput, EmptyState, IconChip, Modal, cx, SectionLabel } from "../../ui";
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

function displaySkillDescription(description: string): string {
  const trimmed = description.trim();
  return /[A-Za-z0-9\u00C0-\u024F]/.test(trimmed) ? trimmed : "";
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
  const installedVisibleCount = installedCards.length + (heroVisible ? 1 : 0);
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
      className="ui-skills-console"
      icon={<Brain size={19} />}
      kicker="Agent Skills"
      title="Skills"
      sub={`Extend your agent with reusable skills and workflows — ${installedCount} of ${totalCount} installed.`}
      actions={<Badge variant="success"><Check size={11} /> {installedCount} active</Badge>}
    >
      <div className="ui-skills-shell">
        {error && (
          <Card pad className="ui-skills-error mint-in mint-in-1">
            <Badge variant="error">Error</Badge>
            <p>{error}</p>
            <IconButton onClick={() => setError("")} title="Dismiss" aria-label="Dismiss error">
              <X size={15} />
            </IconButton>
          </Card>
        )}

        <Card pad className="ui-skills-hero mint-in mint-in-1">
          <div className="ui-skills-hero-mark">
            <Sparkles size={26} />
          </div>
          <div className="ui-skills-hero-copy">
            <div className="ui-eyebrow">{heroSkill && heroVisible ? heroSkill.category || "Installed Skill" : "Skill Library"}</div>
            <h2>{heroSkill && heroVisible ? heroSkill.name : "Reusable workflows for Hermes"}</h2>
            <p>
              {heroSkill && heroVisible && displaySkillDescription(heroSkill.description)
                ? displaySkillDescription(heroSkill.description)
                : "Install, remove, and browse real skill entries from the Hermes skill registry without inventing mock metadata."}
            </p>
          </div>
          <div className="ui-skills-metrics">
            <div>
              <span>Installed</span>
              <strong>{installedCount}</strong>
            </div>
            <div>
              <span>Browse</span>
              <strong>{bundledCards.length}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{totalCount}</strong>
            </div>
          </div>
          {heroSkill && heroVisible && (
            <Badge variant="accent" className="ui-skills-hero-badge"><Check size={11} /> Installed</Badge>
          )}
        </Card>

        <div className="ui-skills-toolbar mint-in mint-in-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search skills by name, category, or description..."
            className="ui-skills-search"
          />
          <Button variant="primary" onClick={() => setInstallOpen(true)} leftIcon={<Download size={15} />}>
            Install Skill
          </Button>
        </div>

        {loading ? (
          <EmptyState
            icon={<Brain size={24} />}
            title="Loading skills..."
            sub="Reading installed and bundled skills."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Brain size={24} />}
            title="No skills found"
            sub={query ? "Try a different search term." : "Install your first skill above."}
          />
        ) : (
          <div className="ui-skills-content">
            {installedCards.length > 0 && (
              <Section
                title="Installed Skills"
                subtitle="Skills available to your agent"
                count={installedVisibleCount}
                skills={installedCards}
                actionName={actionName}
                onInstall={doInstall}
                onUninstall={doUninstall}
                className="ui-skills-section mint-in mint-in-3"
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
                className="ui-skills-section mint-in mint-in-4"
              />
            )}
          </div>
        )}
      </div>

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
        <div className="ui-modal-form">
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
          {error && <div className="ui-modal-alert whitespace-pre-wrap" role="alert">{error}</div>}
        </div>
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
      <div className="ui-skills-section-head">
        <SectionLabel>{title}</SectionLabel>
        <Badge variant="accent">{count}</Badge>
        <p>{subtitle}</p>
      </div>
      <div className="ui-skills-grid stagger">
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
  const description = displaySkillDescription(skill.description);
  return (
    <Card pad interactive className={cx("ui-skills-card", skill.installed && "ui-skills-card-installed")}>
      <div className="ui-skills-card-head">
        <IconChip className={cx(!skill.installed && "!bg-[var(--surface-3)] !text-[var(--text-3)] !border-[var(--border)]")}>
          {skill.installed ? <Sparkles size={18} /> : <Package size={18} />}
        </IconChip>
        <div className="ui-skills-card-copy">
          <h3>{skill.name}</h3>
          {skill.category && (
            <small>{skill.category}</small>
          )}
        </div>
        <div className="ui-skills-card-action">
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
      </div>

      {description && (
        <p className="ui-skills-description">{description}</p>
      )}

      {skill.category && (
        <div className="ui-skills-tags">
          <Tag>{skill.category}</Tag>
          {isBundled && <Tag>bundled</Tag>}
        </div>
      )}
    </Card>
  );
}
