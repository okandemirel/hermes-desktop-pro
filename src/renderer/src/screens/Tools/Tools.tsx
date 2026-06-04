import { useEffect, useState } from "react";
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
  Divider,
  SectionLabel,
} from "../../ui";

type Category = "Core" | "Media" | "Reasoning" | "Automation";

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

const CATEGORY_ICONS: Record<string, React.FC<{ size?: number }>> = {
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
  const restartRequired = toolsets.some(
    (t) => baseline[t.key] !== undefined && t.enabled !== baseline[t.key],
  );

  return (
    <Screen
      icon={<Wrench size={19} />}
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
      {/* Search + category filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search toolsets…"
          className="flex-1 min-w-[240px] max-w-[400px]"
        />
        <Segment>
          {CATEGORIES.map((cat) => {
            const CatIcon = CATEGORY_ICONS[cat];
            return (
              <SegmentItem
                key={cat}
                active={cat === activeCategory}
                onClick={() => setActiveCategory(cat)}
              >
                <CatIcon size={13} />
                {cat}
              </SegmentItem>
            );
          })}
        </Segment>
      </div>

      {/* Gold-filament section break — one confident line between controls and content */}
      <Divider className="ui-divider-gold !my-0" />

      {/* Quiet editorial summary — one line, not a stat strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3.5 mb-5">
        <SectionLabel className="font-mono normal-case tracking-normal text-[11.5px]">
          {enabledCount} / {toolsets.length} toolsets enabled
        </SectionLabel>
        {restartRequired && (
          <Badge variant="warning">
            <Info size={12} /> Restart required to apply changes
          </Badge>
        )}
      </div>

      {/* Toolset grid */}
      {toolsets.length === 0 ? (
        <EmptyState
          icon={<PackageOpen size={24} />}
          title={loaded ? "No toolsets found" : "Loading toolsets…"}
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
        <div className="flex flex-col gap-7">
          {GROUP_ORDER.map((group) => {
            const inGroup = filtered.filter((t) => categoryFor(t.key) === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-3">
                <SectionLabel>{group}</SectionLabel>
                <div className="ui-grid stagger">
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
        <div className="ui-grid stagger">
          {filtered.map((toolset) => (
            <ToolsetCard
              key={toolset.key}
              toolset={toolset}
              onToggle={() => toggleToolset(toolset.key)}
            />
          ))}
        </div>
      )}
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
      className={`flex flex-col gap-3.5 transition-opacity ${enabled ? "" : "opacity-55"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <IconChip
            className={
              enabled
                ? "shadow-[0_0_0_1px_var(--accent-line)]"
                : "!bg-[var(--surface-2)] !text-[var(--text-3)] !border-[var(--border)]"
            }
          >
            <CatIcon size={18} />
          </IconChip>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">
              {toolset.label}
            </h3>
            <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">
              {category}
            </div>
          </div>
        </div>
        <Toggle on={enabled} onChange={onToggle} />
      </div>

      <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
        {toolset.description}
      </p>
    </Card>
  );
}
