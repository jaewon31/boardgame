# AI 작업 인계 (Claude Code ↔ Codex)

이 문서는 다음 작업자(Claude Code 또는 Codex)가 **이 문서와 `git status`만으로** 현재 상황을 이어받기 위한 단일 인계 기록이다. 공통 규칙은 [AGENTS.md](../../AGENTS.md), 장기 현황은 [PROJECT_STATUS](../PROJECT_STATUS.md)에 있다. 여기에는 "지금 진행 중인 것과 다음 할 일"만 두고, 상세 근거는 링크한다.

## 1. 기준점

갱신: 2026-11-22 02:20 KST · 작성: Claude Code

| 항목 | 값 |
| --- | --- |
| 작업본 | `C:\Users\jwseo\Desktop\boardgame` |
| 브랜치 / HEAD | `codex/consolidate-friends-table` / `50ea5cd` (upstream 미설정) |
| 미푸시 커밋 | `353723e`, `1b09bd1`, `29085e1`, `50ea5cd` (원격 어느 브랜치에도 없음) |
| 원격 (2026-11-22 `ls-remote`) | `main`=`a666688`(HEAD의 조상), `deploy/web-staging`=`codex/tempo-hand-history`=`595cd67`(HEAD와 분기, HEAD에 없음). 로컬 `origin/*` 추적 ref는 fetch 전이라 오래됨 |
| 기존 미커밋 변경 (이 작업 이전부터 존재, 작성자 미상) | `M .github/workflows/check.yml`, `M .github/workflows/server-image.yml`, `M AGENTS.md`(운영 환경 접근 정책 추가), `M deploy/web-release.env.example`, `M docs/web-staging-runbook.md`, `?? docs/web-existing-server-runbook.md` — **임의 커밋·폐기 금지** |
| 백업 | `C:\Users\jwseo\Desktop\boardgame-backups\20261122-020217\` — `repo-all.bundle`(전체 ref), `uncommitted.patch`, `worktree/`(미커밋·미추적 파일 원본 + CLAUDE.md), `status.txt`, `HEAD.txt`, `branches.txt`. 검증: bundle verify, 클론 후 HEAD 일치, 패치 역적용 check, 파일별 바이트 비교 모두 통과. 무시 파일(.env.local, SQLite 등)은 백업에 포함하지 않음 |

## 2. 현재 작업: AI 교대 개발·검수 환경 구축

- 완료: Git 상태 확인, 외부 백업·검증, 본 문서 신규 작성.
- **2026-11-22 02:08 사용자 승인 후 적용**: `AGENTS.md` 제목 공통화 + "AI 교대 개발·검수" 섹션 추가(기존 미커밋 운영 정책 섹션과 떨어진 위치), `CLAUDE.md`에 Claude 전용 진입 안내 추가(`@AGENTS.md` 첫 줄 유지), `docs/DEVELOPMENT_WORKFLOW.md`의 Codex 전용 표현·`codex/<작업명>` 규칙을 공통·목적 기준 이름으로 수정, `docs/README.md` 색인에 본 문서 추가.
- 브랜치 규칙(승인): `codex/`·`claude/` 모두 허용, 신규는 목적 기준(`fix/`, `feat/`, `refactor/` 등), 기존 이름 변경 없음. `GITHUB_WORKFLOW.md`의 `codex/기능명` 예시는 승인 범위 밖이라 수정하지 않음(후속 정리 후보).
- 다음 안정화 브랜치 이름: `fix/multiplayer-stability`(**생성은 별도 승인 대기**, 아직 만들지 않음).
- 커밋 준비: 커밋 대상은 `AGENTS.md`(이번 섹션만), `CLAUDE.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/README.md`, `docs/ai/HANDOFF.md`. `AGENTS.md`의 기존 미커밋 운영 정책(+47줄)은 커밋에서 제외해야 한다. 스테이징·커밋·푸시·브랜치 전환은 하지 않았다.
- 검증 상태: Claude Code는 `CLAUDE.md`(`@AGENTS.md`) 경유로 AGENTS.md를 로드함을 확인. Codex는 CLI 0.170.0 설치·AGENTS.md 크기(기본 32KiB 한도 이내)·config 오버라이드 없음까지 정적 확인. **Codex 실제 로딩은 사용량 한도(2026-11-25 해제 예정)로 미검증.**

## 3. 멀티플레이 안정화 — 확인된 결함과 원인 가설

"확인"은 재현 또는 코드로 직접 확인한 사실, "가설"은 미검증 추정이다. 코드 위치는 2026-11-22 HEAD `50ea5cd` 기준.

| # | 문제 | 확인된 사실 | 원인 가설 (미검증) | 다음 확인 |
| --- | --- | --- | --- | --- |
| 1 | 초대 링크 `/join/*` 404 | 스테이징 `GET /join/ABCD1234` → **404 재현**, `/` → 200, `/index.html` → 308 `/` (2026-11-22). 로컬 `dist-web`에는 `_redirects`(`/join/* /index.html 200`)와 `404.html` 존재, `scripts/build-pages.cjs`가 이 형식을 강제 | (a) Pages의 pretty URL 정규화(`/index.html`→`/`) 때문에 재작성 대상 `/index.html`이 해석되지 않고 `404.html`로 떨어짐 (b) 배포된 빌드가 `_redirects` 추가 이전 SHA (c) 배포 출력 디렉터리가 `dist-web`이 아님 | Pages 배포 SHA·출력 경로 확인, `wrangler pages dev`로 로컬 재현, 대상 `/` 변형 비교 |
| 2 | 플랍·턴·리버 공개 지연 | 일반 스트리트는 서버가 마지막 액션과 **같은 상태 갱신**에 보드를 넣음(`hand.ts` `advance`). 올인 런아웃은 의도된 스트리트당 2초, 리버 스퀴즈 최대 15초. 모든 WS 메시지가 처리 전 Supabase 인증을 직렬로 기다림(#5) | 체감 지연 = 마지막 액션의 Supabase 인증 RTT + 클라이언트 오디오 큐 대기(#3). 증상 자체는 사용자 보고이며 이번에 계측·재현하지 않음 | 서버 `ws_auth_completed.authMs`·`queueWaitMs` 진단 로그와 클라이언트 표시 시각 비교 |
| 3 | 효과음–카드 표시 동기화 | `cardPresentation.ts`/`useGameAudio.ts`/`PokerTable.tsx`: 카드 표시가 오디오 큐 재생 시작 콜백에 묶이고, 큐는 음원 완료와 최소 모션 시간을 모두 기다림([근거](../card-audio-sync.md), 당시 기준 b01e1fe) | 앞선 액션음이 쌓이면 카드 표시가 뒤로 밀림. 웹은 오디오 언락/디코딩 지연이 추가될 수 있음. 실기기 녹음·트레이스 없음 | 웹/네이티브 각각 큐 길이·재생 시작 시각 로깅 |
| 4 | 연결 끊긴 플레이어 차례 | `lobby.ts` `syncGame`: 끊긴 플레이어에게도 일반 턴 타이머(방 설정 `turnSeconds`, `hand.ts` 기본 30초) 그대로 적용, 만료 시 체크/폴드(`hand.ts` `timeout`). 단축 처리 없음. 예외: 복구 기간 후 끊긴 플레이어의 리버 스퀴즈만 건너뜀. 좌석은 재접속 기한(`expiresAt`)까지 유지 | 재접속 기한 동안 매 스트리트·매 핸드 전체 턴 시간을 기다리게 됨. 다음 핸드 자동 제외(sit-out) 여부는 미확인 | 원하는 정책(즉시 체크/폴드, 짧은 유예, sit-out) 사용자 결정 → 서버 테스트로 고정 |
| 5 | WS 메시지별 Supabase 인증 지연 | `lobby.ts` `handle`: ping 포함 **모든 메시지**가 `accountSession.ts`의 `current_account_session` RPC를 캐시 없이 호출(타임아웃 4초). 소켓별 큐가 직렬이라 대기가 누적됨 | 액션·ping 지연의 주요 원인. Supabase 5xx/429 시 `AUTH_UNAVAILABLE` | 단일 세션(loginId) 강제와 권한 검증을 유지하는 설계 필요(예: 검증된 토큰의 짧은 TTL 캐시, 입장 시 검증 + 주기적 재검증). 결정 기록 대상 |
| 6 | 재접속 안정성 | 4001 교체 경쟁 상태는 `29085e1`에서 수정, 서버 188/188 통과([조사](../multiplayer-stability-investigation.md)). 클라이언트 heartbeat 5초/timeout 15초(`RoomClient.ts`). 서버 재시작 시 `nextHandAt`은 checkpoint에 저장 안 됨(PROJECT_STATUS) | 인증 직렬 대기(#5)로 pong이 늦어져 클라이언트가 불필요하게 재연결. 모바일 background/네트워크 전환. 실기기·운영 네트워크 미검증 | #5 수정 후 재측정, 실기기 background/복귀 시나리오 |
| 7 | 게임 테이블 UI/UX 개선 | 구체 결함 목록 없음. 기존 검토 자료: [UI 리뷰](../mobile-poker-ui-review.md), [P1](../p1-input-layout-report.md), [P2](../p2-ui-friend-comparison-report.md) | — | 사용자에게 우선 개선 항목을 받아 범위 확정 |

권장 순서: #5(다른 항목의 공통 원인 후보) → #2·#3 계측 → #4 정책 결정 → #1 배포 확인 → #6 재측정 → #7.

## 4. 다음 작업자에게

1. `git status --short`로 위 기준점과 달라진 점을 먼저 확인한다. 위 미커밋 변경이 그대로인지 대조한다.
2. 2절 승인 대기 항목이 승인됐는지 사용자에게 확인한다. 승인 전에는 기존 파일을 수정하지 않는다.
3. 멀티플레이 작업 시작 전 사용자에게 작업 브랜치(예: 확인된 SHA에서 새 브랜치)를 승인받는다. 현재 브랜치에는 타 작업 미커밋 변경이 있다.
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

### 2026-11-22 02:20 KST · Claude Code(클라우드 세션) · 구현(문서)
- 브랜치/HEAD/dirty: `codex/consolidate-friends-table` / `50ea5cd` / dirty(1절 기존 변경 + 협업 문서 5개 + `.claude-write-test` 빈 파일)
- 한 일: 승인된 협업 문서 4개 최소 수정, 본 문서 2절 갱신. 쓰기 가능 여부 확인 중 빈 파일 `.claude-write-test`를 실수로 만듦(삭제 권한 없음 → 사용자 확인 후 삭제)
- 테스트: 코드 변경 없음 → 제품 테스트 미실행. 문서 링크 대상 존재 확인
- 미검증: Codex 실제 AGENTS.md 로딩
- 검수 요청: AGENTS.md 신규 섹션이 기존 규칙과 충돌하지 않는지, DEVELOPMENT_WORKFLOW 링크 경로
- 승인 대기: 협업 문서 커밋(AGENTS.md는 부분 스테이징), `fix/multiplayer-stability` 생성

### 2026-11-22 · Claude Code · 구현(문서)
- 브랜치/HEAD/dirty: `codex/consolidate-friends-table` / `50ea5cd` / dirty(1절 기존 변경 + 본 문서)
- 한 일: 외부 백업·검증, `docs/ai/HANDOFF.md` 신규
- 테스트: 코드 변경 없음 → 제품 테스트 미실행. 백업 무결성 검증만 수행
- 미검증: Codex 실제 AGENTS.md 로딩(사용량 한도), 3절 가설 전부
- 검수 요청: 3절 "확인된 사실"의 코드 위치가 맞는지 Codex가 독립 확인
- 승인 대기: 2절 기존 파일 수정, 커밋, 브랜치 결정
