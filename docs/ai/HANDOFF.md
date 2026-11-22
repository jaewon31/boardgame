# AI 작업 인계 (Claude Code ↔ Codex)

이 문서는 다음 작업자(Claude Code 또는 Codex)가 **이 문서와 `git status`만으로** 현재 상황을 이어받기 위한 단일 인계 기록이다. 공통 규칙은 [AGENTS.md](../../AGENTS.md), 장기 현황은 [PROJECT_STATUS](../PROJECT_STATUS.md)에 있다. 여기에는 "지금 진행 중인 것과 다음 할 일"만 두고, 상세 근거는 링크한다.

## 1. 기준점

갱신: 2026-11-22 (카드·효과음 분리 커밋 후) KST · 작성: Claude Code

| 항목 | 값 |
| --- | --- |
| 작업본 | `C:\Users\jwseo\Desktop\boardgame` |
| 브랜치 / HEAD | `fix/multiplayer-stability` (로컬 전용, upstream 없음). 분기점 `a1505a2` = `codex/consolidate-friends-table` HEAD. 이 브랜치 커밋: `2e97126` 인계 문서, `9366e4a` CI 트리거, `27a9148` 지연 관측 로그, `df6fea3` 관측 정확도·roomRef HMAC 수정, 이어서 초대 링크 수정·본 문서 갱신. 최신 HEAD는 `git log -1`로 확인 |
| 이전 브랜치 | `codex/consolidate-friends-table` @ `a1505a2` — 그대로 보존, 이후 커밋 없음 |
| 미푸시 커밋 | `353723e`, `1b09bd1`, `29085e1`, `50ea5cd`, `e3d5992`, `903a7dd`, `a1505a2` + 이 브랜치의 커밋. 원격 어느 브랜치·태그에도 없음 |
| GitHub 원격 백업 | **보류**(사용자 결정 2026-11-22). 계획: 태그 `backup/consolidate-20261122`(→`a1505a2`), 브랜치 `codex/consolidate-friends-table`. force push 금지. push는 Pages·Railway 설정 확인 후 사용자 PC에서 실행 |
| 원격 (2026-11-22 `ls-remote`) | `main`=`a666688`(조상), `deploy/web-staging`=`codex/tempo-hand-history`=`595cd67`(분기, 앱 코드는 `353723e`와 동일). 로컬 `origin/*` 추적 ref는 오래됨(fetch 전) |
| 미커밋 변경 | 없음. 카드·효과음 분리는 사용자 승인으로 `21c7297` 커밋, 이어서 본 문서 기록 커밋. push 안 함 |
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
- **완료(`21c7297`, 실기기·브라우저 미검증): 카드 공개와 효과음 큐 분리**(3절 #2·#3, 사용자 승인 범위 1번). 카드는 상태 수신 즉시 공개(플랍 3장 한 단위), 효과음은 lane별 비차단·최신 우선·500ms 초과 생략, 결과음은 순서 유지. 설계는 [card-audio-sync](../card-audio-sync.md) 2026-11-22 개정. 서버·프로토콜·음원 변경 없음. 4인 서버 시뮬레이션에서 카드 공개 지연 p50 1.15s/max 5.28s → p50·max ≤0.3ms, 상태와 어긋난 액션음 162/252 → 0/324. **실제 브라우저·실기기 검증은 못 함**(웹 클라이언트가 운영 Supabase 익명 로그인을 요구).
- **브라우저 E2E 환경 조사(2026-11-22)**: 승인된 테스트 환경 없음. 별도 Staging 계획은 철회됨([runbook](../web-staging-runbook.md)), `friends-table-staging.pages.dev`는 운영 Railway·운영 Supabase를 사용하고 테스트 계정·게임 데이터 생성 E2E는 승인 대기([기존 서버 runbook](../web-existing-server-runbook.md) 53·121행). 새 커밋은 어디에도 배포되지 않음. 기존 로컬 브라우저 fixture(`scripts/test-p2-browser.cjs`)는 인증 모듈을 번들 단계에서 교체하는 UI 검사이며, 4인 게임 E2E로 확장하려면 서버 테스트 authorize까지 필요해 사용자 지시(인증 우회 코드 임의 추가 금지)에 따라 만들지 않았다.
- **다음 작업 후보**: (사용자 결정) 브라우저 검증 환경 선택 — ① 로컬 fixture E2E 승인, ② Preview 배포 + 운영 Supabase 테스트 계정 4개 생성 승인, ③ 별도 Supabase 재개 → 사용자 청취 평가(잘림·겹침) → #4 끊긴 플레이어 정책 → #5 인증 캐시 → 초대 수정 Preview 확인.

## 3. 멀티플레이 안정화 — 확인된 결함과 원인 가설

"확인"은 재현 또는 코드로 직접 확인한 사실, "가설"은 미검증 추정이다. 코드 위치는 2026-11-22 HEAD `50ea5cd` 기준이며, 앱 코드는 `a1505a2`까지 바뀌지 않았다.

| # | 문제 | 확인된 사실 | 원인 가설 (미검증) | 다음 확인 |
| --- | --- | --- | --- | --- |
| 1 | 초대 링크 `/join/*` 404 | 스테이징 `GET /join/ABCD1234` → **404 재현**, `/` → 200, `/index.html` → 308 `/`, `_headers`는 적용됨 (2026-11-22). 같은 증상(404.html 존재 + `/index.html` 대상 200 rewrite → 404, 대상 `/`로 해결)이 외부 저장소에서 `wrangler pages dev`로 재현·수정된 사례 있음. **수정 커밋**: rewrite 대상 `/`로 변경 + 빌드 검사·테스트 | 원인 (a) pretty URL 정규화로 `/index.html` rewrite가 따라지지 않음 — 근거 강함, Cloudflare 실측 미검증. (b) 배포 SHA가 다름·(c) 출력 경로 다름은 `_headers` 적용 관찰로 가능성 낮음 | 승인 후 Preview 배포에서 `/join/<코드>` 200·새로고침·없는 `.js` 404 확인 |
| 2 | 플랍·턴·리버 공개 지연 | **원인 확인·수정(미커밋)**. 4인 서버 시뮬레이션(로컬, 인증 스텁): 서버 액션 수신→브로드캐스트 p50 7.5ms. 클라이언트 수신→카드 공개가 p50 1.15s·max 5.28s(빠른 체크), 사운드 끄면 0ms → 원인은 카드가 효과음 큐 뒤에서 기다리는 구조(#3). 수정 후 p50·max ≤0.3ms(사운드 ON/OFF 동일). 인증 지연은 액션마다 1:1로 더해짐(주입 120–280ms 시 p50 195ms) → #5 | 운영 Supabase RTT 크기, 웹 오디오 언락·seek·background 탭 타이머 지연은 미측정 | 실제 브라우저/실기기에서 `client_card_reveal`·`client_board_frame` 확인 |
| 3 | 효과음–카드 표시 동기화 | **원인 확인·수정(미커밋)**. 수정 전: 단일 table lane이 음원 완료까지 기다려 액션음이 상태보다 최대 4.9s 늦게 시작, 체크 28·팟 4·승리 1개 누락, 상태와 어긋난 액션음 162/252. 수정 후(lane 분리·최신 우선·500ms 생략): 0/324, 누락 0, 팟 획득 24/24·승리 6/6 순서대로 재생 ([설계](../card-audio-sync.md)) | 빠른 연속 액션에서 앞선 액션음이 잘림(의도). 마지막 액션음과 카드음이 겹침. 실제 청취·실기기 미검증 | 실기기 청취로 잘림·겹침이 거슬리는지 확인 |
| 4 | 연결 끊긴 플레이어 차례 | `lobby.ts` `syncGame`: 끊긴 플레이어에게도 일반 턴 타이머(방 설정 `turnSeconds`, `hand.ts` 기본 30초) 그대로 적용, 만료 시 체크/폴드(`hand.ts` `timeout`). 단축 처리 없음. 예외: 복구 기간 후 끊긴 플레이어의 리버 스퀴즈만 건너뜀. 좌석은 재접속 기한(`expiresAt`)까지 유지 | 재접속 기한 동안 매 스트리트·매 핸드 전체 턴 시간을 기다리게 됨. 다음 핸드 자동 제외(sit-out) 여부는 미확인 | 원하는 정책(즉시 체크/폴드, 짧은 유예, sit-out) 사용자 결정 → 서버 테스트로 고정 |
| 5 | WS 메시지별 Supabase 인증 지연 | `lobby.ts` `handle`: ping 포함 **모든 메시지**가 `accountSession.ts`의 `current_account_session` RPC를 캐시 없이 호출(타임아웃 4초). 소켓별 큐가 직렬이라 대기가 누적됨 | 액션·ping 지연의 주요 원인. Supabase 5xx/429 시 `AUTH_UNAVAILABLE` | 단일 세션(loginId) 강제와 권한 검증을 유지하는 설계 필요(예: 검증된 토큰의 짧은 TTL 캐시, 입장 시 검증 + 주기적 재검증). 결정 기록 대상 |
| 6 | 재접속 안정성 | 4001 교체 경쟁 상태는 `29085e1`에서 수정, 서버 188/188 통과([조사](../multiplayer-stability-investigation.md)). 클라이언트 heartbeat 5초/timeout 15초(`RoomClient.ts`). 서버 재시작 시 `nextHandAt`은 checkpoint에 저장 안 됨(PROJECT_STATUS) | 인증 직렬 대기(#5)로 pong이 늦어져 클라이언트가 불필요하게 재연결. 모바일 background/네트워크 전환. 실기기·운영 네트워크 미검증 | #5 수정 후 재측정, 실기기 background/복귀 시나리오 |
| 7 | 게임 테이블 UI/UX 개선 | 구체 결함 목록 없음. 기존 검토 자료: [UI 리뷰](../mobile-poker-ui-review.md), [P1](../p1-input-layout-report.md), [P2](../p2-ui-friend-comparison-report.md) | — | 사용자에게 우선 개선 항목을 받아 범위 확정 |

권장 순서: #2·#3 실기기 확인·커밋 → #4 정책 결정 → #5 인증 캐시 → #1 배포 확인 → #6 재측정 → #7.

4인 서버 시뮬레이션 재현 방법(저장소 밖 임시 사본에서 실행, 스크립트는 저장소에 없음): 실제 `attachLobby`·`HoldemHand`·`SqliteStateStore` + 인증 스텁(지연 주입), 독립 WebSocket 클라이언트 4개가 실제 `SoundEvents`·`CardPresentation`·`AudioScheduler`·`GameTimingLog`와 실제 wav 길이의 가짜 플레이어를 사용. 6핸드, 3핸드 플랍에서 액터 연결 끊김(12초 후 복귀), 4핸드 턴 타이머 만료, 5핸드 올인 런아웃+리버 스퀴즈. 시계는 기기별 단조 시계만 사용. 렌더링(`client_board_frame`)은 측정 불가.

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

### 2026-11-22 19:10 KST · Claude Code(클라우드 세션) · 구현(커밋·검증 환경 조사)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `21c7297` + 본 문서 커밋 / clean
- 한 일: 카드·효과음 분리 12개 파일만 검토 후 커밋 `21c7297`(push 없음). Node 24 확보 시도, 브라우저 E2E 환경 조사, 본 문서 갱신
- 테스트: Node 22.23(사본) 서버 209/209, 모바일 50/50, tsc 3개 통과. **Node 24(사용자 Windows, v24.19.0, 사용자 실행 2026-11-22 19:29 보고)**: `npm run typecheck` mobile·server·shared 오류 출력 없음, `npm test` 서버 209/209(fail 0), `npm run test --workspace=@boardgame/mobile` 50/50(fail 0). 실행 시점 HEAD는 보고 로그에 표시되지 않음(직전 HEAD `1a976b8` 기준으로 추정)
- 미실행·미검증: 실제 브라우저 4인 E2E(승인된 환경 없음, 위 2절), 실제 청취(자동화로 들을 수 없음, 사람이 들어야 함), 화면 반영 시간
- 검수 요청: 커밋 diff가 승인 범위(카드·효과음 분리)만 포함하는지
- 승인 대기: 브라우저 검증 환경 ①~③ 선택, 청취 평가, #4·#5

### 2026-11-22 18:30 KST · Claude Code(클라우드 세션) · 구현(카드·효과음 분리)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `bb581ec` / dirty(아래 파일, 미커밋)
- 한 일 (변경 파일): `apps/mobile/src/services/cardPresentation.ts`(상태 수신 즉시 공개, 플랍 한 모션), `audioScheduler.ts`(효과음 전용, action/board/result/notice lane, 최신 우선, 500ms 생략, 결과음 400ms 양보), `soundCatalog.ts`(lane·maxWaitMs), `soundEvents.ts`(스트리트당 공개음 1회), `gameTiming.ts`(주석만). 테스트: `apps/server/test/{cardPresentation,audioScheduler,soundEvents,client-game-timing}.test.ts`, `apps/mobile/test/audio-hook.test.cjs`. 문서: `docs/card-audio-sync.md` 개정, 본 문서. 서버 코드·프로토콜·음원·UI 컴포넌트 변경 없음
- 기존 테스트 기대값 변경(삭제 없음): 이전 설계("카드가 액션음 뒤에 순차 공개", "빠른 CHECK/CALL 모두 순서대로 재생", "재생 중 소리는 끊지 않음")를 검증하던 13개 테스트(5개 파일)의 기대값을 승인된 새 동작 기준으로 바꿈. 새 회귀 테스트 5개 추가(빠른 연속 체크 중 턴 즉시 공개, 누적 없음, 대기 중 오래된 액션 생략, 결과음 순서, 스트리트 건너뛴 상태). 사운드 ON/OFF 동일 타이밍은 기존 음소거 테스트를 바꿔 검증
- 테스트: 저장소 밖 사본(Node 22.23, Windows workspace 링크를 Linux에서 못 읽어 복사)에서 서버 `node --test` 209/209(첫 실행에서 서버 전용 `game-timing.test.ts` 1건 실패 → 단독 3회·전체 재실행 통과, 해당 파일·서버 코드 미변경), 모바일 50/50, tsc shared·server·mobile 통과. 4인 시뮬레이션 수정 전후 각 4조건(체크 간격 0.3s/1s, 인증 지연 0/120–280ms 주입, 사운드 ON/OFF)
- 미실행·미검증: 실제 브라우저 E2E·실기기(웹 클라이언트가 Supabase 익명 로그인 필요, 운영 계정 생성 금지), Node 24 환경 테스트, 화면 반영 시간, 웹 오디오 언락·seek 지연, 실제 청취 품질(잘림·겹침)
- 검수 요청: 결과음 400ms 양보·500ms 생략 값이 적절한지, 올인음이 빠른 콜에 잘리는 것을 허용할지, `holePending`이 항상 false가 된 것(필드 유지)
- 승인 대기: 커밋, 브라우저/실기기 검증 환경(로컬 Supabase 또는 테스트 인증), #4·#5 후속

### 2026-11-22 · Claude Code(클라우드 세션) · 구현(초대 링크 404)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `df6fea3` 다음 커밋 / 커밋 후 clean
- 한 일: `_redirects` 대상 `/`, `build-pages.cjs` 검사 강화, `pages.test.cjs` 회귀 테스트, `web-phase6-deployment-readiness.md`·본 문서 갱신. 앞서 `27a9148`(지연 관측), `df6fea3`(관측 정확도·HMAC) 커밋
- 테스트: tsc 3개 패키지 통과, 서버 `node --test` 204/204, 모바일 50/50, `node scripts/build-pages.cjs`(더미 공개 설정, 배포 없음) 성공·22개 파일 검사 통과. 로컬 HTTP 서버(규칙 단순 적용)로 `/`·`/join/AB3D5FGH`(새로고침 포함)·소문자·형식만 맞는 코드 → index.html 200, 없는 `/nope.js` → 404.html 404, 번들에 `/join/` 파서 포함
- 미검증: Cloudflare Pages 실제 동작(로컬 HTTP는 Cloudflare 동작의 증명이 아님), 브라우저에서 로그인·닉네임 후 입장 흐름 E2E(코드 검토만: 초대 코드는 메모리에 보관되어 익명 로그인·닉네임 설정 후 입장, 같은 방은 복귀, 다른 방은 퇴장 확인, 잘못된 코드는 앱 내 Alert), 존재하지 않는 방 코드의 서버 오류 표시
- 검수 요청: `checkPages` 정규식이 의도한 형식만 통과시키는지, 쿼리·해시가 붙은 초대 URL 거부(B-10) 유지가 맞는지
- 승인 대기: Preview 배포로 초대 링크 확인, GitHub 백업 push
