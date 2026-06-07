# Hermes Desktop Pro

[English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Hermes Desktop Pro 是一个以 macOS 为优先的独立桌面指挥中心，用于管理 Hermes agents。它把聊天、模型与提供商管理、记忆、技能、工具、配置文件、网关控制、日程、看板，以及 Hermes Office 空间工作区整合到同一个原生桌面外壳中。

Hermes Office 是嵌入 Hermes Desktop Pro 内部的本地工作区。它不是独立产品外壳，也不应替代 Hermes 的应用身份、导航结构或视觉系统。

## 亮点

- 高级深色/金色 Hermes 视觉系统，并支持响应式桌面布局。
- 多聊天工作区，支持聊天切换、关闭控制和运行状态。
- Agent 运行时间线，展示提示词接收、上下文准备、生成、工具活动、用量、完成和中止/错误状态。
- Inspector 面板，覆盖上下文、活动、模型状态、工具控制和记忆。
- 提供商与模型目录管理，并支持本地环境密钥处理。
- 配置文件、技能、soul/persona、持久记忆、日程和看板操作。
- Hermes Office：嵌入应用内的本地空间指挥楼层。

## 要求

- 打包后的 macOS 构建需要 macOS 11 或更高版本。
- 推荐 Node.js 22 或更高版本。
- npm。
- 需要 Hermes/OpenCode runtime 访问权限以运行实时聊天和 agent 工作流。

## 开发

安装依赖：

```bash
npm install
```

以开发模式运行桌面应用：

```bash
npm run dev
```

运行常规验证套件：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 打包

构建 macOS 包：

```bash
npm run build:mac
```

仅构建 Apple Silicon：

```bash
npm run build:mac:arm64
```

仅构建 Intel：

```bash
npm run build:mac:x64
```

打包后的应用身份配置为：

- 应用名称：`Hermes Desktop Pro`
- App ID：`com.hermes.desktop-pro`
- macOS 图标：`resources/icon.icns`
- Linux 图标：`resources/icon.png`
- Windows 图标：`resources/icon.ico`

Electron 只是运行时框架。应用标题、Dock/菜单身份、bundle 元数据和打包产物都配置为 Hermes Desktop Pro。

## Office

Hermes Office 从 Office 页面内部启动和停止。Office 视图嵌入 Hermes Desktop Pro，并且必须保留主 Hermes 导航和应用 chrome。

如果 Office 看起来卡住，请先通过 Office 控件检查本地 Office runtime 日志，然后从同一页面重启 Office runtime。

## 仓库结构

- `src/main`：Electron 主进程、IPC handlers 和本地 runtime 编排。
- `src/preload`：用于 renderer 和 Office view 的安全 preload bridges。
- `src/renderer`：React 界面和视觉系统。
- `src/shared`：共享类型、providers、i18n，以及 URL/key helpers。
- `resources`：应用图标和打包资源。
- `build`：macOS entitlement 文件。

## 发布检查清单

发布前：

1. 运行 `npm run typecheck`。
2. 运行 `npm run lint`。
3. 运行 `npm test`。
4. 运行 `npm run build`。
5. 打包目标平台。
6. 打开打包后的应用，并手动检查聊天标签、Activity inspector、模型/提供商对话框，以及 Office 启动流程。
