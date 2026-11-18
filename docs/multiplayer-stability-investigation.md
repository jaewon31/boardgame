# 멀티플레이 안정성 및 Web/PWA 배포 준비 조사

2026-11-18 KST. 저장소 C:/Users/jwseo/Desktop/boardgame.
브랜치 codex/consolidate-friends-table, HEAD 1b09bd1b1d36dcb39c81da89b1e9bd06dddc2fb4. 시작 시 clean, 종료 시 아래 수정만 미커밋. 기존 이력/브랜치 유지, commit/push/merge 없음.
환경: Windows, Node 24.19.0, npm 12.2.1, Chrome 157.0.8103.79. 기존 설치 의존성 사용; npm ci/업데이트 없음.

> 아래 최초 조사 기록의 미커밋/승인 대기 표현은 조사 당시 기준이다. 후속 검토와 로컬 커밋 승인은 문서 마지막 절을 따른다.

## 판정

간헐적 실패 재현 및 클라이언트 경쟁 상태 수정. 테스트 timeout 증가 없음. 로컬 자동 검증 통과와 실제 Staging 배포 승인은 별개다. 실제 URL/키의 유효성, 배포 SHA, 실기기 및 운영 JWT E2E는 미검증이다.

## 원인과 근거

대상: apps/server/test/multiplayer.test.ts의 same account/session reproduces 4001 replacement but foreground must not take the seat back. 수정 전 실패는 모두 마지막 명시적 refresh 후 양쪽 상태를 기다리는 기존 106번째 줄이었다.

1. 서버는 같은 account/session의 새 연결에 member.socket을 먼저 넘기고 기존 연결을 4001로 닫는다.
2. 기존 클라이언트의 heartbeat가 close 콜백보다 먼저 CLOSING(readyState=2)을 관찰했다.
3. checkConnection이 즉시 connectionLost(socket_not_open)를 호출해 generation을 변경하고 retry를 예약했다.
4. 2ms 뒤 도착한 4001 close는 stale=true로 무시됐다. replaced가 설정되지 않아 10ms retry 뒤 다시 currentRoom으로 좌석을 가져왔다.
5. 명시적 재시도를 한 클라이언트가 다시 4001을 받고 error가 되므로 테스트 조건은 영원히 맞지 않았다. 실제 사용자 연결 소유권 역전 버그이며 서버의 좌석 cleanup 경쟁이나 단순 polling 지연이 아니다.

실패 진단의 순서(UTC): copy 09:16:20.428 socket_not_open/readyState=2 → .430 4001 stale=true → .440 currentRoom 재접속 → 원래 클라이언트 .457 4001. 추가 진단 실행 1회도 실패했다. 원본은 ignored .qa-web/stability/diagnostic.log에 보존했다. 이후 빠른 테스트 heartbeat가 rate limit에 도달한 기록은 좌석 역전 이후 현상이며 최초 원인이 아니다.

서버 검토: currentRoom은 검증된 accountId/loginId로만 조회하며, 이전 socket의 close는 member.socket 일치 시에만 좌석을 오프라인 처리한다. 비동기 인증 전후 소켓 상태/소유권을 검사한다. 다른 계정 resume, 새 로그인 4003, private snapshot 및 전적 권한 회귀는 전체 서버 테스트로 재검증했다. 서버 구현은 변경하지 않았다.

## 최소 수정

- apps/mobile/src/services/RoomClient.ts: 비OPEN transport를 처음 관찰한 시각을 저장하고, 기존 heartbeatTimeoutMs 안에는 close 이벤트와 종료 코드를 기다린다. disconnect에서 초기화한다. 정상 close는 즉시 처리되며, close가 끝내 없으면 기존 예산 후 다음 heartbeat 검사에서 재접속한다(기본 예산 15초 + 검사 간격). foreground resynchronize도 비OPEN 소켓에서 이 경로를 사용한다.
- apps/server/test/heartbeat-diagnostics.test.ts: CLOSING/CLOSED × 4001/4003의 결정적 순서 테스트 4개와 close 미도착 복구 제한 테스트 1개 추가. 자동 refresh/resynchronize가 close 전후 세대를 바꾸거나 retry하지 않는지 확인. 기존 구현에서 신규 5개 모두 실패, 수정 후 전체 파일 10/10 PASS.
- apps/server/test/multiplayer.test.ts: 마지막 조건 실패 시 이미 정제된 client/server lifecycle 진단만 출력. 상태 snapshot, 패, JWT, 원본 account UUID, 닉네임 출력 없음.
- apps/mobile/.env.example: 누락된 Supabase 공개 변수와 Pages/native 환경 분리 설명 보완. 실제 환경파일과 Secrets는 열어 출력하거나 수정하지 않았다.
- docs/PROJECT_STATUS.md, docs/web-phase6-deployment-readiness.md, docs/security/npm-audit.md 및 이 보고서 갱신.

## 반복 실행 결과

회차별 독립 Node 프로세스, 각 단계 내부 순차 실행. 소요시간은 PowerShell Stopwatch의 프로세스 실행 wall time이며 npm overhead를 포함한다.

| 코드 단계 | 범위 | 실행 | 통과 | 실패 | 합계 초 |
| --- | --- | ---: | ---: | ---: | ---: |
| 수정 전 | isolated | 20 | 16 | 4 | 26.750 |
| 수정 전 | server | 5 | 4 | 1 | 29.518 |
| heartbeat 수정 후 | isolated | 20 | 20 | 0 | 10.602 |
| heartbeat 수정 후 | server | 5 | 5 | 0 | 28.466 |
| foreground 포함 최종 | isolated | 20 | 20 | 0 | 10.701 |
| foreground 포함 최종 | server | 5 | 5 | 0 | 28.559 |

수정 전 전체는 각 178개(실패 회차 177/178), 수정 후는 신규 회귀 5개를 포함해 각 183/183. 첫 수정 후와 최종 수정 후 각각 20+5회를 수행했으므로, 수정 후 합계 격리 40/40 및 전체 10/10회 PASS. 수정 전 격리 실패 회차 5, 8, 12, 16; 전체 실패 회차 1. 별도의 진단 재현 실패 1회는 표에 합산하지 않았다.

명령:

- node --test --test-name-pattern="same account/session reproduces 4001" apps/server/test/multiplayer.test.ts
- npm.cmd test
- node --test apps/server/test/heartbeat-diagnostics.test.ts

근거: .qa-web/stability/{repetitions,fixed-repetitions,final-repetitions}.json 및 단계/회차별 .log. 실패 로그는 삭제하지 않았다. 반복 실행기의 JWT 패턴 마스킹과 기존 logRecord allowlist를 사용했다. QA 폴더/번들/로그는 ignored이며 Git에 추가하지 않는다.

## 통합 검증

| 항목 | 결과 / 범위 |
| --- | --- |
| npm run typecheck | 모든 workspace PASS, 최종 코드 재검증 |
| npm test | 최종 183/183 × 5회 PASS |
| 모바일 workspace test | 50/50 PASS |
| export:web | PASS; EXPO_NO_DOTENV=1로 로컬 환경 제외 |
| check-web-release + checkPages | PASS, 기본 dist 22파일 |
| build:pages, 실제 설정 미주입 | 요구 변수 4개 오류로 실패 재현; 의도된 배포 guard |
| build:pages, 공개 테스트 fixture | production export 및 정적 22파일 검사 PASS; 최종 코드 재빌드 |
| export:mobile | Android/iOS Hermes JS·에셋 PASS; APK/IPA/서명/실기기 검증 아님 |
| P1 Playwright | Chrome IME/Enter/Backspace/프로필 갱신/revision/모달/가상 키보드 geometry PASS |
| P2 Playwright | 1366×768, 1920×1080, 375×812, 390×844, 430×932, 844×390; 2–6인/설정/본인·친구 전적/403/빈 응답 PASS |
| npm audit --omit=dev | 43개: high 37, moderate 6, critical 0; 서버 workspace 0 |

P1/P2는 기존 설치된 play-ui-refresh/.qa-web/node_modules를 이 저장소 ignored QA 폴더의 junction으로 재사용했다. 설치/의존성 변경은 없고 fixture 산출물은 이 저장소 .qa-web 아래에만 생성했다. 운영 인증/DB에 연결하지 않았다. 테스트용 Pages 빌드는 example.com 및 ci-placeholder Supabase 주소, 가짜 publishable 문자열만 프로세스에 주입했다. 이 산출물은 배포 불가이며 실제 설정으로 다시 빌드해야 한다.

중점 시나리오: 동일 계정 교체/foreground, stale close, 다른 계정 좌석 거부, 새 로그인, 생성/참가/퇴장/재생성, 게임 단절/복귀, 새 클라이언트의 currentRoom 복귀와 비공개 카드·칩·턴 복원, SQLite checkpoint, 친구 전적 관계·RPC fail-closed는 기존 자동 테스트 범위에서 PASS. 브라우저 새로고침의 실제 Supabase 세션/토큰 갱신과 여러 기기의 운영 E2E를 통과한 것으로 해석하지 않는다.

## 배포 전 필수 사항과 잔여 위험

1. 이 변경을 검토하고 승인된 commit/SHA를 정한다. 최신 웹과 네이티브 클라이언트에 수정이 포함돼야 하며 서버만 배포해서 해결되지 않는다.
2. 정확한 HTTPS 웹 origin, public WSS /lobby, 동일 프로젝트 Supabase URL/publishable key, 서버 WEB_ALLOWED_ORIGINS를 관리자와 대조한다. 설정 표는 [6단계 보완](web-phase6-deployment-readiness.md#2026-11-18-재검증-보완)에 있다. 스테이징 URL은 기존 문서에 있지만 현재 배포/설정 일치를 독립 확인하지 않았다.
3. 승인된 격리 Staging 및 테스트 계정으로 실제 JWT, refresh token 복구, 2~6인 및 새로고침/탭 교체/잠금/네트워크 전환/기한 만료를 확인한다. current_account_session은 쓰기를 유발할 수 있어 이번에는 원격 호출하지 않았다.
4. iPhone Safari/PWA와 Android Chrome/native에서 close 전달, 화면 잠금 복귀, OS IME·키보드·오디오를 확인한다. close 이벤트가 유실된 경우의 제한적 재접속은 남아 있고 유한 반복 검증은 모든 네트워크 상태의 증명이 아니다.
5. Pages edge의 초대 라우트/404/MIME/cache/TLS 및 실제 WSS Origin/CORS를 확인한다. GitHub Pages의 /repo/ 하위경로는 현재 설정으로 지원한다고 볼 수 없다.
6. [보안 우선순위](security/npm-audit.md)에 따라 별도 codex/security-dependencies 브랜치에서 호환 업데이트를 조사·검증한다. 이번에는 패키지 변경 없음.

미실행/승인 대상: 원격 배포, push/merge/commit, 실제 DB/RPC/마이그레이션, 환경변수/Secrets/인증 설정 변경, 기존 Volume 백업·재시작, 실제 테스트 계정/게임 데이터 생성. Docker 이미지 재빌드·실제 TLS/edge 및 실기기 검증은 이번 실행 범위 밖이다. Dockerfile의 server/shared production install과 서버 workspace audit 0건은 확인했으나 실행 중 원격 이미지 SBOM 일치를 증명하지 않았다.

## 회차별 소요시간

### 수정 전: isolated

| 회차 | 결과 | 초 |
| --- | --- | ---: |
| 1 | PASS | 0.554 |
| 2 | PASS | 0.563 |
| 3 | PASS | 0.574 |
| 4 | PASS | 0.523 |
| 5 | FAIL | 4.522 |
| 6 | PASS | 0.526 |
| 7 | PASS | 0.521 |
| 8 | FAIL | 4.531 |
| 9 | PASS | 0.541 |
| 10 | PASS | 0.537 |
| 11 | PASS | 0.540 |
| 12 | FAIL | 4.525 |
| 13 | PASS | 0.545 |
| 14 | PASS | 0.555 |
| 15 | PASS | 0.561 |
| 16 | FAIL | 4.532 |
| 17 | PASS | 0.532 |
| 18 | PASS | 0.517 |
| 19 | PASS | 0.532 |
| 20 | PASS | 0.519 |

### 수정 전: server

| 회차 | 결과 | 초 |
| --- | --- | ---: |
| 1 | FAIL | 6.662 |
| 2 | PASS | 5.746 |
| 3 | PASS | 5.710 |
| 4 | PASS | 5.658 |
| 5 | PASS | 5.742 |

### heartbeat 수정 후: isolated

| 회차 | 결과 | 초 |
| --- | --- | ---: |
| 1 | PASS | 0.531 |
| 2 | PASS | 0.552 |
| 3 | PASS | 0.537 |
| 4 | PASS | 0.532 |
| 5 | PASS | 0.519 |
| 6 | PASS | 0.536 |
| 7 | PASS | 0.520 |
| 8 | PASS | 0.533 |
| 9 | PASS | 0.519 |
| 10 | PASS | 0.538 |
| 11 | PASS | 0.528 |
| 12 | PASS | 0.547 |
| 13 | PASS | 0.532 |
| 14 | PASS | 0.520 |
| 15 | PASS | 0.529 |
| 16 | PASS | 0.523 |
| 17 | PASS | 0.532 |
| 18 | PASS | 0.520 |
| 19 | PASS | 0.523 |
| 20 | PASS | 0.531 |

### heartbeat 수정 후: server

| 회차 | 결과 | 초 |
| --- | --- | ---: |
| 1 | PASS | 5.699 |
| 2 | PASS | 5.699 |
| 3 | PASS | 5.657 |
| 4 | PASS | 5.706 |
| 5 | PASS | 5.705 |

### foreground 포함 최종: isolated

| 회차 | 결과 | 초 |
| --- | --- | ---: |
| 1 | PASS | 0.537 |
| 2 | PASS | 0.550 |
| 3 | PASS | 0.521 |
| 4 | PASS | 0.520 |
| 5 | PASS | 0.537 |
| 6 | PASS | 0.534 |
| 7 | PASS | 0.541 |
| 8 | PASS | 0.542 |
| 9 | PASS | 0.547 |
| 10 | PASS | 0.532 |
| 11 | PASS | 0.517 |
| 12 | PASS | 0.531 |
| 13 | PASS | 0.523 |
| 14 | PASS | 0.548 |
| 15 | PASS | 0.535 |
| 16 | PASS | 0.534 |
| 17 | PASS | 0.552 |
| 18 | PASS | 0.533 |
| 19 | PASS | 0.532 |
| 20 | PASS | 0.535 |

### foreground 포함 최종: server

| 회차 | 결과 | 초 |
| --- | --- | ---: |
| 1 | PASS | 5.635 |
| 2 | PASS | 5.725 |
| 3 | PASS | 5.754 |
| 4 | PASS | 5.828 |
| 5 | PASS | 5.617 |

## 2026-11-18 후속 코드 검토 및 로컬 커밋

사용자가 8개 변경 파일의 검토와 단일 로컬 커밋을 승인했다. 변경 범위는 기존 8개 파일 그대로이며, 예상하지 못한 파일·의존성·실제 환경 설정 변경은 없었다. RoomClient 구현에서 추가 결함은 발견하지 못해 제품 코드는 최초 수정 그대로 유지했다.

- disconnect는 heartbeat interval, retry/join/leave/settings timer를 정리하고 closeObservedAt 및 ping 상태를 초기화하며 generation을 증가시킨다. 늦게 도착한 이전 소켓 콜백은 현재 소켓을 폐기하거나 retry를 추가하지 않는다.
- 4001/4003은 replaced를 설정해 자동 refresh와 foreground resynchronize를 중단한다. 명시적 refresh는 기존 권한 확인 경로로 재시도할 수 있다.
- 일반 close 1000/1006/1011/1013은 이벤트 도착 즉시 기존 connectionLost 경로로 복구한다. 비OPEN 대기는 close 콜백을 기다리는 동안에만 적용된다. close가 없으면 기존 heartbeat 예산과 검사 주기에 따라 복구하며 영구 대기하지 않는다.
- OPEN foreground는 currentRoom으로 상태를 재조회하고, connecting/reconnecting 상태에서는 중복 호출이 새 연결을 만들지 않는다. 기존 OPEN 무응답/토큰 획득 정체/재시도 기한/취소·dispose 회귀도 통과했다.
- heartbeat-diagnostics.test.ts에 일반 종료 코드 4개와 OPEN foreground 중복 호출·stale 4001 테스트 1개를 추가했다. 추가 5개는 이번 수정의 정상 복구 보존을 검증하며 기존 183개 반복 결과를 대체하지 않는다.

재실행: 관련 3개 파일 43/43 PASS, 모든 workspace TypeScript PASS, 전체 서버 188/188 PASS, 모바일 50/50 PASS, git diff --check PASS. 근거는 ignored .qa-web/stability/review-{focused,typecheck,server,mobile}.log. 제품 코드 추가 변경이 없어 이전 Web/native/브라우저 검증은 재실행하지 않았다.

커밋 메시지: fix: prevent stale websocket session reclaim after replacement. 이 보고서를 포함한 8개 파일만 로컬 커밋 대상으로 선택한다. push/main 병합/원격 배포/환경변수 변경은 수행하지 않는다. 커밋 식별자는 Git 이력으로 확인하며 문서 자체에 자기 SHA를 넣지 않는다.
