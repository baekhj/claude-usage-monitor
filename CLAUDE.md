# Claude Usage Monitor

## 프로젝트 개요
- macOS/Windows 메뉴바(트레이) 앱 — Electron 기반
- Claude Code 토큰 사용량 실시간 모니터링 (5H 슬라이딩 윈도우 / 7D 합계)
- Pill 스타일 메뉴바 표시, 그룹별 색상 커스터마이징
- GitHub: baekhj/claude-usage-monitor
- 현재 버전: v1.6.1

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
│   ├── index.js          # 메인 프로세스 (Tray, BrowserWindow, IPC, Worker 관리)
│   ├── parser.js         # JSONL 파일 파싱, 5H/7D 토큰 통계 계산 (mtime 캐시)
│   ├── parser-worker.js  # Worker Thread — parser.js를 별도 스레드에서 실행
│   ├── preload.js        # renderer에 노출할 IPC 브릿지
│   ├── settings.js       # 설정 관리 (메뉴바 항목, pill 색상, 테마, 알림 등)
│   ├── updater.js        # GitHub 릴리즈 기반 자동 업데이트 체크
│   ├── usage-api.js      # Anthropic API 사용량 조회 (OAuth/Keychain)
│   └── watcher.js        # JSONL 파일 변경 감시 (fs.watch)
├── renderer/
│   ├── popup/            # 메뉴바 클릭 시 팝업 (popup.html/css/js, 다크/라이트 테마)
│   ├── dashboard/        # 상세 대시보드 윈도우 (index.html/css/js)
│   └── pill/             # 메뉴바 pill 렌더링 (offscreen BrowserWindow)
└── shared/
    ├── constants.js      # 상수 (5H 윈도우, 갱신 주기, 모델 가격)
    └── utils.js          # 공용 유틸리티 (포맷팅 함수)
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
- 테마: `dark` (dark / light 선택 가능)

### Pill 색상 (settings.js)
- **고정 색상** (`PILL_COLORS`): 불투명 solid 배경 + 흰색 텍스트, `{ bg, text, swatch }` 구조
- **동적 색상** (`DYNAMIC_COLORS`, `getDynamicColor()`): 사용률에 따라 자동 변경
  - 0~50%: 초록(#1a7a52) → 50~75%: 노랑(#a07610) → 75~90%: 주황(#c46a15) → 90%+: 빨강(#c43a31)
  - `menubar.dynamicColors: true` (기본값) — 5H/7D pill에 적용
  - OFF 시 기존 고정 색상 사용 (Plan은 항상 고정 색상)
- 색상: none, default(#5a5a5a), green, blue, purple, amber, red
- `{ bg, text, swatch }` 구조 (이전 `{ dark, light, swatch }` → v1.4.5에서 변경)

### 시간 포맷팅 (formatDuration / compactDuration)
- 24시간 이상: `4d2h30m` (일+시간+분)
- 24시간 미만: `3h15m` (시간+분)
- 1시간 미만: `45m` (분)
- **주의**: formatDuration이 4곳에 중복 존재 — `shared/utils.js`, `main/index.js(compactDuration)`, `renderer/popup/popup.js`, `renderer/dashboard/dashboard.js`

### 성능 최적화
- **mtime 캐시** (`parser.js`): 파일별 `statSync`로 mtime 비교, 변경 없으면 재파싱 건너뜀
- **Worker Thread** (`parser-worker.js`): JSONL 파싱을 별도 스레드에서 실행, 메인 프로세스 블로킹 제거
- 워커 실패 시 동기 `getStats()` fallback
- `latestStats` 캐시로 `getStatsPayload()`에서 동기 파싱 방지

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

### 0. CLAUDE.md 업데이트 (필수)
- 커밋/푸시/릴리즈 전에 반드시 CLAUDE.md에 변경 내용을 정리
- 버전, 아키텍처, 설정값, 제약사항 등 변경된 부분 반영
- 다른 세션에서도 현재 상태를 바로 파악할 수 있도록 유지

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
- macOS Light 모드 + 어두운 배경화면: `nativeTheme.shouldUseDarkColors`와 `systemPreferences.getEffectiveAppearance()` 모두 `light` 반환 → pill은 solid 배경으로 해결
- `build:dir`은 x64만 빌드. Apple Silicon 테스트 시 `npx electron-builder --mac --arm64 --dir` 사용
- 앱 재시작 시 `pkill -9` + `open -n` 필요 (`open`만 하면 기존 프로세스 재사용)

## 빌드 & 테스트 팁
- 빠른 테스트: `npx electron-builder --mac --arm64 --dir` → `pkill -9 -f "Claude Usage Monitor"; open -n dist/mac-arm64/Claude\ Usage\ Monitor.app`
- 릴리즈 빌드: `npm run build:arm64` (arm64 + x64 zip 모두 생성)

## 최근 변경 이력
- **v1.6.1**: 인앱 업데이터 버그 수정 — 다운로드 경로를 `os.tmpdir()` → `app.getPath('userData')/updates/` 로 변경 (macOS 주기적 tmp 청소로 install 시 zip 사라지던 문제). `installUpdate`에 파일 존재 검사 추가 → 누락 시 `UPDATE_FILE_MISSING` 에러, main이 `updateState`를 idle로 리셋해 Download 버튼 재표시
- **v1.6.0**: 사용률 기반 동적 pill 색상 (초록→노랑→주황→빨강), 설정에서 ON/OFF 가능
- **v1.5.0**: 팝업 다크/라이트 테마 선택, Worker Thread + mtime 캐시 성능 개선
- **v1.4.6**: 남은 시간 24시간 초과 시 일 단위 표시 (4d2h30m)
- **v1.4.5**: pill 배경을 불투명 solid 색상으로 변경, 가독성 개선
- **v1.4.4**: macOS 멀티 Space에서 팝업이 현재 Space에 표시되도록 수정
