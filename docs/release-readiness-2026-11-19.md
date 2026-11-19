# Web/PWA 운영 배포 후보 검증 — 2026-11-19

> 최종 확정 후속: 사용자가 기존 Pages friends-table-staging / production branch deploy/web-staging / https://friends-table-staging.pages.dev 및 Railway main 연결을 확인했다. 도메인 불확실성은 해소되었다. [최종 실행 계획](release-execution-plan-2026-11-19.md)의 승인별 명령·최종 재검증·롤백 대상을 우선한다. commit 포함 운영 변경은 여전히 미실행이다. 아래는 최초 검증 시점 기록이다.

## 판정

**NOT READY — 로컬 자동 검증은 PASS, 운영 배포 실행 조건은 미완료.** 기능 코드의 재현 가능한 테스트 실패는 발견하지 않았다. 최종 Pages origin/프로젝트·후보 커밋 확정, 일관된 백업 및 복구 확인, 유지보수 시간과 실행 승인이 남았다. 실제 사용자 JWT E2E·Safari/PWA·네이티브 실기기는 미검증이다. 별도 staging 인프라는 만들지 않는다.

이번 작업은 현재 `play-ui-refresh` 작업 트리만 사용했다. 다른 worktree/브랜치의 파일을 가져오지 않았다. 원격 조회는 Railway CLI와 Supabase MCP의 읽기 전용 작업, GitHub 원격 main 조회뿐이다. 운영 인증 RPC·익명 가입·게임 명령은 실행하지 않았다. 커밋·push·main 병합·배포·재시작·운영 변수 변경·백업 생성/복원은 하지 않았다.

## 소스 기준과 포함 범위

- 현재/후보 브랜치: `codex/tempo-hand-history` (그대로 유지; 새 브랜치 미생성).
- HEAD: `89229f5` (`Add Expo Web PWA support and Cloudflare Pages staging build`). 최종 release commit은 아직 없다.
- 실제 원격 main: `a666688cd61452abbaebf415726b0900bfa9b20c`. `git ls-remote origin refs/heads/main`으로 확인. remote-only 0 / local-only 1 커밋.
- 운영 서버: `9e741b27c305b6ec11eb463b6d8677e6690c555f`. 운영→HEAD는 `ce5605d`, `a666688`, `89229f5` 3커밋, 그 위에 미커밋 변경이 있다.
- 시작 시 수정된 tracked 파일 31개. 미추적 파일은 디렉터리를 펼쳐 별도 [후보 목록](release-candidate-files-2026-11-19.md)에 전부 기록한다.
- 권장 후보: HEAD의 전체 tracked 소스 + 현재 P0/P1/P2 구현 및 관련 테스트/문서. P0/P2 UI는 정적 웹 호스팅의 필수 요건은 아니지만 이번 최신 기능 후보에 포함한다. P1과 P0/P2가 GameScreen/HomeScreen/FriendsScreen에 함께 있어 파일 단위 선택으로 일부를 빼면 검증한 후보와 달라진다. 축소 배포를 원하면 별도 변경 분리와 재검증이 필요하다.
- 운영 코드에 필요한 미추적 파일: `FriendComparisonScreen.tsx`, `webViewport.ts`. 누락 시 import/build 실패한다.
- 검증 소스에 필요한 미추적 파일: browser fixture 3개, 브라우저 실행기 2개, 서버 전적 테스트 2개, `supabase/drafts/007` SQL 2개. SQL은 테스트/설치 근거로 포함하며 자동 migration으로 이동하거나 운영에 재실행하지 않는다.
- 제외: `supabase/.temp/**` (9개 CLI 캐시/접속 메타데이터), `docs/staging-environment-plan.md` (별도 인프라 계획으로 현재 요청과 불일치; 로컬 보존), `.qa-web/**`, `.env*` 실값 파일, SQLite/로그, node_modules, 생성 번들. tracked `.env.example`은 예시로 유지한다.
- `docs/assets/p2/**`는 보고서가 링크하는 fixture 캡처/결과 근거로 소스 검토에 포함 가능하며 웹·서버 런타임에는 포함하지 않는다. 정책/문서 변경은 코드 배포의 기술적 의존성은 아니지만 동일 리뷰에 포함하는 것을 권장한다.

## P0/P1/P2 완성도

| 영역 | 목적·구현 | 평가·남은 한계 |
| --- | --- | --- |
| P0 | 홀카드 240ms/보드 360ms, 오디오 피치·fade·동기화, 다음 핸드 5초 및 단절 중 기한 유지, 오른쪽 최근 히스토리 | 자동 회귀 통과. 실기기 청취 미검증. 최근 10핸드/150액션만 제공, nextHandAt의 서버 재시작 보존은 미구현 |
| P1 | 입력 원문/IME·Enter, revision/프로필 갱신 중 포커스 유지, table/input viewport 분리 | 모바일 단위 및 실제 Chrome fixture 통과. Safari 실제 키보드·회전·네이티브 입력 미검증 |
| P2 | 카드 가독성·설정 버튼, 본인/두 친구 비교 UI·API, 007 세 관계 및 최신 세션 권한 검사 | HTTP+SQLite+PGlite·브라우저 통과. 운영 007 정의/ACL 확인. 운영 JWT 경유 E2E는 미검증 |

P0/P1/P2 전체를 검증했으나 실제 디바이스 검증이나 운영 반영 완료를 의미하지 않는다. [P0](tempo-hand-history-report.md), [P1](p1-input-layout-report.md), [P2](p2-ui-friend-comparison-report.md)의 과거 결과와 이번 결과를 구분한다.

## 이번 실행 결과

| 항목 | 명령/조건 | 결과 |
| --- | --- | --- |
| 서버 전체 | `npm test`, loopback 허용 환경 | 178/178 PASS, 실패/skip 0 |
| 모바일 | `npm run test --workspace=@boardgame/mobile` | 50/50 PASS |
| TypeScript | `npm run typecheck` | 3개 workspace PASS |
| Web production | 실제 대상 WSS/Supabase URL 및 로컬 공개 키를 프로세스 환경에 주입하여 `scripts/build-pages.cjs` | PASS, 22개 정적 파일, PWA/Pages 검사 PASS |
| Android/iOS | `APP_ENV=production`, `NODE_ENV=production`, `EXPO_NO_DOTENV=1`, 공개 WSS로 Expo export | 두 플랫폼 Hermes 번들 PASS (APK/IPA 아님) |
| P1 Chrome | `node scripts/test-input-browser.cjs` | IME/Enter/Backspace/갱신 중 포커스/키보드 시뮬레이션 PASS |
| P2 Chrome | `node scripts/test-p2-browser.cjs` | 1366×768, 1920×1080, 375×812, 390×844, 430×932, 844×390 PASS |
| CORS/WS Origin | 전체 서버 suite의 `web-origins.test.ts` 및 비교 API CORS | 허용·거부·preflight·native 무Origin 인증 요구 PASS |
| 인증/세션 | account/anonymous/session/mobile-client/복구 및 모바일 저장소 테스트 | 로컬 fixture PASS; 원격 인증 미실행 |
| 두 친구 API/RLS | `friend-comparison.test.ts`, `friend-stats-security.test.ts` | 001–006+007 로컬 SQL, 세 관계·해제·삭제·role/ACL·최신 세션·fail-closed PASS |
| 재시작/영속성 | 전체 suite의 startup/deployment/session 테스트 | 임시 SQLite의 실제 진입점 재시작 및 복구 PASS |
| diff 공백 검사 | `git diff --check` | PASS |

최초 제한 환경의 서버 suite에서 로컬 HTTP/WS 연결 실패·timeout이 발생해 중단했다. 코드나 timeout을 변경하지 않고 loopback 허용 환경에서 전체 재실행하여 178개 모두 통과했다. 이를 기능 결함 수정으로 보고하지 않는다. Web 빌드의 MODULE_TYPELESS_PACKAGE_JSON 경고는 비차단이며 무관한 module type 변경은 하지 않았다.

상세 로그는 ignored `.qa-web/release-{server,server-permitted,mobile,types,web,native,p1,p2}-2026-11-19.log`에 있다. 네이티브 출력은 `.qa-web/release-native-2026-11-19`, 웹 출력은 `apps/mobile/dist-web`이다. 웹 검증용 origin은 기존 문서의 `https://friends-table-staging.pages.dev`를 사용했다. 이 값은 최종 도메인 승인 또는 현재 Pages 설정 확인을 뜻하지 않으며, 도메인을 변경하면 다시 빌드해야 한다. 번들은 실행하지 않았으므로 익명 가입이 발생하지 않았다.

## 운영 호환성 재확인

Railway: Workspace 418 Studio / project `0aeab21d-455b-434a-b733-82b66251ab4b` / production `6b6708d1-3e1e-451b-b811-d6c7761939a0` / service `7d4a6ad9-47a8-4dd7-8282-2bf53f0cac9b`. 배포 `0b7f9148-3b9c-4783-a310-a7fa9d60627e` SUCCESS, SHA `9e741b27…`, `/data` 마운트, `/health` 설정을 재조회했다.

| 설정 | 조회값 | 예정 |
| --- | --- | --- |
| NODE_ENV / HOST / PORT | production / 0.0.0.0 / 3000 | 유지 |
| STATE_DB_PATH | /data/boardgame.sqlite | 유지 |
| STATS_DB_PATH | /data/stats.sqlite | 유지 |
| SUPABASE_URL | https://znnmzowesjrrshimukwv.supabase.co | 유지 |
| SUPABASE_PUBLISHABLE_KEY | 존재·형식만 확인, 값 미출력 | 유지, 교체 불필요 |
| WEB_ALLOWED_ORIGINS | 미설정 | 최종 정확한 HTTPS origin 추가; 경로/끝 슬래시/와일드카드 금지 |
| RAILWAY_DEPLOYMENT_DRAINING_SECONDS | 15 | 유지; 서버 종료 fallback 10초보다 김 |
| RECONNECT_MS | 앞선 조회에서 미설정, 코드 기본 300000ms | 변경 불필요 |
| TRUSTED_PROXY_IPS / MAX_CONNECTIONS_PER_IP | 앞선 조회에서 미설정 | 임의 변경 금지; 기본 24개/IP, 실제 프록시 집계 확인 권장 |

현재 운영에는 웹 CORS/Origin 제한과 두 친구 API가 없어 **서버 업데이트 필수**다. 최신 코드는 Origin 미설정 시 브라우저를 거부하므로 코드와 환경변수를 같은 유지보수 변경으로 준비한다. 무Origin native는 기존 JWT 검증을 유지한다.

Supabase MCP 카탈로그 재조회: public 4개 테이블 모두 RLS enabled. profiles 본인 조회/수정, friendships 당사자 조회와 read_account_session 제한 유지. 기존 세션·친구 RPC 존재. 007은 `STABLE SECURITY DEFINER`, owner postgres, 빈 search_path, ACL postgres/authenticated만 EXECUTE이며 로컬 초안과 의미상 일치. 신규 DB 변경 필요 없음. 마이그레이션 목록은 여전히 비어 있어 설치 이력/순서는 입증할 수 없다. 운영 current_account_session은 쓰기가 가능하므로 호출하지 않았다. 익명 인증 설정·실제 키 유효성·JWT 요청은 미검증.

운영 SHA 대비 `packages/shared`, `apps/server/src/holdem`, `stateStore.ts`, `FriendStatsStore.ts`, `accountSession.ts`, Dockerfile은 변경 없음. checkpoint version 1·통계 테이블 형식과 기존 메시지 계약을 유지한다. 기존 native 무Origin/인증·재접속 경로는 suite에서 통과했지만 배포된 APK/IPA 자체로 접속한 것은 아니다. 열린 기존 웹 탭은 옛 JS를 유지하므로 배포 직후 강제 reload하지 않는다.

## Pages 예정 설정

기존 Pages 프로젝트가 있다면 재사용한다. 프로젝트/고정 도메인/현재 production branch/배포 SHA는 이번에 관리 API로 확인하지 않았다. 별도 staging 인프라 생성 계획은 제외한다.

| 항목 | 예정값 |
| --- | --- |
| Framework / root | None / 저장소 루트 |
| Build | `npm ci --include=dev && npm run build:pages` |
| Output | `apps/mobile/dist-web` 내용만 |
| NODE_VERSION | 24.19.0 |
| SKIP_DEPENDENCY_INSTALL | 1 |
| EXPO_PUBLIC_WEB_GAME_SERVER_URL | wss://boardgameserver-production.up.railway.app/lobby |
| EXPO_PUBLIC_SUPABASE_URL | https://znnmzowesjrrshimukwv.supabase.co |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 기존 프로젝트 공개 키, 문서/로그에 값 기록 금지 |
| EXPO_PUBLIC_WEB_APP_URL | 최종 고정 HTTPS origin; 미설정이면 브라우저 origin 사용, CF_PAGES_URL은 빌드 검사 대체값 |
| APP_ENV | 미설정 (Pages 스크립트가 설정 시 거부) |
| Production branch | 검토·커밋·게시된 후보 브랜치 확정 후 연결. main을 임의 선택하지 않음 |
| Preview | 자동 배포 끄거나 승인된 브랜치만 제한; 임의 preview origin 허용 금지 |

`EXPO_NO_DOTENV=1`, NODE_ENV=production은 빌드 스크립트가 설정한다. 공개 값은 번들에 포함된다. native 공통 서버 변수를 Pages용으로 덮어쓰지 않는다. `/join/*`만 index rewrite, 없는 asset 404, manifest/PNG/JS MIME, no-cache/nosniff를 배포 후 확인한다. noindex는 접근 통제가 아니다. PWA manifest/설치 메타데이터는 있으나 오프라인 게임 지원을 약속하지 않는다.

## 게임 데이터 백업과 복구 위험

실행하지 않은 승인 후 절차다. 운영 DB 파일을 이번 분석 과정에서 내려받거나 조회하지 않았다.

1. 유지보수 공지와 신규 접속 차단 방법을 먼저 확정한다. 현재 앱에는 전용 drain/점검 모드가 없으므로 공지만으로 새 방 생성을 막았다고 간주하지 않는다. 빈 방 확인과 쓰기 중지를 보장하는 운영 절차를 승인받는다.
2. 기존 배포 ID/SHA, 볼륨 ID·마운트, 비밀값을 제외한 환경 설정을 기록한다. 두 SQLite는 하나의 게임 처리를 두 DB에 걸쳐 저장하지만 분산 트랜잭션은 아니므로, 플레이 도중 파일을 각각 복사하면 시점이 어긋날 수 있다.
3. 승인된 정상 종료/쓰기 중지 상태에서 같은 시점의 `/data` 백업을 생성한다. Railway Volume backup을 사용할 수 있으나 기능 가용성·비용·완료 ID를 확인한다. 단순 live `cp`/다운로드로 일관성을 가정하지 않는다. stateStore는 EXCLUSIVE 잠금을 유지해 외부 SQLite online backup이 차단될 수 있다.
4. 백업을 공개 저장소·Pages·로그에 넣지 않는다. checkpoint에는 비공개 카드와 방 자격이 들어 있다. 승인된 비공개 저장소에 접근을 제한하고 백업 시각/해시/두 파일 대응을 기록한다.
5. 복구 검증은 원본이 아닌 격리된 복사본에서 한다. 두 DB `PRAGMA integrity_check`, 필요한 테이블·checkpoint version을 검사하고, 외부 통신을 차단한 로컬 fixture로 복구한다. 실제 계정/패/토큰을 출력하지 않는다. 별도 staging 인프라는 만들지 않는다. 이번에는 합성 임시 DB 재시작 테스트만 통과했으며 운영 백업 복구는 미검증이다.
6. 코드 롤백은 현재 볼륨을 유지한다. 데이터 손상이 확인된 경우에만 별도 승인으로 같은 시점의 두 파일/볼륨을 함께 복원한다. 신규 기록 소실 가능성을 명시하고 현재 상태도 비공개 보존한다. 한 DB만 과거로 돌리면 전적 중복/누락과 checkpoint 불일치 위험이 있다.

복구 한계: 재배포 때 WS 단절, 24시간 이상 지난 checkpoint의 방 미복구, 기존 오프라인 좌석 만료 유지(기본 5분), nextHandAt 미저장, 복구 시 약 30초의 시계 회복 구간. 자동 복구는 중단 전 화면/카운트다운을 정확히 보존하는 보장이 아니다. 게임이 없는 시간에 배포한다.

[Railway 백업](https://docs.railway.com/volumes/backups)은 볼륨 복원 시 재배포가 발생하며 같은 프로젝트/환경으로 복원한다. 플랫폼 백업 기능의 존재만으로 앱의 두 DB 간 일관성까지 검증됐다고 판단하지 않는다. [SQLite live 파일 복사 주의](https://www.sqlite.org/howtocorrupt.html), [SQLite Backup API](https://sqlite.org/backup.html) 참조.

## 승인 후 안전한 배포 순서

1. 최종 도메인/기존 Pages 프로젝트와 포함 목록 확정 → 별도 승인 후 후보 커밋 생성. 원격 main SHA가 변했으면 비교를 갱신한다. `git add .`나 혼합 트리 `railway up`을 사용하지 않는다. push/자동배포 연결은 별도 승인 후 진행한다.
2. 확정 커밋으로 현재 테스트/빌드를 재현한다. Windows 로컬 번들 통과가 Cloudflare Linux clean npm ci나 Docker 이미지 빌드 통과를 대신하지 않는다. 이미지 빌드는 Docker 가용 환경에서 배포 전에 확인한다.
3. 현재 Railway 배포/환경·볼륨과 Pages 이전 성공 배포를 기록한다. 유지보수·쓰기 중지·백업·복구 확인을 완료한다.
4. 최종 origin을 WEB_ALLOWED_ORIGINS에 추가하고 후보 서버를 기존 production 서비스에 배포한다. 변수 변경이 자동 재배포를 유발할 수 있으므로 변경/배포 묶음을 미리 검토한다. 서비스 Git 연결/main 정책·DB 경로·replica를 임의 변경하지 않는다.
5. `/health`, 허용 origin preflight/WSS, 잘못된 origin 거부, 무Origin native의 JWT 요구, 승인된 사용자 세션/전적/복귀를 확인한다. 실패하면 웹을 게시하지 않고 서버를 롤백한다.
6. 같은 확정 소스/공개 설정의 웹 결과만 기존 Pages에 배포한다. 도메인·MIME·404·초대 링크·캐시와 현재 서버 호환성을 점검한다.
7. 승인된 계정·시간으로 2–6인, 친구 관계 해제, 두 친구 비교, 새로고침/잠금/5분 경계/네이티브 혼합, 비공개 카드 보호를 확인하고 공개 범위를 확대한다. 이 단계는 운영 데이터 쓰기를 포함하므로 현재 승인 범위 밖이다.

## 롤백 순서

- 웹만 문제: 이전 성공 Pages production 배포로 롤백. 첫 배포라 이전 버전이 없으면 안내/접근 제한 방법을 사전 확정한다. preview는 production 롤백 대상으로 가정하지 않는다.
- 서버 문제: 신규 게임 접속을 중단하고 현재 상황·새 기록을 보존한 뒤, 기존 성공 배포 `0b7f9148-3b9c-4783-a310-a7fa9d60627e` 또는 정확한 `9e741b27c305b6ec11eb463b6d8677e6690c555f` 소스로 되돌린다. 이전 배포 재사용 가능성과 이미지 보존은 실행 직전 확인한다. 변경한 변수만 기록된 값으로 복원하며 이전 WEB_ALLOWED_ORIGINS는 미설정이었다.
- `/data`와 두 SQLite는 삭제/초기화하지 않는다. 현재 형식은 이전 서버와 동일하지만 실제 운영 데이터로의 downgrade는 검증하지 않았다.
- 이전 서버는 최신 웹 CORS/두 친구 API를 지원하지 않으므로 웹도 호환 버전으로 되돌리거나 이용을 중단한다. 기존 열린 탭까지 즉시 사라지는 것은 아니다.
- DB 복원은 코드 롤백과 별도 승인한다. Railway 볼륨 복원은 서비스 재배포를 동반한다. 사용자 플레이 이후 백업으로 복귀하면 백업 이후 기록을 잃을 수 있다.

## 남은 필수 조건과 승인

1. 최종 Pages 프로젝트·고정 origin과 후보 커밋 확정. 현재 생성 번들을 도메인 검토 없이 게시하지 않는다.
2. clean Linux/컨테이너 설치·이미지 빌드 검증, 운영 백업 가용성/복구 검증 및 유지보수 절차 확인.
3. Railway Origin 등록·서버 업데이트 후 실제 인증/게임·웹/네이티브 smoke test. 테스트 데이터를 쓸 승인 필요.
4. 운영 반영 승인: 커밋(AGENTS.md 별도 승인), push, Railway 변수/재배포/필요한 유지보수 제어·백업, Pages 설정/배포. main 병합은 별도이며 권장 경로의 필수 단계가 아니다. Supabase 변경·새 인프라 생성은 예정 없음.

이번 로컬 수정은 `.gitignore`, `.dockerignore`의 캐시/산출물 제외와 본 보고서·후보 목록·현황/색인/검증/아키텍처 문서 갱신뿐이다. 기존 기능 코드는 수정하지 않았다. 사용자 승인 전 운영 실행은 대기한다.

Docker 실행기가 이 환경에서 발견되지 않아 Linux 컨테이너 이미지 빌드는 수행하지 못했다. 설치된 의존성으로 전체 검사와 번들을 실행했으며 clean npm ci의 플랫폼 재현성까지 PASS로 표시하지 않는다. 배포 SHA 노출용 안전한 버전 정보, 실제 프록시 연결 제한 측정, 정기 백업 정책은 권장 후속 개선이다. 운영 비용/보안 설정을 이번에 바꾸지 않았다.
