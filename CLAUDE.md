# Claude Usage Monitor

## 프로젝트 개요
- macOS/Windows 메뉴바(트레이) 앱 — Electron 기반
- Claude Code 토큰 사용량 실시간 모니터링 (5H 슬라이딩 윈도우 / 7D 합계)
- Pill 스타일 메뉴바 표시, 그룹별 색상 커스터마이징
- GitHub: baekhj/claude-usage-monitor
- 현재 버전: v1.4.3

## 아키텍처

### 데이터 흐름
1. **JSONL 파싱** (`parser.js`) — `~/.claude/projects` 하위 JSONL 파일에서 토큰 사용 기록 파싱
2. **API 조회** (`usage-api.js`) — macOS Keychain에서 OAuth 토큰 읽어 Anthropic API로 사용량 조회
3. **파일 감시** (`watcher.js`) — JSONL 파일 변경 감지하여 자동 갱신
4. **메뉴바 표시** (`index.js`) — 파이 차트 아이콘 + Pill 텍스트로 트레이에 표시
5. **팝업/대시보드** — 클릭 시 상세 사용량 팝업, 별도 대시보드 윈도우

### 파일 구조
```
src/
├── main/
│   ├── index.js       # 메인 프로세스 (Tray, BrowserWindow, IPC)
│   ├── parser.js      # JSONL 파일 파싱, 5H/7D 토큰 통계 계산
│   ├── preload.js     # renderer에 노출할 IPC 브릿지
│   ├── settings.js    # 설정 관리 (메뉴바 항목, pill 색상, 알림 등)
│   ├── updater.js     # GitHub 릴리즈 기반 자동 업데이트 체크
│   ├── usage-api.js   # Anthropic API 사용량 조회 (OAuth/Keychain)
│   └── watcher.js     # JSONL 파일 변경 감시 (fs.watch)
├── renderer/
│   ├── popup/         # 메뉴바 클릭 시 팝업 (popup.html/css/js)
│   └── dashboard/     # 상세 대시보드 윈도우 (index.html/css/js)
└── shared/
    ├── constants.js   # 상수 (5H 윈도우, 갱신 주기, 모델 가격)
    └── utils.js       # 공용 유틸리티 (포맷팅 함수)
```

### 핵심 설정값 (constants.js)
- `BLOCK_MS`: 5시간 슬라이딩 윈도우 (5 * 60 * 60 * 1000)
- `REFRESH_INTERVAL_MS`: 자동 갱신 30초
- `MODEL_PRICING`: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 가격 정보
- `JSONL_PATHS`: `~/.claude/projects`, `~/.config/claude/projects`

### 설정 기본값 (settings.js)
- 메뉴바 항목: `['icon5h', 'icon7d', 'usagePct', 'remaining', 'costToday']`
- API 갱신 주기: 300초 (5분)
- 알림 임계값: 5H → [50%, 75%, 90%], 7D → [75%, 90%]

## 개발 명령어
```bash
npm start            # 개발 실행 (Electron 바이너리 이름 이슈로 안 될 수 있음)
npm run dev          # 개발 모드 (--dev 플래그)
npm run build:dir    # .app만 빌드 (빠름, zip/dmg 없이)
npm run build:arm64  # arm64 + x64 전체 빌드 (배포용)
npm run build:win    # Windows 빌드
npm run build:all    # macOS + Windows 전체 빌드
```

## 릴리즈 프로세스

### 1. 코드 변경 커밋
```bash
git add <변경파일들>
git commit -m "변경 내용 요약"
```

### 2. package.json 버전 업데이트
- patch: 버그 수정, 소규모 개선 (1.4.3 → 1.4.4)
- minor: 기능 추가 (1.4.3 → 1.5.0)

### 3. 버전 커밋 & 푸시
```bash
git add package.json
git commit -m "v1.x.x: 변경 요약"
git push origin main
```

### 4. 빌드
```bash
npm run build:arm64
# 결과물:
#   dist/Claude Usage Monitor-{version}-arm64-mac.zip (Apple Silicon)
#   dist/Claude Usage Monitor-{version}-mac.zip (Intel)
# 참고: DMG 빌드는 libintl.8.dylib 누락으로 실패 → zip만 배포
```

### 5. GitHub 릴리즈 생성
```bash
gh release create v1.x.x \
  "dist/Claude Usage Monitor-{version}-arm64-mac.zip" \
  "dist/Claude Usage Monitor-{version}-mac.zip" \
  --title "v1.x.x" \
  --notes "릴리즈 노트 작성"
```

### 6. 로컬 앱 재시작
```bash
pkill -f "Claude Usage Monitor"; sleep 1
open "dist/mac-arm64/Claude Usage Monitor.app"
```

## 알려진 제약사항
- DMG 빌드: libintl.8.dylib 누락으로 실패 → zip만 배포
- `npm start`: Electron 바이너리 이름 이슈로 트레이 아이콘이 안 보일 수 있음
- OAuth 토큰: macOS Keychain 기반 → Windows에서는 다른 방식 필요
- 프레임워크 없이 순수 Electron + vanilla JS로 구성 (React/Vue 미사용)
