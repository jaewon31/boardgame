# AI 작업 인계 (Claude Code ↔ Codex)

이 문서는 다음 작업자(Claude Code 또는 Codex)가 **이 문서와 `git status`만으로** 현재 상황을 이어받기 위한 단일 인계 기록이다. 공통 규칙은 [AGENTS.md](../../AGENTS.md), 장기 현황은 [PROJECT_STATUS](../PROJECT_STATUS.md)에 있다. 여기에는 "지금 진행 중인 것과 다음 할 일"만 두고, 상세 근거는 링크한다.

## 1. 기준점

갱신: 2026-11-22 22:57 KST (테스트 환경 재사용 정책 반영) · 작성: Claude Code

| 항목 | 값 |
| --- | --- |
| 작업본 | `C:\Users\jwseo\Desktop\boardgame` |
| 브랜치 / HEAD | `fix/multiplayer-stability` (로컬 전용, upstream 없음). 분기점 `a1505a2` = `codex/consolidate-friends-table` HEAD. 이 브랜치 커밋: `2e97126` 인계 문서, `9366e4a` CI 트리거, `27a9148` 지연 관측 로그, `df6fea3` 관측 정확도·roomRef HMAC 수정, 이어서 초대 링크 수정·본 문서 갱신. 최신 HEAD는 `git log -1`로 확인 |
| 이전 브랜치 | `codex/consolidate-friends-table` @ `a1505a2` — 그대로 보존, 이후 커밋 없음 |
| 미푸시 커밋 | `353723e`, `1b09bd1`, `29085e1`, `50ea5cd`, `e3d5992`, `903a7dd`, `a1505a2` + 이 브랜치의 커밋. 원격 어느 브랜치·태그에도 없음 |
| GitHub 원격 백업 | **보류**(사용자 결정 2026-11-22). 계획: 태그 `backup/consolidate-20261122`(→`a1505a2`), 브랜치 `codex/consolidate-friends-table`. force push 금지. push는 Pages·Railway 설정 확인 후 사용자 PC에서 실행 |
| 원격 (2026-11-22 `ls-remote`) | `main`=`a666688`(조상), `deploy/web-staging`=`codex/tempo-hand-history`=`595cd67`(분기, 앱 코드는 `353723e`와 동일). 로컬 `origin/*` 추적 ref는 오래됨(fetch 전) |
| 미커밋 변경 | 없음 예정 — 아래 문서 변경은 사용자 승인으로 로컬 커밋(`git log -1`로 확인, push 안 함). 대상: 본 문서(Preview 사전 점검 기록 + 정책 변경), `AGENTS.md`, 신규 `docs/deployment-workflow.md`, `docs/web-staging-runbook.md`·`docs/web-existing-server-runbook.md`·`docs/decisions.md`·`docs/PROJECT_STATUS.md`·`docs/README.md`·`docs/web-deployment.md`. 코드는 `290cb8a`(E2E)·`21c7297`(카드·효과음)까지 커밋. push 안 함 |
| 백업 | `C:\Users\jwseo\Desktop\boardgame-backups\20261122-020217\` — `repo-all.bundle`(전체 ref), `uncommitted.patch`, `worktree/`(미커밋·미추적 파일 원본 + CLAUDE.md), `status.txt`, `HEAD.txt`, `branches.txt`. 검증: bundle verify, 클론 후 HEAD 일치, 패치 역적용 check, 파일별 바이트 비교 모두 통과. 무시 파일(.env.local, SQLite 등)은 백업에 포함하지 않음 |

## 2. 현재 상태와 진행 중 작업

- **운영 방침 변경(2026-11-22 사용자 결정, 문서 반영만)**: "멀티플레이 검증 후 테스트 서버·관련 리소스 삭제" 계획 **철회**. 테스트 환경은 반복 개발·배포 검증용 재사용 환경으로 유지(Production: 기존 Pages 운영 배포+Railway+Supabase+SQLite / Preview·Staging: 별도 Railway 프로젝트+별도 Supabase+별도 SQLite 볼륨+기존 Pages Preview 별칭, 테스트 서버는 `main` 자동 배포 미연결). 장기 원칙은 [AGENTS.md](../../AGENTS.md) 6절, 절차·체크리스트·중지/재시작·자동화 계획은 [반복 배포 절차](../deployment-workflow.md). 아래 사전 점검 기록 중 "이번 검증 한정 예외", "Delete after test", "정리: 삭제"는 이 결정으로 대체된다.
- **테스트 환경 구축 상태(2026-11-22 22:57 기준, 완료 아님)**:
  - 생성됨: Railway 프로젝트 `friends-table-mp-test`(서비스 `boardgame-server-test`, 소스 미연결, 빈 볼륨 `/data`, 도메인, 변수 8개), Supabase 프로젝트 `friends-table-mp-test`(001~006 적용·운영과 정책/함수 대조 완료)
  - 남음: ① Supabase Anonymous Sign-Ins 활성화 ② 테스트 Railway에 테스트 Supabase `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY` 설정 ③ 첫 배포(`290cb8a` worktree `railway up`) ④ health·Origin·WS 검증 ⑤ Preview env 파일을 **테스트 서버 WSS·테스트 Supabase 값**으로 다시 준비(현재 `.env.preview.local`은 운영 값) → 재빌드·결과물 검사 ⑥ Cloudflare Preview 배포 ⑦ 다중 브라우저 테스트 ⑧ 중지·재시작 검증([절차](../deployment-workflow.md) 6절, 검증 전 실행 금지)
  - 결정(2026-11-22 사용자): 테스트 환경은 삭제하지 않고 재사용. Preview 별칭은 `fix-multiplayer-stability` 유지(브랜치명·URL 변경 없음). Railway 테스트 프로젝트 설명의 "Delete after test" → "Reusable Preview/Staging environment" 변경 승인·**완료**(아래 시각 정리 참조, 운영 프로젝트 미변경)
  - 남은 결정: draft 007을 정식 migration으로 승격할지(파일 이동 별도 승인)
  - 마지막 테스트 배포 커밋: 서버 없음 / 웹 없음(아직 배포 안 함)

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
- **완료(커밋): 로컬 4인 브라우저 E2E**(사용자 승인 1번 방식). 실제 Chrome 4개(Chrome for Testing 153.0.8010.12, headless, 클라우드 작업 공간, Node 22.23)가 로컬 서버에 독립 사용자로 접속해 7핸드 진행. 상태 수신→카드 공개 p50 10–12ms·max 89ms, →첫 프레임 p50 27–39ms·max 113ms, 사운드 ON/OFF 동일 수준. 상태보다 늦게 시작한 액션음 0/351, 결과음 순서 32/32, 페이지 오류 0. 방법·재실행은 [testing](../testing.md) "로컬 4인 브라우저 게임 E2E". **청취는 못 함**(headless, 사람이 들어야 함). Windows·Node 24에서 이 실행기는 아직 안 돌림
- **Preview 배포 사전 점검(2026-11-22, 읽기 전용, 배포·설정 변경 없음)** — 사용자 선택: Git push 없이 wrangler 직접 업로드(B). 실제 배포·운영 설정 변경은 미승인.
  - 프로덕션 빌드: `scripts/build-pages.cjs`(Metro `expo export --platform web`)를 더미 공개 값으로 실행 성공(22파일, `checkPages` 통과, 클라우드 Node 22). 결과물에 E2E 식별자·테스트 토큰 0건, 실제 `authClient` 포함.
  - **Railway 대시보드 확인(2026-11-22 21:40, 읽기 전용)**: 서비스 `@boardgame/server`(replica 1, 볼륨 `@boardgame/server-volume`). 실행 중 배포 `d8c6a505`(2026-11-20 15:17 KST) = GitHub `jaewon31/boardgame` 커밋 **`595cd676`**("feat: prepare Friends Table web release"). **자동 배포 브랜치 `main`, 자동 배포 켜짐, Wait for CI 꺼짐**, watch 경로 `/apps/server/**`·`/packages/shared/**`·`/Dockerfile`·`/package.json`·`/package-lock.json`. 대기 중인 staged change 없음. 서비스 변수 11개(`WEB_ALLOWED_ORIGINS`·`STATE_DB_PATH`·`STATS_DB_PATH`·`SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY`·`RAILWAY_RUN_UID`·`NODE_ENV`·`PORT`·`HOST` 등, 값 미출력). **`WEB_ALLOWED_ORIGINS`는 HTTPS origin 1개(`https://friends-table-staging.pages.dev`)만, Preview 별칭·와일드카드 없음.** **볼륨 백업 0개, 현재 플랜은 새 백업·스케줄 생성 불가(Pro 필요)** → 백업은 CLI 다운로드 방식만 가능(11-20 CLI 배포 "production-backup-maintenance"와 PC의 `RailwayBackups/FriendsTable/20261120-production`이 이전 수동 백업으로 추정, 미확인)
  - 서버 호환성: `595cd67`(merge-base `89229f5`) 대비 현재 HEAD의 `packages/shared` 변경 없음, 서버 변경은 기본 꺼진 지연 관측 로그만 → 이번 클라이언트와 프로토콜 호환. `fix/**` push는 Railway(main만 감시)를 배포하지 않음
  - **Cloudflare 미확인**: 내장 브라우저 로그인 검증이 통과되지 않음, Chrome 확장 미연결, 연결된 Cloudflare 커넥터(Workers Bindings, 지원 종료 예정)에 Pages 도구 없음 → Pages 운영 브랜치·Preview 브랜치 제어·Git 연동 여부 미확인. B 방식은 로컬에서 빌드한 결과물을 올리므로 Pages의 Preview 환경 변수는 사용되지 않음(로컬 env 파일 값이 번들에 들어감)
  - **Cloudflare(사용자 wrangler 4.166.0 읽기 확인, 22:00)**: 프로젝트 `friends-table-staging`, 운영 브랜치 `deploy/web-staging`, 운영 배포 `6cd92489`(소스 `595cd67`). Preview 대상 브랜치 `fix-multiplayer-stability`(운영 브랜치와 다름)
  - **Preview 빌드(사용자 Windows Node 24.19.0, HEAD `290cb8a`, 22:14)**: 입력 `apps/mobile/.env.preview.local`(git 무시, 공개 값 3개 + 검증용 `CF_PAGES_URL`; Supabase 값은 `.env.local`과 같고 운영 번들과 SHA-256 일치, 게임 서버 `wss://boardgameserver-production.up.railway.app/lobby`, 초대 origin 미고정·관측 로그 미설정은 운영 빌드와 동일). `node --env-file=apps/mobile/.env.preview.local scripts/build-pages.cjs` → 22파일, 번들 `index-4aff6450…js`. 검사(`~/verify-dist.py`, VM): E2E 식별자·테스트 토큰·로컬 테스트 서버 주소 0(`http://localhost:9999`는 Supabase 라이브러리 기본 상수), 게임 서버·Supabase 값 운영과 일치, `_redirects`의 `/join/* / 200`·catch-all 없음, `404.html`·`index.html`·`manifest`·보안 헤더 있음, 비공개 파일 없음, 새 사운드 스케줄러 포함·이전 결합 코드 없음
  - **Railway Preview 연결 준비(22:30, 읽기 전용)**: `WEB_ALLOWED_ORIGINS`는 쉼표 구분·앞뒤 공백 무시·정확한 origin 일치(`origins.ts`, 실행 중 `595cd67`과 동일). 운영에서는 https만, 경로·끝 slash·와일드카드가 있으면 **서버가 시작 시 예외로 종료** → 오타 하나가 장애. 제안 값: `https://friends-table-staging.pages.dev,https://fix-multiplayer-stability.friends-table-staging.pages.dev`(해시 URL은 배포마다 바뀌므로 넣지 않음). Origin 없는 요청(네이티브)은 계속 허용·JWT 필요. DB 경로 `STATE_DB_PATH=/data/boardgame.sqlite`, `STATS_DB_PATH=/data/stats.sqlite`, 볼륨 mount `/data`(최대 5GB). **원격 `main`=`a666688`(웹 Origin 지원 `89229f5` 이전)** ↔ 실행 중 `595cd67`: 변수 반영은 staged change Deploy(같은 소스 재빌드)로 하고 "Deploy Latest Commit"은 쓰지 않는다(구버전 배포 위험). `main` push도 자동 배포되므로 금지. 반영 후 새 배포 Details의 커밋이 `595cd676`인지 확인, 문제 시 이전 배포 `d8c6a505` Rollback(이미지+이전 변수 복원)
  - **Railway 배포 소스·백업 검토(22:40, 문서·코드, 실행 없음)**: staged change "Deploy"가 어떤 소스로 재빌드하는지 공식 문서에 없음(미검증). 대시보드 Redeploy는 원래 소스+원래 변수(새 Origin 미반영), Rollback은 이전 이미지+이전 변수(Hobby 이미지 보존 72시간), `railway restart`는 기존 이미지·변수 동작 미기재. 커밋을 명시적으로 고정하는 방법은 `595cd676`의 깨끗한 worktree에서 `railway up`(CLI 업로드, `.gitignore`·`.railwayignore` 반영)뿐이며 재빌드이고 `node:24-bookworm-slim` 태그가 고정되지 않아 Node 패치 버전이 바뀔 수 있음. CLI `railway volume list`·`volume files list`는 조회만, `files download`는 볼륨을 바꾸지 않음(이 계정에서 미실행). SQLite: 두 DB 모두 `journal_mode=DELETE`(WAL 없음, `-journal`은 쓰기 중에만), checkpoint DB는 `locking_mode=EXCLUSIVE`라 실행 중 다른 SQLite 연결(백업 API·`VACUUM INTO`) 불가 → 방 0개(쓰기 없음)일 때 파일 복사 + 복사 전후 `-journal` 없음 + 두 번 받아 해시 일치로 확인. stats DB는 일반 잠금이라 `railway ssh`로 컨테이너 `/tmp`에 `VACUUM INTO` 후 scp 가능(운영 컨테이너에서 명령 실행 → 승인 필요)
  - 별도 테스트 서버(B) 검토: 같은 프로젝트에 빈 환경 추가 + 새 빈 볼륨 + CLI 업로드(GitHub 소스 연결 안 함 — 복제 시 `main` 자동 배포·구버전 위험), 변수는 Supabase 공개 값·`WEB_ALLOWED_ORIGINS`=Preview만·DB 경로·`NODE_ENV=production`, Preview 웹은 테스트 서버 WSS로 다시 빌드·같은 별칭에 재업로드. Supabase는 운영 그대로라 익명 계정은 여전히 생성. AGENTS.md "별도 Staging 서버 임의 생성 금지"·11/18 철회 결정과 충돌 → 사용자 예외 승인 필요. 비용(Hobby 단가 RAM $10/GB·월, CPU $20/vCPU·월, 볼륨 $0.15/GB·월): 상시 운영 시 월 약 $1–3 추정, 테스트 시간만 띄우면 수십 센트 이하(현재 사용량 대비 $5 포함분 초과 여부 미확인)
  - **테스트 서버(B) 최소 설계(22:50, 설계만·리소스 미생성)**: 사용자 결정 — A 보류, B 진행 검토, AGENTS.md "별도 Staging 금지"는 이번 검증 한정 예외 **검토 중(미승인)**. 격리: 운영 프로젝트의 환경 추가 대신 **별도 Railway 프로젝트**(예: `friends-table-mp-test`) + 빈 서비스 1개(GitHub 저장소 연결 없음 → `main` 자동 배포 불가) + 새 빈 볼륨 `/data`. 배포: `290cb8a`의 깨끗한 git worktree에서 `railway up`(`.dockerignore`가 `.env*`·`*.sqlite*`·`dist-web`·`.qa-web` 제외). 변수: `NODE_ENV=production`, `HOST=0.0.0.0`, `STATE_DB_PATH=/data/boardgame.sqlite`, `STATS_DB_PATH=/data/stats.sqlite`, `RAILWAY_RUN_UID=0`(볼륨 root 소유, cloud-multiplayer-validation 근거), `WEB_ALLOWED_ORIGINS=https://fix-multiplayer-stability.friends-table-staging.pages.dev`, `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY`(공개 값), 선택 `GAME_TIMING_LOG=1`. `PORT`는 Railway 주입. 운영의 `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`·`OVERLAP_SECONDS`는 불필요. Supabase 공유(설정 변경 0, 운영 프로젝트에 익명 계정·profiles·account_sessions 생성, 게임 기록은 테스트 SQLite에만) vs 별도 Supabase(운영 데이터 0, 새 프로젝트 + 001~006 적용 + 친구 전적 쓰면 drafts/007 + Anonymous Sign-Ins 활성화 + 새 URL·키로 서버·웹 재설정, Free는 활성 프로젝트 2개 한도·1주 비활성 시 일시정지)
  - **테스트 서버(B) 1단계 진행 중(사용자 승인 22:35: 당시 AGENTS.md 별도 Staging 금지 규칙의 이번 검증 한정 예외, 1단계만 — 2026-11-22 정책 변경으로 재사용 테스트 환경으로 전환)**. 생성한 리소스(원본 기록 시각 "23:00" — 아래 "시각 정리" 참조):
    - Railway 프로젝트 `friends-table-mp-test`(ID `c40d19c2-837c-46d0-adab-c1c38932f26c`, private, 설명은 생성 당시 "…Delete after test." → 2026-11-22 사용자 승인으로 "Temporary multiplayer stability test (Preview fix-multiplayer-stability). Reusable Preview/Staging environment."로 변경, 재로드 후 저장 확인), 환경 `production`(ID `bef23aac-…`), 서비스 `boardgame-server-test`(ID `31afe494-…`, **소스 미연결 — GitHub 자동 배포 없음**, 아직 배포 없음·offline), 볼륨 `/data`(새 빈 볼륨), 리전 Southeast Asia(Singapore, 운영과 동일), healthcheck `/health`, 도메인 `boardgame-server-test-production.up.railway.app`(포트 3000)
    - 변수 8개: `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`, `STATE_DB_PATH=/data/boardgame.sqlite`, `STATS_DB_PATH=/data/stats.sqlite`, `RAILWAY_RUN_UID=0`, `WEB_ALLOWED_ORIGINS=https://fix-multiplayer-stability.friends-table-staging.pages.dev`, `GAME_TIMING_LOG=1`. **`SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY` 미설정**(테스트 Supabase 생성 후) → 그 전에 배포하면 서버가 시작 시 종료
    - 운영 Railway 프로젝트·Supabase·Cloudflare는 변경 없음
    - **Supabase 테스트 프로젝트(원본 기록 시각 "23:05" — 아래 "시각 정리" 참조)**: `friends-table-mp-test`, ref `lahnhofedtomephzmoty`, 조직 `jaewon31`(Free, 추가 비용 $0), ap-southeast-1. 운영 `znnmzowesjrrshimukwv`는 변경 없음(카탈로그 읽기만). 적용 이력: `001_accounts`·`002_friends`·`003_single_session`·`004_anonymous_onboarding`·`005_repair_account_session`·`006_readonly_session_policies`(파일 원문 그대로, 005→006 순서; 005를 006 뒤에 다시 실행하면 006 정책이 되돌아가므로 금지). 첫 005 시도는 사용자가 경고 확인을 위해 중단, 이력에 남지 않았고 검토 후 승인되어 재적용. 검증: 4개 테이블 RLS on·0행, `auth.users` 0, `create_account_profile` 트리거 1, `nickname_setup_complete boolean default false`. 정책 5개(`profiles`: read own·edit own·only current session(RESTRICTIVE, `read_account_session`), `friendships`: participants read·only current session)가 **운영과 식 해시 동일**. 테이블 권한: anon 없음, authenticated는 `profiles`·`friendships` SELECT와 `profiles(display_name, nickname_setup_complete)` UPDATE만, `account_sessions`·`friend_request_limits`는 클라이언트 권한 없음. 함수 7개 모두 SECURITY DEFINER·`search_path=''`, anon 실행 권한 없음, 본문은 공백·줄바꿈 정규화 시 **운영과 동일**(운영은 CRLF로 저장). 차이: 새 프로젝트 기본 권한으로 함수에 `service_role` 실행 권한이 추가로 있음(클라이언트 무관), 운영에는 Supabase 관리 함수 `rls_auto_enable`이 더 있음. 보안 advisor: INFO 2(`account_sessions`·`friend_request_limits` 정책 없음 = 의도적 전면 차단), WARN 6(authenticated의 SECURITY DEFINER RPC 실행 = 앱 설계상 의도)
    - Draft 007(`can_compare_friend_stats`, 미적용): 서버 `friendStatsApi.ts`가 친구 전적 비교에서 호출. 운영에는 이미 존재하며 공백 무시 시 draft와 **논리 동일**(owner postgres, 권한 postgres·authenticated, STABLE, SECURITY DEFINER). 저장소에는 `supabase/drafts/`에만 있어 마이그레이션만으로 만든 환경에는 빠짐 → 정식 `migrations/007_…`로 승격 필요(파일 이동은 별도 승인). 테스트 프로젝트에 없으면 친구 전적 비교 API만 실패하고 게임·인증에는 영향 없음
    - **시각 정리(2026-11-22 확인)**: 위 "23:00"·"23:05"는 이전 세션이 남긴 원본 표기이며, 이 기록을 갱신한 사용자 메시지 시각(22:54 KST)보다 늦어 실제 시각으로 볼 수 없다. 이 절의 다른 시각 표기(22:35·22:50 등)도 이전 세션의 기록 그대로이며 독립 확인하지 않았다. 확인 가능한 값만 적는다:
      - Supabase 테스트 프로젝트 생성: `created_at` 2026-11-22 12:04:20 UTC = **21:04:20 KST**(Supabase API `get_project`)
      - Supabase 마이그레이션 적용: 버전 타임스탬프 기준 `001` 22:43:19 · `002` 22:44:01 · `003` 22:45:18 · `004` 22:45:29 · `005` 22:50:18 · `006` 22:50:26 KST(`list_migrations`, UTC 13:43–13:50)
      - Railway 테스트 프로젝트·서비스·볼륨 생성 시각: **미확인**(조회하지 않음, 시각을 추정해 넣지 않음)
      - Railway 설명 변경: 2026-11-22 이번 세션(사용자 승인 메시지 23:04 KST 이후), 정확한 저장 시각은 기록하지 않음
    - 아직 안 함: 익명 로그인 활성화(대시보드 Authentication 설정 필요), Railway에 Supabase 변수 설정, 서버 배포·검증
    - 남은 1단계: 익명 로그인 활성화 → Railway Supabase 변수 → 사용자 PC에서 `290cb8a` worktree `railway up`(프로젝트 ID 명시) → health·Origin·WS 검증
    - ~~정리: Railway 프로젝트 삭제(볼륨 포함), 테스트 Supabase 프로젝트 삭제, worktree 제거~~ → **철회**(2026-11-22 정책 변경). 리소스는 유지·재사용하고 배포용 worktree만 배포 후 정리한다. 리소스 삭제는 별도 승인 대상
  - 업로드 명령(승인 전 실행 금지): `npx wrangler@4.166.0 pages deploy apps/mobile/dist-web --project-name friends-table-staging --branch fix-multiplayer-stability --commit-hash 290cb8a764998ae494cd48312383076641b465e2 --commit-message "Preview: card reveal/audio decoupling (290cb8a)" --commit-dirty=true`
  - Preview 페이지를 여는 것만으로 앱이 익명 로그인을 시도하므로, 정적 확인 단계에서도 운영 Supabase에 익명 계정이 생긴다(origin별 저장소라 운영 사이트 세션과 별개)
  - Preview 분리(Cloudflare 문서): Preview 배포는 운영 `<project>.pages.dev`·커스텀 도메인에 영향 없음. `wrangler pages deploy`는 `--branch` 없으면 운영, 비운영 브랜치명이면 Preview(`<branch>.<project>.pages.dev`). Git 작업 폴더에서는 브랜치를 자동 감지하므로 반드시 `--branch=fix-multiplayer-stability`를 명시하고 운영 브랜치명은 쓰지 않는다. 예상 별칭 `https://fix-multiplayer-stability.friends-table-staging.pages.dev`(현재 없음), 배포마다 해시 URL 별도. Preview는 기본 공개.
  - Railway 재시작(Railway 문서): 변수 변경은 staged change이며 Deploy 시 영향 서비스가 재배포된다. 컨테이너는 시작 때만 변수를 읽으므로 Origin 추가는 재배포가 있어야 적용. CLI `railway variable set`은 즉시 재배포(`--skip-deploys`면 다음 배포까지 보류). 볼륨이 붙은 서비스는 두 배포를 동시에 못 띄워 짧은 다운타임이 생긴다. "Wait for CI" 설정 시 CI 통과까지 보류.
  - 재배포 시 기존 게임 영향(코드 기준): 모든 WS 끊김 → 클라이언트 자동 재연결. checkpoint(24시간 이내)로 방·좌석·진행 중 핸드 복원, 복원 후 약 30초 recovery, 진행 중 턴은 턴 시간 전체로 다시 시작(런아웃은 30초), 다음 판 예약(`nextHandAt`) 사라짐, 오프라인 좌석 만료는 연장 안 됨. 배포 중 SIGTERM 10초 종료 상한.
  - SQLite 2개(`/data/boardgame.sqlite` 방 checkpoint, 같은 폴더 `stats.sqlite` 전적. `STATS_DB_PATH` 설정 시 그 경로): checkpoint DB는 `locking_mode=EXCLUSIVE`라 서버 실행 중 다른 프로세스가 SQLite로 열 수 없고, 매 브로드캐스트마다 써서 실행 중 파일 복사는 불일치 위험. 방법 ① Railway 볼륨 백업(Backups 탭 수동/스케줄, 같은 프로젝트·환경으로만 복원, 복원 시 새 볼륨+재배포, 백업 다운로드 불가, 수동 백업은 볼륨 크기 50% 한도, 볼륨 삭제 시 백업도 삭제) ② 게임 없는 시간에 서비스를 멈추거나 쓰기가 없을 때 `railway volume files download`/ssh로 두 파일을 함께 오프사이트 복사. 사용자 PC에 `RailwayBackups/FriendsTable/20261120-production` 폴더 존재(내용·방식 미확인). **복원 연습 기록 없음 → 복구 가능 여부 미검증.**
  - 운영 데이터 생성 범위(테스터 1명당): Supabase `auth.users` 익명 1·`profiles` 1(트리거)·닉네임, `account_sessions` 1행(모든 WS 메시지의 `current_account_session` RPC가 upsert), 친구 기능 사용 시 `friendships`·`friend_request_limits`. 게임 기록은 Supabase가 아니라 Railway SQLite(`stats.sqlite`의 `recorded_hands`·`account_results`, checkpoint의 방·최근 리뷰 10·오늘 기록). 익명 계정 자동 정리 없음 → 테스트 계정은 남는다. 기존 사용자 데이터는 바뀌지 않음
- **다음 작업 후보**: 위 "테스트 환경 구축 상태"의 남은 ①~⑧(각 원격 단계는 실행 직전 승인) → Windows에서 `node scripts/test-game-e2e.cjs`(Node 24) → 사용자 청취 평가(빠른 액션 잘림·공개음 겹침, **현재 정책 유지 결정**, 청취 후 수정 여부 결정) → #4 끊긴 플레이어 정책 → #5 인증 캐시 → 초대 수정 Preview 확인.

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

1. `git status --short --branch`로 1절 기준점(브랜치 `fix/multiplayer-stability`, 미커밋은 1절 표 참조)과 달라진 점을 먼저 확인한다.
2. 2절 "다음 작업 후보"부터 시작한다. 게임 규칙·프로토콜을 바꾸는 수정은 관측 결과와 사용자 승인 후에 한다.
3. push·Cloudflare/Railway 설정 변경·배포·DB 변경은 사용자 승인 없이 하지 않는다. 원격은 읽기 전용 확인만 기본 허용된다. 테스트 환경 배포는 [반복 배포 절차](../deployment-workflow.md)를 따르고 실행 직전 승인을 받는다. 운영 변경·push·리소스 삭제는 각각 별도 승인이다.
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

### 2026-11-22 22:57 KST · Claude Code(클라우드 세션) · 문서(테스트 환경 재사용 정책)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `290cb8a` / dirty(Markdown만, 기존 본 문서 미커밋 변경 보존)
- 한 일 (변경 파일): `AGENTS.md`(5절 재사용 문구를 Production 한정으로 조정, 6절 테스트 환경·반복 배포 원칙 추가), 신규 `docs/deployment-workflow.md`(환경 구성·운영 보호·표준 흐름·생략 조건·중지/재시작·Production 체크리스트·`deploy:preview` 자동화 계획), 본 문서(정책 변경·구축 상태·삭제 계획 철회), `docs/web-staging-runbook.md`·`docs/web-existing-server-runbook.md`·`docs/decisions.md`·`docs/PROJECT_STATUS.md`·`docs/README.md`·`docs/web-deployment.md`(대체 안내·링크)
- 실행한 테스트와 결과: 코드 변경 없음, 테스트 미실행(문서만). 링크 대상 파일 존재 확인
- 미실행·실패·미검증: 테스트 환경 구축 ①~⑧, 중지·재시작 데이터 보존, 자동화 스크립트(범위 밖)
- 검수 요청 사항: 기존 규칙 중 철회/유지 경계(Staging 전용 Git 브랜치 금지는 유지)가 맞는지, Preview 고정 브랜치 규칙
- 승인 대기: 테스트 환경 남은 단계의 각 원격 작업
- 후속(2026-11-22 23:04 KST 사용자 결정 이후, 같은 세션): Markdown만 로컬 커밋 승인(push 금지), Railway 테스트 프로젝트 설명 변경 승인·완료, Preview 별칭 유지, 테스트 환경 재사용 확정, 원본 미래 시각 표기 정리(확인 가능한 시각만 별도 기재)

### 2026-11-22 21:10 KST · Claude Code(클라우드 세션) · 조사(Preview 배포 사전 점검)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `290cb8a` / dirty(본 문서만)
- 한 일: 2절 "Preview 배포 사전 점검" 기록. 빌드·결과물 검사, Cloudflare·Railway 공식 문서 확인, 저장소 코드로 재시작·백업·데이터 범위 정리. 대시보드는 로그인이 없어 읽지 못함
- 테스트: 코드 변경 없음. 실제 Pages 빌드(더미 공개 값) 성공
- 미실행·미검증: Cloudflare Pages 실제 설정(Railway는 21:40에 대시보드로 확인), 백업 복원 연습
- 승인 대기: Cloudflare 설정 확인(사용자 PC에서 wrangler 읽기 명령 또는 일반 브라우저), Preview 배포, Railway `WEB_ALLOWED_ORIGINS` 변경·재배포, 볼륨 백업 생성, 운영 테스트 데이터 생성, 본 문서 커밋

### 2026-11-22 20:30 KST · Claude Code(클라우드 세션) · 구현(로컬 4인 브라우저 E2E)
- 브랜치/HEAD/dirty: `fix/multiplayer-stability` / `520fab7` → 이 기록과 함께 E2E 5개 파일 커밋 / 커밋 후 clean
- 한 일: 테스트 전용 실행기·fixture·격리 테스트 추가. 인증은 실행기의 esbuild 번들 안에서만 `authClient`/`serverUrl` 모듈을 대체하고, 로컬 서버(`attachLobby`, 127.0.0.1, 메모리)는 실행마다 무작위 생성한 토큰 4개만 허용. 앱 소스·서버 소스·`accountAuthorizer`·Pages 빌드·게임 규칙·프로토콜 변경 없음
- 테스트 전용 조정(앱 결함 아님, 근거): ① esbuild의 `.wav` dataurl MIME `audio/wave`를 Chrome이 재생 못 함(`code 4`) → 실행기에서 `audio/wav`로 인라인(실제 빌드는 wav 파일 URL). ② esbuild는 Metro처럼 `global`을 넘기지 않아 react-native-web `Animated` 정지 시 `global is not defined` → `global: globalThis` 정의(실제 Metro 번들은 모듈 래퍼로 전달). ③ `expo-modules-core` 타입 전용 재수출 파일을 빈 모듈로 처리
- 테스트: 실행기 최종본 2회 통과(run4·run5, 각 7핸드·리셋 1회·재시작 포함). 첫 시도들에서 ①②로 실패 후 수정. 모바일 52/52(기존 50 + 격리 2, Node 22 사본), 서버 코드 변경 없음
- 측정(같은 페이지 단조 시계, run4/run5): 사운드 ON 상태→공개 p50 10/11.3ms·max 89/54.5ms, →DOM 반영 p50 23/24ms·max 110/77ms, →첫 프레임 p50 30/35ms·max 114/80ms. OFF →공개 p50 11.8/10.7ms·max 72/57ms, →첫 프레임 p50 39/27ms·max 108/89ms. 공개음은 카드보다 p50 13ms 늦게 시작(max 56ms). 액션음 상태→재생 p50 16–19ms·max 110ms. 서버 액션→브로드캐스트 p50 2.8ms. 카드 애니메이션 완료는 공개 시작 +360ms(명목)
- 잘림·겹침(측정만, 청취 아님): 실행기의 액션 간격 p50 125ms(사람보다 훨씬 빠름)에서 CHECK 269개가 다음 액션에 잘림(재생 p50 130ms / 원래 720ms), 올인 24개 중 20개가 이어진 콜에 잘림(p50 110ms / 967ms). 공개음 77개 중 64개가 아직 재생 중인 액션음과 겹침(겹친 시간 p50 138–160ms). 시뮬레이션에서 1초 간격이면 잘림 0
- 콘솔: 오류는 `/favicon.ico` 404(실행기 페이지에 아이콘 없음)만, 경고는 react-native-web `useNativeDriver` 미지원 안내(웹 공통)만
- 커밋 전 최종 확인: ① 운영 번들 — Pages 빌드는 `expo export --platform web`, 진입점 `apps/mobile/index.ts`. 같은 진입점의 모듈 그래프(esbuild metafile, 웹 해석·별칭 동일, fixture 없음) 495개 파일 중 `test/`·`scripts/` 파일 0개, E2E 식별자(`__friendsTableE2E`·토큰 테이블) 0건, 실제 `authClient.ts` 포함. Metro 그래프를 직접 뽑은 것은 아님(같은 import 기준 근사). `e2e-isolation.test.cjs`가 앱 소스·`App.tsx`·`index.ts`·`app.config.ts`·`build-pages.cjs`·서버 소스의 참조를 상시 검사. ② 외부 연결 — 실행기에 요청 호스트 기록 추가: 최종 실행(run6, 7핸드 통과)에서 4개 브라우저의 HTTP·WebSocket 목적지는 `127.0.0.1:<포트>` 하나뿐. 실행한 번들에 `supabase`·`createClient`·`railway`·`pages.dev`·`wss://`·`accountAuthorizer` 0건(`https://`는 라이브러리 오류 문서 링크만). 로컬 외 요청이나 원격 URL이 생기면 실행기가 실패 처리
- run6(최종 실행기): 사운드 ON 상태→공개 p50 10ms·max 64ms, OFF p50 15ms·max 69ms, 늦게 시작한 액션음 0/173, 모바일 52/52
- 미실행·미검증: 실제 청취, Windows·Node 24에서 실행기, 실기기(모바일 Safari/Android Chrome), 백그라운드 탭, 실제 네트워크 지연, Metro로 만든 실제 Pages 번들의 재검사(이 환경에서 Expo export 불가)
- 검수 요청: 실행기가 운영 코드 경로를 바꾸지 않는지, 격리 테스트 범위가 충분한지
- 승인 대기: 사용자 청취 평가 후 잘림·겹침 정책 변경 여부(현재 정책 유지), push·배포
