import { useState, useMemo } from "react";
import {
  Cpu, Plus, Trash2, Pencil, Check, Star, Zap, Eye, Wrench, Brain,
  Layers, Sparkles, Gauge, Database,
} from "lucide-react";
import {
  Screen, Card, Button, IconButton, IconChip, Badge, Tag,
  Field, Input, Select, Modal, EmptyState, SearchInput,
  Segment, SegmentItem, SectionLabel, StatusDot,
} from "../../ui";

// ─── Types ──────────────────────────────────────────────────

type Capability = "Streaming" | "Vision" | "Tools" | "Reasoning";

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  contextWindow: number;
  temperature: number;
  /** USD price per 1M input tokens */
  priceIn: number;
  /** USD price per 1M output tokens */
  priceOut: number;
  capabilities: Capability[];
  recommended?: boolean;
}

const PROVIDERS = [
  "OpenRouter", "Anthropic", "OpenAI", "Google",
  "Grok", "DeepSeek", "OpenCode Zen", "OpenCode Go", "Local / Custom",
];

const CONTEXT_OPTIONS = [
  { label: "4K", value: 4000 },
  { label: "8K", value: 8000 },
  { label: "16K", value: 16000 },
  { label: "32K", value: 32000 },
  { label: "64K", value: 64000 },
  { label: "128K", value: 128000 },
  { label: "200K", value: 200000 },
  { label: "256K", value: 256000 },
  { label: "1M", value: 1000000 },
  { label: "2M", value: 2000000 },
];

const TEMP_OPTIONS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0];

const CAPABILITY_META: Record<Capability, { icon: typeof Zap }> = {
  Streaming: { icon: Zap },
  Vision: { icon: Eye },
  Tools: { icon: Wrench },
  Reasoning: { icon: Brain },
};

// Provider glyph (lucide stand-in for brand marks) + display order
const PROVIDER_ICONS: Record<string, typeof Cpu> = {
  Anthropic: Sparkles,
  OpenAI: Brain,
  Google: Layers,
  Grok: Zap,
  DeepSeek: Gauge,
  OpenRouter: Database,
  "OpenCode Zen": Cpu,
  "OpenCode Go": Cpu,
  "Local / Custom": Cpu,
};

// ─── Mock data ──────────────────────────────────────────────

const MOCK_MODELS: ModelConfig[] = [
  { id: "m1", name: "Claude Sonnet 4", provider: "Anthropic", modelId: "claude-sonnet-4-20250514", contextWindow: 200000, temperature: 0.5, priceIn: 3, priceOut: 15, capabilities: ["Streaming", "Vision", "Tools", "Reasoning"], recommended: true },
  { id: "m2", name: "Claude Opus 4", provider: "Anthropic", modelId: "claude-opus-4-20250514", contextWindow: 200000, temperature: 0.4, priceIn: 15, priceOut: 75, capabilities: ["Streaming", "Vision", "Tools", "Reasoning"], recommended: true },
  { id: "m3", name: "GPT-4o", provider: "OpenAI", modelId: "gpt-4o", contextWindow: 128000, temperature: 0.8, priceIn: 2.5, priceOut: 10, capabilities: ["Streaming", "Vision", "Tools"], recommended: true },
  { id: "m4", name: "o3", provider: "OpenAI", modelId: "o3", contextWindow: 200000, temperature: 1.0, priceIn: 10, priceOut: 40, capabilities: ["Streaming", "Tools", "Reasoning"] },
  { id: "m5", name: "Gemini 3 Pro", provider: "Google", modelId: "gemini-3-pro", contextWindow: 1000000, temperature: 0.6, priceIn: 1.25, priceOut: 5, capabilities: ["Streaming", "Vision", "Tools", "Reasoning"], recommended: true },
  { id: "m6", name: "Gemini 3 Flash", provider: "Google", modelId: "gemini-3-flash", contextWindow: 1000000, temperature: 0.7, priceIn: 0.075, priceOut: 0.3, capabilities: ["Streaming", "Vision", "Tools"] },
  { id: "m7", name: "Grok 4", provider: "Grok", modelId: "grok-4", contextWindow: 256000, temperature: 0.7, priceIn: 5, priceOut: 15, capabilities: ["Streaming", "Vision", "Tools", "Reasoning"] },
  { id: "m8", name: "DeepSeek V4 Pro", provider: "DeepSeek", modelId: "deepseek-v4-pro", contextWindow: 128000, temperature: 0.7, priceIn: 0.27, priceOut: 1.1, capabilities: ["Streaming", "Tools", "Reasoning"] },
  { id: "m9", name: "DeepSeek R2", provider: "DeepSeek", modelId: "deepseek-r2", contextWindow: 64000, temperature: 0.6, priceIn: 0.55, priceOut: 2.19, capabilities: ["Streaming", "Reasoning"] },
  { id: "m10", name: "Sonnet (Zen)", provider: "OpenCode Zen", modelId: "claude-sonnet-4", contextWindow: 200000, temperature: 0.5, priceIn: 0, priceOut: 0, capabilities: ["Streaming", "Vision", "Tools", "Reasoning"] },
  { id: "m11", name: "DeepSeek (Go)", provider: "OpenCode Go", modelId: "deepseek-v4-pro", contextWindow: 128000, temperature: 0.7, priceIn: 0, priceOut: 0, capabilities: ["Streaming", "Tools"] },
  { id: "m12", name: "Llama 4 Maverick", provider: "Local / Custom", modelId: "llama-4-maverick-local", contextWindow: 32000, temperature: 0.8, priceIn: 0, priceOut: 0, capabilities: ["Streaming", "Tools"] },
];

const DEFAULT_MODEL_ID = "m1";

// ─── Helpers ────────────────────────────────────────────────

const fmtCtx = (n: number) => (n >= 1000000 ? `${n / 1000000}M` : `${Math.round(n / 1000)}K`);
const fmtPrice = (n: number) => (n === 0 ? "Free" : `$${n}`);

// ─── Component ──────────────────────────────────────────────

export default function ModelsView() {
  const [models, setModels] = useState<ModelConfig[]>(MOCK_MODELS);
  const [defaultId, setDefaultId] = useState<string>(DEFAULT_MODEL_ID);
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState(PROVIDERS[0]);
  const [formModelId, setFormModelId] = useState("");
  const [formContext, setFormContext] = useState(128000);
  const [formTemp, setFormTemp] = useState(0.7);

  const resetForm = () => {
    setFormName(""); setFormProvider(PROVIDERS[0]); setFormModelId("");
    setFormContext(128000); setFormTemp(0.7); setEditingId(null);
  };

  const openAddForm = () => { resetForm(); setShowForm(true); };
  const openEditForm = (m: ModelConfig) => {
    setFormName(m.name); setFormProvider(m.provider); setFormModelId(m.modelId);
    setFormContext(m.contextWindow); setFormTemp(m.temperature);
    setEditingId(m.id); setShowForm(true);
  };

  const closeForm = () => { resetForm(); setShowForm(false); };

  const handleSave = () => {
    if (!formName.trim() || !formModelId.trim()) return;
    if (editingId) {
      setModels(prev => prev.map(m => m.id === editingId ? { ...m, name: formName.trim(), provider: formProvider, modelId: formModelId.trim(), contextWindow: formContext, temperature: formTemp } : m));
    } else {
      const newModel: ModelConfig = {
        id: `m${Date.now()}`,
        name: formName.trim(),
        provider: formProvider,
        modelId: formModelId.trim(),
        contextWindow: formContext,
        temperature: formTemp,
        priceIn: 0,
        priceOut: 0,
        capabilities: ["Streaming", "Tools"],
      };
      setModels(prev => [...prev, newModel]);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
    if (defaultId === id) {
      const next = models.find(m => m.id !== id);
      setDefaultId(next ? next.id : "");
    }
    setDeleteConfirm(null);
    if (editingId === id) { resetForm(); setShowForm(false); }
  };

  const canSave = !!formName.trim() && !!formModelId.trim();

  // ── Derived data ──
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    models.forEach(m => { counts[m.provider] = (counts[m.provider] || 0) + 1; });
    return counts;
  }, [models]);

  const usedProviders = useMemo(
    () => PROVIDERS.filter(p => providerCounts[p]),
    [providerCounts],
  );

  const filterTabs = useMemo(() => ["All", ...usedProviders], [usedProviders]);

  const filtered = useMemo(() => models.filter(m => {
    const matchesSearch = !search.trim() ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.modelId.toLowerCase().includes(search.toLowerCase()) ||
      m.provider.toLowerCase().includes(search.toLowerCase());
    const matchesProvider = activeProvider === "All" || m.provider === activeProvider;
    return matchesSearch && matchesProvider;
  }), [models, search, activeProvider]);

  const recommended = filtered.filter(m => m.recommended);
  const catalog = filtered.filter(m => !m.recommended);

  const defaultModel = models.find(m => m.id === defaultId);
  const DefaultIcon = defaultModel ? (PROVIDER_ICONS[defaultModel.provider] || Cpu) : Cpu;

  // ── Card renderer ──
  const renderCard = (m: ModelConfig) => {
    const ProviderIcon = PROVIDER_ICONS[m.provider] || Cpu;
    const isDefault = m.id === defaultId;
    return (
      <Card key={m.id} pad interactive active={isDefault} className="group flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <IconChip><ProviderIcon size={17} /></IconChip>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-[var(--text)] truncate">{m.name}</span>
                {isDefault && <Star size={13} className="shrink-0 text-[var(--accent-text)] fill-[var(--accent)]" />}
              </div>
              <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">{m.provider}</div>
            </div>
          </div>
          <Badge variant={isDefault ? "accent" : "neutral"}>
            {isDefault ? <><StatusDot color="var(--accent)" /> Default</> : "Active"}
          </Badge>
        </div>

        <code className="block text-[12px] font-mono text-[var(--text-2)] truncate">{m.modelId}</code>

        <div className="flex flex-wrap items-center gap-1.5">
          {m.capabilities.map(c => {
            const CapIcon = CAPABILITY_META[c].icon;
            return (
              <Badge key={c} variant="neutral"><CapIcon size={11} /> {c}</Badge>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <span className="text-[var(--text-3)]">Context <span className="font-mono text-[var(--text)] ml-0.5">{fmtCtx(m.contextWindow)}</span></span>
          <span className="text-[var(--text-3)]">In <span className="font-mono text-[var(--text)] ml-0.5">{fmtPrice(m.priceIn)}</span></span>
          <span className="text-[var(--text-3)]">Out <span className="font-mono text-[var(--text)] ml-0.5">{fmtPrice(m.priceOut)}</span></span>
        </div>

        <div className="mt-auto pt-3.5 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <Tag>temp&nbsp;<span className="font-mono">{m.temperature.toFixed(1)}</span></Tag>
          <div className="flex items-center gap-0.5 shrink-0">
            {!isDefault && (
              <IconButton onClick={() => setDefaultId(m.id)} title="Set as default"><Star size={15} /></IconButton>
            )}
            {isDefault && (
              <span className="flex items-center justify-center w-[30px] h-[30px] text-[var(--accent-text)]" title="Current default"><Check size={15} /></span>
            )}
            <IconButton onClick={() => openEditForm(m)} title="Edit"><Pencil size={15} /></IconButton>
            <IconButton danger onClick={() => setDeleteConfirm(m.id)} title="Delete"><Trash2 size={15} /></IconButton>
          </div>
        </div>
      </Card>
    );
  };

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
            <DefaultIcon size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="ui-eyebrow">Default Model</div>
            <h2 className="serif text-[var(--text)] leading-none" style={{ fontSize: "clamp(24px, 2.6vw, 31px)", letterSpacing: "-0.012em" }}>
              {defaultModel.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[12.5px]">
              <span className="text-[var(--text-2)]">{defaultModel.provider}</span>
              <code className="font-mono text-[var(--text-3)]">{defaultModel.modelId}</code>
              <span className="text-[var(--text-3)]">Context <span className="font-mono text-[var(--text-2)]">{fmtCtx(defaultModel.contextWindow)}</span></span>
              <span className="text-[var(--text-3)]">temp <span className="font-mono text-[var(--text-2)]">{defaultModel.temperature.toFixed(1)}</span></span>
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
          {filterTabs.map(p => (
            <SegmentItem key={p} active={p === activeProvider} onClick={() => setActiveProvider(p)}>
              {p}
              {p !== "All" && <span className="ml-0.5 text-[var(--text-3)] font-mono">{providerCounts[p]}</span>}
            </SegmentItem>
          ))}
        </Segment>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Cpu size={24} />}
          title={models.length === 0 ? "No models configured" : "No models found"}
          sub={models.length === 0 ? "Add your first model to get started." : `No models match "${search || activeProvider}".`}
          action={models.length === 0 ? <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openAddForm}>Add Model</Button> : undefined}
        />
      ) : (
        <>
          {recommended.length > 0 && (
            <section className="mb-7 mint-in mint-in-3">
              <div className="flex items-center gap-2 mb-3">
                <SectionLabel>Recommended</SectionLabel>
                <Badge variant="accent">{recommended.length}</Badge>
              </div>
              <div className="ui-grid">
                {recommended.map(renderCard)}
              </div>
            </section>
          )}

          {catalog.length > 0 && (
            <section className="mint-in mint-in-4">
              <div className="flex items-center gap-2 mb-3">
                <SectionLabel>{activeProvider === "All" ? "Catalog" : activeProvider}</SectionLabel>
                <Badge variant="neutral">{catalog.length}</Badge>
              </div>
              <div className="ui-grid">
                {catalog.map(renderCard)}
              </div>
            </section>
          )}
        </>
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
            <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. My DeepSeek" />
          </Field>

          <Field label="Provider">
            <Select value={formProvider} onChange={e => setFormProvider(e.target.value)}>
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>

          <Field label="Model ID">
            <Input value={formModelId} onChange={e => setFormModelId(e.target.value)} placeholder="e.g. gpt-4o" className="font-mono" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Context Window">
              <Select value={formContext} onChange={e => setFormContext(Number(e.target.value))}>
                {CONTEXT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} tokens</option>)}
              </Select>
            </Field>

            <Field label="Temperature">
              <Select value={formTemp} onChange={e => setFormTemp(Number(e.target.value))}>
                {TEMP_OPTIONS.map(t => <option key={t} value={t}>{t.toFixed(1)}</option>)}
              </Select>
            </Field>
          </div>
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
          This action cannot be undone. The model configuration will be permanently removed.
        </p>
      </Modal>
    </Screen>
  );
}
