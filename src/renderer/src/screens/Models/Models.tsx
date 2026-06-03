import { useState } from "react";
import { Server, Plus, Trash2, X, Check, ChevronDown } from "../../components/Icons";

// ─── Missing icons defined locally ──────────────────────────
function SvgIcon({ paths, circle, rect, size = 16, style }: { paths: string[]; circle?: [number, number, number]; rect?: [number, number, number, number]; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {circle && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
      {rect && <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} rx="2" />}
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
const Cpu = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon rect={[4, 4, 16, 16]} paths={["M9 9h6v6H9z", "M9 1v3", "M15 1v3", "M9 20v3", "M15 20v3", "M20 9h3", "M20 14h3", "M1 9h3", "M1 14h3"]} {...p} />;
const Edit3 = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon paths={["M12 20h9", "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"]} {...p} />;
const SlidersHorizontal = (p: { size?: number; style?: React.CSSProperties }) => <SvgIcon paths={["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"]} {...p} />;

// ─── Types ──────────────────────────────────────────────────

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  contextWindow: number;
  temperature: number;
}

const PROVIDERS = [
  "OpenRouter", "Anthropic", "OpenAI", "Google",
  "Grok", "DeepSeek", "OpenCode Zen", "OpenCode Go", "Local / Custom",
];

// ─── Mock data ──────────────────────────────────────────────

const MOCK_MODELS: ModelConfig[] = [
  { id: "m1", name: "DeepSeek V4 Pro", provider: "OpenCode Go", modelId: "deepseek-v4-pro", contextWindow: 128000, temperature: 0.7 },
  { id: "m2", name: "Claude Sonnet 4", provider: "OpenCode Zen", modelId: "claude-sonnet-4", contextWindow: 200000, temperature: 0.5 },
  { id: "m3", name: "GPT-4o", provider: "OpenAI", modelId: "gpt-4o", contextWindow: 128000, temperature: 0.8 },
  { id: "m4", name: "Gemini 3 Pro", provider: "Google", modelId: "gemini-3-pro", contextWindow: 1000000, temperature: 0.6 },
];

// ─── Component ──────────────────────────────────────────────

export default function ModelsView() {
  const [models, setModels] = useState<ModelConfig[]>(MOCK_MODELS);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState(PROVIDERS[0]);
  const [formModelId, setFormModelId] = useState("");
  const [formContext, setFormContext] = useState(128000);
  const [formTemp, setFormTemp] = useState(0.7);
  const [providerOpen, setProviderOpen] = useState(false);

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
      };
      setModels(prev => [...prev, newModel]);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
    setDeleteConfirm(null);
    if (editingId === id) { resetForm(); setShowForm(false); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "#0D0D0D" }}>
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between flex-shrink-0 mac-drag-region" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.15)" }}>
            <Cpu size={18} style={{ color: "#0A84FF" }} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold" style={{ color: "#fff" }}>Models</h1>
            <p className="text-[11.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
              {models.length} configuration{models.length !== 1 ? "s" : ""} saved
            </p>
          </div>
        </div>
        <button
          onClick={showForm ? () => { resetForm(); setShowForm(false); } : openAddForm}
          className="mac-no-drag rounded-lg px-4 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
          style={{ background: showForm ? "transparent" : "#0A84FF", color: "#fff", border: showForm ? "1px solid rgba(255,255,255,0.1)" : "none" }}
        >
          {showForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add Model</>}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-6 px-8 space-y-6">

          {/* Inline Add/Edit Form */}
          {showForm && (
            <div className="rounded-xl p-5 animate-slide-up" style={{ background: "#242424", border: "1px solid rgba(10,132,255,0.12)" }}>
              <h2 className="text-[13px] font-semibold mb-4" style={{ color: "#fff" }}>
                {editingId ? "Edit Model Configuration" : "New Model Configuration"}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10.5px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>Display Name</label>
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. My DeepSeek"
                    className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors"
                    style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#0A84FF"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                </div>

                {/* Provider dropdown */}
                <div>
                  <label className="block text-[10.5px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>Provider</label>
                  <div className="relative">
                    <button
                      onClick={() => setProviderOpen(!providerOpen)}
                      className="w-full rounded-lg px-3 py-2 text-[12px] flex items-center justify-between transition-colors outline-none"
                      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                    >
                      <span>{formProvider}</span>
                      <ChevronDown size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
                    </button>
                    {providerOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10 shadow-lg"
                        style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {PROVIDERS.map(p => (
                          <button
                            key={p}
                            onClick={() => { setFormProvider(p); setProviderOpen(false); }}
                            className="w-full text-left px-3 py-2 text-[11.5px] transition-colors"
                            style={{ color: p === formProvider ? "#0A84FF" : "rgba(255,255,255,0.7)", background: p === formProvider ? "rgba(10,132,255,0.08)" : "transparent" }}
                            onMouseEnter={e => { if (p !== formProvider) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                            onMouseLeave={e => { if (p !== formProvider) e.currentTarget.style.background = "transparent"; }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>Model ID</label>
                  <input type="text" value={formModelId} onChange={e => setFormModelId(e.target.value)} placeholder="e.g. gpt-4o"
                    className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors font-mono"
                    style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#0A84FF"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Context Window — <span className="font-mono" style={{ color: "#0A84FF" }}>{formContext.toLocaleString()}</span> tokens
                  </label>
                  <input type="range" min={4000} max={2000000} step={1000} value={formContext}
                    onChange={e => setFormContext(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: "#0A84FF", background: "#1A1A1A" }}
                  />
                  <div className="flex justify-between text-[9.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <span>4K</span><span>2M</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Temperature — <span className="font-mono" style={{ color: "#0A84FF" }}>{formTemp.toFixed(1)}</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <SlidersHorizontal size={13} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                    <input type="range" min={0} max={2} step={0.1} value={formTemp}
                      onChange={e => setFormTemp(Number(e.target.value))}
                      className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: "#0A84FF", background: "#1A1A1A" }}
                    />
                  </div>
                  <div className="flex justify-between text-[9.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <span>0 (deterministic)</span><span>2 (creative)</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleSave} disabled={!formName.trim() || !formModelId.trim()}
                  className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
                  style={{ background: "#0A84FF", color: "#fff", opacity: formName.trim() && formModelId.trim() ? 1 : 0.5, cursor: formName.trim() && formModelId.trim() ? "pointer" : "not-allowed" }}>
                  <Check size={13} /> Save
                </button>
                <button onClick={() => { resetForm(); setShowForm(false); }}
                  className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all"
                  style={{ background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {models.length === 0 && !showForm && (
            <div className="flex items-center justify-center py-24">
              <div className="text-center animate-fade-in">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#1A1A1A" }}>
                  <Cpu size={40} style={{ color: "rgba(255,255,255,0.2)" }} />
                </div>
                <h2 className="text-[16px] font-semibold mb-1" style={{ color: "#fff" }}>No models configured</h2>
                <p className="text-[12px] mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Add your first model to get started</p>
                <button onClick={openAddForm}
                  className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all inline-flex items-center gap-1.5"
                  style={{ background: "#0A84FF", color: "#fff" }}>
                  <Plus size={13} /> Add Model
                </button>
              </div>
            </div>
          )}

          {/* Model list grouped by provider */}
          {models.length > 0 && (
            <div className="space-y-8">
              {PROVIDERS.filter(p => models.some(m => m.provider === p)).map(provider => {
                const providerModels = models.filter(m => m.provider === provider);
                return (
                  <div key={provider}>
                    <div className="flex items-center gap-2 mb-3">
                      <Server size={14} style={{ color: "rgba(255,255,255,0.35)" }} />
                      <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>{provider}</h2>
                      <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>{providerModels.length}</span>
                    </div>
                    <div className="space-y-2">
                      {providerModels.map(m => (
                        <div key={m.id}
                          className="rounded-xl p-4 transition-all duration-200 animate-slide-up"
                          style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-[13px] font-semibold" style={{ color: "#fff" }}>{m.name}</h3>
                                <code className="text-[10.5px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}>{m.modelId}</code>
                              </div>
                              <div className="flex items-center gap-3 text-[10.5px] mt-1.5">
                                <span style={{ color: "rgba(255,255,255,0.35)" }}>
                                  Context: <span className="font-mono" style={{ color: "rgba(255,255,255,0.55)" }}>{m.contextWindow.toLocaleString()}</span>
                                </span>
                                <span style={{ color: "rgba(255,255,255,0.35)" }}>
                                  Temp: <span className="font-mono" style={{ color: "rgba(255,255,255,0.55)" }}>{m.temperature.toFixed(1)}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => openEditForm(m)}
                                className="p-1.5 rounded-lg transition-all"
                                style={{ color: "rgba(255,255,255,0.3)" }}
                                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                                <Edit3 size={14} />
                              </button>
                              <button onClick={() => setDeleteConfirm(m.id)}
                                className="p-1.5 rounded-lg transition-all"
                                style={{ color: "rgba(255,255,255,0.3)" }}
                                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#ef4444"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setDeleteConfirm(null)}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4 animate-slide-up" style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold mb-2" style={{ color: "#fff" }}>Delete Model?</h3>
            <p className="text-[11.5px] mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
              This action cannot be undone. The model configuration will be permanently removed.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all"
                style={{ background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all flex items-center gap-1.5"
                style={{ background: "#ef4444", color: "#fff" }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
