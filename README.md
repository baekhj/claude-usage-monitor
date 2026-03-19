# Claude Usage Monitor

> macOS-only menubar app that displays your Claude Code usage limits in real-time.

![Platform](https://img.shields.io/badge/platform-macOS%20only-lightgrey?logo=apple)
![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron)
![License](https://img.shields.io/badge/license-ISC-green)

<!-- 스크린샷은 직접 캡처 후 assets/ 폴더에 저장하세요 -->
<!-- ![Screenshot](assets/screenshot-popup.png) -->

---

## Features

- **Real-time usage monitoring** — 5-hour and 7-day utilization directly from Anthropic's API response headers
- **Menubar display** — Customizable: usage %, remaining time, cost, requests, active model (drag to reorder)
- **Popup dashboard** — Click menubar icon for quick overview with per-model breakdown
- **Full dashboard** — Separate window with project/model tables and weekly cost chart
- **Local JSONL parsing** — Token usage and cost estimation from `~/.claude/projects/` log files
- **Model breakdown** — Per-model stats (Opus / Sonnet / Haiku) for 5h block and today
- **Project breakdown** — Usage grouped by Claude Code project directory
- **Notifications** — macOS alerts at configurable usage thresholds (5h & 7d)
- **Configurable refresh** — API polling interval adjustable in seconds (default: 5 min)

## Platform

**macOS only.** This app depends on:
- macOS Keychain for reading Claude Code OAuth credentials (`security` CLI)
- macOS-specific Electron APIs (`app.dock.hide()`)
- JSONL log paths at `~/.claude/projects/` (macOS/Linux path format)

Windows and Linux are not supported.

## Prerequisites

- **macOS** 10.15 (Catalina) or later
- **Claude Code** CLI installed and **logged in** (Pro / Max / Team subscription)
- **Node.js** 18+ (for building from source only)

## How It Works

### Authentication

No login required in this app. It reads OAuth credentials automatically from macOS Keychain entry `Claude Code-credentials`, which is created when you log in to Claude Code CLI.

On first launch, macOS may ask to allow Keychain access — click "Always Allow".

### Usage Data (API)

Sends a minimal Haiku API request (`max_tokens: 1`, cost < $0.001) to `api.anthropic.com/v1/messages` with the `anthropic-beta: oauth-2025-04-20` header. The response headers contain official utilization data:

```
anthropic-ratelimit-unified-5h-utilization: 0.04
anthropic-ratelimit-unified-7d-utilization: 0.02
anthropic-ratelimit-unified-5h-reset: <unix-timestamp>
anthropic-ratelimit-unified-7d-reset: <unix-timestamp>
```

> **Note:** Each API poll consumes ~9 tokens on Haiku. At the default 5-minute interval, this is negligible.

### Token & Cost Data (Local)

Parses JSONL files from `~/.claude/projects/**/*.jsonl` (including subagent logs) to aggregate:
- Per-request token counts (input, output, cache creation, cache read)
- Cost estimation using model-specific pricing (Opus / Sonnet / Haiku)
- Breakdown by model, project, and time period (5h block, today, 7 days)

Cost figures are **estimates** based on public API pricing — actual billing may differ.

## Installation

### 사전 요구사항

- **Claude Code CLI**가 설치되어 있고 **로그인된 상태**여야 합니다 (Pro / Max / Team 구독)
- 로그인이 안 되어 있으면 터미널에서 `claude` 실행 후 로그인하세요
- 로그인하면 macOS Keychain에 인증 정보가 자동 저장됩니다

### Option 1: .app 파일 직접 전달받은 경우

1. `Claude Usage Monitor.app`을 `Applications` 폴더로 복사
2. 앱을 **우클릭(또는 Control+클릭) → "열기(Open)"** 클릭
3. "확인되지 않은 개발자" 경고 팝업에서 **"열기(Open)"** 클릭
4. Keychain 접근 팝업이 뜨면 → **"항상 허용(Always Allow)"** 클릭

> 이후 실행부터는 더블클릭으로 바로 열립니다. 터미널 명령은 필요 없습니다.
>
> 만약 "손상되었기 때문에 열 수 없습니다" 에러가 나오면:
> - **System Settings → Privacy & Security** → 하단 **"Open Anyway"** 클릭
> - 또는 터미널에서 `xattr -cr /Applications/Claude\ Usage\ Monitor.app` 실행

### Option 2: DMG

1. [Releases](../../releases)에서 `Claude-Usage-Monitor-x.x.x-arm64.dmg` 다운로드
2. DMG를 열고 `Claude Usage Monitor.app`을 `Applications` 폴더로 드래그
3. 위와 동일하게 우클릭 → "열기" → 경고 팝업에서 "열기" 클릭

### Option 2: From Source

```bash
git clone https://github.com/baekhj/claude-usage-monitor.git
cd claude-usage-monitor
npm install
npm start
```

개발 중이거나 직접 빌드하고 싶을 때 사용합니다.
Node.js 18+ 가 설치되어 있어야 합니다.

### Option 3: Build .app / DMG directly

```bash
git clone https://github.com/baekhj/claude-usage-monitor.git
cd claude-usage-monitor
npm install

# Apple Silicon (M1/M2/M3/M4)
npm run build:dir -- --arm64
open dist/mac-arm64/Claude\ Usage\ Monitor.app

# Intel Mac
npm run build:dir -- --x64
open dist/mac/Claude\ Usage\ Monitor.app
```

## Usage

앱을 실행하면 macOS 메뉴바에 사용량이 표시됩니다. (Dock 아이콘 없음, 메뉴바 전용 앱)

별도 로그인이 필요 없습니다 — Claude Code CLI에 로그인되어 있으면 자동으로 Keychain에서 인증 정보를 읽습니다.

- **Left-click** menubar → popup dashboard
- **Right-click** menubar → Refresh / Dashboard / Quit

### Settings (gear icon in popup)

**Menubar Items** — check/uncheck and drag to reorder:

| Item | Description |
|------|-------------|
| 5h Usage % | Current 5-hour utilization from API |
| 5h Remaining % | Remaining 5-hour capacity |
| 7d Usage % | Current 7-day utilization from API |
| Block Tokens | Total tokens in current 5h window (local) |
| Block Cost | Estimated cost in current 5h window (local) |
| Today Cost | Today's estimated total cost (local) |
| Block Remaining | Time until 5h window resets |
| Block Requests | Request count in current 5h window (local) |
| Today Requests | Today's total request count (local) |
| Active Model | Last used model name |

**API Refresh Interval** — polling frequency in seconds (minimum 10s, default 300s)

**Notifications** — usage threshold alerts:
- 5h thresholds: e.g., `50, 75, 90`
- 7d thresholds: e.g., `75, 90`
- Auto-reset when usage drops after a window reset

## Project Structure

```
claude-usage-monitor/
├── package.json
├── src/
│   ├── main/
│   │   ├── index.js          # Electron main (Tray, Popup, Dashboard, IPC, Notifications)
│   │   ├── parser.js         # JSONL parsing & usage aggregation
│   │   ├── watcher.js        # File change detection (fs.watch)
│   │   ├── usage-api.js      # Keychain OAuth + Messages API for utilization headers
│   │   ├── settings.js       # Persistent settings (JSON)
│   │   └── preload.js        # Context bridge for renderer
│   ├── renderer/
│   │   ├── popup/            # Menubar popup (HTML/CSS/JS)
│   │   └── dashboard/        # Full dashboard window (HTML/CSS/JS)
│   └── shared/
│       ├── constants.js      # Model pricing, refresh intervals, JSONL paths
│       └── utils.js          # Formatters, cost calculation
├── assets/
├── docs/
│   └── claude_usage_app_plan.md
└── README.md
```

## Privacy & Security

- Reads OAuth credentials **locally** from macOS Keychain — this app never stores or transmits your credentials elsewhere
- Communicates **only** with `api.anthropic.com` (Messages API)
- No telemetry, no analytics, no third-party services
- All JSONL data is read locally from `~/.claude/projects/`
- Settings stored locally in Electron's `userData` directory

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Electron 41 |
| UI | HTML + CSS + Vanilla JS |
| Data | Local JSONL parsing + Anthropic API response headers |
| Auth | macOS Keychain (automatic, read-only) |
| Settings | Local JSON file |

## Known Limitations

- **macOS only** — depends on macOS Keychain and `security` CLI
- **Requires Claude Code login** — no standalone API key support
- **Cost estimates are approximate** — based on public pricing, may not match actual billing
- **Launch at login** requires a signed/notarized build to work properly
- **Not code-signed** — macOS Gatekeeper may block first launch (bypass via System Settings → Privacy & Security)

## Credits

The approach of reading rate-limit utilization from Messages API response headers was learned from [claude-code-stats](https://github.com/dmelo/claude-code-stats).

## License

ISC
