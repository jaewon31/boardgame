# Friends Table 6단계: Railway 재사용 / Cloudflare Pages 배포 준비

> 2026-11-17 문서 정비: 6단계 작업 당시 이력이다. 아래 현재 브랜치/배포 승인 대기/미커밋 표현은 당시 기준이며 최신 상태는 [project-status](project-status.md)를 확인한다.

최종 정리: 2026-11-16 KST. 외부 점검 시각은 `web-phase6-remote-check.json`의 UTC를 기준으로 한다. **로컬 코드·설정·검증 준비 완료, 실제 배포는 승인 대기**다. 원격 push, main 병합, Railway 배포/변수 변경, Pages 프로젝트 생성, Supabase 데이터/설정 변경, 유료 리소스 생성은 수행하지 않았다.

## 1. Git와 Railway 확인 정보

- 저장소: `C:/Users/jwseo/Documents/ChatGPT/앱/play-ui-refresh`, origin `jaewon31/boardgame`.
- 작업 전 브랜치 main, HEAD `a666688cd61452abbaebf415726b0900bfa9b20c`. GitHub main도 읽기 전용 API에서 동일 SHA였다.
- 사용자 요청 브랜치 `deploy/web-staging`이 로컬에 없는 것을 확인한 뒤 같은 HEAD에서 생성했다. 현재 이 브랜치이며 기존 미커밋/미추적 변경을 모두 보존했다. 새 commit/push는 하지 않았다.
- Railway 서비스 `@boardgame/server`, Hobby, main 자동 배포 **enabled**, Volume 연결 **yes**는 사용자 대시보드 확인값이다. `0b7f9148`은 배포 화면 ID이고 Git SHA가 아니다.
- 실제 배포 소스는 사용자 확인 Git SHA `9e741b27c305b6ec11eb463b6d8677e6690c555f`, 메시지 `Synchronize card reveals with action audio and rebalance effects`. GitHub 및 로컬 Git 객체로 비교했다.
- 대시보드 직접 접근/로그인된 Railway CLI는 없으므로 실제 마운트 경로·변수 값·청구내역·프로세스 배포 SHA를 관리자 API로 독립 확인하지 못했다. 공개 health에는 SHA가 없다. 아래 외부 동작은 해당 커밋의 코드와 일치하지만 바이너리 일치 증명은 아니다.

**main push 또는 병합은 현재 Railway 재배포를 유발할 수 있다.** 웹 준비/배포 브랜치만 사용한다. Cloudflare Production Branch도 `deploy/web-staging`으로 정하고 main을 선택하지 않는다. Railway와 Pages 자동 배포는 별개다. [Railway 자동 배포](https://docs.railway.com/deployments/github-autodeploys)

## 2. 배포 커밋과 최신 코드 비교

배포 SHA → 로컬 HEAD는 2커밋 차이다. 이 두 커밋은 체크 효과음, PokerTable/GameScreen UI, 관련 테스트/문서만 바꾸었다. **서버·shared·Dockerfile·Supabase 스키마는 배포 SHA와 로컬 HEAD가 동일하다.** 추가 웹 작업은 아직 미커밋이다.

| 영역 | 배포 코드 → 현재 작업 트리 | 영향 |
| --- | --- | --- |
| HTTP API | `apps/server/src/http.ts`에 정확한 CORS, 제한된 OPTIONS, no-store 추가 | 경로/응답 데이터는 동일. 허용되지 않은 웹 Origin은 403 |
| WebSocket | `lobby.ts` upgrade에 Origin 검증 추가 | `/lobby`, JSON 메시지·JWT 전달 형식 동일. 인증 없는 요청 계속 거부 |
| 설정/진입점 | `config.ts`, `index.ts`, 신규 `origins.ts` | `WEB_ALLOWED_ORIGINS` 파싱·전달. 빈 목록은 브라우저 거부, native 무Origin도 JWT 필요 |
| currentRoom | 배포 SHA에 이미 있음; 서버 로직 변경 없음 | Supabase 검증 account ID로 기존 참여 조회. 웹 클라이언트 복귀/생명주기 개선은 2~3단계 변경 |
| 인증·친구 | `accountSession.ts`, 친구 API/RPC·서버 권한 로직 동일 | current_account_session 검증, 친구 전적의 친구 관계 검사 유지 |
| 게임/정산 | 엔진·shared 계약·SQLite state/stat 저장 구현 동일 | 덱·칩·승패·저장 형식 변경 없음 |
| DB migration | 이번 단계 없음, 배포 SHA 대비 스키마 변경 없음 | 기존 DB에 migration 실행 불필요. 현재 원격 RPC/RLS 설치 상태는 별도 확인 |
| 클라이언트 | 플랫폼별 저장소·web endpoint·공유·복귀·반응형/PWA 추가 | native SecureStore/주소 경로 유지. 현재 공개 URL에 `https://`를 WS 설정으로 넣으면 안 됨 |

서버 배포 후보 파일은 `apps/server/src/{config,http,index,lobby}.ts`와 신규 `origins.ts`다. 테스트는 `web-origins.test.ts` 및 기존 회귀를 포함한다. 서버 package/게임 엔진/DB 변경은 필요 없다. 사용자별 정확한 브라우저 Origin을 서버 런타임에 추가해야 한다.

## 3. 기존 Railway의 실제 외부 점검

공개 주소는 사용자가 제공한 `https://boardgameserver-production.up.railway.app`, WS는 같은 호스트의 `wss://…/lobby`다. 계정/방을 만들지 않고 소수의 비인증 요청만 보냈다.

| 요청 | 관찰 | 의미 |
| --- | --- | --- |
| GET /health, Origin 없음 | 200, 정상 service/status | HTTPS/Node 준비 상태 정상. Supabase 인증 성공 증명 아님 |
| GET /health, 등록하지 않은 테스트 Origin | 200, ACAO 없음 | 최신 Origin 차단 정책과 다름 |
| 친구 전적 OPTIONS + Authorization 사전 요청 | 404, ACAO 없음 | 브라우저 전적 API용 CORS 미준비 |
| 친구 전적 GET, 인증 없음 | 401 | 비인증 데이터 접근 차단 |
| WSS /lobby, Origin 없음, currentRoom 인증 없음 | upgrade 성공 → AUTH_REQUIRED | native 경로와 인증 요구 유지 |
| WSS /lobby, 등록하지 않은 Origin, currentRoom 인증 없음 | upgrade 성공 → AUTH_REQUIRED | JWT 요구는 있으나 WS Origin 차단 없음 |

**판정: 기존 서비스를 재사용할 수 있으나, 현재 상태 그대로 웹 베타를 완료할 수는 없다.** 기본 게임 프로토콜은 호환되며 CORS/Origin 서버 업데이트와 실제 Pages origin 등록이 필요하다. 현재 열린 WS에서 인증 없이 게임/방 정보를 받지는 않았다. 인증된 currentRoom·실제 Railway 게임·새로고침 복귀는 이번 단계에서 미검증이다. 사용자 세션을 사용해 기존 Android 연결을 교체하지 않았다.

## 4. Volume/영속성 및 업데이트 위험

Volume 연결 자체는 확인됐지만 실제 mount path와 사용 경로는 아직 미확인이다. 배포 SHA와 현재 코드 모두 `STATE_DB_PATH`의 SQLite checkpoint, `STATS_DB_PATH`의 SQLite 전적을 사용한다. Dockerfile 기본 state는 `/data/boardgame.sqlite`; 통계 기본은 state 옆 `stats.sqlite`. `NODE_ENV=production`이면 state path가 필수다.

대시보드에서 비밀 값 출력 없이 확인할 것:

1. Volume mount path가 실제 두 SQLite 경로의 부모인지 확인한다. 일반 권장 `/data`와 실제 설정이 같은지는 아직 단정하지 않는다.
2. 시작 로그의 `durable:true`, 성공한 health, `persistence_failed` 부재를 확인한다. 파일 존재/쓰기 권한·용량도 관리자가 확인한다. DB 내용/비공개 카드/토큰은 열거나 공유하지 않는다.
3. 기존 `RAILWAY_RUN_UID`와 mount 권한을 확인한다. Dockerfile의 USER node와 Railway volume 소유권이 맞아야 한다. 기존 정상 설정은 임의 변경하지 않는다.
4. replica 1, 같은 SQLite를 여는 두 프로세스 금지. 체크포인트 파일은 독점 잠금이며 두 번째 writer는 실패한다.

Volume은 배포/재시작의 영속 저장에 사용할 수 있으나 무중단을 보장하지 않는다. Railway volume 서비스는 배포 제약이 있으므로 기존 연결 종료와 기동 공백을 예상한다. [Railway Volume](https://docs.railway.com/volumes)

서버는 상태를 동기 저장하고 SIGTERM에서 close한다. 저장된 방/패/칩/턴 복구 코드는 존재하고 로컬 SQLite 재시작 테스트는 통과했다. 다만 **현재 Railway Volume으로 실제 재시작 복구를 시험하지 않았다.** 마운트가 틀리거나 파일이 ephemeral이면 재배포 시 유실된다. 기존 오프라인 좌석 만료를 갱신하지 않고, 24시간 이상 된 checkpoint 방은 복원하지 않는다. 기본 연결 상실 보존은 5분이다. 단절 중 턴은 진행되므로 최신 서버 상태로 복귀해야 한다.

서버 업데이트에는 재시작이 필요하다. 데이터 형식은 같지만 기동 실패·경로/권한 오설정·보존 시간 초과 위험은 남는다. 현재 부하와 Railway 기동 시간이 없어 다운타임을 숫자로 보장할 수 없다. **게임 없는 유지보수 시간을 잡고 최대 5분 보존에 기대어 진행 중인 판을 보호하지 않는다.** 시작 전 두 SQLite를 일관된 방식으로 백업하고 기존 배포/변수/볼륨 설정을 비공개 기록한다. 실제 백업·재시작은 승인 후 한다.

## 5. Cloudflare Pages 준비 파일과 빌드 설정

이번 단계 추가/수정:

- `apps/mobile/public/_headers`: no-cache, nosniff, no-referrer, noindex/nofollow, manifest MIME.
- `apps/mobile/public/_redirects`: `/join/* /index.html 200`만 rewrite.
- `apps/mobile/public/404.html`: 없는 JS/아이콘을 앱 HTML로 바꾸는 Pages 암묵적 SPA fallback 방지.
- `scripts/build-pages.cjs`, 루트 `package.json`의 `build:pages`: 배포 환경 형식 검사 → Expo production web export → PWA/Pages 파일/크기 검사. 외부 API·업로드 명령 없음.
- `apps/mobile/test/pages.test.cjs`: dotenv 배제·환경/라우팅/개인 파일 차단 검증.
- `.github/workflows/check.yml`: 웹 export에 Pages 정적 결과 검사 추가.
- `docs/web-deployment.md`: 5단계 후보 비교 대신 이번 Railway+Pages 결정을 우선하도록 안내.
- 이 보고서 및 `web-phase6-remote-check.json`, `web-phase6-browser-results.json`, `web-phase6-local-preview.png`.

| Pages 설정 | 값/계획 |
| --- | --- |
| Git 저장소 | jaewon31/boardgame, 연결은 승인 후 |
| Production branch | **deploy/web-staging** |
| Framework preset | None |
| Root directory | 저장소 루트(비움 또는 `/`) |
| Node | NODE_VERSION=24.19.0, 기존 Node 24 요구 유지 |
| 패키지 매니저 | npm, 기존 package-lock.json. 패키지 버전 업그레이드 없음 |
| 자동 설치 | SKIP_DEPENDENCY_INSTALL=1 |
| Build command | `npm ci --include=dev && npm run build:pages` |
| Output directory | `apps/mobile/dist-web` |
| Preview 자동 배포 | 초기에는 끄거나 승인 브랜치만 제한; origin마다 별도 검증 |
| Functions/Workers | 없음. Node/ws는 Railway에 유지 |
| 도메인 | 프로젝트 생성 후 실제 pages.dev 확인. 이름을 미리 확정/하드코딩하지 않음 |

Node override·자동 설치 비활성 설정은 [빌드 이미지 문서](https://developers.cloudflare.com/pages/configuration/build-image/), monorepo와 CF_PAGES_URL은 [빌드 구성](https://developers.cloudflare.com/pages/configuration/build-configuration/) 기준이다.

`404.html`이 있으면 Pages의 암묵적 SPA fallback이 비활성화되므로 invite 경로만 명시 rewrite한다. root는 index로 제공하며 없는 자산은 404여야 한다. [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/), [redirects](https://developers.cloudflare.com/pages/configuration/redirects/). `_headers`는 정적 파일 응답 정책이다. [Headers](https://developers.cloudflare.com/pages/configuration/headers/)

## 6. 환경변수·HTTPS/WSS

Pages 빌드에만 설정할 공개 변수 이름:

- `EXPO_PUBLIC_WEB_GAME_SERVER_URL`: 사용자가 제공한 Railway의 **wss:// 호스트 + /lobby**. `EXPO_PUBLIC_GAME_SERVER_URL=https://…` 예시는 이 앱 규약과 맞지 않는다.
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 기존 프로젝트의 공개 값. admin/service-role 키 금지.
- `EXPO_PUBLIC_WEB_APP_URL`: 선택 사항. 프로젝트 생성 뒤 실제 고정 HTTPS origin을 지정하거나, 미설정으로 현재 브라우저 origin을 공유한다. 미설정일 때 빌드 검사는 자동 주입 CF_PAGES_URL로 수행하지만 그 URL을 초대 링크에 박아 넣지 않는다.
- `NODE_VERSION`, `SKIP_DEPENDENCY_INSTALL`은 위 표대로. native용 `APP_ENV`는 Pages에서 미설정한다. 빌드 스크립트가 웹 release 보안 조건을 따로 검사하며 APP_ENV가 있으면 오류로 중단한다.

빌드 스크립트는 `EXPO_NO_DOTENV=1`로 실행해 로컬 개발 `.env.local`에 의존하지 않는다. 로컬에서 동일한 입력으로 검사하려면 기존 파일을 덮어쓰지 않고 별도의 ignored 설정 파일을 준비한 뒤 `node --env-file=<로컬설정파일> scripts/build-pages.cjs`를 실행한다. 출력은 `apps/mobile/dist-web`만 게시한다. 원본 `.env`, `.qa-web`, SQLite, 로그는 업로드하지 않는다.

Railway에서는 **코드 업데이트와 WEB_ALLOWED_ORIGINS 변경이 필요**하다. 실제 발급된 정확한 `https://<프로젝트>.pages.dev` origin을 기존 허용 목록에 추가한다. wildcard·모든 preview 일괄 허용 금지. native가 Origin을 보내지 않는 기존 경로는 유지하되 JWT 검증은 계속한다. 프록시 신뢰 설정은 현재 정상값을 유지한다. HOST/PORT, Supabase, STATE/STATS 경로는 우선 읽기 확인만 하고 불필요하게 바꾸지 않는다.

API는 WSS 주소에서 HTTPS로 변환된 기존 친구 전적 호출을 재사용한다. 웹은 HTTPS, 게임은 WSS, Supabase는 HTTPS라 Mixed Content를 만들지 않는다. 토큰은 WS JSON/HTTP Authorization으로만 전달하고 URL/로그에 넣지 않는다. 기존 Android/iOS `EXPO_PUBLIC_GAME_SERVER_URL`·EAS 설정은 변경하지 않는다.

## 7. Supabase 및 비공개 베타의 의미

기존 프로젝트를 재사용하며 이 단계에서 데이터/스키마/RLS/인증 설정을 바꾸지 않았다. 공개 Auth 설정 GET은 200, signup 비활성 값 false였지만 해당 응답에서 익명 로그인 활성 여부를 확인하지 못했다. 현재 운영 profiles/친구/RLS 설치 상태, Railway와 로컬이 동일 Supabase 프로젝트인지 관리자 설정 비교가 필요하다. 5단계 실제 익명 로그인 성공을 이번 운영 검증으로 대신하지 않는다.

코드상 새 migration은 필요 없다. 기존 `current_account_session` RPC, profiles, 친구 RPC/RLS는 이미 있는 것을 사용한다. 게임 checkpoint/전적은 Supabase가 아니라 Railway SQLite에 저장된다. 실제 환경에서 누락을 발견해도 승인 없이 migration을 실행하지 않는다.

같은 Supabase와 Railway를 쓰는 베타는 **데이터가 분리된 스테이징이 아니다.** 테스트 로그인/친구 요청/게임은 기존 프로젝트와 Volume에 데이터가 추가될 수 있다. 이번 단계에는 테스트 계정 생성도 하지 않았다. 승인된 테스트 계정/시간을 정해 운영 확인을 진행해야 한다. Railway Hobby 내 별도 environment/service는 격리는 개선하지만 추가 자원·volume 비용이 생길 수 있어 생성하지 않는다.

pages.dev는 공개 접근 URL이다. noindex는 검색 억제일 뿐 접근 통제가 아니다. 현재 방 입장은 **인증된 계정 + 비공개 방 코드** 기반이고 친구 관계가 필수 조건은 아니다. 친구 전적 조회는 수락된 친구 권한을 검사한다. 친구 5~10명에게 URL/방 코드를 제한 공유하되, 엄격한 사용자 초대 allowlist가 필요하면 별도 설계/승인이 필요하다. CORS/Origin은 인증 대체물이 아니다.

## 8. 비용 판단

확인된 입력은 Hobby와 화면 숫자 `5`뿐이다. 통화, 기간, 누적/예상/구독료/크레딧 전후 의미는 아직 모른다. **현재 정보로 전체 월말 10,000원 이하 또는 추가 비용 0원을 확정할 수 없다.** 이전 문서의 일반 예산 추정치를 실제 청구액으로 사용하지 않는다.

Hobby는 월 $5 최소 비용에 $5 리소스 사용량이 포함되는 구조다. 리소스가 이를 넘으면 초과분이 추가된다. [Railway 요금](https://docs.railway.com/pricing/plans). 실제 총비용은 Railway 예상 최종 청구액 + 기존 Supabase/기타 비용 + 세금/환전·결제 수수료로 판단한다. 달러 리소스 사용량이 $5 이하이고 다른 비용이 없다는 조건이 확인되어야 최소 요금 구간이라고 할 수 있다.

Cloudflare Pages Free는 월 500빌드, 동시 빌드1, 빌드 timeout20분, 최대20,000파일/파일당25MiB 등 한도 내에서 사용할 계획이다. 이번 산출물은 22파일, 크기 검사 통과다. 유료 Functions/R2/추가 서비스는 없다. [Pages 한도](https://developers.cloudflare.com/pages/platform/limits/)

Supabase Free 공식 한도에는 50,000 MAU, 500MB DB, 5GB egress, 비활성 1주 정지가 있다. 실제 사용 중인 플랜·잔여 한도는 미확인이다. [Supabase 가격](https://supabase.com/pricing)

대시보드에서 Billing/Usage의 통화, 청구 기간, Subscription, Used resources, Included credits, Estimated bill, CPU/RAM/egress/volume별 수치, 세금과 지출 한도를 확인해야 한다. 5~10명이라는 인원만으로 리소스 사용량을 추정하지 않는다. 기존 서버를 재사용하면 별도 서버 구독은 없지만 추가 사용량은 생길 수 있다. 비용 알림 설정 변경도 승인 후 진행한다.

## 9. 테스트와 실제 확인 범위

| 검증 | 결과 |
| --- | --- |
| 기존 서버 `npm test` | 최종 172/172 통과 |
| 모바일 `npm run test --workspace=@boardgame/mobile` | 47/47 통과 (45 + Pages2) |
| TypeScript `npm run typecheck` | mobile/server/shared 통과 |
| `npm run build:pages`와 동일 Node 스크립트 | production 웹 export, 22파일 PWA/Pages 검사 성공 |
| `npm run export:mobile` | Android/iOS Hermes 번들 성공 |
| 실제 Railway | 위 HTTPS/WS/비인증 요청 표 참조 |
| 서버 복귀/보안 회귀 | 다른 계정 currentRoom 거부, 개인 패 보호, Origin 거부, native JWT 요구, SQLite 재시작 복구 포함 |
| Chrome 로컬 production bundle | 초대 경로 앱 렌더링, manifest 파싱 오류0, 없는 자산404, pageerror0 |
| 실제 Pages edge | 프로젝트 미생성으로 미검증. 로컬 서버의 경로/헤더 검사는 Cloudflare 자체 검증이 아님 |
| 이번 단계 실로그인/친구/실제 Railway 게임 | Supabase·기존 사용자 데이터 보호 조건 때문에 미실행. 기존 단계 이력과 구분 |
| iPhone/Android PWA, 네이티브 혼합 플레이 | 실기기 미검증 |

초기 서버 테스트에서 동일 세션 교체 테스트 1건이 timeout됐다. 해당 파일 단독 재실행과 전체 172개 재실행이 통과했고 코드를 바꾸거나 timeout을 늘려 숨기지 않았다. 환경 부하에 따른 간헐성 가능성이 남아 배포 전 CI에서도 확인한다.

로컬 Chrome 검사는 신규 Supabase 익명 계정 생성 방지를 위해 해당 브라우저의 Supabase 네트워크 요청을 차단했다. 앱의 인증 실패 화면 렌더링까지 확인한 것이며 로그인 성공으로 보고하지 않는다. 인증·멀티플레이는 기존 자동 테스트에서 외부 Supabase 경계 fixture를 사용하며 실제 인증 정책 확인은 별도다. 실제 OS 화면·설치·5분 잠금 복귀는 [기기 체크리스트](web-device-checklist.md)를 따른다.

## 10. 승인 후 정확한 순서와 롤백

1. **승인 전 준비 확인:** Volume mount/STATE/STATS 경로, 현재 배포/환경 설정, 비용 숫자 의미, Supabase 프로젝트 일치를 관리자가 확인한다. 이 보고서와 서버 변경 5파일을 검토한다.
2. **코드 게시 승인:** 원하는 변경만 검토·커밋한 `deploy/web-staging`을 원격 push한다. main push/merge는 하지 않는다. Railway main 자동배포 설정은 그대로 유지한다. 현재는 push하지 않았다.
3. **Pages 생성/공개 URL 승인:** Free 프로젝트를 저장소에 연결하고 Production Branch를 deploy/web-staging으로 지정한다. 위 빌드 설정과 공개 변수만 넣고 preview 범위를 제한한다. 생성/저장 시 첫 공개 배포가 일어날 수 있으므로 이 단계 전체가 승인 대상이다.
4. 실제 pages.dev origin과 배포 SHA를 기록하고 PWA/초대/자산 MIME·404·캐시·TLS를 확인한다. 이 시점 서버 CORS가 준비되지 않았다면 게임 성공을 기대하지 않는다. 일반 사용자에게 아직 공유하지 않는다.
5. **Railway 변경 별도 승인:** 게임이 없는 유지보수 시간에 두 SQLite의 일관된 비공개 백업 및 rollback 대상 `9e741b27…`/배포ID 기록을 준비한다. 정확한 Pages origin을 변수에 추가하고 검토된 서버 코드를 일회성 배포한다. main 병합이 필요 없는 수동/CLI 배포 방식을 선택하되, 대상 project/environment/service와 정확한 source SHA를 실행 전 확인한다. 사용자 PC의 혼합 미커밋 트리를 그대로 `railway up`하지 않는다. 서비스의 Git main 연결은 임의로 바꾸지 않는다.
6. 신규 서버 health/잘못된 Origin 거부/허용 Origin CORS·JWT·currentRoom, 기존 Android 인증 연결부터 확인한다. 실제 볼륨 경로와 durable 로그를 재확인한다.
7. 승인된 테스트 사용자로 친구 요청, 2~6인 게임·새로고침·탭 종료·일시 단절·5분 경계·비공개 패, Android 혼합 플레이를 수행한다. 실제 iPhone/Android 설치는 기기 체크리스트대로 기록한다.
8. 성공 후 한정된 친구 그룹에 공유한다. 실패 시 신규 접속 안내를 중단하고 아래 롤백을 수행한다.

**롤백:** Pages는 이전 검증된 정적 배포로 되돌린다(첫 배포면 공유 중단/프로젝트 접근 정책을 승인된 방식으로 처리). Railway는 이전 성공 배포 또는 정확한 `9e741b27…` 소스로 재배포하고 변경한 변수만 기록된 값으로 복원한다. Volume을 삭제/초기화하지 않는다. 이번 서버 변경은 checkpoint 스키마가 같아 형식 migration 롤백이 필요 없지만 실제 이전 배포 복구를 보장하는 것은 아니다. 파일 손상이 있으면 쓰기를 멈추고 **별도 승인된** 백업 복구를 수행한다. 이전 서버로 돌아가면 native는 유지돼도 웹 CORS/Origin 보완은 사라지므로 웹 베타를 중단한다.

정확한 배포 명령의 project/environment/service ID와 source SHA는 접근 권한 및 최종 commit이 생긴 뒤 고정한다. 지금 이 값들을 추측해 명령을 실행하지 않는다. **현 단계에서 승인 요청 대상은 브랜치 게시·Pages 생성/첫 배포이며, Railway 재배포/변수 수정은 Volume·중단 시간 확인 후 별도 승인하는 순서를 권장한다.**
