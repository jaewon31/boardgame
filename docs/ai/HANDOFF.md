# AI 작업 인계 (Claude Code ↔ Codex)

이 문서는 다음 작업자(Claude Code 또는 Codex)가 **이 문서와 `git status`만으로** 현재 상황을 이어받기 위한 단일 인계 기록이다. 공통 규칙은 [AGENTS.md](../../AGENTS.md), 장기 현황은 [PROJECT_STATUS](../PROJECT_STATUS.md)에 있다. 여기에는 "지금 진행 중인 것과 다음 할 일"만 두고, 상세 근거는 링크한다.

## 1. 기준점

갱신: 2026-11-22 (초대 링크 수정 후) KST · 작성: Claude Code

| 항목 | 값 |
| --- | --- |
| 작업본 | `C:\Users\jwseo\Desktop\boardgame` |
| 브랜치 / HEAD | `fix/multiplayer-stability` (로컬 전용, upstream 없음). 분기점 `a1505a2` = `codex/consolidate-friends-table` HEAD. 이 브랜치 커밋: `2e97126` 인계 문서, `9366e4a` CI 트리거, `27a9148` 지연 관측 로그, `df6fea3` 관측 정확도·roomRef HMAC 수정, 이어서 초대 링크 수정·본 문서 갱신. 최신 HEAD는 `git log -1`로 확인 |
| 이전 브랜치 | `codex/consolidate-friends-table` @ `a1505a2` — 그대로 보존, 이후 커밋 없음 |
| 미푸시 커밋 | `353723e`, `1b09bd1`, `29085e1`, `50ea5cd`, `e3d5992`, `903a7dd`, `a1505a2` + 이 브랜치의 커밋. 원격 어느 브랜치·태그에도 없음 |
| GitHub 원격 백업 | **보류**(사용자 결정 2026-11-22). 계획: 태그 `backup/consolidate-20261122`(→`a1505a2`), 브랜치 `codex/consolidate-friends-table`. force push 금지. push는 Pages·Railway 설정 확인 후 사용자 PC에서 실행 |
| 원격 (2026-11-22 `ls-remote`) | `main`=`a666688`(조상), `deploy/web-staging`=`codex/tempo-hand-history`=`595cd67`(분기, 앱 코드는 `353723e`와 동일). 로컬 `origin/*` 추적 ref는 오래됨(fetch 전) |
| 미커밋 변경 | 없음. 이전 미커밋 6개는 아래 C1·C2로 커밋 완료 |
| 백업 | `C:\Users\jwseo\Desktop\boardgame-backups\20261122-020217\` — `repo-all.bundle`(전체 ref), `uncommitted.patch`, `worktree/`(미커밋·미추적 파일 원본 + CLAUDE.md), `status.txt`, `HEAD.txt`, `branches.txt`. 검증: bundle verify, 클론 후 HEAD 일치, 패치 역적용 check, 파일별 바이트 비교 모두 통과. 무시 파일(.env.local, SQLite 등)은 백업에 포함하지 않음 |

## 2. 현재 상태와 진행 중 작업

- **완료**: AI 교대 개발 문서(`e3d5992`), C1 운영 환경 접근 정책(`903a7dd`, `AGENTS.md` 제목 계층·끝 줄바꿈만 정리), C2 기존 Railway·Supabase 재사용 계획(`a1505a2`, CI·env 예시·runbook·문서 링크, runbook 검증 결과는 "로컬 검증 미실행"). 이전 미커밋 6개는 모두 C1·C2에 원문대로 포함됨.
- **이 브랜치의 정리 커밋**: 본 문서 갱신, CI push 트리거에 `claude/**`·`fix/**`·`feat/**`·`refactor/**` 추가(기존 `main`, `codex/**` 유지, 검사 로직 변경 없음). CI 추가 전에는 `fix/**` push에 CI가 돌지 않았다.
- **미확인(읽기 전용 확인 예정, 설정 변경 금지)**:
  - Cloudflare Pages: Git 연동/Direct Upload, Production·Preview 브랜치 설정. 간접 증거: 브랜치 별칭 `codex-tempo-hand-history.friends-table-staging.pages.dev`가 200(운영과 같은 번들), `deploy-web-staging`·`main` 별칭은 404 → 비-production 브랜치 push가 공개 미리보기를 만들 가능성 높음. 태그 push 동작 미확인.
  - Railway: 연동 저장소·배포 브랜치·자동 배포 여부. 운영 서버는 `Cache-Control: no-store`와 Origin 차단이 있는 `89229f5` 이후 코드로 동작(`main`에는 없음) → main 자동 배포만으로 설명 안 됨. 실행 SHA 미확인.
  - 운영 서버 Origin: 2026-11-22 `friends-table-staging.pages.dev`는 허용, 미리보기 별칭 origin은 health·WSS 모두 차단. 11/18 runbook의 "Origin 차단 미적용" 관찰과 다름 → 그 사이 재배포 추정.
- **승인 대기/후속**: GitHub 백업 push, `GITHUB_WORKFLOW.md`의 `codex/기능명` 예시 정리, 끊긴 플레이어 처리 정책(3절 #4), 원격 push 시 CI 결과 확인, Codex의 AGENTS.md 실제 로딩 검증(사용량 한도로 2026-11-25 이후 가능).
- **완료: 멀티플레이 지연 관측**(`27a9148`, 보완 `df6fea3`). 게임 동작 변경 없음, 기본 꺼짐. 서버 `GAME_TIMING_LOG=1`, 클라이언트 `EXPO_PUBLIC_GAME_TIMING_LOG=1` 또는 localStorage `friends-table.diagnostics.game-timing`=`1`. 로그는 `handRef`(핸드 id 앞 8자)+revision으로 서버·클라이언트를 대조하고 단조 시계를 쓴다. `roomRef`는 프로세스별 키의 HMAC-SHA256. `df6fea3`에서 중복 room 수신(첫 수신 유지·중복 횟수 집계, 재연결·새 핸드에 초기화), 보드 프레임·보드 효과음 revision, 타이머 schedule/cancel/fire, 조기 종료 trace 정리를 고쳤다. **실제 운영·다인원 환경에서 로그를 수집한 적은 없다.**
- **완료(배포 미확인): 초대 링크 404**(3절 #1). `apps/mobile/public/_redirects`를 `/join/* /index.html 200` → `/join/* / 200`으로 변경, `scripts/build-pages.cjs` `checkPages`가 `/` 대상만 허용하고 `/index.html` 200 rewrite를 거부, `apps/mobile/test/pages.test.cjs` 회귀 테스트 추가, `docs/web-phase6-deployment-readiness.md` 설명 갱신. `404.html`(없는 자산의 진짜 404)은 유지. 앱 코드(초대 파싱·로그인/닉네임 후 입장·권한 검사)는 변경 없음. **Cloudflare에서 동작은 검증하지 않았다**(wrangler 설치 불가, 배포 금지). 확인에는 승인된 Preview 또는 운영 배포가 필요하며 Cloudflare 설정 변경은 필요 없다.
- **다음 작업 후보**: 초대 수정의 Preview 배포 확인(승인 필요) → 관측 로그로 4인 실측(#2·#3·#5) → #5 인증 캐시 설계.

## 3. 멀티플레이 안정화 — 확인된 결함과 원인 가설

"확인"은 재현 또는 코드로 직접 확인한 사실, "가설"은 미검증 추정이다. 코드 위치는 2026-11-22 HEAD `50ea5cd` 기준이며, 앱 코드는 `a1505a2`까지 바뀌지 않았다.

| # | 문제 | 확인된 사실 | 원인 가설 (미검증) | 다음 확인 |
| --- | --- | --- | --- | --- |
| 1 | 초대 링크 `/join/*` 404 | 스테이징 `GET /join/ABCD1234` → **404 재현**, `/` → 200, `/index.html` → 308 `/`, `_headers`는 적용됨 (2026-11-22). 같은 증상(404.html 존재 + `/index.html` 대상 200 rewrite → 404, 대상 `/`로 해결)이 외부 저장소에서 `wrangler pages dev`로 재현·수정된 사례 있음. **수정 커밋**: rewrite 대상 `/`로 변경 + 빌드 검사·테스트 | 원인 (a) pretty URL 정규화로 `/index.html` rewrite가 따라지지 않음 — 근거 강함, Cloudflare 실측 미검증. (b) 배포 SHA가 다름·(c) 출력 경로 다름은 `_headers` 적용 관찰로 가능성 낮음 | 승인 후 Preview 배포에서 `/join/<코드>` 200·새로고침·없는 `.js` 404 확인 |
| 2 | 플랍·턴·리버 공개 지연 | 일반 스트리트는 서버가 마지막 액션과 **같은 상태 갱신**에 보드를 넣음(`hand.ts` `advance`). 올인 런아웃은 의도된 스트리트당 2초, 리버 스퀴즈 최대 15초. 모든 WS 메시지가 처리 전 Supabase 인증을 직렬로 기다림(#5) | 체감 지연 = 마지막 액션의 Supabase 인증 RTT + 클라이언트 오디오 큐 대기(#3). 증상 자체는 사용자 보고이며 이번에 계측·재현하지 않음 | 서버 `ws_auth_completed.authMs`·`queueWaitMs` 진단 로그와 클라이언트 표시 시각 비교 |
| 3 | 효과음–카드 표시 동기화 | `cardPresentation.ts`/`useGameAudio.ts`/`PokerTable.tsx`: 카드 표시가 오디오 큐 재생 시작 콜백에 묶이고, 큐는 음원 완료와 최소 모션 시간을 모두 기다림([근거](../card-audio-sync.md), 당시 기준 b01e1fe) | 앞선 액션음이 쌓이면 카드 표시가 뒤로 밀림. 웹은 오디오 언락/디코딩 지연이 추가될 수 있음. 실기기 녹음·트레이스 없음 | 웹/네이티브 각각 큐 길이·재생 시작 시각 로깅 |
| 4 | 연결 끊긴 플레이어 차례 | `lobby.ts` `syncGame`: 끊긴 플레이어에게도 일반 턴 타이머(방 설정 `turnSeconds`, `hand.ts` 기본 30초) 그대로 적용, 만료 시 체크/폴드(`hand.ts` `timeout`). 단축 처리 없음. 예외: 복구 기간 후 끊긴 플레이어의 리버 스퀴즈만 건너뜀. 좌석은 재접속 기한(`expiresAt`)까지 유지 | 재접속 기한 동안 매 스트리트·매 핸드 전체 턴 시간을 기다리게 됨. 다음 핸드 자동 제외(sit-out) 여부는 미확인 | 원하는 정책(즉시 체크/폴드, 짧은 유예, sit-out) 사용자 결정 → 서버 테스트로 고정 |
| 5 | WS 메시지별 Supabase 인증 지연 | `lobby.ts` `handle`: ping 포함 **모든 메시지**가 `accountSession.ts`의 `current_account_session` RPC를 캐시 없이 호출(타임아웃 4초). 소켓별 큐가 직렬이라 대기가 누적됨 | 액션·ping 지연의 주요 원인. Supabase 5xx/429 시 `AUTH_UNAVAILABLE` | 단일 세션(loginId) 강제와 권한 검증을 유지하는 설계 필요(예: 검증된 토큰의 짧은 TTL 캐시, 입장 시 검증 + 주기적 재검증). 결정 기록 대상 |
| 6 | 재접속 안정성 | 4001 교체 경쟁 상태는 `29085e1`에서 수정, 서버 188/188 통과([조사](../multiplayer-stability-investigation.md)). 클라이언트 heartbeat 5초/timeout 15초(`RoomClient.ts`). 서버 재시작 시 `nextHandAt`은 checkpoint에 저장 안 됨(PROJECT_STATUS) | 인증 직렬 대기(#5)로 pong이 늦어져 클라이언트가 불필요하게 재연결. 모바일 background/네트워크 전환. 실기기·운영 네트워크 미검증 | #5 수정 후 재측정, 실기기 background/복귀 시나리오 |
| 7 | 게임 테이블 UI/UX 개선 | 구체 결함 목록 없음. 기존 검토 자료: [UI 리뷰](../mobile-poker-ui-review.md), [P1](../p1-input-layout-report.md), [P2](../p2-ui-friend-comparison-report.md) | — | 사용자에게 우선 개선 항목을 받아 범위 확정 |

권장 순서: #5(다른 항목의 공통 원인 후보) → #2·#3 계측 → #4 정책 결정 → #1 배포 확인 → #6 재측정 → #7.

## 4. 다음 작업자에게

1. `git status --short --branch`로 1절 기준점(브랜치 `fix/multiplayer-stability`, 미커밋 없음)과 달라진 점을 먼저 확인한다.
2. 2절 "다음 작업 후보"부터 시작한다. 게임 규칙·프로토콜을 바꾸는 수정은 관측 결과와 사용자 승인 후에 한다.
3. push·Cloudflare/Railway 설정 변경·배포·DB 변경은 하지 않는다. 원격 설정은 읽기 전용 확인만 허용된다.
4. 상대 AI의 이전 변경은 이 문서의 서술을 믿지 말고 diff와 테스트로 독립 검증한다.

## 5. 인계 기록 양식

작업 종료 시 1·2절을 갱신하고 아래 항목을 한 블록으로 남긴다. 이전 기록은 최근 3개만 유지하고 나머지는 git 이력으로 대신한다.

```
### YYYY-MM-DD HH:MM KST · 작성자(Claude Code|Codex) · 역할(구현|검수)
- 브랜치/HEAD/dirty:
- 한 일 (변경 파일):
- 실행한 테스트와 결과 (명령 · 통과/실패 수):
- 미실행·실패·미검증:
- 검수 요청 사항 (상대 AI가 확인할 지점):
- 승인 대기:
```

### 2026-11-22 · Claude Code(클라우드 세션) · 구현(초대 링크 404)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `df6fea3` 다음 커밋 / 커밋 후 clean
- 한 일: `_redirects` 대상 `/`, `build-pages.cjs` 검사 강화, `pages.test.cjs` 회귀 테스트, `web-phase6-deployment-readiness.md`·본 문서 갱신. 앞서 `27a9148`(지연 관측), `df6fea3`(관측 정확도·HMAC) 커밋
- 테스트: tsc 3개 패키지 통과, 서버 `node --test` 204/204, 모바일 50/50, `node scripts/build-pages.cjs`(더미 공개 설정, 배포 없음) 성공·22개 파일 검사 통과. 로컬 HTTP 서버(규칙 단순 적용)로 `/`·`/join/AB3D5FGH`(새로고침 포함)·소문자·형식만 맞는 코드 → index.html 200, 없는 `/nope.js` → 404.html 404, 번들에 `/join/` 파서 포함
- 미검증: Cloudflare Pages 실제 동작(로컬 HTTP는 Cloudflare 동작의 증명이 아님), 브라우저에서 로그인·닉네임 후 입장 흐름 E2E(코드 검토만: 초대 코드는 메모리에 보관되어 익명 로그인·닉네임 설정 후 입장, 같은 방은 복귀, 다른 방은 퇴장 확인, 잘못된 코드는 앱 내 Alert), 존재하지 않는 방 코드의 서버 오류 표시
- 검수 요청: `checkPages` 정규식이 의도한 형식만 통과시키는지, 쿼리·해시가 붙은 초대 URL 거부(B-10) 유지가 맞는지
- 승인 대기: Preview 배포로 초대 링크 확인, GitHub 백업 push

### 2026-11-22 02:50 KST · Claude Code(클라우드 세션) · 구현(문서·CI)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / 분기점 `a1505a2` / 커밋 후 clean 예정
- 한 일: 사용자 승인으로 브랜치 생성·전환, 본 문서 1·2·4절 갱신, CI push 트리거 확장(`.github/workflows/check.yml`, `server-image.yml`)
- 테스트: 제품 코드 변경 없음 → 제품 테스트 미실행. YAML 구조·트리거 diff, `git diff --check` 확인
- 미검증: 원격 CI 실제 실행(push 보류), Pages·Railway 설정, Codex의 AGENTS.md 실제 로딩
- 검수 요청: CI 트리거 패턴이 의도대로인지, 2절 미확인 항목 서술이 과장되지 않았는지
- 승인 대기: GitHub 백업 push, 지연 관측 작업 범위

### 2026-11-22 02:20 KST · Claude Code(클라우드 세션) · 구현(문서)
- 브랜치/HEAD/dirty: `codex/consolidate-friends-table` / `50ea5cd` / dirty(1절 기존 변경 + 협업 문서 5개 + `.claude-write-test` 빈 파일)
- 한 일: 승인된 협업 문서 4개 최소 수정, 본 문서 2절 갱신. 쓰기 가능 여부 확인 중 빈 파일 `.claude-write-test`를 실수로 만듦(삭제 권한 없음 → 사용자 확인 후 삭제)
- 테스트: 코드 변경 없음 → 제품 테스트 미실행. 문서 링크 대상 존재 확인
- 미검증: Codex 실제 AGENTS.md 로딩
- 검수 요청: AGENTS.md 신규 섹션이 기존 규칙과 충돌하지 않는지, DEVELOPMENT_WORKFLOW 링크 경로
- 승인 대기: 협업 문서 커밋(AGENTS.md는 부분 스테이징), `fix/multiplayer-stability` 생성
