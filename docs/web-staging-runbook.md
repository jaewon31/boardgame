# Web/PWA Staging 실행 계획 — 29085e1

2026-11-18 KST. 저장소 C:/Users/jwseo/Desktop/boardgame, 브랜치 codex/consolidate-friends-table.
기준 SHA: 29085e1e4ee722fbd4d725359fa30eadfe48e856. 시작 clean. 이번 준비 변경은 사용자 승인에 따라 단일 로컬 커밋에 포함한다. 배포/push/main 병합/운영 DB·Auth·Secrets 변경 없음.

## 준비 판정

로컬 빌드·검증 및 실행 절차 준비 완료. 실제 환경 준비 완료나 배포 승인 상태는 아니다. Cloudflare/Railway/Supabase 관리자 설정에 접근하지 않았으며 운영 토큰/환경파일을 출력하지 않았다.

기존 보고 URL: friends-table-staging.pages.dev / boardgameserver-production.up.railway.app. 현재 응답·배포 SHA·Volume·프로젝트 격리는 이번에 독립 확인하지 않았다. 운영 서버와 Supabase를 재사용하면 데이터가 분리된 Staging이 아니다. 별도 서비스/Volume/Supabase 프로젝트와 비용은 사용자 결정 사항이다.

웹은 Cloudflare Pages 정적 파일, 게임은 Railway 단일 Node 24 HTTP/WebSocket 프로세스, 인증·친구는 Supabase, 게임 checkpoint/전적은 SQLite 두 파일이다. Pages에 Node WebSocket 서버를 함께 배포하지 않는다.

## 코드 및 안전한 설정 보완

- build-pages.cjs: APP_ENV 혼용 거부 → URL/키 형식 검사 → EXPO_NO_DOTENV=1 및 production Expo export → PWA/라우팅/404/헤더/개인파일/크기 검사. 게시 대상은 apps/mobile/dist-web 내용만이다. 실제 인증 성공은 검사하지 않는다.
- 기존 Actions push 대상 main/codex/**에 deploy/web-staging 추가(check.yml, server-image.yml). check.yml의 일반 Web export/정적 검사를 실제 build:pages + 가짜 공개 fixture로 교체했다. contents: read 유지, 배포 job/Secret 없음. P1/P2는 기존 로컬 실행기를 사용한다.
- server-image.yml은 Docker 기동·동적 PORT·health·재시작·필수 인증 설정 누락·Compose/Caddy를 검사한다. 빈 컨테이너 재시작 health와 게임 checkpoint 복원 테스트는 서로 다른 검증이다.
- .dockerignore에 .qa-web 및 **/dist-web 제외 추가. QA/생성물을 서버 빌드 컨텍스트에 보내지 않는다. 게임 코드/패키지/SQL 변경 없음.

## 프런트엔드 — Cloudflare Pages 설정

| 이름 | 값/요구사항 |
| --- | --- |
| Project | 기존 Staging 프로젝트 소유 계정·Git integration 여부 확인; 중복 생성 금지 |
| Production branch | deploy/web-staging. 이 Staging 사이트의 고정 URL용 branch라는 뜻이며 main이 아님 |
| Preview branches | None 권장; 필요 시 승인된 정확한 브랜치만 |
| Framework preset / Root directory | None / 저장소 루트(빈 값) |
| Build command | npm ci --include=dev && npm run build:pages |
| Build output directory | apps/mobile/dist-web |
| NODE_VERSION | 24.19.0; engines 자동 감지에 의존하지 않음 |
| SKIP_DEPENDENCY_INSTALL | 1; 위 명령에서 설치를 명시 |
| EXPO_PUBLIC_WEB_APP_URL | 실제 https://<staging-web-host>, 경로·끝 slash 없음. 선택값이며 없으면 CF_PAGES_URL로 검사하고 초대는 브라우저 origin 사용 |
| EXPO_PUBLIC_WEB_GAME_SERVER_URL | 실제 wss://<staging-game-host>/lobby |
| EXPO_PUBLIC_SUPABASE_URL | https://<staging-project-ref>.supabase.co |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 같은 프로젝트 sb_publishable_ 공개 키 |
| APP_ENV | 미설정. native 전용 |

Staging 프로젝트의 Production 환경에 설정한다. Preview 사용 시 Preview 변수도 별도로 설정한다. 로컬 .env.local은 build:pages에 사용되지 않는다. GitHub Pages의 /repo/ 경로와 Cloudflare _redirects/_headers는 같은 배포 방식이 아니다.

[빌드 설정](https://developers.cloudflare.com/pages/configuration/build-configuration/), [빌드 이미지 변수](https://developers.cloudflare.com/pages/configuration/build-image/), [브랜치 제어](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) 확인. Pages Git integration은 push로 배포될 수 있으며 Actions 성공을 기다리는 gate로 가정하지 않는다. 첫 프로젝트 생성/Save/자동배포 설정도 외부 변경이다.

## 서버 — Railway 설정 및 복구

| 이름 | 값/요구사항 |
| --- | --- |
| Project / Environment / Service | 관리자가 확인한 대상 ID 3개; 운영과 Staging을 이름만으로 추정하지 않음 |
| Builder / Root | 저장소 루트 Dockerfile; apps/server만 source root로 선택하지 않음 |
| Start command | Dockerfile CMD: node apps/server/src/index.ts. dev/watch 사용 금지 |
| NODE_ENV / HOST | production / 0.0.0.0 |
| PORT | Railway 주입값; public target port와 일치. 코드가 PORT를 읽음 |
| Public Networking | HTTPS 도메인 및 WSS /lobby; Railway edge TLS 종료 |
| Healthcheck path | /health를 Railway 설정에도 명시. Docker HEALTHCHECK와 별개 |
| Volume | 단일 서비스 전용 영속 Volume, 실제 mount·쓰기 권한 확인 |
| STATE_DB_PATH | /data/boardgame.sqlite — mount가 /data인 경우 |
| STATS_DB_PATH | /data/stats.sqlite — 동일 Volume. 미설정 시 state 옆이나 명시 권장 |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | 프런트엔드와 같은 프로젝트 URL·publishable key |
| WEB_ALLOWED_ORIGINS | 정확한 https://<staging-web-host>. 기존 허용 origin 보존; 쉼표 구분, wildcard/경로/끝 slash 금지 |
| RECONNECT_MS | 300000 기본값 |
| MAX_ROOMS / MAX_CONNECTIONS / MAX_CONNECTIONS_PER_IP | 현재 기본 100 / 240 / 24. 성능 보장값 아님 |
| TRUSTED_PROXY_IPS | 통제·검증한 정확한 IP만. Compose의 172.30.50.2를 복사하지 않음 |
| Replicas / sleep / restart | replica 1, 자동 휴면 비활성·on-failure 재시작 정책 확인 |

프록시 신뢰가 없으면 proxy IP로 per-IP 집계가 몰릴 수 있다. 한도를 임의 확대하거나 X-Forwarded-For 전체를 신뢰하지 않는다. 이미지 USER node와 Volume 소유권을 확인하고 RAILWAY_RUN_UID 등의 기존 정상값을 임의 변경하지 않는다.

/health는 listen/ready 후 200 및 status=ok/service=boardgame-server, shutdown 시 503이다. Supabase/RPC와 디스크 쓰기 probe는 하지 않으므로 health만으로 인증·영속성 성공을 주장할 수 없다. server_started durable:true, persistence_failed 부재, mount 및 실제 재시작 복구를 함께 확인한다. health에 SHA가 없어 플랫폼 배포 메타데이터로 출처를 대조한다.

SIGINT/SIGTERM 처리와 10초 종료 상한, 저장 실패 fail-closed, SQLite 동시 writer 차단이 있다. 24시간 이상 된 checkpoint는 복원하지 않고 오프라인 좌석 만료를 갱신하지 않는다. 복원 직후 오프라인/약 30초 recovery가 적용된다. nextHandAt 자체는 checkpoint에 보존되지 않는다. 재배포로 WS가 끊기며 무중단을 보장하지 않는다. 게임이 없는 시간과 두 SQLite의 일관된 비공개 백업·롤백 계획이 필요하다.

[Railway networking](https://docs.railway.com/networking/public-networking), [Volume](https://docs.railway.com/volumes), [healthcheck](https://docs.railway.com/deployments/healthchecks). Railway healthcheck는 배포 후 지속 모니터링을 대신하지 않는다. 실제 원격 설정은 관리자 확인 전까지 미검증이다.

## Supabase Auth / RLS / RPC / 마이그레이션

- 앱은 signInAnonymously를 사용한다. 대상 프로젝트 anonymous sign-in, rate limit, 비용·휴면, Site URL/사용하는 redirect 목록을 확인한다. 익명 로그인은 DB에 사용자 데이터를 생성한다. OAuth/email callback 신규 구현은 범위 밖이다.
- 익명 로그인 사용자도 authenticated 역할이며 비로그인 anon과 다르다. profiles 본인 접근, friendships 참여자 접근, account_sessions 직접 접근 차단, 현재 세션 restrictive RLS를 유지한다. RLS 해제/anon 권한 확대 금지.
- 신규 빈 Staging: supabase/migrations/001_accounts.sql → 002_friends.sql → 003_single_session.sql → 004_anonymous_onboarding.sql → 005_repair_account_session.sql → 006_readonly_session_policies.sql 순서로 검토·승인 후 설치한다. 기존 프로젝트에는 무조건 재실행하지 않는다.
- 추가 필수: supabase/drafts/007_friend_stats_permission.sql의 can_compare_friend_stats(uuid,uuid). migrations 밖이므로 일반 db push만으로 설치되지 않는다. 이번에 이동하거나 실행하지 않았다.
- 필수 RPC: current_account_session, read_account_session, list_friends, request_friend(text), respond_friend(uuid,boolean), remove_friend(uuid), can_compare_friend_stats(uuid,uuid). profiles 생성 trigger/nickname_setup_complete도 필요하다.
- 007: postgres owner, 빈 search_path, authenticated EXECUTE만 허용; PUBLIC/anon/service_role 차단. 세 accepted 관계를 검사한다. 오류 시 서버 503, 미승인 403으로 차단하며 health로 007 누락을 탐지하지 못한다.
- 운영 007 설치/ACL은 사용자 보고이며 새 Staging 설치 증거가 아니다. 대상 SQL Editor에서 supabase/drafts/007_friend_stats_preflight_readonly.sql의 정의/ACL/RLS 결과를 대조한다. 빈 DB는 regclass 참조가 실패할 수 있으므로 설치 상태부터 확인한다.
- current_account_session은 INSERT/UPDATE 가능하다. 인증된 GET 전적 조회도 완전한 읽기 전용 검사가 아니다. 운영 사용자 JWT 추출/재사용 금지.
- 앱은 captchaToken을 전달하지 않는다. CAPTCHA 강제 환경에서는 로그인 흐름 보완이 선행돼야 한다. 운영 CAPTCHA를 우회 목적으로 끄지 않는다. [Supabase 익명 인증](https://supabase.com/docs/guides/auth/auth-anonymous)은 CAPTCHA/Turnstile을 권고한다. noindex·제한 공유는 접근 통제가 아니며 공개 남용 방지는 별도 출시 조건이다.

### 007 적용 순서 및 재실행 안전성

1. 대상 프로젝트를 확인하고 먼저 001~006 설치/정의 대조를 완료한다. 007은 profiles/friendships와 006의 read_account_session, auth.uid/auth.jwt, Supabase 역할에 의존한다. 001은 CREATE TABLE/정책/trigger를 포함하므로 전체 migration 묶음을 무조건 재실행할 수 없다.
2. 기존 프로젝트에서는 readonly preflight로 owner/정의/ACL/역할 상속/다른 overload를 먼저 확인한다. 신규 프로젝트에서도 001~006 이후 preflight로 의존성을 확인할 수 있다(007 미설치는 허용되는 초기 상태).
3. 승인 후 trusted postgres owner로 007 파일 전체 BEGIN~COMMIT을 한 번 실행한다. 임의 구간만 선택 실행하지 않는다. 일반 db push에는 drafts/007이 포함되지 않는다. 수동 적용 이력과 파일 SHA-256을 비밀값 없이 기록한다.
4. 같은 함수 시그니처·정상 ACL·필수 의존성이 유지되면 CREATE OR REPLACE로 재적용할 수 있다. owner/search_path/EXECUTE를 재확인하며 table RLS/사용자·친구 행을 변경하지 않는다. 재실행은 함수 정의를 해당 파일 내용으로 교체하고 schema reload NOTIFY를 다시 발생시키므로 무조건 무영향 작업은 아니다.
5. PUBLIC/anon/service_role 직접 권한은 revoke하지만 다른 역할에 남은 ACL 또는 authenticated WITH GRANT OPTION은 명시적으로 오류를 일으킨다. 오류 시 트랜잭션이 실패하고 그 실행의 변경은 커밋되지 않는다. 세션이 aborted transaction 상태면 ROLLBACK 후 원인을 조사한다. 이전의 잘못된 권한이 자동 수리된 것으로 보지 않는다. 직접 ACL 검사만으로 모든 역할 상속/다른 overload까지 안전하다고 단정하지 않는다.
6. 기존 함수의 반환형·인자명 불일치나 소유권/권한 부족도 실패할 수 있다. DROP FUNCTION이나 일괄 권한 제거로 우회하지 말고 별도 검토한다. 성공 후 readonly preflight 및 승인된 테스트 JWT E2E로 확인한다.

근거: apps/server/test/friend-stats-security.test.ts는 로컬 메모리 PGlite에서 001~006 → 007 두 번 → readonly preflight를 실행하며 RLS 보존/owner/search_path/역할별 EXECUTE를 검사한다. 예상 밖 역할 및 grant option 재적용 실패도 검사한다. 로컬 테스트 DB는 폐기되며 원격 Supabase DB를 변경하지 않는다.

### 별도 Staging Supabase 초기 설정 체크리스트

아래 항목은 관리자 실행·검증용이며 이번에 원격 실행하지 않았다.

- [ ] 운영과 다른 프로젝트 ref/URL·소유 조직·지역·요금/사용량·휴면 조건을 확인하고 생성 승인을 받는다. 운영 사용자/세션/친구 데이터를 복사하지 않는다.
- [ ] 전용 publishable key와 URL을 확보해 Pages 및 전용 Railway Staging에 동일하게 설정한다. service_role/secret 키는 앱에 넣지 않는다. 관리 자격증명은 별도 보관한다.
- [ ] 승인된 SQL Editor에서 001~006을 순서대로 적용하고 파일별 성공·해시를 기록한다. profiles 생성 trigger, nickname_setup_complete, account_sessions 및 friendships를 확인한다.
- [ ] 위 순서대로 007을 적용하고 public API schema 노출, schema cache 갱신 및 필수 RPC 존재를 확인한다. RLS·owner/search_path·직접 ACL·역할 상속을 readonly preflight와 대조한다.
- [ ] 익명 로그인 활성화, signup/rate limit, CAPTCHA 정책을 확인한다. CAPTCHA 강제 시 현재 앱의 토큰 미지원부터 해결한다. 운영 보안 설정은 변경하지 않는다.
- [ ] Site URL을 실제 Staging HTTPS origin으로 설정하고 실제 사용하는 redirect만 허용한다. 현재 익명 로그인에 OAuth callback을 가정하지 않는다.
- [ ] 별도 웹 origin의 저장소를 사용한다. 기존 운영 origin에서 프로젝트 설정을 바꿔 운영 익명 세션을 덮어쓰지 않는다. 기존 운영 익명 계정이 새 프로젝트에 복구될 것으로 가정하지 않는다.
- [ ] 승인된 테스트 사용자로 신규 로그인 → 프로필 자동 생성/닉네임 설정 → current_account_session → 세션 갱신/새로고침 복귀를 확인한다.
- [ ] 테스트 사용자 3명으로 친구 요청/수락/해제 및 전적 비교의 세 관계 허용·거부를 확인한다. RPC 누락/오류 시 차단, 구 세션 거부를 확인한다. SQL Editor owner 호출을 사용자 JWT E2E로 대체하지 않는다.
- [ ] 전용 서버 Volume·CORS/WSS·실기기 검증과 데이터 보존/백업 정책을 확인한다. 테스트 사용자 삭제·reset도 별도 승인 없이는 하지 않는다.

## Secrets 분류

| 구분 | 값/보관 |
| --- | --- |
| 앱/서버 runtime | Supabase URL/publishable key는 공개 값. 사용자 access/refresh token은 로그인 흐름에서만 취급 |
| Cloudflare Git integration | 사용자가 저장소 접근 승인. 현재 Actions에는 CLOUDFLARE_API_TOKEN/ACCOUNT_ID 불필요 |
| 향후 direct upload 자동화 | CLOUDFLARE_API_TOKEN은 최소 권한 보호 Secret, CLOUDFLARE_ACCOUNT_ID는 식별자. 이번에 등록/사용 안 함 |
| Railway 배포 | 사용자 CLI 로그인 또는 대상 한정 RAILWAY_TOKEN(자동화 시 보호 Secret). 웹 번들에 넣지 않음 |
| Supabase 관리 | DB 비밀번호/연결 문자열/SUPABASE_ACCESS_TOKEN은 관리자 도구에서만 사용. SQL Editor 경로는 앱 Secret 불필요 |
| service_role / sb_secret_ | 현재 앱/서버 runtime에 불필요·금지 |

실제 값은 채팅·로그·Git에 출력하지 않는다. 관리 Secret 등록·Auth/DB 변경은 별도 승인 대상이다.

## 실행 순서 — 원격 명령은 승인 후에만 사용

### 1. 대상 확인과 로컬 검증

대상 계정/프로젝트·격리 수준·비용·Pages 연결·Railway 자동배포 branch·Volume·Supabase를 사용자와 확정한다. 이번 보완을 포함한 로컬 커밋의 전체 SHA를 release SHA로 지정하고 원격 게시 승인은 별도로 받는다. 29085e1만 선택하면 이번 CI 보완은 포함되지 않는다.

```powershell
Set-Location 'C:\Users\jwseo\Desktop\boardgame' -ErrorAction Stop
git status -sb
git log -1 --oneline
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Server tests failed' }
npm.cmd run test --workspace=@boardgame/mobile
if ($LASTEXITCODE -ne 0) { throw 'Mobile tests failed' }
# 실제 공개 설정을 별도 ignored 파일에 준비; 기존 파일 덮어쓰기 금지
node --env-file=apps/mobile/.env.staging.local scripts/build-pages.cjs
if ($LASTEXITCODE -ne 0) { throw 'Staging build failed' }
```

.env.staging.local에는 프런트엔드 표의 EXPO_PUBLIC 변수만 둔다. 셸의 동일 이름 변수가 파일보다 우선하므로 새 전용 셸을 사용하고 APP_ENV는 설정하지 않는다. npm ci는 필요할 때 깨끗한 전용 checkout에서 실행한다.

### 2. 소스 고정 및 Git 게시 승인

Pages/서버가 push로 자동 배포되는지 먼저 확인한다. 켜져 있다면 push 자체를 배포 승인 범위에 포함한다. Actions 성공 전에 Pages가 배포될 수 있으므로 검증 완료 SHA만 게시한다.

```powershell
$releaseSha = '<검증하고 승인한 전체 SHA>'
$stagingSource = 'C:\Users\jwseo\Desktop\boardgame-staging-release'
# 경로가 없을 때만. 기존 worktree를 삭제/덮어쓰지 않는다.
git worktree add --detach $stagingSource $releaseSha
if ($LASTEXITCODE -ne 0) { throw 'Worktree creation failed' }
git -C $stagingSource status --short
git ls-remote --heads origin deploy/web-staging
if ($LASTEXITCODE -ne 0) { throw 'Remote branch lookup failed' }
# 별도 push/자동배포 승인 후에만 실행
git push origin "${releaseSha}:refs/heads/deploy/web-staging"
```

non-fast-forward면 중단하고 이력을 검토한다. force/main 병합은 사용하지 않는다. 현재 작업용 branch 전환은 필요 없다.

### 3. Supabase 및 서버 준비·배포 승인

대상 SQL Editor 설치 현황 대조 → 승인된 누락 SQL만 순서대로 설치 → readonly preflight → 승인된 테스트 계정/JWT E2E. 프로젝트 생성/Auth/DB 변경은 먼저 승인받는다. 운영에 무조건 db push/reset을 실행하지 않는다.

Railway 대시보드에서 위 서버 설정·Volume·백업·유지보수 시간을 확인한다. 설정 저장도 재배포를 유발할 수 있다. 기존 main Git 연결은 임의 변경하지 않는다. 검토한 CLI 설치·로그인 후 고정 source에서:

```powershell
Set-Location $stagingSource -ErrorAction Stop
if (git status --porcelain) { throw 'Release checkout must be clean' }
if ((git rev-parse HEAD) -ne $releaseSha) { throw 'Unexpected release SHA' }
railway up --project '<PROJECT_ID>' --environment '<ENVIRONMENT_ID>' --service '<SERVICE_ID>' --detach
```

[railway up](https://docs.railway.com/cli/up)은 로컬 소스를 업로드·배포한다. 확인한 기존 ID를 모두 명시한다. --new/--yes/--no-gitignore를 사용하지 않는다. queued는 runtime 성공이 아니다. 대시보드 deployment ID/출처 SHA/health/durable 기록을 확인한다.

### 4. Pages 배포 승인

기존 Staging Pages 프로젝트의 빌드 표와 Production 환경값을 확인한다. Git 연결/첫 Save/자동배포 활성화도 공개 배포를 유발할 수 있다. Preview는 None, 정확한 release SHA로 배포한다. 실제 도메인과 서버 WEB_ALLOWED_ORIGINS를 일치시키고, 실제 설정으로 재빌드한 결과만 공유한다. fixture dist-web 게시 금지.

### 5. 배포 후 검증과 롤백

아래는 계정 생성 없는 공개 확인 예시다. 실제 URL은 관리자가 확정한 값만 쓴다.

```powershell
$webOrigin = 'https://<실제-staging-web-host>'
$gameOrigin = 'https://<실제-staging-game-host>'
curl.exe --silent --show-error --max-time 15 "$gameOrigin/health"
curl.exe --silent --show-error --max-time 15 -o NUL -w '%{http_code}' -H "Origin: $webOrigin" "$gameOrigin/health"
curl.exe --silent --show-error --max-time 15 -o NUL -w '%{http_code}' -H 'Origin: https://untrusted.invalid' "$gameOrigin/health"
curl.exe --silent --show-error --max-time 15 -I "$webOrigin/manifest.webmanifest"
curl.exe --silent --show-error --max-time 15 -I "$webOrigin/join/ABCDEFGH"
curl.exe --silent --show-error --max-time 15 -I "$webOrigin/missing-verification-asset.js"
```

기대: health JSON/허용 Origin 200, 비허용 Origin 403, manifest 200/정상 MIME, 초대 경로 앱 HTML, 없는 자산 404. 실제 WSS upgrade 101/비허용 Origin 거부, API OPTIONS/Authorization CORS도 브라우저에서 확인한다. JWT를 URL/명령줄/로그에 넣지 않는다.

승인된 테스트 계정으로 2~6인 생성/참가/게임/퇴장/재생성, 두 탭 4001 및 foreground 자동 재탈취 없음, 새로고침·단절·잠금·네트워크 전환·5분 경계, 비공개 패/칩/턴 복구, 친구 전적 허용/거부/RPC 오류를 검사한다. iPhone/Android PWA 설치·native 혼합 플레이는 별도 기록한다. 실제 재시작 테스트는 승인된 격리 서버에서 한다.

실패 시 공유 중단 → 승인된 이전 Pages 배포 rollback → 서버의 기록된 정상 배포/변수로 복귀. Volume 삭제·초기화 금지. DB/SQL rollback은 앱 rollback과 별도 검토하고 자동 역마이그레이션하지 않는다.

## 로컬 검증 및 역할 분담

TypeScript PASS, 서버 188/188 PASS(로컬 PGlite SQL/SQLite 복구/Origin·권한 포함), 모바일 50/50 PASS, fixture Pages 22파일 PASS. YAML 파싱/branch/fixture 형식 및 git diff --check PASS. 로그: ignored .qa-web/stability/staging-*.log. 기존 의존성 사용, 설치/업데이트 없음.

Docker/Railway/Wrangler 실행기가 없어 Docker 이미지·Compose·Caddy 및 CLI 실제 실행 미검증. hosted Actions와 실제 edge/WSS/TLS/Volume/Supabase는 미검증. 게임 코드 미변경으로 native/P1·P2 재실행은 생략했으며 직전 검증 이력과 구분한다. 기존 npm 권고 43개는 이번에 해소하지 않았다([보안 계획](security/npm-audit.md)).

| 구분 | 작업 |
| --- | --- |
| 사용자 직접 결정·설정 | 계정/프로젝트 ID/도메인/비용/격리, 공개 값·관리 Secret 입력, Supabase Auth/SQL 설치 상태, Volume/백업/유지보수 시간 |
| Codex 로컬 자동화 가능 | YAML·설정 검사, 타입·테스트·fixture 빌드, clean source 준비, 값 존재·형식만 검사, 로그 정제·결과 보고 |
| 실제 실행 별도 승인 | push, Pages 공개 배포/설정, Railway 배포/Volume/변수/재시작, Supabase 프로젝트/Auth/DB 변경, 테스트 계정·친구·게임 데이터 생성 |

## 2026-11-18 최종 검토 및 커밋 검증

예상한 7개 파일만 변경됨을 확인했다. Actions push는 main/codex/**/deploy/web-staging, PR 대상은 기존 main 유지. Pages 단계는 실제 워크플로 env를 읽어 로컬 build-pages.cjs로 실행했다. Docker ignore의 .qa-web 및 **/dist-web은 Dockerfile COPY에 필요한 manifest/lock/server/shared 소스를 제외하지 않음을 정적으로 확인했다. Docker 엔진 검증으로 간주하지 않는다.

재검증: RPC 보안 2/2(007 두 번 적용·RLS/ACL 보존·비정상 ACL 거부 포함), 전체 서버 188/188, 모바일 50/50, TypeScript, Pages 22파일, 두 YAML 구조, 실행 계획 PowerShell 4개 블록 구문, 문서 링크 및 git diff --check PASS. 근거: ignored .qa-web/stability/staging-review-*.log. 원격 SQL/프로젝트/배포 명령은 실행하지 않았다.

커밋 메시지: chore: prepare isolated web staging deployment. 사용자 승인으로 해당 7개 파일만 로컬 커밋한다. 원격 push/main 병합/배포/Supabase 프로젝트 생성·DB 변경은 승인 범위 밖이며 수행하지 않았다.
