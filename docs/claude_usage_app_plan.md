# Claude Usage Monitor
> macOS 메뉴바 + 데스크톱 대시보드 실시간 사용량 모니터링 앱

---

## 목표

Claude Code(터미널)의 토큰 사용량을 macOS 상태표시줄(메뉴바)과 데스크톱 대시보드에서 실시간으로 확인할 수 있는 앱 개발

---

## 기술 스택

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Electron** | macOS Tray API 내장, Node.js 기반으로 JSONL 파일 처리 용이 |
| UI | **HTML + CSS + Vanilla JS** | 별도 프레임워크 불필요한 단순 대시보드 |
| 데이터 | **로컬 JSONL 파일 파싱** | 외부 API 없이 로컬에서 완결 |
| 패키지 매니저 | **npm** | |
| 빌드/배포 | **electron-builder** | macOS .dmg 패키징 |

---

## 데이터 소스

Claude Code가 로컬에 자동 기록하는 JSONL 파일을 읽어서 집계

```
~/.claude/projects/**/*.jsonl
~/.config/claude/projects/**/*.jsonl   # 신규 버전 경로
```

### JSONL 레코드 구조 (주요 필드)

```json
{
  "timestamp": "2025-03-16T10:23:00.000Z",
  "model": "claude-sonnet-4-6",
  "costUSD": 0.0023,
  "message": {
    "usage": {
      "input_tokens": 1200,
      "output_tokens": 340,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 800
    }
  }
}
```

---

## 핵심 기능 정의

### 1. 메뉴바 (상태표시줄)
- 토큰 사용률 또는 남은 시간 요약 표시
- 예: `🤖 68% · 4h 12m`
- 30초마다 자동 갱신

### 2. 팝업 대시보드 (메뉴바 클릭 시)
- 현재 5시간 블록 사용량 / 잔여량
- 블록 초기화까지 남은 시간 (카운트다운)
- 오늘 누적 사용량 및 비용
- 주간 일별 사용량 바 차트

### 3. 메인 윈도우 (상세 보기)
- 일별 / 주별 / 월별 리포트
- 프로젝트별 사용량 breakdown
- 모델별 사용량 breakdown (Opus / Sonnet / Haiku)

---

## 프로젝트 폴더 구조

```
claude-usage-monitor/
├── package.json
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.js          # Electron 메인 프로세스 (Tray + Window 생성)
│   │   ├── tray.js           # 메뉴바 아이콘 및 팝업 관리
│   │   ├── watcher.js        # JSONL 파일 감시 (fs.watch)
│   │   └── parser.js         # JSONL 파싱 및 사용량 집계
│   ├── renderer/
│   │   ├── popup/
│   │   │   ├── popup.html    # 메뉴바 클릭 시 팝업 UI
│   │   │   ├── popup.css
│   │   │   └── popup.js
│   │   └── dashboard/
│   │       ├── index.html    # 메인 대시보드 윈도우
│   │       ├── dashboard.css
│   │       └── dashboard.js
│   └── shared/
│       ├── constants.js      # 모델별 토큰 가격, 5시간 블록 설정 등
│       └── utils.js          # 시간 포맷, 비용 계산 유틸
├── assets/
│   ├── tray-icon.png         # 메뉴바 아이콘 (16x16 @2x)
│   └── tray-icon-active.png
└── README.md
```

---

## 개발 단계 로드맵

### Phase 1 - 데이터 레이어 (parser.js, watcher.js)
- [ ] JSONL 파일 경로 자동 탐색 (`~/.claude` / `~/.config/claude`)
- [ ] JSONL 파싱 및 레코드 유효성 검사
- [ ] 5시간 블록 단위 집계 로직
- [ ] 일별 / 주별 집계 함수
- [ ] fs.watch로 파일 변경 감지 → 자동 갱신

### Phase 2 - 메인 프로세스 (main/index.js, tray.js)
- [ ] Electron Tray 아이콘 생성
- [ ] 메뉴바 텍스트 실시간 업데이트
- [ ] 팝업 BrowserWindow 생성 (메뉴바 아이콘 아래 위치)
- [ ] IPC 통신 설정 (main ↔ renderer)

### Phase 3 - 팝업 UI (renderer/popup)
- [ ] 현재 블록 진행률 바
- [ ] 초기화까지 카운트다운 타이머
- [ ] 오늘 사용량 / 비용 표시
- [ ] 주간 미니 바 차트

### Phase 4 - 대시보드 윈도우 (renderer/dashboard)
- [ ] 일별 사용량 테이블
- [ ] 주간 차트 (Canvas API 또는 Chart.js)
- [ ] 모델별 / 프로젝트별 breakdown

### Phase 5 - 마무리
- [ ] 자동 시작 설정 (macOS 로그인 시 자동 실행)
- [ ] 알림 설정 (잔여량 20% 이하 시 macOS 알림)
- [ ] electron-builder로 .dmg 패키징

---

## 환경 설정

### 사전 설치 필요
```bash
# Node.js 18+ 필요
node -v

# 프로젝트 초기화
mkdir claude-usage-monitor && cd claude-usage-monitor
npm init -y
npm install electron
npm install electron-builder --save-dev
```

### package.json 주요 설정
```json
{
  "name": "claude-usage-monitor",
  "version": "1.0.0",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder --mac"
  },
  "build": {
    "appId": "com.yourcompany.claude-usage-monitor",
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": "dmg"
    }
  }
}
```

---

## 핵심 로직 - 5시간 블록 계산

Claude Code는 **5시간 슬라이딩 윈도우** 기준으로 사용량을 초기화함

```js
// 현재 활성 블록의 시작 시간과 잔여 시간 계산
function getCurrentBlock(records) {
  const now = Date.now();
  const BLOCK_MS = 5 * 60 * 60 * 1000; // 5시간

  // 최근 5시간 이내 레코드만 필터
  const blockRecords = records.filter(r => {
    return (now - new Date(r.timestamp).getTime()) < BLOCK_MS;
  });

  // 블록 시작 시간 = 가장 오래된 레코드의 timestamp
  const blockStart = blockRecords.length > 0
    ? new Date(blockRecords[0].timestamp).getTime()
    : now;

  const blockEnd = blockStart + BLOCK_MS;
  const remainingMs = blockEnd - now;

  return {
    records: blockRecords,
    startTime: new Date(blockStart),
    endTime: new Date(blockEnd),
    remainingMs,
    remainingFormatted: formatDuration(remainingMs)
  };
}
```

---

## 참고 자료

- [Electron 공식 문서](https://www.electronjs.org/docs/latest)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [ccusage 소스코드 (JSONL 구조 참고)](https://github.com/ryoppippi/ccusage)
- [electron-builder 문서](https://www.electron.build/)
