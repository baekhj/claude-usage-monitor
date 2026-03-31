# Claude Usage Monitor

## 프로젝트 개요
- macOS 메뉴바 앱 (Electron)
- Claude Code 토큰 사용량 실시간 모니터링 (5H/7D 제한)
- GitHub: baekhj/claude-usage-monitor

## 릴리즈 프로세스

### 1. 코드 변경 커밋
```bash
git add <변경파일들>
git commit -m "변경 내용 요약"
```

### 2. package.json 버전 업데이트
- patch: 버그 수정, 소규모 개선 (1.3.0 → 1.3.1)
- minor: 기능 추가 (1.3.0 → 1.4.0)

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

## 개발 명령어
```bash
npm start          # 개발 실행 (Electron 바이너리 이름 이슈로 안 될 수 있음)
npm run build:dir  # .app만 빌드 (빠름, zip/dmg 없이)
npm run build:arm64 # arm64 + x64 전체 빌드
```
