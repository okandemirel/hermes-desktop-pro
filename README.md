# Hermes Desktop Pro

[简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Hermes Desktop Pro is a standalone macOS-first desktop command center for Hermes agents. It provides chat, model/provider management, memory, skills, tools, profiles, gateway controls, schedules, kanban, and the Hermes Office spatial workspace in one native desktop shell.

Hermes Office is an embedded local workspace inside Hermes Desktop Pro. It is not a separate product shell and it should not replace the Hermes app identity, navigation, or visual system.

## Highlights

- Premium dark/gold Hermes visual system with responsive desktop layouts.
- Multi-chat workspace with tab switching, close controls, and run activity state.
- Agent run timeline showing prompt intake, context preparation, generation, tool activity, usage, completion, and abort/error states.
- Inspector panels for context, activity, model state, tool controls, and memory.
- Provider and model catalog management with local environment key handling.
- Profiles, skills, soul/persona, persistent memory, schedules, and kanban operations.
- Hermes Office for a local spatial command floor embedded inside the app.

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

## Packaging

Build a macOS package:

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

The packaged app identity is configured as:

- App name: `Hermes Desktop Pro`
- App ID: `com.hermes.desktop-pro`
- macOS icon: `resources/icon.icns`
- Linux icon: `resources/icon.png`
- Windows icon: `resources/icon.ico`

Electron is the runtime framework only. The app title, Dock/menu identity, bundle metadata, and package artifacts are configured to present the product as Hermes Desktop Pro.

## Office

Hermes Office is started and stopped from inside the Office page. The Office view is embedded into Hermes Desktop Pro and must keep the main Hermes navigation and app chrome intact.

If Office appears stuck, verify the local Office runtime logs from the Office controls first, then restart the Office runtime from the same page.

## Repository Structure

- `src/main`: Electron main process, IPC handlers, local runtime orchestration.
- `src/preload`: Secure preload bridges for the renderer and Office view.
- `src/renderer`: React interface and visual system.
- `src/shared`: Shared types, providers, i18n, and URL/key helpers.
- `resources`: App icon and package resources.
- `build`: macOS entitlement files.

## Release Checklist

Before shipping:

1. Run `npm run typecheck`.
2. Run `npm run lint`.
3. Run `npm test`.
4. Run `npm run build`.
5. Package the target platform.
6. Open the packaged app and manually check chat tabs, Activity inspector, model/provider dialogs, and Office startup.
