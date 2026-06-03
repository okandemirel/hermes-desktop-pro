# Hermes Desktop Pro — Implementation Plan

> **Goal:** Build a next-generation desktop app for Hermes Agent with OpenCode support,
> multi-provider chat, tabbed sessions, robust history, and multi-profile integration.

**Architecture:** Electron + React 19 + TypeScript + Tailwind CSS 4 + Vite.
Communicates with Hermes Agent via local API server (HTTP/SSE) or remote.
Reads `state.db` directly for session history using better-sqlite3.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, Tailwind CSS 4, Vite 7,
better-sqlite3, lucide-react, react-markdown, react-syntax-highlighter

---

## Phase 1: Project Scaffold & Core Infrastructure

### Task 1.1: Initialize project with electron-vite
- Create package.json with all deps
- Configure electron-vite, TypeScript, Tailwind
- Set up main/preload/renderer structure

### Task 1.2: IPC bridge & type-safe preload
- Define IPC channels (chat, config, sessions, profiles, providers)
- Implement contextBridge preload API
- Generate type-safe renderer hooks

### Task 1.3: Theme system & base UI components
- Dark/light theme with CSS variables
- Base components: Button, Input, Select, Dialog, Tabs, Sidebar
- Tailwind config with Hermes brand colors

### Task 1.4: Provider registry with OpenCode support
- Define provider types (OpenCode, OpenRouter, Anthropic, OpenAI, etc.)
- OpenCode provider with Zen/Go endpoints
- Provider capabilities (streaming, reasoning, vision, tool-use)

---

## Phase 2: Chat & Streaming Engine

### Task 2.1: SSE streaming client
- HTTP client with AbortController
- SSE parser with delta extraction
- Reasoning token extraction (DeepSeek, OpenAI o-series, OpenCode)
- Tool call progress parsing

### Task 2.2: Chat message renderer
- Markdown rendering with syntax highlighting
- Reasoning/thinking bubble (collapsible)
- Tool call inline display (collapsible)
- Tool result display
- Token usage footer

### Task 2.3: Tabbed chat interface
- Multiple concurrent chat sessions as tabs
- Each tab: independent provider, model, history
- Tab persistence across app restarts
- Drag-drop tab reordering

### Task 2.4: Slash commands
- `/new`, `/clear`, `/model`, `/provider`, `/profile`
- `/web`, `/image`, `/code`, `/shell`
- `/help`, `/usage`, `/status`
- Extensible command registry

---

## Phase 3: Chat History & Session Management

### Task 3.1: State.db reader
- Read session metadata (id, title, model, timestamps)
- Full-text search via FTS5
- Session list with date grouping

### Task 3.2: History message reconstruction
- Decode multimodal content (JSON-prefixed messages)
- Parse tool_calls JSON
- Extract reasoning from 3 provider-specific columns
- Build correct HistoryItem timeline:
  - user → assistant → tool_calls → tool_results → ...
- Attachments (images, file refs)

### Task 3.3: Session browser UI
- Search bar with FTS5
- Date-grouped session list
- Resume session (loads full history into chat)
- Delete/rename sessions
- Session preview snippets

---

## Phase 4: Multi-Provider System

### Task 4.1: Provider model discovery
- Fetch models from OpenCode API
- Fetch models from OpenRouter API
- Fetch models from Anthropic/OpenAI APIs
- Local/custom endpoint model discovery
- Model metadata (context length, pricing, capabilities)

### Task 4.2: Per-chat provider/model selector
- Provider dropdown in chat header
- Model dropdown filtered by provider
- API key management per provider
- Quick-switch between providers mid-conversation

### Task 4.3: Provider settings panel
- Add/remove providers
- Configure base URLs
- API key entry (stored in .env)
- Test connection button
- Credential pool management

---

## Phase 5: Profile System

### Task 5.1: Profile manager backend
- List profiles from ~/.hermes/profiles/
- Create/delete/rename profiles
- Clone profiles
- Active profile tracking

### Task 5.2: Multi-profile gateway management
- Start/stop per-profile API servers on unique ports
- Port allocation and collision detection
- Profile health monitoring (polling)
- Gateway log viewer per profile

### Task 5.3: Profile dashboard UI
- Profile cards with status indicators
- Quick profile switch
- Per-profile: model, sessions, memory, tools
- Multi-profile view: see all at once

### Task 5.4: Cross-profile integration
- Copy settings between profiles
- Unified session search across profiles
- Profile import/export

---

## Phase 6: Tools, Skills & Memory

### Task 6.1: Tools panel
- List available toolsets
- Enable/disable per profile
- Tool descriptions and requirements
- Quick-toggle switches

### Task 6.2: Skills browser
- List installed skills
- Install from registry
- Skill detail view
- Enable/disable skills

### Task 6.3: Memory viewer
- View memory entries
- User profile memory
- Memory capacity tracking
- Memory provider configuration

---

## Phase 7: Settings & Configuration

### Task 7.1: Settings panel
- Model defaults
- Terminal settings
- Gateway configuration
- Theme & display options
- Data & privacy

### Task 7.2: Gateway platform setup
- Telegram, Discord, Slack, etc.
- Platform-specific settings
- Connection testing
- Webhook management

### Task 7.3: Data management
- Backup config/sessions/skills
- Import from backup
- Debug report generation
- Log viewer

---

## Phase 8: Polish & Release

### Task 8.1: Installer & setup wizard
- First-run experience
- Provider selection wizard
- Hermes Agent installer (if not installed)
- Dependency checking

### Task 8.2: Auto-updater
- Check for updates
- Download and install
- Release notes display

### Task 8.3: Cross-platform packaging
- Windows (NSIS installer)
- macOS (DMG)
- Linux (AppImage, deb, rpm)

---

**Priority:** Phases 1-4 are MVP. Phases 5-8 are enhancements.
**Estimated effort:** ~80 tasks, ~200-300 files.
