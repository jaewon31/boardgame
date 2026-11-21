# 기존 Railway·Supabase 재사용 배포 계획

2026-11-18 KST. 저장소 C:/Users/jwseo/Desktop/boardgame, 현재 개발 branch codex/consolidate-friends-table. 작업 시작 HEAD 50ea5cd, 미커밋 변경 없음. 이전 29085e1의 세션 교체 수정은 유지한다. 이번 변경을 검증 후 로컬 커밋하며 최종 후보 SHA는 git log -1로 확인한다. (2026-11-22: 검증 없이 문서·CI 정리만 커밋했다. 아래 검증 결과 참조. 철회된 별도 Staging 계획은 [철회 안내](web-staging-runbook.md)에 있으며 이 문서가 현재 계획이다.)

## 확정 범위 및 승인 경계

별도 Staging 서버/Supabase/배포 브랜치는 만들지 않는다. 기존 Railway 서비스와 Supabase 프로젝트·데이터를 유지하고 Cloudflare Pages 웹/PWA를 연결한다. 기존 URL에 staging이라는 단어가 있어도 새 인프라를 의미하지 않는다. 기존 Pages 재사용 여부/최종 origin은 사용자 확인 사항이다.

Staging branch 전용 CI trigger만 제거한다. production Pages fixture 빌드, 타입/서버/모바일/native 검사, Docker 이미지 보안 검사 및 .dockerignore의 QA/생성물 제외는 유지한다. 게임 규칙·프로토콜·DB 형식 변경 없음. deploy의 Compose/Caddy 예시는 기존 대안이므로 유지하되 이번 Railway 배포에서 실행하지 않는다.

원격 push/배포/변수/DB/인증 변경은 대상·후보 SHA·백업·중단 영향·롤백을 보고한 뒤 사용자 최종 확인을 받아야 한다. 기존 서버 삭제·새 서비스 생성·DB reset·임의 테스트 데이터 삭제는 금지한다.

## 이번 원격 읽기 전용 관찰

2026-11-18 확인, 개별 UTC 시각은 ignored .qa-web/stability/existing-server-{public,ws}.json에 보존.

| 대상 | 실제 관찰 | 한계 |
| --- | --- | --- |
| https://boardgameserver-production.up.railway.app/health | 200, status=ok/service=boardgame-server | 배포 SHA/DB/Volume/Auth 정상 증거 아님 |
| 같은 health + 기존 Pages Origin / 비허용 Origin | 둘 다 200, ACAO 없음 | 현재 로컬 코드의 정확한 Origin 차단 정책과 다름 |
| 전적 OPTIONS + Pages Origin + Authorization preflight | 404, ACAO 없음 | 웹 전적 CORS 준비 미완료 |
| wss://boardgameserver-production.up.railway.app/lobby | 무Origin/Pages/비허용 Origin 모두 upgrade 성공 후 비인증 currentRoom에 AUTH_REQUIRED | TLS/WSS와 인증 요구는 확인; Origin 차단 미적용 동작. 실제 인증 요청 없음 |
| https://friends-table-staging.pages.dev | HTTP 200 HTML | 프로젝트 소유·설정·배포 SHA·최종 사용 여부 미확인 |
| 원격 Git main | a666688cd61452abbaebf415726b0900bfa9b20c | Railway 실제 실행 SHA와 동일하다고 가정하지 않음 |

과거 Railway SHA 9e741b27…는 사용자 보고 이력일 뿐 현재값이 아니다. 현재 service/project/environment ID·deployment SHA·Volume mount·backup·rollback은 미확인이다. 기존 브라우저 프로토콜의 currentRoom/AUTH_REQUIRED까지만 확인했으며 full authenticated compatibility는 미검증이다.

관리 접근: Railway/Supabase 연결 제안은 했으나 연결 확인 전까지 사용 불가. 로컬 railway/wrangler/supabase/docker CLI 없음. gh 설치는 있으나 로그인 안 됨; Git 읽기와 GitHub connector 접근은 별개다. Railway/Supabase/Cloudflare 로그인·연결이 필요하며 자격증명을 채팅에 붙여 넣지 않는다. GitHub connector의 시작 SHA PR workflow 조회는 빈 목록이었고 전체 CI 통과 증거가 아니다.

## 데이터 보존·중단 위험 — 배포 전 필수 확인

**서버 배포는 WS 연결을 끊으며 진행 중 게임의 보존을 보장하지 않는다.** Volume/저장 경로 오류, 디스크 장애, 만료 기한 초과, 호환되지 않는 이전 checkpoint reader로 rollback하면 방/게임이 유실되거나 복귀하지 못할 수 있다. 현재 실제 Volume을 확인하지 못했으므로 게임 없는 유지보수 시간과 복구 가능한 백업이 없으면 배포하지 않는다.

- Dockerfile: Node 24, node apps/server/src/index.ts, USER node, /data 기본 경로. Railway가 주입하는 PORT와 HOST=0.0.0.0 사용; watch/dev 실행 금지.
- 기존 서비스는 replica 1. Volume의 실제 mount, STATE_DB_PATH, STATS_DB_PATH 두 파일의 위치/쓰기 권한, 최근 backup 상태를 확인한다. 다른 서비스/새 Volume으로 바꾸지 않는다. 기존 RAILWAY_RUN_UID/프록시 설정도 이유 없이 변경하지 않는다.
- 코드의 health는 ready 시 200, shutdown 시 503. Supabase·실제 디스크 쓰기 readiness 검사는 아니며 SHA를 노출하지 않는다. Railway health path /health와 deployment ID/source SHA, durable:true 및 persistence_failed 부재를 각각 확인한다.
- checkpoint 원자 저장/동시 writer 차단/저장 실패 fail-closed, 종료 시 SIGINT/SIGTERM 및 10초 상한. 24시간 이상 checkpoint는 무시하고 기존 오프라인 좌석의 만료를 연장하지 않는다. 복원 직후 오프라인/약 30초 recovery이며 nextHandAt 자체는 보존되지 않는다.
- 관리자 확인 후 게임 없는 시간에 두 SQLite를 일관되게 백업한다. 실행 중 파일 단순 복사/백업 내용을 Git·웹에 올리기 금지. 백업 성공 시각·대상 배포·복구 절차를 비밀값 없이 기록한다. 백업 생성도 승인된 원격 변경으로 다룬다.
- rollback은 현재 확인한 정상 deployment ID와 소스 SHA로 수행한다. 과거 문서 SHA를 그대로 사용하지 않는다. 구 서버가 새 checkpoint를 읽는지 비교하고 같은 DB 형식이어도 실제 복구 보장은 따로 검증한다. DB 복원은 별도 승인, Volume 삭제/reset 금지.

## 기존 Supabase 점검 — 신규 프로젝트·일괄 migration 없음

기존 URL과 publishable key는 로컬 apps/mobile/.env.local에서 존재/형식을 확인했고 키 값은 출력하지 않았다. 그것이 실제 Railway 프로젝트와 같은지는 관리자 대조가 필요하다. 기존 `001~006` 및 `007`이 설치돼 있으면 다시 적용하지 않는다.

관리자가 기존 프로젝트의 anonymous sign-in/가입 제한/CAPTCHA/rate limit, profiles·friendships·account_sessions RLS, 생성 trigger·nickname_setup_complete, 필수 RPC 정의/ACL/owner를 확인한다. 기존 세션·계정·친구 관계를 보존한다. 앱은 CAPTCHA token을 전달하지 않으므로 강제 CAPTCHA이면 로그인 보완이 선행돼야 한다. 우회 목적으로 운영 CAPTCHA를 끄지 않는다. 새 origin에는 기존 브라우저의 익명 계정 저장소가 자동 이전되지 않는다.

필수 RPC: current_account_session, read_account_session, list_friends, request_friend, respond_friend, remove_friend, can_compare_friend_stats(uuid,uuid). 인증된 익명 사용자는 authenticated 역할이며 anon 권한을 확대하지 않는다.

007은 supabase/drafts/007_friend_stats_permission.sql에 있다. 운영 설치/EXECUTE ACL은 과거 사용자 확인이며 현재 정의는 독립 미확인. 기존 001~006과 read_account_session 이후에만 의미가 있다. 필요 여부는 supabase/drafts/007_friend_stats_preflight_readonly.sql로 카탈로그를 비교해 판단한다. 새 migration 폴더로 옮기거나 db push/reset을 실행하지 않는다.

같은 시그니처·정상 ACL이면 007 재적용 가능하나 기존 정의를 덮어쓰고 schema reload한다. 다른 역할 ACL/authenticated grant option이 있으면 트랜잭션 실패; 실패 후 기존 잘못된 권한이 수리됐다고 해석하지 않는다. RETURN/인자명/owner 차이, 역할 상속·overload도 확인한다. SQL이 필요할 때만 현재 정의/ACL 비공개 백업, 영향·의존성·복원 SQL 검토 후 별도 승인한다. 이번 작업은 SQL 변경을 제안하거나 적용하지 않는다.

current_account_session은 INSERT/UPDATE 가능하다. 인증된 GET 전적 조회도 읽기 전용 점검이 아니므로 승인 없이 실제 JWT를 쓰지 않는다. 테스트 계정/친구/게임 생성은 기존 운영 데이터에 추가된다는 점을 배포 후 검증 승인에 포함한다.

## Pages/서버 설정 — 기존 값 우선

| 설정 | 목표/확인 |
| --- | --- |
| Pages 프로젝트 | 기존 프로젝트·계정·Git integration/Direct Upload 방식 확인. 기존 URL 유지 여부 사용자 확인 |
| Git branch 사용 시 | 기존 개발 branch codex/consolidate-friends-table 사용 가능 여부 확인. 별도 배포 branch를 만들지 않고 main 자동배포를 유발하지 않음 |
| Framework / Root | None / 저장소 루트 |
| Build / Output | npm ci --include=dev && npm run build:pages / apps/mobile/dist-web |
| NODE_VERSION / SKIP_DEPENDENCY_INSTALL | 24.19.0 / 1 |
| EXPO_PUBLIC_WEB_APP_URL | 확정된 기존 HTTPS origin, 경로·끝 slash 없음. 기존 후보는 https://friends-table-staging.pages.dev |
| EXPO_PUBLIC_WEB_GAME_SERVER_URL | wss://boardgameserver-production.up.railway.app/lobby |
| EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 기존 프로젝트 공개 값 재사용. 프런트엔드와 서버 일치 필요 |
| APP_ENV | Pages에서는 미설정; local dotenv는 build:pages가 제외 |
| 서버 WEB_ALLOWED_ORIGINS | 확정된 Pages origin을 기존 목록에 추가. 기존 네이티브/웹 사용자 허용 origin을 제거하지 않음 |
| 서버 SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | 기존 값 보존·대조. service-role/admin/sb_secret_는 사용하지 않음 |
| STATE_DB_PATH / STATS_DB_PATH / PORT / HOST / RECONNECT_MS | 현재 정상값과 실제 mount를 확인하고 불필요하게 변경하지 않음 |
| TRUSTED_PROXY_IPS | 검증된 정확한 IP만. Compose IP를 Railway로 복사하거나 X-Forwarded-For 전체를 신뢰하지 않음 |

EXPO_PUBLIC_*는 번들에 공개된다. 빌드에는 whitelist의 공개 값만 주입하고 sb_secret_나 service_role JWT가 산출물에 없는지 확인한다. URL/키 형식 검사는 인증 성공 증거가 아니다. 로컬 실제 공개 값으로 빌드해도 관리자 대조 전 산출물을 게시하지 않는다.

## 실행 순서 및 실제 명령 — 최종 승인 전 원격 실행 금지

1. 관리 접근을 연결하고 현재 Railway service/environment/project ID, source SHA, 상태·Volume·백업·롤백 deployment를 확인한다. Pages와 Supabase 프로젝트 일치를 확인한다.
2. 현재 개발 branch에서 테스트·로컬 커밋하고 후보 SHA를 고정한다. 새 branch나 서버는 만들지 않는다. 아래 로컬 명령은 기존 공개 설정을 전용 ignored 파일에 사용자가 준비한 후 실행한다.

```powershell
Set-Location 'C:\Users\jwseo\Desktop\boardgame' -ErrorAction Stop
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Server tests failed' }
npm.cmd run test --workspace=@boardgame/mobile
if ($LASTEXITCODE -ne 0) { throw 'Mobile tests failed' }
node --env-file=apps/mobile/.env.production.local scripts/build-pages.cjs
if ($LASTEXITCODE -ne 0) { throw 'Pages build failed' }
git diff --check
```

3. hosted CI에는 후보 SHA가 먼저 원격에 있어야 한다. 현재 push 금지 상태에서 새로운 SHA의 hosted CI 통과를 주장하지 않는다. 기존 자동배포 연결을 먼저 확인하고, 필요하면 **소스 게시·CI 실행만 별도 최종 승인**받는다. 이는 Railway/Pages 실제 배포 승인과 분리한다. push가 자동배포를 유발하는 경우 그 연결을 확인·승인 없이 push하지 않는다.

```powershell
# 소스 게시 최종 승인 및 자동배포 영향 확인 후에만
$releaseSha = '<검증하고 승인한 전체 SHA>'
if ((git rev-parse HEAD) -ne $releaseSha) { throw 'Unexpected SHA' }
if (git status --porcelain) { throw 'Dirty release source' }
git push origin HEAD:refs/heads/codex/consolidate-friends-table
```

4. 정확한 SHA의 Check project/Verify server image CI가 모두 통과한 뒤 서비스 영향·백업·롤백·설정 diff를 다시 보고하고 배포 최종 확인을 받는다. CI 실패나 Docker 실행 불가를 통과로 바꾸지 않는다. 기존 서비스를 유지하며 빈 게임 시간에 배포한다.

```powershell
# 기존 서비스 ID를 모두 확인하고 실제 배포 최종 승인 후에만
railway up --project '<EXISTING_PROJECT_ID>' --environment '<EXISTING_ENVIRONMENT_ID>' --service '<EXISTING_SERVICE_ID>' --detach
```

이 명령은 현재 폴더 소스를 업로드한다. 앞 단계와 같은 clean root/SHA를 재확인한다. --new/--yes/--no-gitignore 금지. CLI가 없거나 인증되지 않으면 사용자가 설치·로그인/연결하며 우회 생성하지 않는다. queued는 배포 성공이 아니다.

5. 서버 새 deployment의 /health, durable, 허용/비허용 Origin 및 CORS를 확인한다. Pages는 기존 프로젝트의 실제 연결 방식으로 같은 검증 SHA/산출물을 배포한다. Git integration branch 설정 저장 자체가 배포를 유발할 수 있다. Direct Upload 프로젝트라면 해당 기존 프로젝트의 승인된 업로드 방식으로 배포하고 새 프로젝트를 만들지 않는다.
6. HTTPS/WSS·실제 인증·친구 전적·멀티플레이·새로고침/탭 교체·비공개 패/칩/턴 복귀·모바일 혼합 플레이를 승인된 사용자로 확인한다. 예상 못한 인증/복원/정산 오류면 공유 중단하고 기록된 정상 배포로 rollback한다.

## 승인 전에 필요한 사용자 조치

- Railway와 Supabase 연결(또는 기존 서비스 관리자 확인 결과). 비밀값을 채팅으로 보내지 않는다.
- 기존 Pages URL/프로젝트·Git/Direct Upload·현재 배포 branch, 계정 로그인 확인.
- Railway 기존 배포 SHA/ID, service/environment/project ID, Volume mount·STATE/STATS 경로, 최근 백업·복구 방법, 게임 없는 시간.
- Supabase 기존 프로젝트 URL 일치·007 정의/ACL·익명 인증/CAPTCHA 적용 상태.
- 후보 SHA 게시/CI 실행 승인, 이후 별도 서비스 배포·필요 설정 변경·데이터를 생성하는 E2E 승인.

## 검증 결과

이번 전체 로컬 검증 결과는 완료 후 아래에 기록한다. 로컬 테스트는 외부 Supabase를 모사하며 실제 운영 JWT/Volume/배포 SHA 확인을 대체하지 않는다. 실제 배포 전 필수 조건이 미확인이면 상태는 승인 대기/차단으로 남긴다.

- 2026-11-22 KST: **로컬 검증 미실행.** typecheck, 서버·모바일 테스트, Pages 빌드, `git diff --check` 외 검사를 이 계획 기준으로 실행하지 않았다. 원격 배포·운영 설정·DB 변경 없음.
