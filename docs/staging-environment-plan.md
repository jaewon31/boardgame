# Friends Table Staging / Production 환경 분리 계획

조사일: 2026-11-18 KST. 작업 경로: `play-ui-refresh`, 브랜치: `codex/tempo-hand-history`, HEAD: `89229f5`.

이 문서는 조사와 향후 실행 계획이다. 리소스 생성, 설정 변경, 로그인·테스트 데이터 생성, DB 접근/쓰기, commit/push/main 병합, 빌드·배포를 수행하지 않았다. 기존 미커밋·미추적 파일은 보존했다. 현재 작업 트리에 HEAD 이후 변경이 많으므로 HEAD가 현재 구현 전체를 대표하지 않는다.

## 1. 결론과 확인 범위

**웹 주소만 Staging인 상태를 끝내고 Supabase 프로젝트, Railway 서비스 및 SQLite Volume까지 별도로 구성한다.** 운영 데이터나 운영 인증 세션은 복사하지 않는다. 기존 Staging Pages는 백엔드 분리 후 재연결하는 안을 우선한다.

| 항목 | 확인 결과 | 근거·한계 |
| --- | --- | --- |
| 프런트엔드 | Expo React Native Web/PWA, 정적 export | `apps/mobile`, `scripts/build-pages.cjs` |
| Staging 웹 | `https://friends-table-staging.pages.dev` | 사용자 제공. 이번 Node fetch, PowerShell HTTP, 웹 조회 모두 접근 실패. 서비스 장애라고 단정할 수 없으며 현재 번들·배포 SHA 미확인 |
| 운영 게임 서버 | `https://boardgameserver-production.up.railway.app` | 사용자 제공. HTTP + WebSocket, `/lobby` 사용. 현재 원격 배포 SHA/런타임 변수 미확인 |
| Supabase | 인증·프로필·친구·세션 권한 관리 | 코드 확인. 운영 프로젝트 식별자/플랜/현재 Auth 설정 미확인 |
| 비교 RPC | 운영에 `can_compare_friend_stats(uuid,uuid)` 설치됨 | 사용자 보고. 원격 정의를 독립 대조하지 않음 |
| SQLite | 게임 checkpoint와 누적 전적을 별도 파일로 저장 | 코드 확인. 운영 Volume 실제 mount/path/백업 상태 미확인 |
| 자동 배포 | Railway main 자동 배포 가능 | 사용자 보고 및 과거 문서. 현재 연결/활성 상태는 콘솔 확인 필요 |
| 운영 웹 | 주소·프로젝트 확인 자료 없음 | 신규 생성 필요 여부부터 확인 |

과거 [6단계 기록](web-phase6-deployment-readiness.md) §§6–7은 Staging 웹에 기존 Railway와 Supabase를 재사용하는 계획이었다. 따라서 데이터 혼용 가능성이 높지만, **현재 공개 번들이 실제 운영 서버·운영 Supabase에 연결된다고 확정할 증거는 확보하지 못했다.** 관리자가 Pages 변수와 Railway 변수를 값 노출 없이 대조하고 공개 JS의 접속 호스트만 확인해야 한다. 앱을 단순히 열어도 익명 가입이 발생할 수 있으므로, 분리 확인 전 브라우저 로그인/E2E를 실행하지 않는다.

## 2. 현재 코드와 배포 경로

### Cloudflare Pages와 클라이언트

- 루트 `package.json`의 `npm run build:pages` → `scripts/build-pages.cjs` → Expo web export → `apps/mobile/dist-web` 검증. 배포 명령 자체는 없다.
- `pagesEnvironment()`는 프로세스 환경을 검사하고 `EXPO_NO_DOTENV`를 활성화해 로컬 `.env.local`의 유입을 막는다. `NODE_ENV`는 production으로 설정한다. `APP_ENV`가 있으면 Pages 빌드를 거부한다. Staging이라는 이유로 `APP_ENV=staging`을 추가하면 안 된다.
- `check-web-release.cjs`는 HTTPS 웹 origin, WSS `/lobby`, Supabase URL 및 publishable key 형식을 확인한다. 프로젝트 소유권이나 Staging/Production의 올바른 조합까지 검사하지는 않는다.
- `serverUrl.web.ts`는 웹 전용 서버 변수 → 공통 서버 변수 순으로 선택한다. 웹 전용 변수를 반드시 명시해 fallback에 의한 교차 연결을 막는다. 친구 전적 HTTP API도 게임 서버 연결과 함께 분리한다.
- `authClient.ts`는 공개 Supabase 변수로 클라이언트를 생성한다. `EXPO_PUBLIC_*` 값은 번들에 포함되므로 비밀 저장소가 아니다.
- `shareInvite.web.ts`는 설정된 웹 origin 또는 현재 origin으로 초대 링크를 만든다. `CF_PAGES_URL`은 빌드 검사 대체값이며 초대 URL로 자동 주입되지 않는다.
- `accountStorage.web.ts`의 인증 저장은 origin별 localStorage이다. 다른 도메인은 분리되지만, 기존 Staging 도메인의 Supabase 프로젝트를 바꾸면 기존 세션/계정 표시가 남을 수 있다. 전환 안내와 해당 Staging origin만 대상으로 한 재가입·저장소 처리 절차를 준비한다. 익명 계정은 저장소 삭제 시 복구 불가할 수 있다.
- `_redirects`는 `/join/*`만 index로 rewrite한다. 명시적 404, no-cache, nosniff, noindex 헤더를 빌드에서 검사한다. noindex는 접근 통제가 아니다.
- 추적된 Wrangler 설정은 발견하지 못했다. 과거 문서의 Pages Production branch는 `deploy/web-staging`이지만 현재 콘솔 값은 미확인이다. Cloudflare의 “Production” 설정 칸은 해당 Pages 프로젝트의 기본 배포를 뜻하므로, **Staging 프로젝트의 Production 변수 칸에도 Staging 값**을 넣어야 한다.

### Railway와 SQLite

- 추적된 `railway.toml`/`railway.json`은 없다. 실제 빌더·명령·source branch는 콘솔 관리 여부를 확인한다.
- 루트 Dockerfile: Node 24, `/app` 작업 디렉터리, `USER node`, `node apps/server/src/index.ts` 실행. 서버 workspace의 start는 `node src/index.ts`이며 루트에서 직접 사용하는 명령과 구분한다.
- `config.ts`: production에서는 state 경로 필수, 기본 host는 모든 인터페이스, 기본 port는 3000이고 플랫폼 PORT를 반영한다. `/health`는 준비 상태용이며 Supabase 인증·볼륨 영속성의 종합 검사가 아니다.
- `index.ts`: production 외 환경에서는 `apps/mobile/.env.local`의 공개 Supabase 설정을 fallback으로 읽는다. 클라우드 Staging도 `NODE_ENV=production`으로 실행하고 두 인증 변수를 명시한다.
- Docker 기본 checkpoint는 `/data/boardgame.sqlite`; 통계는 state 파일과 같은 디렉터리의 `stats.sqlite`가 기본이다. 실제 구축에서는 두 경로를 명시한다.
- `compose.yaml`은 `/data`에 `game-data`를 연결하지만 **Compose 설정이 Railway Volume 연결을 증명하지 않는다.** Docker의 디렉터리 생성이나 state 경로 검사도 영속 mount를 보장하지 않는다.
- `stateStore.ts`: SQLite `journal_mode=DELETE`, `synchronous=FULL`, `locking_mode=EXCLUSIVE`. `FriendStatsStore.ts`: `recorded_hands`, `account_results`에 누적 결과 저장. 단일 프로세스/replica 1로 운영하고 두 환경이 파일이나 Volume을 공유하지 않는다.
- state에는 복구용 게임 정보가 들어가므로 파일을 웹 산출물/로그로 공개하지 않는다. 전체 핸드의 영구 보관과 최근 UI 히스토리는 누적 전적 저장과 별개다.
- `.dockerignore`는 env/SQLite 등을 제외하고 Dockerfile도 필요한 소스만 복사한다. 지속성은 별도 Volume과 실제 쓰기 권한 확인이 필요하다.
- Railway Volume은 런타임에 mount된다. 공식 문서는 non-root 이미지의 권한 문제에 `RAILWAY_RUN_UID` 설정을 안내한다. Docker의 `/data` chown만 믿지 말고 새 Staging에서 실행 UID와 mount 권한을 검증한다. root 실행 여부는 권한 대안과 함께 검토하며 운영의 기존 정상 설정을 변경하지 않는다. [공식 Volume 문서](https://docs.railway.com/volumes)

### Supabase 마이그레이션·RLS·Auth

| 파일 | 역할 |
| --- | --- |
| `001_accounts.sql` | profiles, 본인 조회/수정 정책, Auth 사용자 생성 시 profile trigger |
| `002_friends.sql` | friendships, 요청 제한 테이블, 친구 목록/요청/수락·거절/삭제 RPC |
| `003_single_session.sql` | account_sessions, 현재 세션 검증 및 restrictive 정책 |
| `004_anonymous_onboarding.sql` | 닉네임 완료 상태, 익명 온보딩 지원 |
| `005_repair_account_session.sql` | 001/002 전제의 세션·친구 계약 복구, 003/004 이후에도 적용 가능 |
| `006_readonly_session_policies.sql` | read_account_session 추가, 조회 RLS를 읽기 전용 세션 검사로 교체 |
| `drafts/007_friend_stats_permission.sql` | 세 관계 기반 친구 비교 boolean 권한 RPC; migrations 폴더 밖에 있음 |

- profiles는 본인, friendships는 관계 당사자 조회에 제한된다. 세션 restrictive 정책이 추가된다. 제한 테이블과 account_sessions의 직접 접근은 막고 변경은 검증 RPC를 통한다.
- 익명 Auth 사용자도 DB 역할은 `authenticated`이다. `anon` 권한을 열어 해결하면 안 된다. 현재 앱은 익명 가입 중심이며 OAuth/이메일 콜백을 전제로 설계하지 않는다.
- `current_account_session`은 최신 세션을 account_sessions에 기록할 수 있다. 인증 확인처럼 보여도 RPC 호출은 DB 쓰기일 수 있다. 이번 조사에서는 호출하지 않았다.
- 서버 `accountSession.ts`는 사용자 JWT와 공개 키로 위 RPC를 호출해 인증한다. `friendStatsApi.ts`는 비교 RPC가 true인 경우에만 SQLite 전적을 반환한다. service-role 키는 필요하지 않다.
- 007은 `read_account_session`, profiles, friendships에 의존한다. 세 참여자 사이 필요한 accepted 관계를 모두 검사하고, `SECURITY DEFINER`, 빈 search_path, postgres owner, authenticated EXECUTE 및 다른 역할 제한을 사용한다.
- 운영 RPC가 설치됐다는 사실과 저장소에 재현 가능한 migration이 있다는 사실은 다르다. 구축 시 draft를 검토된 정식 migration으로 편입하고 기존 운영 정의/ACL과 대조해야 한다. 이번에는 파일 이동·SQL 변경을 하지 않았다.
- Supabase Auth 콘솔의 Anonymous Sign-Ins, Site URL/redirect allowlist, 가입 rate limit, CAPTCHA, 세션 설정은 SQL 파일만으로 재현되지 않는다. 현재 클라이언트에 CAPTCHA 토큰 수집 UI가 없으므로 강제 활성화 시 가입 실패 가능성을 먼저 검증한다. 기존 OAuth 관련 로컬 env 이름은 현재 사용을 증명하지 않는다.

### 하드코딩과 자동 배포 조사

- `apps/mobile/src`, `apps/server/src`, `scripts`의 소스에서 실제 Supabase/Railway/Pages 호스트 및 대표 비밀키/JWT 리터럴 패턴 후보는 발견하지 못했다. 이 검사는 전체 Git 이력에 대한 비밀 탐지 감사가 아니다.
- 로컬 `.env.local`에 Supabase URL이 구성되어 있으나 운영 프로젝트인지 미확인이다. 서버 주소는 알려진 운영 Railway 호스트와 일치하지 않았다. 값·키는 출력하거나 문서에 복사하지 않았다. localhost/에뮬레이터 주소는 개발 fallback이다.
- `.github/workflows/check.yml`, `server-image.yml`은 main 및 codex 브랜치 push와 main PR의 검사·export·이미지 검증을 실행한다. 확인한 워크플로에는 클라우드 배포 단계가 없다.
- 그럼에도 `main` 변경 → Railway GitHub 연동 → 연결된 운영 서비스 배포가 별도로 일어날 수 있다. GitHub Actions에 deploy가 없다고 안전한 것은 아니다. “Wait for CI”, watch paths, source branch, 자동 배포 활성 상태를 콘솔에서 확인한다. [Railway 자동 배포](https://docs.railway.com/deployments/github-autodeploys)
- Cloudflare도 Git 연결 브랜치 push → 빌드/배포가 가능하다. production/preview branch 범위, Deploy Hooks, GitHub 외 자동화는 현재 확인하지 못했다. [Pages 브랜치 제어](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)

## 3. 목표 구조와 수동 생성 리소스

| 계층 | Staging | Production |
| --- | --- | --- |
| 웹 | 기존 friends-table-staging Pages 재사용, 분리된 백엔드로 새 빌드 | 현재 프로젝트 확인 후 별도 운영 Pages 사용/생성 |
| 서버 | 별도 Railway service + 독립 URL | 기존 Railway 유지 |
| 파일 저장 | Staging 전용 새 빈 Volume | 기존 운영 Volume 유지 |
| 인증·친구 DB | 새 Supabase 프로젝트, 새 사용자와 친구 관계 | 기존 Supabase 유지 |
| 배포 소스 | 제안: `codex/staging`, 검토된 후보만 반영 | main, Staging 검증·명시적 승격 승인 후 |

필수 신규 리소스는 Supabase 프로젝트 1개, Railway 서비스 1개와 그 전용 Volume 1개다. Railway에서는 별도 project 또는 명시적 Staging environment로 운영과 구분한다. 환경 복제 기능으로 운영 변수/데이터를 자동 복사하지 말고 새 빈 서비스에서 시작한다. 기존 Pages 재사용이 불가능하면 Staging Pages를 새로 만들며, 운영 Pages가 없으면 향후 별도로 생성한다. 유료 도메인은 필수가 아니다.

필요한 향후 코드/관리 변경은 007 정식 migration 편입, 환경별 주소 조합 검사, Staging 표시와 세션 전환 안내, 배포 브랜치/승인 정책 확정이다. 현재 코드로도 별도 공개 변수와 서버 변수로 연결 분리가 가능하지만, 환경 이름만으로 오접속을 차단하는 장치는 없다. 별도 구현 작업에서 빌드 산출물의 운영 호스트 부재와 프로젝트 조합을 검증하도록 보완한다.

## 4. 환경변수 목록 — 이름만

두 환경의 이름은 같고 저장 위치와 값은 독립적이다. 아래 표는 값을 의도적으로 포함하지 않는다. 비밀키·JWT·DB 비밀번호·CLI 토큰은 앱 런타임 변수 목록에 추가하지 않는다.

| 범위 | Staging 변수 이름 | Production 변수 이름 |
| --- | --- | --- |
| Pages 필수 공개 빌드 | `EXPO_PUBLIC_WEB_GAME_SERVER_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 동일 |
| Pages 권장 canonical URL | `EXPO_PUBLIC_WEB_APP_URL` | 동일 |
| Pages 빌드 런타임/자동 제공 | `NODE_VERSION`, `CF_PAGES_URL`, `NODE_ENV`, `EXPO_NO_DOTENV` | 동일 |
| 서버 필수 구성 | `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `STATE_DB_PATH`, `STATS_DB_PATH`, `WEB_ALLOWED_ORIGINS` | 동일 |
| 서버 플랫폼/선택 조정 | `PORT`, `HOST`, `RECONNECT_MS`, `MAX_ROOMS`, `MAX_CONNECTIONS`, `MAX_CONNECTIONS_PER_IP`, `TRUSTED_PROXY_IPS` | 동일 |
| Railway 권한 검토/자동 제공 | `RAILWAY_RUN_UID`, `RAILWAY_VOLUME_NAME`, `RAILWAY_VOLUME_MOUNT_PATH` | 동일 |
| 네이티브 빌드에만 별도 관리 | `APP_ENV`, `EXPO_PROJECT_ID`, `EXPO_PUBLIC_GAME_SERVER_URL` | 동일 |

Pages에서 APP_ENV는 설정하지 않는다. build-pages가 설정하는 변수와 플랫폼이 제공하는 변수는 불필요하게 수동 덮어쓰지 않는다. Compose/Caddy 전용 GAME_DOMAIN은 Railway+Pages 방식에서는 필수가 아니다. TRUSTED_PROXY_IPS에 추측한 CIDR/전체 인터넷을 신뢰하도록 넣지 않는다.

## 5. 승인 후 구축 실행 순서

1. **읽기 전용 기준 확보:** 관리자 콘솔에서 프로젝트/서비스/환경 식별자, 연결 브랜치, 현재 배포 SHA, 변수 이름 및 연결 대상 일치 여부, Volume mount/두 파일 경로, 실행 UID, 백업 상태, 요금제와 잔여 한도를 확인한다. 비밀 값은 보고서에 넣지 않는다. Pages의 기존 연결 방식과 운영 웹 존재도 확인한다.
2. **릴리스 후보 정리:** 현 미커밋 변경 중 검토된 범위를 선택한다. 007의 검토/정식 이력 편입과 필요 보완을 별도 작업으로 준비한다. 사용자가 승인한 뒤에만 commit 및 Staging 브랜치 push를 한다. main은 건드리지 않는다. 연결을 만들거나 저장하면 첫 자동 배포가 일어날 수 있으므로 배포 승인까지 먼저 받는다.
3. **Staging Supabase 생성:** 사용 가능한 Free 한도/조직 과금을 확인한 후 새 빈 프로젝트를 만든다. 운영 dump, auth.users, 친구 관계, JWT 서명키를 복제하지 않는다. 새 프로젝트 식별자를 별도 기록한다.
4. **스키마 적용:** 새 프로젝트임을 재확인하고 `001 → 002 → 003 → 004 → 005 → 006 → 검토된 007` 순으로 적용한다. 001은 bootstrap이며 기존 DB에 무조건 재실행하지 않는다. 각 단계 성공·정의·ACL을 기록한다. 005를 적용하더라도 그 뒤 006을 생략하지 않는다. SQL Editor 수동 적용과 CLI migration ledger를 혼용하지 않도록 적용 방식/이력을 정한다. 기존 CLI 링크를 믿고 `db push`하지 않는다. 프로젝트를 지정하지 않은 실행 금지.
5. **Auth 구성:** Staging에서 Anonymous Sign-Ins와 프로젝트별 URL allowlist를 설정한다. 미사용 공급자는 임의 복제하지 않는다. CAPTCHA/가입 제한과 현재 앱 호환성을 검증한다. 007 owner/EXECUTE 권한, RLS 활성 상태, read_account_session 의존성을 확인한다. 운영에는 이번 bootstrap을 실행하지 않는다.
6. **Staging Railway 생성:** 새 service/environment, 새 빈 Volume, 단일 replica를 구성한다. 저장소 루트를 build context로 루트 Dockerfile을 사용하고 Node 24 명령을 유지한다. 기본 실행 명령을 임의로 dev/watch로 바꾸지 않는다. 연결 source는 승인된 Staging 브랜치만 사용한다.
7. **서버 설정:** production 모드, Staging Supabase, 전용 Volume의 `/data/boardgame.sqlite`와 `/data/stats.sqlite`, Staging 웹의 정확한 HTTPS origin을 구성한다. `/health` healthcheck, HTTPS/WSS 도메인, mount 쓰기 권한을 확인한다. 운영 Volume/변수 참조를 사용하지 않는다. 장기 WS 테스트 중 절전을 피하고, 비용 절약을 위한 테스트 종료 후 중지는 별도 운영 절차로 정한다.
8. **Staging Pages 연결:** 저장소 root, build `npm run build:pages`, output `apps/mobile/dist-web`, Node 24를 설정한다. 기본 배포 브랜치를 Staging 후보로 연결한다. Production/Preview 변수 scope 모두 Staging 리소스만 사용하거나 불필요한 preview 빌드를 비활성화한다. 프리뷰를 사용할 때는 허용된 정확한 origin만 서버에 추가한다. wildcard 허용 금지.
9. **연결 확인 후 테스트:** 공개 번들에는 Staging 서버/Supabase만 들어 있는지 확인한다. 페이지 origin → WSS/HTTP → Supabase 조합 확인 후에만 새 테스트 계정을 만든다. 기존 Staging 사이트 이용자에게 계정·친구·전적이 이어지지 않는 별도 테스트 환경임을 안내한다.
10. **분리 완료 기록:** 새 서비스 재시작/재배포 후 Staging 전적·복구를 확인하고 아래 검증표를 완료한다. 환경별 SHA, migration 목록, 검증 일시·기기, rollback 대상, 비용 예측을 기록한다. 완료 승인 후 향후 기능 개발의 기본 검증 환경으로 사용한다.

운영 서버가 기존 Staging origin을 계속 허용하는 경우, 완전 분리의 후속 작업으로 해당 origin 제거를 검토한다. 이는 운영 설정 변경이므로 별도 승인과 영향 확인 후 수행하며 이번 구축 준비에서 변경하지 않는다.

## 6. Staging 검증 계획

아래는 **미실행 계획**이다. 새 Staging 계정 A/B/C/D와 최대 6인 테스트 계정을 만들고, 브라우저 프로필을 분리한다. 실제 사용자 개인정보·운영 UUID/토큰을 가져오지 않는다.

| 검증 | 방법과 합격 기준 |
| --- | --- |
| 연결 격리 | HTML/JS의 endpoint와 서버 콘솔 연결 대상을 비교. 운영 호스트/DB/Volume 참조 없음. JWT·키를 캡처 로그에 남기지 않음 |
| Auth·프로필 | 새 익명 가입, 닉네임 저장, 새로고침·세션 재사용 성공. profiles 타인 조회/수정 거부 |
| 세션 보안 | 구세션/만료·위조 JWT 거부, 최신 세션만 허용. Auth 장애 시 권한 우회 없이 실패 |
| 친구 | A↔B, A↔C, B↔C 수락 관계 구성. D 비친구, pending·거절·삭제 시나리오 검증. 제한 테이블 직접 접근 거부 |
| 방 | A 생성, 초대 코드로 B 등 참가, 중복 참가·잘못된 코드·미인증 거부. 현 사양은 인증+코드이며 친구 관계 필수 입장은 아님 |
| 게임 | 2~6인 참가, 턴·레이즈·올인·사이드 팟·쇼다운·칩 합계, 접속 종료/복귀, 비공개 카드 노출 없음 |
| 전적 | 핸드 완료 후 본인-친구 비교와 A가 B-C 비교 성공. 필요한 세 관계 중 하나 삭제/pending이면 거부. 동일 UUID/잘못된 UUID·미인증 거부. 재시도/복구 시 중복 집계 없음 |
| RPC ACL | authenticated 허용, PUBLIC/anon/service_role의 007 실행 제한과 owner/search_path 확인. 직접 테이블 SELECT 범위가 확대되지 않음 |
| 웹 경계 | 허용 origin 정상, 불허 origin의 HTTP/WS 거부, 토큰을 URL로 보내지 않음. CORS는 인증 대체가 아님 |
| 영속성 | 테스트 전적 생성 후 Staging만 재시작/재배포. 두 DB 경로 및 기존 기록 유지 확인. 방 복구는 RECONNECT_MS 등 기존 만료 조건 내에서 검증 |
| 교차 환경 | Staging 내 테스트용 두 번째 로컬/격리 Auth 프로젝트의 유효 토큰도 Staging 서버가 거부하는지 검증. 운영에 대한 JWT 요청은 수행하지 않음; 실제 양방향 운영 부정 테스트는 별도 승인 |
| 웹/PWA·네이티브 | PC Chrome, iPhone Safari/PWA, Android Chrome에서 초대·새로고침·키보드·오디오·복귀. 기존 native 인증·WS 호환 확인 |
| 롤백 연습 | Staging에서 직전 서버/웹 버전으로 복귀해 동일 Volume과 이전 클라이언트 호환 확인. 두 SQLite의 일관된 백업/복구 연습은 Staging 데이터만 사용 |

기존 로컬 검사 기준: `npm run typecheck`, `npm test`, `npm run test --workspace=@boardgame/mobile`, Pages build 및 P1/P2 브라우저 검사. 구체 명령과 기기 항목은 [testing](testing.md), [web-device-checklist](web-device-checklist.md)를 따른다. 이번 문서 작업에서는 재실행하지 않았다. 과거 PASS를 현재 Staging E2E PASS로 취급하지 않는다.

## 7. 추가 비용과 무료 플랜

2026-11-18 공식 공개 페이지 조회 기준, USD/월. 세금·환전·선택 도메인·백업 추가 비용은 제외하며 계정의 실제 청구·할인·잔여 quota는 미확인이다. 과거 문서의 추정 범위를 현재 견적으로 재사용하지 않는다.

| 서비스 | 확인된 가격/제약 | 추가 비용 판단 |
| --- | --- | --- |
| Cloudflare Pages Free | 월 500 builds, 동시 1 build, 20,000 files, 파일당 25 MiB 한도 | 정적 웹이 무료 범위에 있으면 추가 $0. 계정 내 기존 사용량과 함께 확인. Functions 등 추가 서비스는 계획에 없음 |
| Supabase Free | $0, active project 2개 한도, 500 MB DB, 1주 비활성 pause | 사용할 수 있는 Free 프로젝트 한도가 남아 있으면 Staging 추가 $0. pause가 테스트를 막을 수 있음 |
| Supabase Pro | 조직 플랜 월 $25부터, 추가 프로젝트 $10/월부터 | 기존 유료 조직 내 추가 프로젝트는 무료로 간주하지 않음. 기존 구독/compute credit 배분과 크기에 따라 확정 |
| Railway | Hobby 월 $5 최소 사용료, 사용량 포함. RAM $10/GB-month, CPU $20/vCPU-month, egress $0.05/GB, Volume $0.15/GB-month | 기존 Hobby에 서비스를 더할 때 무조건 구독료 $5가 추가되는 것은 아님. 추가 자원 사용량과 기존 포함 사용량 잔여분으로 계산 |
| Railway Free | 월 $1 무료 자원 제공 | 소규모 실험 가능성만 확인. 지속 서버+Volume 요구와 실제 quota 충족 여부를 확인하지 않았으므로 상시 Staging 무료를 보장하지 않음 |

출처: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Supabase pricing](https://supabase.com/pricing), [Supabase 조직 과금](https://supabase.com/docs/guides/platform/billing-faq), [Railway pricing](https://docs.railway.com/pricing).

예산 산식: Staging 자원 사용료를 S, 기존 Railway 사용료를 P라 할 때 같은 Hobby 청구 범위에서 증가분은 `max(5, P+S) - max(5, P)`이다. 현재 P와 측정된 S가 없어 실제 월 증가액은 미확정이다.

산술 예시일 뿐 사용량 예측은 아니다: 한 달 평균 RAM 0.25 GB, CPU 0.02 vCPU, Volume 과금량 1 GB, egress 1 GB라면 S는 `2.50 + 0.40 + 0.15 + 0.05 = $3.10`. 같은 Hobby 포함액이 이미 소진됐고 Supabase Free/Pages Free를 쓰면 이 가정에서 추가 $3.10, 기존 유료 Supabase 조직에 최소 추가 프로젝트를 쓰면 $13.10부터다. 사용량 가정을 실제 측정치로 대체하기 전에는 예산 확정값으로 사용하지 않는다. 새 별도 Hobby 구독이라면 최소 $5 조건을 따로 적용한다.

## 8. 데이터 혼용·보안·운영 위험

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 웹만 분리, 운영 Supabase 공유 | 테스트 가입·친구 관계가 운영에 기록, 세션 교체 영향 | 프로젝트 전체 분리, 새 테스트 사용자 |
| 서버만 분리, 운영 Volume 공유 | 전적 오염, checkpoint 잠금 충돌/정보 노출 | 독립 새 Volume, replica 1, 경로와 mount 대조 |
| 서로 다른 환경의 웹/서버/Auth 혼합 | 로그인 실패 또는 잘못된 환경 데이터 생성 | 빌드 전 구성 검사 + 공개 산출물 호스트 확인 + 서버 변수 대조 |
| 브랜치 연결 실수 | Staging push나 main 병합으로 운영 자동 배포 | 연결 branch·preview 범위 확인, 승인 전 push 금지 |
| 오래된 JS/세션 | 이전 운영 endpoint를 계속 사용 | 새 빌드/캐시 갱신, 기존 탭/PWA 재실행 안내, Staging 저장소 전환 계획 |
| 공개 프리뷰와 익명 가입 남용 | 비용·계정 증가 | 공유 대상 제한, 필요 시 별도 접근 통제 검토, rate limit/CAPTCHA 호환성 검증 |
| EXPO_PUBLIC 비밀키 삽입 | 클라이언트 공개로 권한 유출 | publishable key만 사용, service-role/admin 키 금지 |
| 007 draft 누락·정의 불일치 | 비교 실패 또는 권한 계약 차이 | 정식 migration/운영 정의 대조, ACL·세 관계 부정 테스트 |
| Volume 권한/경로 오류 | 시작 실패 또는 비영속 저장 | mount/UID/두 파일 경로 및 재배포 보존 검사 |
| 재배포·무료 pause | WS 끊김, 복귀/인증 실패 | 게임 없는 배포 시간, 복구 테스트, 비용과 가용성 선택 |

## 9. Staging → Production 승격과 롤백

1. 기능 브랜치의 검토된 변경을 Staging 후보에 반영하고 CI·실제 Staging 검증을 통과시킨다. 후보 SHA, SQL 파일/체크섬, 테스트 결과, 환경 조합, 롤백 버전을 묶어 기록한다. 혼합된 미커밋 디렉터리를 배포하지 않는다.
2. main에 새 변경이 들어왔다면 최종 승격 후보를 다시 구성해 Staging에서 재검증한다. merge/squash로 SHA가 달라지는 경우 테스트된 코드 트리와 최종 tree의 일치를 확인한다. 검증한 기능 목록만 같다는 이유로 다른 코드를 승격하지 않는다.
3. 운영 migration 필요 여부와 실제 설치 정의를 비교한다. 007은 이미 설치됐다는 사용자 보고가 있으므로 무조건 재실행하지 않는다. 변경이 필요하면 기존 앱과 호환되는 additive 변경을 먼저 검토한다. Staging DB/SQLite 자체를 운영으로 옮기지 않는다.
4. **main 병합/push 및 자동 배포가 시작되기 전에 운영 승인을 받는다.** Railway의 main 자동 배포를 유지한다면 병합이 곧 운영 릴리스 시작점이다. 승인 후 준비된 유지보수 시간에 수행하며 CI 대기 여부도 사전에 확인한다. 자동 배포를 수동 gate로 바꾸려면 그 설정 변경 자체를 별도로 승인받는다.
5. 사용자 승인 후 운영 두 SQLite를 일관된 시점으로 백업하고 이전 서버 image/배포 ID, 웹 배포 ID, 설정을 비공개 기록한다. 필요한 Supabase 변경 → 구/신 클라이언트 호환 서버 → 운영 변수로 새 웹 빌드 순서를 따른다. 병렬 자동 배포라면 순서를 보장할 제어를 먼저 준비한다.
6. Staging JS 번들에는 Staging 값이 박혀 있으므로 그대로 운영으로 승격하지 않는다. **동일 검증 소스/lockfile을 운영 변수로 재빌드**하고 호스트 조합을 재검사한다. 서버 이미지가 동일해도 환경별 런타임 변수와 Volume은 유지한다.
7. 운영 smoke test 범위와 계정을 별도로 승인받고, 오류율/인증/WS/전적을 관찰한다. 문제가 생기면 새 변경 진행을 중단한다.

롤백 원칙:

- Pages는 해당 환경의 이전 검증 배포로 복귀한다. 이전 웹이 새 서버/RPC와 호환되는지 사전 테스트한다. 오래 열린 탭은 자동으로 즉시 바뀐다고 가정하지 않는다.
- Railway는 해당 환경의 이전 성공 배포/image와 기록된 변수로 복귀한다. Volume은 보존하며 삭제·초기화하지 않는다. 코드 롤백이 DB를 되돌려 주지 않는다.
- Supabase는 backward-compatible additive migration을 유지하면서 앱을 먼저 되돌리는 방식을 우선한다. 파괴적인 down migration이나 운영 전체 복원은 기본 롤백이 아니다. 필요 시 수정 migration과 별도 승인·복구 계획을 준비한다.
- 두 SQLite 복원은 새로 기록된 전적을 잃을 수 있다. 쓰기를 중단하고 두 파일의 일관성·손실 범위를 확인한 뒤 별도 승인 후 수행한다. 개별 파일을 실행 중 임의 복사하는 방식은 금지한다.
- 사용자 허락 없이 main에 revert commit/push하지 않는다. 같은 자동 배포 경로를 다시 트리거할 수 있다. 운영 배포/백업 보존 기간과 실제 복구 시간을 Staging 연습에서 측정하며 무중단을 보장하지 않는다.

## 10. 실제 구축 전 승인 목록과 남은 확인

이번 요청은 조사·문서 작성까지만 승인했다. 아래 항목은 **향후 실행 시** 대상·비용·변경 내용을 제시하고 승인받는다. 지금 승인이나 자격 증명 제공을 요구하는 것은 아니다.

- Supabase 프로젝트 생성 및 과금 선택, Staging migration/익명 Auth/보안 설정 적용.
- Railway 서비스/environment/Volume 생성, 연결 브랜치·환경변수·권한·도메인·첫 배포 설정 및 비용.
- 기존 Staging Pages 재연결/변수 변경/재빌드·첫 배포, 필요한 신규 Pages 생성 및 공개 범위.
- 검토된 코드/SQL의 commit·Staging push, 이후 별도 main 병합/push 및 운영 배포.
- Staging 테스트 사용자·친구·게임 데이터 생성과 Staging 재시작/백업·복구 연습.
- 운영 백업/재배포, 운영 origin 허용 목록·자동 배포 정책 변경, 필요한 운영 SQL, 운영 smoke test 및 데이터 복구.

구축 시작 전 미확인 항목: 현재 Pages Git/Direct Upload 방식과 branch·변수 scope·배포 SHA, 운영 웹 위치, Railway source/build/start/mount/UID/replica/절전/백업/실사용 과금, Supabase 프로젝트/플랜/Free 잔여 한도/Auth/RLS/RPC 실제 정의, GitHub 배포 연동/보호 규칙. 로컬 자료와 공개 가격만으로 확인할 수 없는 항목을 완료로 표시하지 않는다.

문서 검증 범위: 참조 파일과 설정 흐름을 코드로 대조하고 공식 가격·배포 문서를 확인했다. 공개 웹 접근은 실패했고 로그인·원격 관리 콘솔·운영 DB 조회·게임·테스트·빌드·배포는 실행하지 않았다. 이번 산출물은 이 문서 1개다.
