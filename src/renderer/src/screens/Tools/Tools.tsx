import { useState } from "react";
import {
  Search,
  Wrench,
  Zap,
  Code,
  ImageIcon,
  MessageSquare,
  Globe,
  Terminal,
  Database,
  Layers,
  Filter,
  Info,
} from "../../components/Icons";

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

const CATEGORY_ICONS: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
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
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="px-8 py-5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}
            >
              <Wrench size={17} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h1 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                Tools & Plugins
              </h1>
              <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {enabledCount}/{toolsets.length} toolsets enabled · {totalToolCount} tools active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={enableAll}
              className="rounded-lg px-3 py-2 text-[11.5px] font-medium transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              <Zap size={12} className="inline mr-1.5" style={{ color: "var(--success)" }} />
              Enable All
            </button>
            <button
              onClick={disableAll}
              className="rounded-lg px-3 py-2 text-[11.5px] font-medium transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Disable All
            </button>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search toolsets..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-[12px] outline-none transition-colors"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>
          <Filter size={14} style={{ color: "var(--text-muted)" }} />
          <div className="flex gap-1">
            {CATEGORIES.map((cat) => {
              const CatIcon = CATEGORY_ICONS[cat];
              const isActive = cat === activeCategory;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-medium transition-colors"
                  style={{
                    background: isActive ? "var(--accent-subtle)" : "var(--bg-secondary)",
                    color: isActive ? "var(--accent)" : "var(--text-secondary)",
                    border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <CatIcon size={12} />
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toolset grid */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-[1200px]">
          {filtered.map((toolset) => {
            const CatIcon = CATEGORY_ICONS[toolset.category] || Wrench;
            return (
              <div
                key={toolset.id}
                className="rounded-xl p-5 transition-all duration-200 animate-slide-up"
                style={{
                  background: "var(--bg-secondary)",
                  border: toolset.enabled ? "1px solid var(--border)" : "1px solid var(--border)",
                  opacity: toolset.enabled ? 1 : 0.6,
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: toolset.enabled ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                        border: `1px solid ${toolset.enabled ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      <CatIcon
                        size={16}
                        style={{ color: toolset.enabled ? "var(--accent)" : "var(--text-muted)" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3
                        className="text-[13px] font-semibold truncate"
                        style={{ color: toolset.enabled ? "var(--text-primary)" : "var(--text-secondary)" }}
                      >
                        {toolset.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            background: "var(--bg-tertiary)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {toolset.category}
                        </span>
                        <span
                          className="text-[10px] font-mono font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {toolset.toolCount} tools
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle switch */}
                  <button
                    onClick={() => toggleToolset(toolset.id)}
                    className="w-10 h-5 rounded-full transition-colors relative flex-shrink-0"
                    style={{
                      background: toolset.enabled ? "var(--accent)" : "var(--bg-tertiary)",
                      border: toolset.enabled ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
                      style={{
                        transform: toolset.enabled ? "translateX(1.25rem)" : "translateX(0.125rem)",
                      }}
                    />
                  </button>
                </div>

                <p
                  className="text-[11.5px] leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {toolset.description}
                </p>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-20 animate-fade-in">
            <div className="text-center">
              <Search size={36} style={{ color: "var(--text-muted)", opacity: 0.3 }} className="mx-auto mb-3" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                No toolsets match &quot;{search}&quot;
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Restart notice */}
      <div
        className="px-8 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <Info size={13} style={{ color: "var(--warning)" }} />
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Toolset changes require an agent restart to take effect.
        </p>
        <div className="flex-1" />
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: "rgba(245, 158, 11, 0.1)", color: "var(--warning)" }}
        >
          Restart required
        </span>
      </div>
    </div>
  );
}
