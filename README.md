# Hermes Desktop Pro

[简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Hermes Desktop Pro is a standalone macOS-first command center for Hermes agents. It brings chat execution, multi-profile dispatch, model and provider management, tools, skills, memory, schedules, cron jobs, kanban, and the Hermes Office spatial workspace into one premium desktop application.

Hermes Office is embedded inside Hermes Desktop Pro. It is not a separate product shell and must not replace the Hermes app identity, navigation, or visual system.

![Hermes Desktop Pro chat and profile dispatch](docs/assets/screenshots/hermes-chat-dispatch.png)

## What It Is

Hermes Desktop Pro is built for people who operate several AI profiles and workflows from one local desktop surface. The app keeps the product identity independent from Electron and from embedded runtimes: Electron is only the desktop framework, while the app name, bundle metadata, Dock/menu identity, and packaged artifacts are Hermes Desktop Pro.

The interface is designed as an operational workspace rather than a marketing page. It uses a dark/gold Hermes visual system, compact desktop controls, readable panels, and persistent navigation so users can move between chat, tools, models, providers, memory, schedules, cron jobs, kanban, and Office without losing context.

## Product Screens

### Chat Command Center

The chat page is the primary execution surface. It supports multiple open chats, close/new controls, provider and model selectors, inspector panels, quick actions, and a structured profile dispatch picker.

![Hermes multi-profile execution picker](docs/assets/screenshots/hermes-chat-dispatch.png)

### Tools Matrix

Tools and plugins are grouped by capability, can be toggled from the UI, and are reflected back into the agent configuration flow.

![Hermes tools and plugins matrix](docs/assets/screenshots/hermes-tools-matrix.png)

### Provider Catalog

Providers show model counts, capability tags, context windows, API-key requirements, and local/no-key provider status.

![Hermes provider catalog](docs/assets/screenshots/hermes-provider-catalog.png)

### Model Dialogs

Model creation and editing use centered modal dialogs with a dimmed app background, clear fields, and action-focused controls.

![Hermes model edit dialog](docs/assets/screenshots/hermes-model-dialog.png)

## Core Capabilities

- Multi-chat workspace with tab switching, close controls, new chat creation, and active-session loading.
- Real multi-profile execution from the chat composer: single, sequential, parallel, and hybrid dispatch modes.
- Profile-scoped commands so one prompt can run against one profile, several profiles, or a primary profile plus a team.
- Agent run timeline for prompt intake, context preparation, generation, tool activity, usage, completion, abort, and error states.
- Inspector panels for activity, context, pinned information, model state, tool controls, and memory.
- Provider and model catalog management with local environment key handling.
- Tools and plugin matrix with grouped capability filters and enable/disable controls.
- Profiles, skills, persona/soul, persistent memory, schedules, cron jobs, and kanban operations.
- Hermes Office as an embedded local spatial command floor inside the same Hermes application shell.

## Execution Model

Hermes Desktop Pro does not fake multi-profile execution. The renderer sends a dispatch request through the preload bridge to the Electron main process. The main process runs the selected profiles through the real chat execution path and streams status back to the UI.

Supported dispatch modes:

- `single`: send the prompt to one selected profile.
- `sequential`: run selected profiles one by one.
- `parallel`: run selected profiles at the same time.
- `hybrid`: run the primary profile first, then dispatch to the selected team.

The UI keeps per-profile state so the user can see queued, running, completed, aborted, and failed runs without treating the output as a static mockup.

## App Sections

- `Chat`: command center for direct prompts, agent runs, tool activity, and multi-profile dispatch.
- `Sessions`: session browsing and active-chat loading.
- `Profiles`: isolated Hermes workspaces, each with its own config, models, skills, memory, and gateway state.
- `Tools`: toolset availability, grouped filters, and enable/disable controls.
- `Skills`: reusable capabilities and workflows available to agents.
- `Soul` / `Persona`: the agent's behavior, tone, and principles.
- `Memory`: persistent context that Hermes can recall across sessions.
- `Models`: saved model catalog and default model selection.
- `Providers`: provider catalog, API-key hints, context windows, and local providers.
- `Gateway`: local communication and integration server controls.
- `Office`: embedded Hermes Office spatial command floor.
- `Schedules`: recurring scheduled work.
- `Cron Jobs`: profile-scoped cron registry with active/paused state, edit controls, and grouping by profile.
- `Kanban`: durable multi-agent task board.
- `Settings`: connection mode, network, providers, appearance, backup, diagnostics, and runtime preferences.

## Architecture

Hermes Desktop Pro uses Electron, React, TypeScript, Vite, Tailwind CSS, and SQLite-backed local state.

- `src/main`: Electron main process, IPC handlers, local runtime orchestration, app windows, packaged identity, and backend-facing execution.
- `src/preload`: safe bridge between renderer surfaces and main-process APIs.
- `src/renderer`: React interface, visual system, chat workspace, pages, dialogs, timeline, inspector, and Office container.
- `src/shared`: shared types, provider metadata, i18n helpers, URL helpers, and cross-process contracts.
- `resources`: app icons and package resources.
- `build`: macOS entitlements and packaging support files.

The app keeps user-facing identity separate from framework identity. `package.json` uses `productName: "Hermes Desktop Pro"`, package metadata uses `com.hermes.desktop-pro`, and the app icon is sourced from the Hermes asset set.

## Requirements

- macOS 11 or newer for packaged macOS builds.
- Node.js 22 or newer is recommended.
- npm.
- Hermes/OpenCode runtime access for live chat and agent workflows.

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm run dev
```

Run the normal verification suite:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Open As A macOS App

From source, the fastest no-AI path is:

```bash
npm install
npm run start:mac
```

`start:mac` builds a real local application bundle and opens it through macOS. The generated app is placed under `dist/mac-arm64/Hermes Desktop Pro.app` on Apple Silicon, or `dist/mac/Hermes Desktop Pro.app` on Intel.

If you only want to build the `.app` bundle without opening it:

```bash
npm run build:mac:app
```

If macOS blocks a local unsigned build, right-click `Hermes Desktop Pro.app` and choose `Open` once. Public distribution should use a Developer ID certificate and notarization before shipping the DMG.

## Packaging

Build distributable macOS DMG and ZIP artifacts:

```bash
npm run build:mac
```

Build only Apple Silicon:

```bash
npm run build:mac:arm64
```

Build only Intel:

```bash
npm run build:mac:x64
```

Other platform scripts are available through `npm run build:linux`, `npm run build:win`, and `npm run build:all`.

## Update Button Requirements

The in-app update button is a GitHub Releases updater. It does not install from `main`, npm, or a local build folder. Hermes Desktop Pro uses `electron-updater`, configured for the `okandemirel/hermes-desktop-pro` GitHub release feed.

The button can install an update only when all of these conditions are true:

- The app is running as a packaged app. `npm run dev` and `electron-vite preview` are unsupported for updates. A local `build:mac:app` bundle is useful for manual testing, but it is not a public update source by itself.
- The installed app version is lower than the newest GitHub Release version.
- `package.json` has been bumped to that newer version before the release is published.
- A GitHub Release exists for the newer version in `okandemirel/hermes-desktop-pro`.
- The release contains the `electron-builder` update assets: `latest-mac.yml`, macOS `.dmg`, macOS `.zip`, and the generated `.blockmap` files.
- For public user machines, macOS artifacts are signed with a Developer ID Application certificate and notarized. The release workflow needs `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
- The user has network access to GitHub Releases.

Clicking the button checks the GitHub release feed, downloads a newer asset when one exists, then enables install/restart after the download reaches the `downloaded` state. If any requirement is missing, the button may show checking, error, unsupported, or up-to-date state, but it will not install anything.

There is no npm upload requirement for this updater. The public update source is GitHub Releases. See `docs/RELEASE.md` for the release flow.

## Office

Hermes Office is started and stopped from inside the Office page. The Office view is embedded into Hermes Desktop Pro and must keep the main Hermes navigation and app chrome intact.

If Office appears stuck, verify the local Office runtime logs from the Office controls first, then restart the Office runtime from the same page.

## Release Checklist

Before shipping:

1. Run `npm run typecheck`.
2. Run `npm run lint`.
3. Run `npm test`.
4. Run `npm run build`.
5. Package the target platform.
6. Open the packaged app and manually check chat tabs, multi-profile dispatch, Activity inspector, model/provider dialogs, cron jobs, and Office startup.

## Keywords

Hermes Desktop Pro, AI desktop app, agent workspace, multi-agent execution, OpenCode desktop, Electron React app, macOS AI app, local AI command center, provider management, AI workflow automation, cron jobs, kanban, agent memory.
