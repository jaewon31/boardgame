# 반복 배포 절차 — Preview/Staging과 Production

갱신: 2026-11-22 KST · 작성: Claude Code. 모든 개발 에이전트(Codex, Claude Code)가 따르는 반복 배포 절차다. 장기 원칙은 [AGENTS.md](../AGENTS.md), 현재 진행 상태와 실행 커밋은 [AI 인계](ai/HANDOFF.md)에 둔다. **이 문서의 명령은 실행 허가가 아니다.** 각 원격 작업은 AGENTS.md 승인 경계를 따른다.

## 1. 운영 방침 (2026-11-22 사용자 결정)

- 이전 계획 "멀티플레이 검증 후 테스트 서버와 관련 리소스 삭제"를 **철회**한다. 테스트 환경은 반복 개발과 배포 검증에 계속 쓰는 **재사용 환경**으로 유지한다.
- 테스트 환경을 한 번 구축한 뒤에는 Railway 프로젝트·Supabase 프로젝트·SQLite 볼륨을 **매번 새로 만들지 않는다.** 같은 리소스에 다시 배포한다.
- 2026-11-18의 "별도 Staging 서버·Supabase·배포 브랜치 철회" 결정 중 **별도 서버·Supabase 부분은 이 결정으로 대체**된다. Staging 전용 Git 배포 브랜치를 만들지 않는다는 부분과 Production 재사용 원칙은 유지한다.

## 2. 환경 구성

| 구분 | Production | Preview/Staging (테스트) |
| --- | --- | --- |
| 웹 | Cloudflare Pages 프로젝트 `friends-table-staging`의 **운영 배포**(`https://friends-table-staging.pages.dev`, 운영 브랜치 `deploy/web-staging`). 이름에 staging이 있지만 실제 서비스 환경이다 | 같은 Pages 프로젝트의 **Preview 별칭**. 현재 예정 별칭 `https://fix-multiplayer-stability.friends-table-staging.pages.dev`(`--branch fix-multiplayer-stability`) |
| 게임 서버 | 기존 Railway 서비스 `@boardgame/server`(GitHub 연결, `main` 자동 배포 켜짐) | 별도 Railway 프로젝트 `friends-table-mp-test`, 서비스 `boardgame-server-test`. **GitHub 소스 연결 없음**, CLI 업로드(`railway up`)로만 배포 |
| 인증·DB | 기존 Supabase 프로젝트 | 별도 Supabase 프로젝트 `friends-table-mp-test` |
| SQLite | 운영 볼륨 `/data`(`boardgame.sqlite`, `stats.sqlite`) | 테스트 서비스의 별도 볼륨 `/data`. **운영 SQLite를 복제하지 않는다** |

- 테스트 서버는 GitHub `main` 자동 배포에 연결하지 않는다. 서비스에 저장소를 연결하거나 운영 프로젝트를 복제(duplicate)하지 않는다(복제 시 `main` 자동 배포와 구버전 배포 위험).
- Preview 웹은 **테스트 게임 서버 WSS와 테스트 Supabase 공개 값**으로 빌드한다. 운영 서버·운영 Supabase 값으로 빌드한 결과물을 Preview 검증 결과로 기록하지 않는다.
- Preview 별칭은 브랜치 이름으로 정해지고 테스트 서버 `WEB_ALLOWED_ORIGINS`는 정확한 origin만 허용한다. 따라서 Preview 배포에는 **고정된 하나의 `--branch` 값**을 쓴다. 별칭을 바꾸려면(예: 작업 브랜치와 무관한 `preview`) 먼저 사용자 결정을 받고 테스트 서버 `WEB_ALLOWED_ORIGINS`를 함께 바꾼다. 배포마다 바뀌는 해시 URL은 Origin 목록에 넣지 않는다.
- Cloudflare Preview는 기본 공개다. 테스트 서버와 테스트 Supabase에 운영 사용자 데이터가 없어야 하는 이유다.
- 실제 리소스 ID·구축 진행 상태는 이 문서가 아니라 [AI 인계](ai/HANDOFF.md)에 기록한다. **구축이 끝나지 않은 항목을 완료로 기록하지 않는다.**

## 3. 운영 보호 원칙

- 운영 Railway 서비스와 환경 변수는 사용자 명시적 승인 없이 수정·재배포·재시작하지 않는다.
- 운영 Supabase 데이터와 스키마(SQL, RLS, RPC, 인증 설정)는 명시적 승인 없이 수정하지 않는다.
- Cloudflare Production 배포는 명시적 승인 없이 실행하지 않는다. `wrangler pages deploy`는 `--branch`를 빼거나 운영 브랜치명(`deploy/web-staging`)을 쓰면 **운영 배포**가 되므로, Preview 배포에는 항상 고정 Preview 브랜치명을 명시한다. Git 작업 폴더에서는 브랜치가 자동 감지되므로 생략하지 않는다.
- 테스트 환경에는 운영 SQLite 데이터를 복제하지 않고, 별도 Supabase 프로젝트를 사용한다. 운영 키·URL을 테스트 서버 변수에 넣지 않는다.
- **배포 소스를 반드시 확인한다.** 운영 서버의 실행 커밋과 원격 `main`이 다를 수 있다(2026-11-22 확인: 실행 중 `595cd676`, 원격 `main`=`a666688`, 이 커밋은 웹 Origin 지원 이전). 운영 Railway의 "Deploy Latest Commit"이나 `main` push는 구버전을 배포할 수 있다.
- Git push, 운영 배포, 리소스 삭제는 **각각 별도 승인**을 받는다. 하나의 승인을 다른 작업으로 확장하지 않는다. `main` push는 운영 Railway 자동 배포를 유발하므로 기본 금지다.
- 테스트 환경 작업도 원격 변경이다. 테스트 Railway 배포·변수 변경, 테스트 Supabase SQL·인증 설정 변경, Cloudflare Preview 배포는 실행 직전에 대상·커밋·영향을 보고하고 사용자 승인을 받는다(자동화가 안정될 때까지 동일).

## 4. 표준 개발 흐름

| 단계 | 내용 | 생략 조건 |
| --- | --- | --- |
| 1 | 로컬 코드 수정 | — |
| 2 | TypeScript(`npm run typecheck`)와 관련 단위 테스트 | 문서만 바뀐 경우 링크·상태 검토로 대체([검증 절차](testing.md)) |
| 3 | 서버 변경 시 서버 테스트(`npm test`) → 테스트 Railway 배포 | 서버 영향 경로가 바뀌지 않았으면 Railway 재배포 생략 |
| 4 | 웹 변경 시 모바일 테스트 → Preview 빌드 → Cloudflare Preview 배포 | 웹 영향 경로가 바뀌지 않았으면 Cloudflare 재배포 생략 |
| 5 | Health, Origin, WebSocket 연결 검사 | 3·4를 모두 생략했으면 생략 가능 |
| 6 | 주요 멀티플레이 변경 시 실제 다중 브라우저 테스트 | 멀티플레이 동작에 영향 없는 변경 |
| 7 | 검증 결과 기록(인계 문서, 필요 시 기능 보고서) | — |
| 8 | **별도 승인 후** Production 배포(7절 체크리스트) | — |

변경 판정은 **테스트 환경에 마지막으로 배포한 커밋**(인계 문서 기록)과 후보 커밋의 `git diff --name-only`로 한다.

- 서버 영향 경로(운영 Railway watch 경로와 동일): `apps/server/**`, `packages/shared/**`, `Dockerfile`, `package.json`, `package-lock.json`.
- 웹 영향 경로: `apps/mobile/**`(테스트 전용 파일 제외 가능), `packages/shared/**`, `scripts/build-pages.cjs`, `package.json`, `package-lock.json`, 그리고 Preview 빌드 env 값.
- `packages/shared`(프로토콜) 변경은 서버·웹 모두 재배포한다. 한쪽만 재배포할 때는 배포된 상대 쪽과의 프로토콜 호환을 확인한다.

## 5. 단계별 세부 절차

### 5.1 배포 전 공통 확인

1. `git status --short --branch`, `git log -1`로 후보 커밋 고정. 미커밋 변경이 있으면 배포하지 않는다(배포 소스는 깨끗한 커밋).
2. 배포 대상 확인: 테스트 Railway 프로젝트/환경/서비스 ID(인계 문서), Pages 프로젝트명과 Preview 브랜치명. 운영 ID와 혼동하지 않도록 명령에 ID를 명시한다.
3. 환경 변수는 **설정 여부와 형식만** 확인하고 값을 출력하지 않는다.

### 5.2 테스트 Railway 배포

- 후보 커밋의 **깨끗한 `git worktree`**에서 테스트 프로젝트 ID를 명시해 `railway up`으로 업로드한다(`.dockerignore`가 `.env*`·`*.sqlite*`·`dist-web`·`.qa-web` 제외). `--new`·`--yes`·`--no-gitignore`는 쓰지 않는다.
- 테스트 서버 변수(값은 인계 문서/대시보드에서 확인, 문서에 비밀 값 기록 금지): `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT`, `STATE_DB_PATH=/data/boardgame.sqlite`, `STATS_DB_PATH=/data/stats.sqlite`, `RAILWAY_RUN_UID=0`, `WEB_ALLOWED_ORIGINS`(Preview 별칭만), `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY`(**테스트 Supabase 공개 값**), 선택 `GAME_TIMING_LOG=1`. Supabase 변수 없이 배포하면 서버가 시작 시 종료한다.
- `WEB_ALLOWED_ORIGINS`에 경로·끝 slash·와일드카드가 있으면 서버가 시작 시 예외로 종료한다.

### 5.3 Cloudflare Preview 빌드·배포

- Preview 빌드 입력은 git 무시 파일(예: `apps/mobile/.env.preview.local`)에 **테스트 서버 WSS와 테스트 Supabase 공개 값**을 둔다. 2026-11-22 기준 이 파일은 운영 값으로 만들어져 있으므로 테스트 환경용으로 다시 준비해야 한다(인계 문서 참조).
- 빌드: `node --env-file=apps/mobile/.env.preview.local scripts/build-pages.cjs`(`checkPages` 포함).
- 결과물 검사: 게임 서버·Supabase 값이 **테스트 환경 값**인지, E2E 식별자·테스트 토큰·로컬 주소·비공개 파일이 없는지, `_redirects`·`_headers`·`404.html` 존재.
- 배포 형식(승인 후, 고정 Preview 브랜치 명시): `npx wrangler@<고정 버전> pages deploy apps/mobile/dist-web --project-name friends-table-staging --branch <Preview 브랜치> --commit-hash <후보 SHA> --commit-message "<요약>"`.

### 5.4 Health, Origin, WebSocket 검사

- `GET https://<테스트 서버>/health` → 200, 응답에 저장 실패 표시 없음(`durable` 확인).
- Origin: Preview 별칭 Origin 허용, 운영 Pages Origin과 임의 Origin은 차단되는지(테스트 서버는 Preview만 허용).
- WSS `/lobby` 업그레이드 성공 후 비인증 요청에 `AUTH_REQUIRED`가 오는지.
- Preview 페이지 로드 시 네트워크 요청의 게임 서버·Supabase 목적지가 테스트 환경인지(운영 호스트로 가는 요청 0).

### 5.5 다중 브라우저 테스트(주요 멀티플레이 변경)

- Preview 별칭에서 독립 브라우저 프로필 여러 개(최소 2, 가능하면 4)로 방 생성·참가·핸드 진행·새로고침·재접속을 확인한다. 테스트 Supabase에만 익명 계정이 생긴다.
- 로컬 자동 E2E(`scripts/test-game-e2e.cjs`, [검증 절차](testing.md))는 이 단계를 대체하지 않고 보완한다.

### 5.6 결과 기록

인계 문서에 날짜·후보 SHA·배포한 쪽(서버/웹)·테스트 배포 ID·Preview 배포 ID·검사 결과·미검증 항목을 남긴다. **테스트 환경에 마지막으로 배포한 서버/웹 커밋**을 갱신해 다음 변경 판정 기준으로 쓴다.

## 6. 비용 절감: 중지·재시작 (문서화만, 검증 전 실행 금지)

아래 방법은 데이터 보존과 재시작 가능 여부를 **테스트 환경에서 검증하기 전에는 실행하지 않는다.** 검증도 승인 후 수행한다.

| 대상 | 중지 방법(문서 근거) | 재시작 | 미검증 위험 |
| --- | --- | --- | --- |
| 테스트 Railway 서비스 | 활성 배포 Remove(대시보드 Deployments의 메뉴) 또는 CLI `railway down`. Railway 문서상 Remove는 실행 중 배포를 멈추고 이력으로 옮긴다. 볼륨 데이터는 배포와 별개로 유지된다고 안내됨 | 소스 미연결 서비스이므로 기록된 커밋의 깨끗한 worktree에서 `railway up` 재업로드 | Remove 후 볼륨 데이터·변수·도메인 유지 여부, 재업로드 후 checkpoint·전적 복원 |
| 테스트 Railway(대안) | Serverless(App Sleeping) 설정 | 요청 시 자동 기동 | WebSocket·heartbeat가 있는 서버에서 실제로 잠드는지, 기동 지연 중 클라이언트 동작 |
| 테스트 Supabase(Free) | 대시보드 Pause, 또는 7일 저활동 시 자동 일시정지 | 대시보드 Resume/Restore. 복원 가능 기한은 공식 문서마다 표기가 달라(90일/1년) **대시보드 표시 기한을 따른다** | Free 플랜은 자동 백업이 없음. 복원 후 정책·RPC·익명 로그인 설정 유지 여부 |

검증 절차(승인 후 1회): ① 테스트 환경에서 방·전적·익명 계정 생성 → ② 서버 중지 → ③ 볼륨 파일 존재 확인(`railway volume files list`, 조회만) → ④ 재시작 → ⑤ health·checkpoint 복원·전적·로그인 확인 → ⑥ Supabase Pause/Resume 후 테이블 행 수·정책·RPC·인증 설정 비교 → ⑦ 결과를 인계 문서에 기록. 통과 전에는 테스트 환경을 계속 켜 둔다. **운영 환경에는 적용하지 않는다.**

## 7. Production 배포 체크리스트 (별도 승인 필수)

1. 같은 후보 SHA가 테스트 환경에서 4·5절 검증을 통과했고 결과가 기록됨.
2. 운영 실행 커밋 확인: Railway 활성 배포 Details의 커밋, Pages 운영 배포 소스. 원격 `main`과 다를 수 있음을 전제로 비교.
3. 운영 변경 diff: 서버·웹·변수·Supabase 스키마 각각. Supabase 마이그레이션은 운영 카탈로그와 비교하고 설치된 SQL을 재실행하지 않는다.
4. 데이터 보존: 진행 중 게임 유무, 두 SQLite 백업(방 0개일 때, [기존 서버 runbook](web-existing-server-runbook.md) 데이터 보존 절), 롤백 대상 배포 ID.
5. 배포 방법이 의도한 소스를 쓰는지 확인(운영 Railway의 "Deploy Latest Commit"·`main` push 금지).
6. 승인 항목을 분리해 받는다: Git push / 운영 Railway 배포·변수 / 운영 Supabase 변경 / Cloudflare 운영 배포.
7. 배포 후 운영 health·Origin·WSS·실제 로그인 확인, 문제 시 기록된 배포로 롤백. 결과 기록.

## 8. 배포 자동화 계획 (미구현)

향후 `npm run deploy:preview` 같은 단일 명령으로 4~5절을 자동화한다. **이번에는 계획만 기록하며 스크립트는 구현하지 않았다.**

| 순서 | 자동화 대상 | 실패 시 |
| --- | --- | --- |
| 1 | Git 상태(깨끗함)·후보 커밋·마지막 테스트 배포 커밋 대비 변경 경로 판정(서버/웹/둘 다/없음) | 중단 |
| 2 | TypeScript, 서버·모바일 자동 테스트 | 중단 |
| 3 | 환경 변수 누락·형식 검사(테스트 env 파일, Railway 변수 이름). **비밀 값 출력 금지**, 운영 URL·키 감지 시 중단 | 중단 |
| 4 | 웹 빌드(`build-pages.cjs`) | 중단 |
| 5 | 배포 결과물 검사(테스트 값 포함, 운영 값·테스트 토큰·비공개 파일 없음) | 중단 |
| 6 | **사용자 승인 프롬프트**: 대상 프로젝트·서비스·Preview 브랜치·SHA·배포할 쪽 표시 | 거부 시 중단 |
| 7 | 테스트 Railway 배포(worktree `railway up`)·Cloudflare Preview 배포(고정 `--branch`) | 중단·보고 |
| 8 | Health, Origin, 기본 WebSocket(`AUTH_REQUIRED`) 검사 | 실패 보고 |
| 9 | 결과 보고(인계 문서에 붙일 요약 출력) | — |

설계 원칙: 운영 프로젝트·서비스 ID, 운영 Pages 브랜치, `--branch` 생략을 스크립트가 거부한다. Production 배포는 자동화 대상에 넣지 않는다. 초기에는 실제 배포 직전(6번)에 반드시 사용자 승인을 받는다.
