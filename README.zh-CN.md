# Hermes Desktop Pro

[English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Hermes Desktop Pro 是一个以 macOS 为优先的独立桌面指挥中心，用于运行和管理 Hermes agents。它把聊天执行、多配置文件 dispatch、模型与提供商管理、工具、技能、记忆、日程、cron jobs、看板，以及 Hermes Office 空间工作区整合到一个高级桌面应用中。

Hermes Office 嵌入在 Hermes Desktop Pro 内部。它不是独立产品外壳，也不应替代 Hermes 的应用身份、导航结构或视觉系统。

![Hermes Desktop Pro chat and profile dispatch](docs/assets/screenshots/hermes-chat-dispatch.png)

## 它是什么

Hermes Desktop Pro 面向需要从一个本地桌面界面运营多个 AI 配置文件和工作流的用户。应用将产品身份与 Electron 和嵌入式 runtime 分离：Electron 只是桌面 framework，应用名称、bundle metadata、Dock/menu identity 和打包产物都以 Hermes Desktop Pro 呈现。

界面不是营销页，而是面向日常操作的工作台。深色/金色 Hermes 视觉系统、紧凑桌面控件、清晰面板和持久导航，让用户可以在 chat、tools、models、providers、memory、schedules、cron jobs、kanban、Office 之间切换而不丢失上下文。

## 产品界面

### Chat Command Center

Chat 页面是主要执行界面。它支持多个打开的聊天、关闭/新建控件、provider 和 model selectors、inspector panels、quick actions，以及结构化的 profile dispatch picker。

![Hermes multi-profile execution picker](docs/assets/screenshots/hermes-chat-dispatch.png)

### Tools Matrix

Tools 和 plugins 按 capability 分组，可以从 UI 启用或禁用，并写回 agent configuration flow。

![Hermes tools and plugins matrix](docs/assets/screenshots/hermes-tools-matrix.png)

### Provider Catalog

Providers 展示 model counts、capability tags、context windows、API-key requirements，以及 local/no-key provider status。

![Hermes provider catalog](docs/assets/screenshots/hermes-provider-catalog.png)

### Model Dialogs

Model 创建和编辑使用居中的 modal dialogs，带有暗化的应用背景、清晰字段和面向操作的控件。

![Hermes model edit dialog](docs/assets/screenshots/hermes-model-dialog.png)

## 核心能力

- 多聊天工作区，支持 tab switching、close controls、new chat creation 和 active-session loading。
- 从 chat composer 发起真实 multi-profile execution：single、sequential、parallel、hybrid dispatch modes。
- Profile-scoped commands：一个 prompt 可以发送给一个 profile、多个 profiles，或 primary profile plus team。
- Agent run timeline：展示 prompt intake、context preparation、generation、tool activity、usage、completion、abort 和 error states。
- Inspector panels：覆盖 activity、context、pinned information、model state、tool controls 和 memory。
- Provider 和 model catalog management，并支持 local environment key handling。
- Tools and plugin matrix，带 grouped capability filters 和 enable/disable controls。
- Profiles、skills、persona/soul、persistent memory、schedules、cron jobs 和 kanban operations。
- Hermes Office spatial command floor 嵌入在同一个 Hermes application shell 中。

## 执行模型

Hermes Desktop Pro 不伪造 multi-profile execution。Renderer 通过 preload bridge 向 Electron main process 发送 dispatch request。Main process 使用真实 chat execution path 运行所选 profiles，并将状态 stream 回 UI。

支持的 dispatch modes:

- `single`: 将 prompt 发送给一个选中的 profile。
- `sequential`: 按顺序运行所选 profiles。
- `parallel`: 同时运行所选 profiles。
- `hybrid`: 先运行 primary profile，再 dispatch 给 selected team。

UI 保留每个 profile 的 state，让用户看到 queued、running、completed、aborted、failed runs，而不是静态 mockup。

## 应用模块

- `Chat`: direct prompts、agent runs、tool activity 和 multi-profile dispatch 的 command center。
- `Sessions`: session browsing 和 active-chat loading。
- `Profiles`: 隔离的 Hermes workspaces，每个都有自己的 config、models、skills、memory 和 gateway state。
- `Tools`: toolset availability、grouped filters 和 enable/disable controls。
- `Skills`: agents 可复用的 capabilities and workflows。
- `Soul` / `Persona`: agent 的 behavior、tone 和 principles。
- `Memory`: Hermes 可跨 sessions recall 的 persistent context。
- `Models`: saved model catalog 和 default model selection。
- `Providers`: provider catalog、API-key hints、context windows 和 local providers。
- `Gateway`: local communication and integration server controls。
- `Office`: embedded Hermes Office spatial command floor。
- `Schedules`: recurring scheduled work。
- `Cron Jobs`: profile-scoped cron registry，包含 active/paused state、edit controls，并按 profile 分组。
- `Kanban`: durable multi-agent task board。
- `Settings`: connection mode、network、providers、appearance、backup、diagnostics 和 runtime preferences。

## 架构

Hermes Desktop Pro 使用 Electron、React、TypeScript、Vite、Tailwind CSS，以及 SQLite-backed local state。

- `src/main`: Electron main process、IPC handlers、local runtime orchestration、app windows、packaged identity、backend-facing execution。
- `src/preload`: renderer surfaces 与 main-process APIs 之间的安全 bridge。
- `src/renderer`: React interface、visual system、chat workspace、pages、dialogs、timeline、inspector 和 Office container。
- `src/shared`: shared types、provider metadata、i18n helpers、URL helpers 和 cross-process contracts。
- `resources`: app icons 和 package resources。
- `build`: macOS entitlements 和 packaging support files。

应用将 user-facing identity 与 framework identity 分离。`package.json` 使用 `productName: "Hermes Desktop Pro"`，package metadata 使用 `com.hermes.desktop-pro`，app icon 来自 Hermes asset set。

## 要求

- 打包后的 macOS build 需要 macOS 11 或更高版本。
- 推荐 Node.js 22 或更高版本。
- npm。
- 实时聊天和 agent workflows 需要 Hermes/OpenCode runtime access。

## 开发

安装依赖:

```bash
npm install
```

以开发模式运行桌面应用:

```bash
npm run dev
```

运行常规验证套件:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 作为 macOS 应用打开

从源码运行时，最直接的 no-AI 路径是:

```bash
npm install
npm run start:mac
```

`start:mac` 会构建真正的本地应用 bundle，并通过 macOS 打开它。Apple Silicon 上的产物位于 `dist/mac-arm64/Hermes Desktop Pro.app`，Intel 上位于 `dist/mac/Hermes Desktop Pro.app`。

如果只想构建 `.app` bundle 而不打开:

```bash
npm run build:mac:app
```

如果 macOS 阻止本地未签名 build，请右键点击 `Hermes Desktop Pro.app` 并选择一次 `打开`。公开分发前应使用 Developer ID certificate 和 notarization 来签名 DMG。

## 打包

构建可分发的 macOS DMG 和 ZIP artifacts:

```bash
npm run build:mac
```

仅构建 Apple Silicon:

```bash
npm run build:mac:arm64
```

仅构建 Intel:

```bash
npm run build:mac:x64
```

其他平台脚本可通过 `npm run build:linux`、`npm run build:win` 和 `npm run build:all` 使用。

## 应用内更新按钮条件

应用内更新按钮使用 GitHub Releases。它不会从 `main`、npm 或本地 build 目录安装更新。Hermes Desktop Pro 使用 `electron-updater`，并配置为读取 `okandemirel/hermes-desktop-pro` 的 GitHub release feed。

只有满足以下全部条件时，更新按钮才能真正安装更新:

- 应用必须以 packaged app 方式运行。`npm run dev` 和 `electron-vite preview` 不支持更新。本地 `build:mac:app` bundle 可用于手动测试，但它本身不是公开更新源。
- 已安装应用的版本必须低于最新 GitHub Release 版本。
- 发布 release 前，`package.json` 必须已经提升到新的版本号。
- `okandemirel/hermes-desktop-pro` 中必须存在对应新版本的 GitHub Release。
- Release 必须包含 `electron-builder` 生成的更新 assets: `latest-mac.yml`、macOS `.dmg`、macOS `.zip` 和生成的 `.blockmap` 文件。
- 面向真实用户公开分发时，macOS artifacts 必须使用 Developer ID Application certificate 签名并完成 notarization。Release workflow 需要 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_API_KEY`、`APPLE_API_KEY_ID` 和 `APPLE_API_ISSUER`。
- 用户设备必须可以访问 GitHub Releases。

点击按钮后，Hermes 会检查 GitHub release feed；如果存在更高版本，就下载对应 asset；下载进入 `downloaded` 状态后才会启用 install/restart。任何条件缺失时，按钮可能显示 checking、error、unsupported 或 up-to-date，但不会安装任何内容。

此 updater 不需要上传 npm。公开更新源是 GitHub Releases。完整发布流程见 `docs/RELEASE.md`。

## Office

Hermes Office 从 Office 页面内部启动和停止。Office view 嵌入 Hermes Desktop Pro，并且必须保留主 Hermes navigation 和 app chrome。

如果 Office 看起来卡住，请先从 Office controls 检查 local Office runtime logs，然后从同一页面重启 Office runtime。

## 发布检查清单

发布前:

1. 运行 `npm run typecheck`。
2. 运行 `npm run lint`。
3. 运行 `npm test`。
4. 运行 `npm run build`。
5. 打包目标 platform。
6. 打开 packaged app，并手动检查 chat tabs、multi-profile dispatch、Activity inspector、model/provider dialogs、cron jobs 和 Office startup。

## 关键词

Hermes Desktop Pro、AI desktop app、agent workspace、multi-agent execution、OpenCode desktop、Electron React app、macOS AI app、local AI command center、provider management、AI workflow automation、cron jobs、kanban、agent memory。
