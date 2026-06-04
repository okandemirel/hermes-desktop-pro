import { useEffect, useMemo, useState } from "react";
import {
  Cpu, Plus, Trash2, Pencil, Check, Star, Zap, Eye, Wrench, Brain,
} from "lucide-react";
import type { SavedModel, ProviderId } from "@shared/types";
import { getAllProviders, getProvider } from "@shared/providers";
import {
  Screen, Card, Button, IconButton, IconChip, Badge, Tag,
  Field, Input, Select, Modal, EmptyState, SearchInput,
  Segment, SegmentItem, SectionLabel, StatusDot,
} from "../../ui";

// ─── Provider catalog (real backend providers) ──────────────
// The provider key is what the backend stores on each SavedModel; the label is
// display-only. Anything not in the registry (e.g. a hand-edited models.json)
// falls back to showing the raw key.
const ALL_PROVIDERS = getAllProviders();

function providerLabel(key: string): string {
  return getProvider(key as ProviderId)?.label ?? key;
}

// ─── Capabilities (display-only, derived from the provider registry) ─────────
// SavedModel has no capability data — the mock's per-model caps had no backend.
// We surface the provider's declared capabilities instead, so the badges are
// honest (they describe the provider, not a fabricated per-model spec).
type Capability = "Streaming" | "Vision" | "Tools" | "Reasoning";

const CAPABILITY_META: Record<Capability, { icon: typeof Zap }> = {
  Streaming: { icon: Zap },
  Vision: { icon: Eye },
  Tools: { icon: Wrench },
  Reasoning: { icon: Brain },
};

function capabilitiesFor(provider: string): Capability[] {
  const caps = getProvider(provider as ProviderId)?.capabilities;
  if (!caps) return [];
  const out: Capability[] = [];
  if (caps.streaming) out.push("Streaming");
  if (caps.vision) out.push("Vision");
  if (caps.toolUse) out.push("Tools");
  if (caps.reasoning) out.push("Reasoning");
  return out;
}

// Context window (display-only) — match the saved model id against the
// provider's known models; fall back to the provider's max context.
function contextFor(m: SavedModel): number | null {
  const p = getProvider(m.provider as ProviderId);
  if (!p) return null;
  const known = p.models.find((mm) => mm.id === m.model);
  if (known?.contextLength) return known.contextLength;
  return p.capabilities.maxContextTokens || null;
}

const fmtCtx = (n: number) =>
  n >= 1000000 ? `${n / 1000000}M` : `${Math.round(n / 1000)}K`;

// ─── Component ──────────────────────────────────────────────

export default function ModelsView() {
  const [models, setModels] = useState<SavedModel[]>([]);
  // Active model config = the real default (model.default / model.provider in
  // config.yaml). There is no "default" flag in models.json — the star writes
  // the active model config instead.
  const [active, setActive] = useState<{ model: string; provider: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState<string>(ALL_PROVIDERS[0]?.id ?? "openrouter");
  const [formModel, setFormModel] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");

  // Provider model-discovery autocomplete (optional, non-blocking). Offers the
  // provider's advertised model ids as a datalist; on any failure we silently
  // fall back to free text.
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverStatus, setDiscoverStatus] = useState<string | null>(null);

  // Load the real model library + active model config on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, cfg] = await Promise.all([
          window.hermes.listModels(),
          window.hermes.getModelConfig(),
        ]);
        if (!alive) return;
        setModels(list);
        setActive({ model: cfg.model, provider: cfg.provider });
      } catch {
        // honest empty state — no mock fallback
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Discover provider models whenever the form is open and the provider /
  // base URL changes. Debounced so typing a base URL doesn't fire per
  // keystroke. Best-effort: errors and non-"ok" statuses just leave the
  // datalist empty (free-text entry still works).
  useEffect(() => {
    if (!showForm) {
      setDiscoveredModels([]);
      setDiscoverStatus(null);
      setDiscoverLoading(false);
      return;
    }
    let cancelled = false;
    setDiscoverLoading(true);
    setDiscoverStatus(null);
    const handle = setTimeout(() => {
      window.hermes
        .discoverProviderModels(formProvider, formBaseUrl.trim() || undefined)
        .then((res: { models: string[]; status: string }) => {
          if (cancelled) return;
          setDiscoveredModels(res.status === "ok" ? res.models : []);
          setDiscoverStatus(res.status);
        })
        .catch(() => {
          if (cancelled) return;
          setDiscoveredModels([]);
          setDiscoverStatus(null);
        })
        .finally(() => {
          if (!cancelled) setDiscoverLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [showForm, formProvider, formBaseUrl]);

  const isDefault = (m: SavedModel) =>
    !!active && active.model === m.model && active.provider === m.provider;

  const resetForm = () => {
    setFormName("");
    setFormProvider(ALL_PROVIDERS[0]?.id ?? "openrouter");
    setFormModel("");
    setFormBaseUrl("");
    setEditingId(null);
  };

  const openAddForm = () => { resetForm(); setShowForm(true); };
  const openEditForm = (m: SavedModel) => {
    setFormName(m.name);
    setFormProvider(m.provider);
    setFormModel(m.model);
    setFormBaseUrl(m.baseUrl);
    setEditingId(m.id);
    setShowForm(true);
  };
  const closeForm = () => { resetForm(); setShowForm(false); };

  const canSave = !!formName.trim() && !!formModel.trim();

  const handleSave = async () => {
    if (!canSave) return;
    const name = formName.trim();
    const provider = formProvider;
    const model = formModel.trim();
    const baseUrl = formBaseUrl.trim();

    if (editingId) {
      const ok = await window.hermes.updateModel(editingId, {
        name, provider, model, baseUrl,
      });
      if (ok) {
        setModels((prev) =>
          prev.map((m) =>
            m.id === editingId ? { ...m, name, provider, model, baseUrl } : m,
          ),
        );
      }
    } else {
      const entry = await window.hermes.addModel(name, provider, model, baseUrl);
      setModels((prev) =>
        prev.some((m) => m.id === entry.id) ? prev : [...prev, entry],
      );
    }
    setShowForm(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const ok = await window.hermes.removeModel(id);
    if (ok) setModels((prev) => prev.filter((m) => m.id !== id));
    setDeleteConfirm(null);
    if (editingId === id) { resetForm(); setShowForm(false); }
  };

  // "Set as default" writes the active model config (model.default /
  // model.provider / model.base_url) — it does NOT flag models.json.
  const setDefault = async (m: SavedModel) => {
    const ok = await window.hermes.setModelConfig(m.model, m.provider, m.baseUrl);
    if (ok) setActive({ model: m.model, provider: m.provider });
  };

  // ── Derived data ──
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    models.forEach((m) => { counts[m.provider] = (counts[m.provider] || 0) + 1; });
    return counts;
  }, [models]);

  const usedProviders = useMemo(
    () => Object.keys(providerCounts).sort((a, b) =>
      providerLabel(a).localeCompare(providerLabel(b)),
    ),
    [providerCounts],
  );

  const filterTabs = useMemo(() => ["All", ...usedProviders], [usedProviders]);

  const filtered = useMemo(() => models.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch = !search.trim() ||
      m.name.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      providerLabel(m.provider).toLowerCase().includes(q);
    const matchesProvider = activeProvider === "All" || m.provider === activeProvider;
    return matchesSearch && matchesProvider;
  }), [models, search, activeProvider]);

  const defaultModel = useMemo(
    () => models.find((m) => isDefault(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [models, active],
  );

  // ── Card renderer ──
  const renderCard = (m: SavedModel) => {
    const def = isDefault(m);
    const caps = capabilitiesFor(m.provider);
    const ctx = contextFor(m);
    return (
      <Card key={m.id} pad interactive active={def} className="group flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <IconChip><Cpu size={17} /></IconChip>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-[var(--text)] truncate">{m.name}</span>
                {def && <Star size={13} className="shrink-0 text-[var(--accent-text)] fill-[var(--accent)]" />}
              </div>
              <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">{providerLabel(m.provider)}</div>
            </div>
          </div>
          <Badge variant={def ? "accent" : "neutral"}>
            {def ? <><StatusDot color="var(--accent)" /> Default</> : "Saved"}
          </Badge>
        </div>

        <code className="block text-[12px] font-mono text-[var(--text-2)] truncate">{m.model}</code>

        {caps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {caps.map((c) => {
              const CapIcon = CAPABILITY_META[c].icon;
              return (
                <Badge key={c} variant="neutral"><CapIcon size={11} /> {c}</Badge>
              );
            })}
          </div>
        )}

        {m.baseUrl && (
          <div className="text-[11.5px] text-[var(--text-3)] truncate">{m.baseUrl}</div>
        )}

        <div className="mt-auto pt-3.5 border-t border-[var(--border)] flex items-center justify-between gap-2">
          {ctx !== null ? (
            <Tag>ctx&nbsp;<span className="font-mono">{fmtCtx(ctx)}</span></Tag>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-0.5 shrink-0">
            {!def && (
              <IconButton onClick={() => setDefault(m)} title="Set as default"><Star size={15} /></IconButton>
            )}
            {def && (
              <span className="flex items-center justify-center w-[30px] h-[30px] text-[var(--accent-text)]" title="Current default"><Check size={15} /></span>
            )}
            <IconButton onClick={() => openEditForm(m)} title="Edit"><Pencil size={15} /></IconButton>
            <IconButton danger onClick={() => setDeleteConfirm(m.id)} title="Delete"><Trash2 size={15} /></IconButton>
          </div>
        </div>
      </Card>
    );
  };

  const defaultCtx = defaultModel ? contextFor(defaultModel) : null;

  return (
    <Screen
      icon={<Cpu size={19} />}
      kicker="Model Catalog"
      title="Models"
      sub="Manage your model library — these appear in the chat model selector."
      actions={<Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={openAddForm}>Add Model</Button>}
    >
      <hr className="ui-divider-gold mt-5 mb-7 mint-in mint-in-1" />

      {/* ── Signature: the current default model, struck as the focal hero ── */}
      {defaultModel && (
        <Card pad className="mb-8 mint-in mint-in-1 flex items-center gap-5">
          <span className="ui-stamp w-[58px] h-[58px] rounded-full text-[var(--accent-text)]">
            <Cpu size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="ui-eyebrow">Default Model</div>
            <h2 className="serif text-[var(--text)] leading-none" style={{ fontSize: "clamp(24px, 2.6vw, 31px)", letterSpacing: "-0.012em" }}>
              {defaultModel.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[12.5px]">
              <span className="text-[var(--text-2)]">{providerLabel(defaultModel.provider)}</span>
              <code className="font-mono text-[var(--text-3)]">{defaultModel.model}</code>
              {defaultCtx !== null && (
                <span className="text-[var(--text-3)]">Context <span className="font-mono text-[var(--text-2)]">{fmtCtx(defaultCtx)}</span></span>
              )}
            </div>
          </div>
          <Badge variant="accent" className="self-start shrink-0"><StatusDot color="var(--accent)" /> Active</Badge>
        </Card>
      )}

      {/* ── Search + provider filter ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 mint-in mint-in-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search models, IDs, providers…"
          className="flex-1 min-w-[240px] max-w-[400px]"
        />
        <Segment className="flex-wrap">
          {filterTabs.map((p) => (
            <SegmentItem key={p} active={p === activeProvider} onClick={() => setActiveProvider(p)}>
              {p === "All" ? "All" : providerLabel(p)}
              {p !== "All" && <span className="ml-0.5 text-[var(--text-3)] font-mono">{providerCounts[p]}</span>}
            </SegmentItem>
          ))}
        </Segment>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Cpu size={24} />}
          title={
            !loaded
              ? "Loading models…"
              : models.length === 0
                ? "No models configured"
                : "No models found"
          }
          sub={
            !loaded
              ? undefined
              : models.length === 0
                ? "Add your first model to get started."
                : `No models match "${search || providerLabel(activeProvider)}".`
          }
          action={loaded && models.length === 0 ? <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openAddForm}>Add Model</Button> : undefined}
        />
      ) : (
        <section className="mint-in mint-in-3">
          <div className="flex items-center gap-2 mb-3">
            <SectionLabel>{activeProvider === "All" ? "Catalog" : providerLabel(activeProvider)}</SectionLabel>
            <Badge variant="neutral">{filtered.length}</Badge>
          </div>
          <div className="ui-grid">
            {filtered.map(renderCard)}
          </div>
        </section>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Edit Model" : "New Model"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>Cancel</Button>
            <Button variant="primary" disabled={!canSave} onClick={handleSave}>Save Model</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Display Name">
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. My DeepSeek" />
          </Field>

          <Field label="Provider">
            <Select value={formProvider} onChange={(e) => setFormProvider(e.target.value)}>
              {ALL_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>

          <Field
            label="Model ID"
            hint={
              discoverLoading
                ? "Discovering available models…"
                : discoveredModels.length > 0
                  ? `${discoveredModels.length} model${discoveredModels.length === 1 ? "" : "s"} found — pick one or type your own`
                  : discoverStatus === "no-key"
                    ? "Set this provider's API key to autocomplete model IDs"
                    : undefined
            }
          >
            <Input
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
              placeholder="e.g. gpt-4o"
              className="font-mono"
              list="model-discovery-options"
            />
            <datalist id="model-discovery-options">
              {discoveredModels.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </Field>

          <Field label="Base URL">
            <Input value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} placeholder="Optional — for custom / local endpoints" className="font-mono" />
          </Field>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Model?"
        width={400}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-2)]">
          This removes the model from your library (~/.hermes/models.json). It will no
          longer appear in the chat model selector. This does not delete any provider
          API keys.
        </p>
      </Modal>
    </Screen>
  );
}
