# Hermes Desktop Pro

[English](README.md) · [简体中文](README.zh-CN.md) · [한국어](README.ko.md)

Hermes Desktop Pro は、Hermes agents のための macOS ファーストな独立デスクトップ・コマンドセンターです。チャット実行、複数プロファイルへの dispatch、モデル/プロバイダー管理、ツール、スキル、メモリ、スケジュール、cron jobs、カンバン、そして Hermes Office の空間ワークスペースを、ひとつのプレミアムなデスクトップアプリに統合します。

Hermes Office は Hermes Desktop Pro の内部に組み込まれています。別製品のシェルではなく、Hermes のアプリ identity、ナビゲーション、ビジュアルシステムを置き換えるものではありません。

![Hermes Desktop Pro chat and profile dispatch](docs/assets/screenshots/hermes-chat-dispatch.png)

## 概要

Hermes Desktop Pro は、複数の AI プロファイルとワークフローを 1 つのローカルデスクトップ画面から運用するためのアプリです。Electron はデスクトップ framework としてのみ使われ、製品名、bundle metadata、Dock/menu identity、パッケージ成果物は Hermes Desktop Pro として管理されます。

UI はマーケティングページではなく、日々の運用に使う workspace として設計されています。ダーク/ゴールドの Hermes visual system、コンパクトなデスクトップ controls、読みやすい panels、永続的な navigation により、chat、tools、models、providers、memory、schedules、cron jobs、kanban、Office を文脈を失わずに移動できます。

## 製品スクリーン

### Chat Command Center

Chat page は主要な実行サーフェスです。複数の open chats、close/new controls、provider/model selectors、inspector panels、quick actions、構造化された profile dispatch picker を備えています。

![Hermes multi-profile execution picker](docs/assets/screenshots/hermes-chat-dispatch.png)

### Tools Matrix

Tools と plugins は capability ごとにグループ化され、UI から toggle でき、agent configuration flow に反映されます。

![Hermes tools and plugins matrix](docs/assets/screenshots/hermes-tools-matrix.png)

### Provider Catalog

Providers では model count、capability tags、context windows、API key requirements、local/no-key provider status を確認できます。

![Hermes provider catalog](docs/assets/screenshots/hermes-provider-catalog.png)

### Model Dialogs

Model の作成と編集は、暗転した app background、明確な fields、action-focused controls を持つ centered modal dialogs で行います。

![Hermes model edit dialog](docs/assets/screenshots/hermes-model-dialog.png)

## 主な機能

- Chat switching、close controls、new chat creation、active-session loading を備えた multi-chat workspace。
- Chat composer からの real multi-profile execution: single、sequential、parallel、hybrid dispatch modes。
- 1 つの prompt を 1 profile、複数 profiles、または primary profile plus team に送れる profile-scoped commands。
- Prompt intake、context preparation、generation、tool activity、usage、completion、abort、error states を表示する agent run timeline。
- Activity、context、pinned information、model state、tool controls、memory のための inspector panels。
- Local environment key handling を含む provider/model catalog management。
- Grouped capability filters と enable/disable controls を持つ tools and plugin matrix。
- Profiles、skills、persona/soul、persistent memory、schedules、cron jobs、kanban operations。
- 同じ Hermes application shell 内に組み込まれた Hermes Office spatial command floor。

## 実行モデル

Hermes Desktop Pro は multi-profile execution を mock しません。Renderer は preload bridge 経由で Electron main process に dispatch request を送り、main process が選択された profiles を real chat execution path で実行し、status を UI に stream します。

対応する dispatch modes:

- `single`: 選択した 1 profile に prompt を送信。
- `sequential`: 選択した profiles を順番に実行。
- `parallel`: 選択した profiles を同時に実行。
- `hybrid`: primary profile を先に実行し、その後 selected team に dispatch。

UI は profile ごとの state を保持し、queued、running、completed、aborted、failed runs を静的な mockup ではなく実際の状態として表示します。

## アプリセクション

- `Chat`: direct prompts、agent runs、tool activity、multi-profile dispatch の command center。
- `Sessions`: session browsing と active-chat loading。
- `Profiles`: config、models、skills、memory、gateway state を持つ isolated Hermes workspaces。
- `Tools`: toolset availability、grouped filters、enable/disable controls。
- `Skills`: agents が利用できる reusable capabilities and workflows。
- `Soul` / `Persona`: agent の behavior、tone、principles。
- `Memory`: sessions をまたいで Hermes が recall できる persistent context。
- `Models`: saved model catalog と default model selection。
- `Providers`: provider catalog、API-key hints、context windows、local providers。
- `Gateway`: local communication and integration server controls。
- `Office`: embedded Hermes Office spatial command floor。
- `Schedules`: recurring scheduled work。
- `Cron Jobs`: profile-scoped cron registry、active/paused state、edit controls、profile grouping。
- `Kanban`: durable multi-agent task board。
- `Settings`: connection mode、network、providers、appearance、backup、diagnostics、runtime preferences。

## アーキテクチャ

Hermes Desktop Pro は Electron、React、TypeScript、Vite、Tailwind CSS、SQLite-backed local state を使用します。

- `src/main`: Electron main process、IPC handlers、local runtime orchestration、app windows、packaged identity、backend-facing execution。
- `src/preload`: renderer surfaces と main-process APIs の安全な bridge。
- `src/renderer`: React interface、visual system、chat workspace、pages、dialogs、timeline、inspector、Office container。
- `src/shared`: shared types、provider metadata、i18n helpers、URL helpers、cross-process contracts。
- `resources`: app icons と package resources。
- `build`: macOS entitlements と packaging support files。

User-facing identity は framework identity から分離されています。`package.json` は `productName: "Hermes Desktop Pro"` を使用し、package metadata は `com.hermes.desktop-pro`、app icon は Hermes asset set から取得されます。

## 要件

- パッケージ済み macOS build には macOS 11 以降。
- Node.js 22 以降を推奨。
- npm。
- Live chat と agent workflows には Hermes/OpenCode runtime access。

## 開発

依存関係をインストールします:

```bash
npm install
```

開発モードで desktop app を起動します:

```bash
npm run dev
```

通常の検証スイートを実行します:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## パッケージング

macOS package を build:

```bash
npm run build:mac
```

Apple Silicon のみ:

```bash
npm run build:mac:arm64
```

Intel のみ:

```bash
npm run build:mac:x64
```

その他の platform scripts は `npm run build:linux`、`npm run build:win`、`npm run build:all` で利用できます。

## Office

Hermes Office は Office page から start/stop します。Office view は Hermes Desktop Pro に embedded され、main Hermes navigation と app chrome を維持する必要があります。

Office が停止しているように見える場合は、まず Office controls から local Office runtime logs を確認し、その後同じ page から Office runtime を再起動してください。

## リリースチェックリスト

出荷前:

1. `npm run typecheck` を実行。
2. `npm run lint` を実行。
3. `npm test` を実行。
4. `npm run build` を実行。
5. 対象 platform を package。
6. Packaged app を開き、chat tabs、multi-profile dispatch、Activity inspector、model/provider dialogs、cron jobs、Office startup を手動確認。

## キーワード

Hermes Desktop Pro、AI desktop app、agent workspace、multi-agent execution、OpenCode desktop、Electron React app、macOS AI app、local AI command center、provider management、AI workflow automation、cron jobs、kanban、agent memory。
