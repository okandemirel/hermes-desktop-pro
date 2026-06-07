# Hermes Desktop Pro

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

Hermes Desktop Pro는 Hermes agents를 위한 macOS 우선 독립형 데스크톱 command center입니다. 채팅, 모델/프로바이더 관리, 메모리, 스킬, 도구, 프로필, 게이트웨이 제어, 스케줄, 칸반, Hermes Office 공간 워크스페이스를 하나의 네이티브 데스크톱 셸에 통합합니다.

Hermes Office는 Hermes Desktop Pro 내부에 포함된 로컬 워크스페이스입니다. 별도 제품 셸이 아니며 Hermes 앱 identity, 내비게이션, 비주얼 시스템을 대체해서는 안 됩니다.

## 주요 기능

- 프리미엄 다크/골드 Hermes 비주얼 시스템과 반응형 데스크톱 레이아웃.
- 채팅 전환, 닫기 컨트롤, 실행 activity 상태를 지원하는 멀티 채팅 워크스페이스.
- 프롬프트 수신, 컨텍스트 준비, 생성, 도구 activity, 사용량, 완료, 중단/오류 상태를 보여주는 agent run timeline.
- 컨텍스트, activity, 모델 상태, 도구 컨트롤, 메모리를 위한 Inspector 패널.
- 로컬 환경 키 처리를 포함한 프로바이더 및 모델 카탈로그 관리.
- 프로필, 스킬, soul/persona, 영구 메모리, 스케줄, 칸반 운영.
- 앱 내부에 포함된 로컬 공간 command floor인 Hermes Office.

## 요구 사항

- 패키징된 macOS 빌드는 macOS 11 이상이 필요합니다.
- Node.js 22 이상을 권장합니다.
- npm.
- 라이브 채팅과 agent 워크플로를 위해 Hermes/OpenCode runtime 접근 권한이 필요합니다.

## 개발

의존성을 설치합니다:

```bash
npm install
```

개발 모드로 데스크톱 앱을 실행합니다:

```bash
npm run dev
```

일반 검증 스위트를 실행합니다:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 패키징

macOS 패키지를 빌드합니다:

```bash
npm run build:mac
```

Apple Silicon만 빌드합니다:

```bash
npm run build:mac:arm64
```

Intel만 빌드합니다:

```bash
npm run build:mac:x64
```

패키징된 앱 identity는 다음과 같이 설정되어 있습니다:

- 앱 이름: `Hermes Desktop Pro`
- App ID: `com.hermes.desktop-pro`
- macOS 아이콘: `resources/icon.icns`
- Linux 아이콘: `resources/icon.png`
- Windows 아이콘: `resources/icon.ico`

Electron은 runtime framework일 뿐입니다. 앱 제목, Dock/메뉴 identity, bundle 메타데이터, 패키지 산출물은 제품이 Hermes Desktop Pro로 보이도록 구성되어 있습니다.

## Office

Hermes Office는 Office 페이지 내부에서 시작하고 중지합니다. Office 뷰는 Hermes Desktop Pro에 포함되며, 메인 Hermes 내비게이션과 앱 chrome을 유지해야 합니다.

Office가 멈춘 것처럼 보이면 먼저 Office 컨트롤에서 로컬 Office runtime 로그를 확인한 뒤, 같은 페이지에서 Office runtime을 다시 시작하세요.

## 저장소 구조

- `src/main`: Electron main process, IPC handlers, 로컬 runtime orchestration.
- `src/preload`: renderer와 Office view를 위한 안전한 preload bridges.
- `src/renderer`: React 인터페이스와 비주얼 시스템.
- `src/shared`: 공유 타입, providers, i18n, URL/key helpers.
- `resources`: 앱 아이콘과 패키지 리소스.
- `build`: macOS entitlement 파일.

## 릴리스 체크리스트

출시 전:

1. `npm run typecheck`를 실행합니다.
2. `npm run lint`를 실행합니다.
3. `npm test`를 실행합니다.
4. `npm run build`를 실행합니다.
5. 대상 플랫폼을 패키징합니다.
6. 패키징된 앱을 열고 채팅 탭, Activity inspector, 모델/프로바이더 대화상자, Office 시작을 수동으로 확인합니다.
