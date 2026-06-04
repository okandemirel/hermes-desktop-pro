import { useState } from "react";
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
import {
  Screen,
  Card,
  Button,
  Badge,
  Toggle,
  Segment,
  SegmentItem,
  SearchInput,
  StatusDot,
  EmptyState,
  IconChip,
} from "../../ui";

interface Toolset {
  id: string;
  name: string;
  description: string;
  category: "Core" | "Media" | "Communication" | "Development";
  toolCount: number;
  enabled: boolean;
}

const MOCK_TOOLSETS: Toolset[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read, write, and manage files on the local system",
    category: "Core",
    toolCount: 5,
    enabled: true,
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Execute shell commands in a sandboxed environment",
    category: "Core",
    toolCount: 3,
    enabled: true,
  },
  {
    id: "search",
    name: "Code Search",
    description: "Search file contents with regex and glob patterns",
    category: "Core",
    toolCount: 2,
    enabled: true,
  },
  {
    id: "web",
    name: "Web Fetch",
    description: "Fetch and parse web pages, APIs, and RSS feeds",
    category: "Core",
    toolCount: 4,
    enabled: true,
  },
  {
    id: "database",
    name: "Database",
    description: "Query and manage SQLite and Postgres databases",
    category: "Core",
    toolCount: 6,
    enabled: true,
  },
  {
    id: "image-gen",
    name: "Image Generation",
    description: "Generate and edit images via DALL·E, Stable Diffusion, and Midjourney",
    category: "Media",
    toolCount: 3,
    enabled: false,
  },
  {
    id: "image-analyze",
    name: "Vision Analysis",
    description: "Analyze images, screenshots, and diagrams with vision models",
    category: "Media",
    toolCount: 2,
    enabled: true,
  },
  {
    id: "audio",
    name: "Audio Processing",
    description: "Transcribe, synthesize, and analyze audio files",
    category: "Media",
    toolCount: 4,
    enabled: false,
  },
  {
    id: "telegram",
    name: "Telegram Gateway",
    description: "Send and receive messages via Telegram bot API",
    category: "Communication",
    toolCount: 8,
    enabled: true,
  },
  {
    id: "discord",
    name: "Discord Gateway",
    description: "Integrate with Discord servers and DMs",
    category: "Communication",
    toolCount: 6,
    enabled: false,
  },
  {
    id: "email",
    name: "Email",
    description: "Send and read emails via SMTP/IMAP",
    category: "Communication",
    toolCount: 3,
    enabled: false,
  },
  {
    id: "code-interpreter",
    name: "Code Interpreter",
    description: "Execute Python, JavaScript, and TypeScript in isolated sandboxes",
    category: "Development",
    toolCount: 3,
    enabled: true,
  },
  {
    id: "git",
    name: "Git Operations",
    description: "Clone, commit, branch, and manage git repositories",
    category: "Development",
    toolCount: 7,
    enabled: true,
  },
  {
    id: "package-manager",
    name: "Package Managers",
    description: "Install and manage packages via npm, pip, cargo, and apt",
    category: "Development",
    toolCount: 5,
    enabled: false,
  },
];

const CATEGORIES = ["All", "Core", "Media", "Communication", "Development"];

const CATEGORY_ICONS: Record<string, React.FC<{ size?: number }>> = {
  Core: Wrench,
  Media: ImageIcon,
  Communication: MessageSquare,
  Development: Code,
  All: Layers,
};

export default function ToolsView() {
  const [toolsets, setToolsets] = useState<Toolset[]>(MOCK_TOOLSETS);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = toolsets.filter((t) => {
    const matchesSearch =
      !search.trim() ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || t.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleToolset = (id: string) => {
    setToolsets((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const enableAll = () => setToolsets((prev) => prev.map((t) => ({ ...t, enabled: true })));
  const disableAll = () => setToolsets((prev) => prev.map((t) => ({ ...t, enabled: false })));

  const enabledCount = toolsets.filter((t) => t.enabled).length;
  const totalToolCount = toolsets.filter((t) => t.enabled).reduce((sum, t) => sum + t.toolCount, 0);

  return (
    <Screen
      icon={<Wrench size={19} />}
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
      {/* Summary + restart notice */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <Badge variant="success">
          <StatusDot color="var(--success)" pulse />
          {enabledCount} of {toolsets.length} toolsets enabled
        </Badge>
        <Badge variant="accent">
          <span className="font-mono">{totalToolCount}</span> tools active
        </Badge>
        <Badge variant="warning">
          <Info size={12} /> Restart required to apply changes
        </Badge>
      </div>

      {/* Search + category filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
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

      {/* Toolset grid */}
      {filtered.length > 0 ? (
        <div className="ui-grid stagger">
          {filtered.map((toolset) => {
            const CatIcon = CATEGORY_ICONS[toolset.category] || Wrench;
            return (
              <Card key={toolset.id} pad interactive className="flex flex-col gap-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <IconChip>
                      <CatIcon size={18} />
                    </IconChip>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">
                        {toolset.name}
                      </h3>
                      <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">
                        {toolset.category} · <span className="font-mono">{toolset.toolCount}</span> tools
                      </div>
                    </div>
                  </div>
                  <Toggle on={toolset.enabled} onChange={() => toggleToolset(toolset.id)} />
                </div>

                <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
                  {toolset.description}
                </p>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<PackageOpen size={24} />}
          title="No toolsets found"
          sub={
            search.trim()
              ? `No toolsets match "${search}".`
              : "No toolsets in this category."
          }
        />
      )}
    </Screen>
  );
}
