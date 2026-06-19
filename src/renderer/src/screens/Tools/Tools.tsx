import { useEffect, useState, type ComponentType } from "react";
import {
  Wrench,
  Zap,
  Code,
  Image as ImageIcon,
  MessageSquare,
  Layers,
  Info,
  Power,
  PackageOpen,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ToolsetInfo } from "@shared/types";
import {
  Screen,
  Card,
  Button,
  Badge,
  Toggle,
  Segment,
  SegmentItem,
  SearchInput,
  EmptyState,
  IconChip,
  SectionLabel,
} from "../../ui";

type Category = "Core" | "Media" | "Reasoning" | "Automation";
type CategoryIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

// Client-side display grouping only — the data itself is the fixed set of
// toolset keys returned by the backend. Categories never leave the renderer
// and are not persisted anywhere.
const CATEGORY_FOR_KEY: Record<string, Category> = {
  web: "Core",
  browser: "Core",
  terminal: "Core",
  file: "Core",
  code_execution: "Core",
  vision: "Media",
  image_gen: "Media",
  tts: "Media",
  skills: "Reasoning",
  memory: "Reasoning",
  session_search: "Reasoning",
  clarify: "Reasoning",
  delegation: "Automation",
  cronjob: "Automation",
  moa: "Automation",
  todo: "Automation",
};

function categoryFor(key: string): Category {
  return CATEGORY_FOR_KEY[key] ?? "Core";
}

const CATEGORIES = ["All", "Core", "Media", "Reasoning", "Automation"];
const GROUP_ORDER = ["Core", "Media", "Reasoning", "Automation"] as const;

const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  Core: Wrench,
  Media: ImageIcon,
  Reasoning: MessageSquare,
  Automation: Code,
  All: Layers,
};

export default function ToolsView() {
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [baseline, setBaseline] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [bridgeEnabled, setBridgeEnabled] = useState(false);

  // Load the real toolsets from the backend on mount. The enabled flags come
  // straight from platform_toolsets.cli in config.yaml (all enabled when no
  // config section exists). An empty result keeps the honest empty state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data: ToolsetInfo[] = await window.hermes.getToolsets();
        if (!active) return;
        setToolsets(data);
        setBaseline(Object.fromEntries(data.map((t) => [t.key, t.enabled])));
      } catch {
        // honest empty state — no mock fallback
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.hermes
      .getAskProfileBridgeEnabled()
      .then((on: boolean) => {
        if (active) setBridgeEnabled(on);
      })
      .catch(() => {
        /* leave off on read failure */
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = toolsets.filter((t) => {
    const matchesSearch =
      !search.trim() ||
      t.label.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === "All" || categoryFor(t.key) === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Optimistic toggle: flip the UI immediately, persist to config.yaml. On a
  // failed write, revert so the screen never claims a state the backend does
  // not hold.
  const toggleToolset = async (key: string) => {
    const target = toolsets.find((t) => t.key === key);
    if (!target) return;
    const next = !target.enabled;
    setToolsets((prev) =>
      prev.map((t) => (t.key === key ? { ...t, enabled: next } : t)),
    );
    try {
      const ok = await window.hermes.setToolsetEnabled(key, next);
      if (!ok) throw new Error("write failed");
    } catch {
      setToolsets((prev) =>
        prev.map((t) => (t.key === key ? { ...t, enabled: !next } : t)),
      );
    }
  };

  // Optimistic toggle for the desktop-managed ask_profile MCP bridge. The IPC
  // returns the authoritative new state; revert to the previous value on error.
  const toggleBridge = async () => {
    const next = !bridgeEnabled;
    setBridgeEnabled(next);
    try {
      const result = await window.hermes.setAskProfileBridge(next);
      setBridgeEnabled(result);
    } catch {
      setBridgeEnabled(!next);
    }
  };

  const setAll = async (enabled: boolean) => {
    const targets = toolsets.filter((t) => t.enabled !== enabled);
    if (targets.length === 0) return;
    setToolsets((prev) => prev.map((t) => ({ ...t, enabled })));
    await Promise.all(
      targets.map(async (t) => {
        try {
          const ok = await window.hermes.setToolsetEnabled(t.key, enabled);
          if (!ok) throw new Error("write failed");
        } catch {
          setToolsets((prev) =>
            prev.map((x) =>
              x.key === t.key ? { ...x, enabled: !enabled } : x,
            ),
          );
        }
      }),
    );
  };

  const enableAll = () => setAll(true);
  const disableAll = () => setAll(false);

  const enabledCount = toolsets.filter((t) => t.enabled).length;
  const disabledCount = toolsets.length - enabledCount;
  const restartRequired = toolsets.some(
    (t) => baseline[t.key] !== undefined && t.enabled !== baseline[t.key],
  );

  return (
    <Screen
      className="ui-tools-console"
      icon={<Wrench size={19} className="ui-tools-screen-glyph" />}
      kicker="Capabilities"
      title="Tools & Plugins"
      sub="Enable or disable the toolsets your agent can use during conversations."
      actions={
        <>
          <Button variant="secondary" size="sm" leftIcon={<Zap size={14} />} onClick={enableAll}>
            Enable All
          </Button>
          <Button variant="ghost" size="sm" leftIcon={<Power size={14} />} onClick={disableAll}>
            Disable All
          </Button>
        </>
      }
    >
      <div className="ui-tools-shell">
        <Card pad className="ui-tools-hero mint-in mint-in-1">
          <div className="ui-tools-hero-mark">
            <ShieldCheck size={26} />
          </div>
          <div className="ui-tools-hero-copy">
            <div className="ui-eyebrow">Capability Matrix</div>
            <h2>{enabledCount} toolset{enabledCount !== 1 ? "s" : ""} enabled</h2>
            <p>Tool availability is written back to config.yaml. Changes are optimistic and reverted if the backend cannot persist them.</p>
          </div>
          <div className="ui-tools-metrics">
            <div>
              <span>Enabled</span>
              <strong>{enabledCount}</strong>
            </div>
            <div>
              <span>Disabled</span>
              <strong>{disabledCount}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{toolsets.length}</strong>
            </div>
          </div>
          {restartRequired && (
            <Badge variant="warning" className="ui-tools-restart">
              <Info size={12} /> Restart required
            </Badge>
          )}
        </Card>

        <Card pad className="ui-tools-bridge mint-in mint-in-2" data-enabled={bridgeEnabled}>
          <div className="ui-tools-card-head">
            <div className="ui-tools-card-title">
              <IconChip className="ui-tools-card-icon ui-tools-card-icon-automation">
                <Users size={18} className="ui-tools-card-glyph" />
              </IconChip>
              <div>
                <h3>Cross-profile delegation</h3>
                <span>ask_profile · MCP bridge</span>
              </div>
            </div>
            <Toggle on={bridgeEnabled} onChange={toggleBridge} />
          </div>
          <p>
            Let this profile&apos;s agent call another profile with the <strong>ask_profile</strong> tool, via the desktop MCP bridge. Off by default. Works in local mode; cron &amp; delegation tools are in the list below.
          </p>
        </Card>

        <div className="ui-tools-toolbar mint-in mint-in-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search toolsets..."
            className="ui-tools-search"
          />
          <Segment className="ui-tools-segment">
            {CATEGORIES.map((cat) => {
              const CatIcon = CATEGORY_ICONS[cat];
              return (
                <SegmentItem
                  key={cat}
                  active={cat === activeCategory}
                  onClick={() => setActiveCategory(cat)}
                >
                  <CatIcon
                    size={13}
                    className={cat === "Core" ? "ui-tools-segment-glyph-core" : "ui-tools-segment-glyph"}
                  />
                  {cat}
                </SegmentItem>
              );
            })}
          </Segment>
        </div>

        {toolsets.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={24} />}
            title={loaded ? "No toolsets found" : "Loading toolsets..."}
            sub={
              loaded
                ? "Could not read toolsets from config.yaml. Start the gateway or check your connection."
                : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={24} />}
            title="No toolsets found"
            sub={
              search.trim()
                ? `No toolsets match "${search}".`
                : "No toolsets in this category."
            }
          />
        ) : activeCategory === "All" ? (
          <div className="ui-tools-groups">
            {GROUP_ORDER.map((group) => {
              const inGroup = filtered.filter((t) => categoryFor(t.key) === group);
              if (inGroup.length === 0) return null;
              return (
                <section key={group} className="ui-tools-section">
                  <div className="ui-tools-section-head">
                    <SectionLabel>{group}</SectionLabel>
                    <Badge variant="neutral">{inGroup.length}</Badge>
                  </div>
                  <div className="ui-tools-grid stagger">
                    {inGroup.map((toolset) => (
                      <ToolsetCard
                        key={toolset.key}
                        toolset={toolset}
                        onToggle={() => toggleToolset(toolset.key)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="ui-tools-grid stagger">
            {filtered.map((toolset) => (
              <ToolsetCard
                key={toolset.key}
                toolset={toolset}
                onToggle={() => toggleToolset(toolset.key)}
              />
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}

function ToolsetCard({ toolset, onToggle }: { toolset: ToolsetInfo; onToggle: () => void }) {
  const category = categoryFor(toolset.key);
  const CatIcon = CATEGORY_ICONS[category] || Wrench;
  const { enabled } = toolset;
  return (
    <Card
      pad
      interactive
      className="ui-tools-card"
      data-enabled={enabled}
    >
      <div className="ui-tools-card-head">
        <div className="ui-tools-card-title">
          <IconChip
            className={
              enabled
                ? `ui-tools-card-icon ui-tools-card-icon-${category.toLowerCase()} shadow-[0_0_0_1px_var(--accent-line)]`
                : `ui-tools-card-icon ui-tools-card-icon-${category.toLowerCase()} !bg-[var(--surface-2)] !text-[var(--text-3)] !border-[var(--border)]`
            }
          >
            <CatIcon size={18} className="ui-tools-card-glyph" />
          </IconChip>
          <div>
            <h3>{toolset.label}</h3>
            <span>{category}</span>
          </div>
        </div>
        <Toggle on={enabled} onChange={onToggle} />
      </div>

      <p>
        {toolset.description}
      </p>
    </Card>
  );
}
