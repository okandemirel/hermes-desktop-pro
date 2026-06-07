# Hermes Desktop Pro

[English](README.md) · [简体中文](README.zh-CN.md) · [한국어](README.ko.md)

Hermes Desktop Pro は、Hermes agents のための macOS ファーストな独立デスクトップ・コマンドセンターです。チャット、モデル/プロバイダー管理、メモリ、スキル、ツール、プロファイル、ゲートウェイ制御、スケジュール、カンバン、そして Hermes Office の空間ワークスペースを、ひとつのネイティブデスクトップシェルに統合します。

Hermes Office は Hermes Desktop Pro の内部に組み込まれたローカルワークスペースです。別製品のシェルではなく、Hermes のアプリ identity、ナビゲーション、ビジュアルシステムを置き換えるものではありません。

## ハイライト

- プレミアムなダーク/ゴールドの Hermes ビジュアルシステムと、レスポンシブなデスクトップレイアウト。
- チャット切り替え、クローズ操作、実行アクティビティ状態に対応したマルチチャットワークスペース。
- プロンプト受信、コンテキスト準備、生成、ツール活動、使用量、完了、中止/エラー状態を表示する agent run タイムライン。
- コンテキスト、アクティビティ、モデル状態、ツール制御、メモリを扱う Inspector パネル。
- ローカル環境キー処理を含むプロバイダー/モデルカタログ管理。
- プロファイル、スキル、soul/persona、永続メモリ、スケジュール、カンバン操作。
- アプリ内に組み込まれたローカル空間コマンドフロアとしての Hermes Office。

## 要件

- パッケージ済み macOS ビルドには macOS 11 以降が必要です。
- Node.js 22 以降を推奨します。
- npm。
- ライブチャットと agent ワークフローには Hermes/OpenCode runtime へのアクセスが必要です。

## 開発

依存関係をインストールします：

```bash
npm install
```

開発モードでデスクトップアプリを起動します：

```bash
npm run dev
```

通常の検証スイートを実行します：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## パッケージング

macOS パッケージをビルドします：

```bash
npm run build:mac
```

Apple Silicon のみをビルドします：

```bash
npm run build:mac:arm64
```

Intel のみをビルドします：

```bash
npm run build:mac:x64
```

パッケージ済みアプリの identity は次のように設定されています：

- アプリ名：`Hermes Desktop Pro`
- App ID：`com.hermes.desktop-pro`
- macOS アイコン：`resources/icon.icns`
- Linux アイコン：`resources/icon.png`
- Windows アイコン：`resources/icon.ico`

Electron は runtime framework にすぎません。アプリタイトル、Dock/メニュー identity、bundle メタデータ、パッケージ成果物は、製品を Hermes Desktop Pro として表示するよう設定されています。

## Office

Hermes Office は Office ページ内から開始および停止します。Office ビューは Hermes Desktop Pro に組み込まれており、メインの Hermes ナビゲーションとアプリ chrome を維持する必要があります。

Office が停止しているように見える場合は、まず Office コントロールからローカル Office runtime ログを確認し、その後同じページから Office runtime を再起動してください。

## リポジトリ構成

- `src/main`：Electron メインプロセス、IPC handlers、ローカル runtime orchestration。
- `src/preload`：renderer と Office view のための安全な preload bridges。
- `src/renderer`：React インターフェイスとビジュアルシステム。
- `src/shared`：共有型、providers、i18n、URL/key helpers。
- `resources`：アプリアイコンとパッケージリソース。
- `build`：macOS entitlement ファイル。

## リリースチェックリスト

出荷前：

1. `npm run typecheck` を実行します。
2. `npm run lint` を実行します。
3. `npm test` を実行します。
4. `npm run build` を実行します。
5. 対象プラットフォームをパッケージ化します。
6. パッケージ済みアプリを開き、チャットタブ、Activity inspector、モデル/プロバイダーダイアログ、Office 起動を手動で確認します。
