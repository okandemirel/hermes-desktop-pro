import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Cpu, Plus, Trash2, Pencil, Check, Star, Zap, Eye, Wrench, Brain, Copy,
} from "lucide-react";
import type { SavedModel, ProviderId } from "@shared/types";
import { getAllProviders, getProvider } from "@shared/providers";
import {
  Screen, Card, Button, IconButton, IconChip, Badge, Tag,
  Field, Input, Select, Modal, EmptyState, SearchInput,
  Segment, SegmentItem, SectionLabel, StatusDot, getFloatingRect,
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

const MODEL_LOAD_TIMEOUT_MS = 2500;
const MODEL_DISCOVERY_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const handle = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(handle));
  });
}

// ─── Component ──────────────────────────────────────────────

export default function ModelsView() {
  const [models, setModels] = useState<SavedModel[]>([]);
  // Active model config = the real default (model.default / model.provider in
  // config.yaml). There is no "default" flag in models.json — the star writes
  // the active model config instead.
  const [active, setActive] = useState<{ model: string; provider: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState<string>(ALL_PROVIDERS[0]?.id ?? "openrouter");
  const [formModel, setFormModel] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [modelSuggestionsOpen, setModelSuggestionsOpen] = useState(false);
  const [activeModelSuggestionIndex, setActiveModelSuggestionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const modelSuggestionListId = useId();
  const nameInputId = useId();
  const providerSelectId = useId();
  const modelInputId = useId();
  const baseUrlInputId = useId();
  const modelDiscoveryRef = useRef<HTMLDivElement>(null);
  const modelSuggestionMenuRef = useRef<HTMLDivElement>(null);
  const [modelSuggestionRect, setModelSuggestionRect] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    placement: "top" | "bottom";
  } | null>(null);

  // Provider model-discovery autocomplete (optional, non-blocking). Offers the
  // provider's advertised model ids as a datalist; on any failure we silently
  // fall back to free text.
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverStatus, setDiscoverStatus] = useState<string | null>(null);

  const loadModelLibrary = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    setLoadError(null);

    try {
      if (!window.hermes?.listModels || !window.hermes?.getModelConfig) {
        throw new Error("Hermes desktop bridge is not available");
      }

      const [list, cfg] = await withTimeout(
        Promise.all([
          window.hermes.listModels(),
          window.hermes.getModelConfig(),
        ]),
        MODEL_LOAD_TIMEOUT_MS,
        "Model library",
      );

      setModels(Array.isArray(list) ? list : []);
      setActive({ model: cfg.model, provider: cfg.provider });
    } catch (error) {
      setModels([]);
      setActive(null);
      setLoadError(error instanceof Error ? error.message : "Model library could not be loaded");
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, []);

  // Load the real model library + active model config on mount.
  useEffect(() => {
    void loadModelLibrary();
  }, [loadModelLibrary]);

  // Discover provider models whenever the form is open and the provider /
  // base URL changes. Debounced so typing a base URL doesn't fire per
  // keystroke. Best-effort: errors and non-"ok" statuses just leave the
  // datalist empty (free-text entry still works).
  useEffect(() => {
    if (!showForm) {
      setDiscoveredModels([]);
      setDiscoverStatus(null);
      setDiscoverLoading(false);
      setModelSuggestionsOpen(false);
      return;
    }
    let cancelled = false;
    const requestProvider = formProvider;
    const requestBaseUrl = formBaseUrl.trim();
    setDiscoveredModels([]);
    setDiscoverLoading(true);
    setDiscoverStatus(null);
    setActiveModelSuggestionIndex(0);
    const handle = setTimeout(() => {
      if (!window.hermes?.discoverProviderModels) {
        setDiscoveredModels([]);
        setDiscoverStatus("unsupported");
        setDiscoverLoading(false);
        return;
      }
      withTimeout<{ models: string[]; status: string }>(
        window.hermes.discoverProviderModels(requestProvider, requestBaseUrl || undefined),
        MODEL_DISCOVERY_TIMEOUT_MS,
        "Model discovery",
      )
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

  useEffect(() => {
    if (!showForm || !modelSuggestionsOpen) return undefined;
    const updatePosition = () => {
      if (!modelDiscoveryRef.current) return;
      setModelSuggestionRect(getFloatingRect(modelDiscoveryRef.current));
    };
    updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (modelDiscoveryRef.current?.contains(target) || modelSuggestionMenuRef.current?.contains(target)) return;
      setModelSuggestionsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setModelSuggestionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [modelSuggestionsOpen, showForm]);

  const isDefault = (m: SavedModel) =>
    !!active && active.model === m.model && active.provider === m.provider;

  const resetForm = () => {
    setFormName("");
    setFormProvider(ALL_PROVIDERS[0]?.id ?? "openrouter");
    setFormModel("");
    setFormBaseUrl("");
    setEditingId(null);
  };

  const openAddForm = () => {
    resetForm();
    setSaveError(null);
    setShowForm(true);
  };
  const openEditForm = (m: SavedModel) => {
    setFormName(m.name);
    setFormProvider(m.provider);
    setFormModel(m.model);
    setFormBaseUrl(m.baseUrl);
    setEditingId(m.id);
    setSaveError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setModelSuggestionsOpen(false);
    setSaveError(null);
    setSaving(false);
    resetForm();
    setShowForm(false);
  };

  const canSave = !!formName.trim() && !!formModel.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    const name = formName.trim();
    const provider = formProvider;
    const model = formModel.trim();
    const baseUrl = formBaseUrl.trim();

    try {
      if (editingId) {
        const ok = await window.hermes.updateModel(editingId, {
          name, provider, model, baseUrl,
        });
        if (!ok) throw new Error("Model could not be updated");
        setModels((prev) =>
          prev.map((m) =>
            m.id === editingId ? { ...m, name, provider, model, baseUrl } : m,
          ),
        );
      } else {
        const entry = await window.hermes.addModel(name, provider, model, baseUrl);
        setModels((prev) =>
          prev.some((m) => m.id === entry.id) ? prev : [...prev, entry],
        );
      }
      setLoaded(true);
      setLoadError(null);
      setShowForm(false);
      resetForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Model could not be saved");
    } finally {
      setSaving(false);
    }
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

  const copyValue = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue((current) => current === value ? null : current), 1400);
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

  const providerOptions = useMemo(() => {
    if (!formProvider || ALL_PROVIDERS.some((p) => p.id === formProvider)) return ALL_PROVIDERS;
    return [
      { id: formProvider as ProviderId, label: `${formProvider} (custom)`, models: [], capabilities: {} },
      ...ALL_PROVIDERS,
    ];
  }, [formProvider]);

  const filtered = useMemo(() => models.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch = !search.trim() ||
      m.name.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      providerLabel(m.provider).toLowerCase().includes(q);
    const matchesProvider = activeProvider === "All" || m.provider === activeProvider;
    return matchesSearch && matchesProvider;
  }), [models, search, activeProvider]);

  const suggestedModels = useMemo(() => {
    const q = formModel.trim().toLowerCase();
    const list = q
      ? discoveredModels.filter((id) => id.toLowerCase().includes(q))
      : discoveredModels;
    return list.slice(0, 8);
  }, [discoveredModels, formModel]);

  useEffect(() => {
    setActiveModelSuggestionIndex(0);
  }, [suggestedModels]);

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
      <Card key={m.id} pad interactive active={def} className="ui-models-card">
        <div className="ui-models-card-head">
          <div className="ui-models-card-title">
            <IconChip><Cpu size={17} /></IconChip>
            <div>
              <div>
                <span>{m.name}</span>
              </div>
              <small>{providerLabel(m.provider)}</small>
            </div>
          </div>
          <Badge variant={def ? "accent" : "neutral"}>
            {def ? <><StatusDot color="var(--accent)" /> Default</> : "Saved"}
          </Badge>
        </div>

        <button
          type="button"
          className="ui-models-code-row"
          onClick={() => copyValue(m.model)}
          title={`Copy ${m.model}`}
        >
          <code className="ui-models-model-id">{m.model}</code>
          <span className="ui-models-code-copy">
            {copiedValue === m.model ? <Check size={13} /> : <Copy size={13} />}
          </span>
        </button>

        {caps.length > 0 && (
          <div className="ui-models-cap-list">
            {caps.map((c) => {
              const CapIcon = CAPABILITY_META[c].icon;
              return (
                <Badge key={c} variant="neutral"><CapIcon size={11} /> {c}</Badge>
              );
            })}
          </div>
        )}

        {m.baseUrl && (
          <button
            type="button"
            className="ui-models-code-row ui-models-code-row-muted"
            onClick={() => copyValue(m.baseUrl)}
            title={`Copy ${m.baseUrl}`}
          >
            <code className="ui-models-base-url">{m.baseUrl}</code>
            <span className="ui-models-code-copy">
              {copiedValue === m.baseUrl ? <Check size={13} /> : <Copy size={13} />}
            </span>
          </button>
        )}

        <div className="ui-models-card-foot">
          {ctx !== null ? (
            <Tag>ctx&nbsp;<span className="font-mono">{fmtCtx(ctx)}</span></Tag>
          ) : (
            <span />
          )}
          <div className="ui-models-card-actions">
            {!def && (
              <IconButton onClick={() => setDefault(m)} title="Set as default"><Star size={15} /></IconButton>
            )}
            {def && (
              <span className="ui-models-default-check" title="Current default"><Check size={15} /></span>
            )}
            <IconButton onClick={() => openEditForm(m)} title="Edit"><Pencil size={15} /></IconButton>
            <IconButton danger onClick={() => setDeleteConfirm(m.id)} title="Delete"><Trash2 size={15} /></IconButton>
          </div>
        </div>
      </Card>
    );
  };

  const defaultCtx = defaultModel ? contextFor(defaultModel) : null;
  const defaultCaps = defaultModel ? capabilitiesFor(defaultModel.provider) : [];
  const heroTitle = defaultModel
    ? defaultModel.name
    : loadError
      ? "Model catalog unavailable"
      : loaded
        ? "No default model configured"
        : "Loading model library";
  const heroSub = defaultModel
    ? `${providerLabel(defaultModel.provider)} is active for new chat runs.`
    : loadError
      ? "The local model catalog did not respond. You can retry or add a model manually."
      : "Add a saved model and mark it as default to make it available in the chat selector.";
  const emptyTitle = loading
    ? "Loading models..."
    : loadError
      ? "Model catalog unavailable"
      : models.length === 0
        ? "No models configured"
        : "No models found";
  const emptySub = loading
    ? "Reading your local Hermes model catalog."
    : loadError
      ? loadError
      : models.length === 0
        ? "Add your first model to get started."
        : `No models match "${search || providerLabel(activeProvider)}".`;
  const emptyAction = loadError ? (
    <Button leftIcon={<Zap size={15} />} onClick={loadModelLibrary}>Retry</Button>
  ) : loaded && models.length === 0 ? (
    <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openAddForm}>Add Model</Button>
  ) : undefined;

  return (
    <Screen
      className="ui-models-console"
      icon={<Cpu size={19} />}
      kicker="Model Catalog"
      title="Models"
      sub="Manage your model library — these appear in the chat model selector."
      actions={<Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={openAddForm} disabled={loading}>Add Model</Button>}
    >
      <div className="ui-models-shell">
        <Card pad className="ui-models-hero mint-in mint-in-1">
          <div className="ui-models-hero-mark">
            <Cpu size={26} />
          </div>
          <div className="ui-models-hero-copy">
            <div className="ui-eyebrow">Default Model</div>
            <h2>{heroTitle}</h2>
            <p>{heroSub}</p>
            {defaultModel && (
              <div className="ui-models-hero-meta">
                <code>{defaultModel.model}</code>
                <span>{providerLabel(defaultModel.provider)}</span>
                {defaultCtx !== null && <span>Context <strong>{fmtCtx(defaultCtx)}</strong></span>}
              </div>
            )}
            {defaultCaps.length > 0 && (
              <div className="ui-models-cap-list">
                {defaultCaps.map((c) => {
                  const CapIcon = CAPABILITY_META[c].icon;
                  return <Badge key={c} variant="neutral"><CapIcon size={11} /> {c}</Badge>;
                })}
              </div>
            )}
          </div>
          <div className="ui-models-metrics">
            <div>
              <span>Saved</span>
              <strong>{models.length}</strong>
            </div>
            <div>
              <span>Providers</span>
              <strong>{usedProviders.length}</strong>
            </div>
            <div>
              <span>Visible</span>
              <strong>{filtered.length}</strong>
            </div>
          </div>
        </Card>

        <div className="ui-models-toolbar mint-in mint-in-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search models, IDs, providers..."
            className="ui-models-search"
          />
          <Segment className="ui-models-segment">
            {filterTabs.map((p) => (
              <SegmentItem key={p} active={p === activeProvider} onClick={() => setActiveProvider(p)}>
                {p === "All" ? "All" : providerLabel(p)}
                {p !== "All" && <span className="ui-models-filter-count">{providerCounts[p]}</span>}
              </SegmentItem>
            ))}
          </Segment>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Cpu size={24} />}
            title={emptyTitle}
            sub={emptySub}
            action={emptyAction}
          />
        ) : (
          <section className="ui-models-catalog mint-in mint-in-3">
            <div className="ui-models-catalog-head">
              <SectionLabel>{activeProvider === "All" ? "Catalog" : providerLabel(activeProvider)}</SectionLabel>
              <Badge variant="neutral">{filtered.length}</Badge>
            </div>
            <div className="ui-models-grid">
              {filtered.map(renderCard)}
            </div>
          </section>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Edit Model" : "New Model"}
        kicker="Model Catalog"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button>
            <Button variant="primary" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save Model"}
            </Button>
          </>
        }
      >
        <div className="ui-modal-form ui-models-modal-form">
          <div className="ui-modal-form-note">
            <Cpu size={16} />
            <div>
              <strong>{editingId ? "Update saved model" : "Register a model"}</strong>
              <span>Provider credentials stay in your Hermes environment. This only changes the selector catalog.</span>
            </div>
          </div>
          {saveError && <div className="ui-modal-alert">{saveError}</div>}

          <Field label="Display Name" hint="Shown in the model catalog and chat selector.">
            <Input id={nameInputId} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. My DeepSeek" />
          </Field>

          <div className="ui-modal-grid-2">
            <Field label="Provider" hint="Routes requests through this provider.">
              <Select
                id={providerSelectId}
                value={formProvider}
                onChange={(e) => {
                  setFormProvider(e.target.value);
                  setModelSuggestionsOpen(false);
                  setDiscoveredModels([]);
                  setDiscoverStatus(null);
                  setActiveModelSuggestionIndex(0);
                }}
                aria-label="Provider"
              >
                {providerOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Model ID"
              hint={
                discoverLoading
                  ? "Discovering available models..."
                  : discoveredModels.length > 0
                    ? `${discoveredModels.length} model${discoveredModels.length === 1 ? "" : "s"} found`
                    : discoverStatus === "no-key"
                      ? "Add this provider's API key for autocomplete."
                      : "Type an exact provider model id."
              }
            >
              <div className="ui-model-discovery" ref={modelDiscoveryRef}>
                <Input
                  id={modelInputId}
                  value={formModel}
                  onChange={(e) => {
                    setFormModel(e.target.value);
                    setModelSuggestionsOpen(true);
                  }}
                  onFocus={() => setModelSuggestionsOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      if (modelSuggestionsOpen) {
                        event.preventDefault();
                        event.stopPropagation();
                        setModelSuggestionsOpen(false);
                      }
                      return;
                    }
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
                    if (suggestedModels.length === 0) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setModelSuggestionsOpen(true);
                      setActiveModelSuggestionIndex((current) => Math.min(current + 1, suggestedModels.length - 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setModelSuggestionsOpen(true);
                      setActiveModelSuggestionIndex((current) => Math.max(current - 1, 0));
                    } else if (event.key === "Enter" && modelSuggestionsOpen) {
                      event.preventDefault();
                      const selected = suggestedModels[activeModelSuggestionIndex] || suggestedModels[0];
                      setFormModel(selected);
                      setModelSuggestionsOpen(false);
                    }
                  }}
                  placeholder="e.g. gpt-4o"
                  className="font-mono"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={modelSuggestionsOpen && suggestedModels.length > 0}
                  aria-controls={modelSuggestionsOpen && suggestedModels.length > 0 ? modelSuggestionListId : undefined}
                  aria-activedescendant={
                    modelSuggestionsOpen && suggestedModels.length > 0
                      ? `${modelSuggestionListId}-${activeModelSuggestionIndex}`
                      : undefined
                  }
                />
                {modelSuggestionsOpen && suggestedModels.length > 0 && modelSuggestionRect && (
                  createPortal(<div
                    id={modelSuggestionListId}
                    ref={modelSuggestionMenuRef}
                    className="ui-model-discovery-menu ui-model-discovery-menu-portal slide-up"
                    role="listbox"
                    aria-label="Model suggestions"
                    data-placement={modelSuggestionRect?.placement}
                    style={{
                      left: modelSuggestionRect.left,
                      top: modelSuggestionRect.top,
                      width: modelSuggestionRect.width,
                      maxHeight: Math.min(modelSuggestionRect.maxHeight, 240),
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Tab") return;
                      event.preventDefault();
                      setModelSuggestionsOpen(false);
                      requestAnimationFrame(() => {
                        document.getElementById(modelInputId)?.focus();
                      });
                    }}
                  >
                    {suggestedModels.map((id, index) => (
                      <button
                        key={id}
                        id={`${modelSuggestionListId}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeModelSuggestionIndex}
                        className={index === activeModelSuggestionIndex ? "ui-model-discovery-item is-active" : "ui-model-discovery-item"}
                        onMouseEnter={() => setActiveModelSuggestionIndex(index)}
                        onClick={() => {
                          setFormModel(id);
                          setModelSuggestionsOpen(false);
                        }}
                      >
                        <code>{id}</code>
                      </button>
                    ))}
                  </div>, document.body)
                )}
              </div>
            </Field>
          </div>

          <Field label="Base URL" hint="Optional. Use only for custom or local OpenAI-compatible endpoints.">
            <Input
              id={baseUrlInputId}
              value={formBaseUrl}
              onChange={(e) => {
                setFormBaseUrl(e.target.value);
                setDiscoveredModels([]);
                setDiscoverStatus(null);
                setActiveModelSuggestionIndex(0);
              }}
              placeholder="Optional — for custom / local endpoints"
              className="font-mono"
            />
          </Field>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Model?"
        kicker="Confirmation"
        width={400}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </>
        }
      >
        <div className="ui-confirm-panel ui-confirm-danger">
          <span className="ui-confirm-icon"><Trash2 size={18} /></span>
          <div className="ui-confirm-copy">
            <strong>Delete model?</strong>
            <p>
              This removes the model from your library (~/.hermes/models.json). It will no longer appear
              in the chat model selector. Provider API keys stay untouched.
            </p>
          </div>
        </div>
      </Modal>
    </Screen>
  );
}
