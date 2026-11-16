# 웹/PWA 배포 준비 및 운영 절차

> 6단계 결정(2026-11-16): 기존 Railway Hobby + Cloudflare Pages Free를 사용한다. 아래 후보 비교는 5단계 이력이며 신규 Render/VPS 도입 계획이 아니다. 현재 실행 계획과 승인 조건은 [6단계 배포 준비 보고서](web-phase6-deployment-readiness.md)를 우선한다.

2026-11-15 KST. 플랫폼 선정·계약·공개 배포를 하지 않은 비교/설정 예시다. 비용은 USD 월 기준, 세금·도메인·초과 트래픽 제외이며 신청 직전 다시 확인한다.

## 권장 구조와 비용

**소규모 친구 테스트에는 무료 정적 호스팅 + 절전 없는 단일 Node 서버 + 영속 디스크를 우선 권장한다.** 서버는 Node 24 / HTTP + ws 그대로 유지한다. Supabase는 기존 인증·프로필·친구 DB에 사용하고 게임 상태는 해당 Node 프로세스와 SQLite에 둔다. CDN 정적 호스팅에 Node/ws 서버를 함께 올릴 수 있다고 가정하지 않는다.

| 후보 | 월 비용 예산 | 장점 | 한계/운영 조건 |
| --- | --- | --- | --- |
| Cloudflare Pages 또는 Render Static + Render 유료 Node/디스크 | 정적 $0 + 서버 약 $7 + 1GB 디스크 $0.25 → 약 $7.25부터 | 관리형 HTTPS, 웹/서버 독립 배포, WebSocket 지원 | 고정비·대역폭 초과 비용 확인. 단일 인스턴스/영속 디스크 필요 |
| 무료 정적 호스팅 + Railway Hobby Node/Volume | 최소 $5, 소규모 예산 추정 $5~15 | 관리형 HTTPS/WSS, 사용량 기반, 영속 volume | $5는 무제한 정액이 아니라 포함 사용량. 메모리·CPU·트래픽·volume 합산. Serverless sleep 끄고 비용 알림 설정 |
| 기존 Compose + Caddy를 설치한 단일 VPS | 업체 미선정: 예산 가정 $5~15 + 백업/도메인 | 현재 구조 재사용, 웹·게임·TLS 한곳 관리 | 서버 보안 업데이트, 방화벽, 디스크/백업, 인증서 접근·장애 대응을 직접 운영. 이 금액은 견적이 아님 |
| 무료 Node 호스팅 | 현금 $0 범위 가능 | 일회성 화면 시연 | SQLite 영속성·절전·자원 한도 때문에 지속 게임 테스트에는 부적합 |

근거: [Render 가격](https://render.com/pricing), [디스크](https://render.com/docs/disks), [WebSocket](https://render.com/docs/websocket), [Railway 가격](https://railway.com/pricing), [WebSocket 제한](https://docs.railway.com/networking/public-networking/specs-and-limits), [Serverless sleep](https://docs.railway.com/deployments/serverless). Railway 예산 범위와 VPS 예산은 예상 사용량을 바탕으로 한 계획값이며 보장 가격이 아니다.

Render 무료 웹 서비스는 수신 트래픽(WS 메시지 포함)이 15분 없으면 절전하며 재기동에 약 1분이 걸릴 수 있다. 재시작/절전 시 로컬 파일이 사라지고 무료 플랜에는 영속 디스크가 없다. heartbeat로 절전을 피하는 것을 데이터 보존 대책으로 삼지 않는다. [공식 무료 제한](https://render.com/docs/free)

정적 사이트에는 장기 WebSocket 프로세스가 없으므로 별도 게임 서버가 필요하다. Cloudflare Pages Free는 월 빌드 횟수 등 한도가 있고, 빌드에만 환경변수를 주입한다. [Pages 한도](https://developers.cloudflare.com/pages/platform/limits/)

Supabase Free는 $0이나 1주 비활성 시 일시 정지 제한이 있다. Pro는 월 $25부터이므로 위 구성에 추가하면 Render 예시 약 $32.25부터다. 기존 프로젝트가 어떤 유료 플랜인지 이번에 변경/조회하지 않았다. 인증 서버가 멈추면 게임 서버만 살아 있어도 신규 로그인/재인증이 실패한다. [Supabase 가격](https://supabase.com/pricing)

## 환경변수와 빌드

`deploy/web-release.env.example`은 예시다. 실제 값은 ignored `.env.production.local`이나 승인된 호스팅 환경에만 둔다. 기존 `apps/mobile/.env.local`을 덮어쓰지 않는다. 예시 호스트/키는 그대로 사용할 수 없다.

- 웹 빌드: `EXPO_PUBLIC_WEB_APP_URL=https://play.<실제도메인>` (경로/끝 슬래시 없음), `EXPO_PUBLIC_WEB_GAME_SERVER_URL=wss://game.<실제도메인>/lobby`, Supabase HTTPS URL/공개 publishable key.
- 서버 런타임: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, 정확한 `WEB_ALLOWED_ORIGINS`, 영속 `STATE_DB_PATH`/`STATS_DB_PATH`, `RECONNECT_MS=300000`.
- 브라우저 서버 주소만 override한다. 기존 네이티브 `EXPO_PUBLIC_GAME_SERVER_URL`과 개발 HTTP/WS 동작은 유지한다.
- `EXPO_PUBLIC_*`는 누구나 번들에서 읽을 수 있다. service-role/admin 키를 넣지 않는다. 설정 검사기는 형식만 검증하며 실제 프로젝트 소유권/키 유효성/외부 서비스 연결을 보장하지 않는다.
- Supabase 익명 인증, 기존 RLS/RPC를 유지한다. 운영 DB migration이나 auth 정책 변경은 별도 승인 대상이다.

저장소 루트에서 실제 공개 설정을 준비한 후 **로컬에서만**:

```powershell
node --env-file=apps/mobile/.env.production.local scripts/check-web-release.cjs --environment
```

실제 빌드는 `apps/mobile` 작업 디렉터리에서 다음과 같이 실행한다. 같은 파일을 프로세스 환경에 먼저 읽어 개발 `.env.local` 값보다 우선한다. 이 명령은 공개 배포를 하지 않는다.

```powershell
cd apps/mobile
node --env-file=.env.production.local ../../node_modules/expo/bin/cli export --platform web --output-dir dist-web
cd ../..
node scripts/check-web-release.cjs apps/mobile/dist-web
```

일반 개발/CI 번들 명령은 `npm run export:web --workspace=@boardgame/mobile -- --output-dir dist-web` 그대로다. 개발 설정으로 만들어진 결과는 운영 배포하지 않는다. 웹 설정은 빌드 시 고정되므로 호스팅 런타임 변수만 바꾸면 기존 JS가 갱신되지 않는다. 게시 대상은 `apps/mobile/dist-web` **내용만**이다. 저장소 루트, `.env`, `.qa-web`, SQLite 파일, 로컬 로그를 업로드하지 않는다.

## HTTPS/WSS와 라우팅

웹 HTTPS → 게임 WSS `/lobby`, 친구 전적 API HTTPS, Supabase HTTPS가 모두 필요하다. HTTPS 페이지의 WS 설정은 기존 `webEndpoint`가 거부한다. access token은 기존 WS JSON 메시지와 HTTP Authorization 헤더로만 전달하며 URL/query/subprotocol에 넣지 않는다.

Origin은 `https://play.<실제도메인>`을 정확히 등록한다. `*`, suffix matching, 요청 Origin 무조건 반사는 금지다. 미설정 목록은 브라우저를 거절한다. Origin 없는 네이티브 연결도 JWT 검증이 필요하다. HTTPS 운영 origin만 허용하며 개발 목록과 분리한다. 임시 preview마다 승인된 origin을 명시하고 테스트 종료 후 제거한다.

정적 호스트는 `/`와 `/join/*`를 index.html로 전달한다. 없는 `.js`, 아이콘, manifest를 HTML로 바꾸지 않는다. manifest MIME은 `application/manifest+json` 또는 JSON, PNG는 `image/png`, JS는 JavaScript MIME으로 제공한다. HTML/manifest는 `Cache-Control: no-cache`; 첫 배포 예시는 모든 정적 파일 재검증을 사용한다. 장기 캐시 최적화는 내용 해시 파일에만 추후 적용한다. 서버 HTTP 응답은 이제 `Cache-Control: no-store`다.

관리형 호스팅에서는 TLS 종료 후 Node의 지정 PORT로 전달하고 WS Upgrade/Connection/Origin 헤더를 유지한다. 임의의 클라이언트 X-Forwarded-For를 신뢰하지 않는다. 현재 `TRUSTED_PROXY_IPS`는 통제하는 정확한 IP만 허용한다. 관리형 프록시의 신뢰 경계를 확인하기 전에는 비워두며, 이 경우 같은 프록시 IP로 연결 수가 집계되어 per-IP 한도에 닿을 수 있다. 부하 검증 후 설정한다.

VPS 후보에서는 기존 `compose.yaml`에 `deploy/compose.web.example.yaml`을 추가하는 예시를 제공한다. 서로 다른 WEB_DOMAIN/GAME_DOMAIN과 읽기 전용 `/srv/web` 마운트를 사용한다. Caddy는 자동 TLS와 WS reverse proxy를 제공한다. DNS/80·443 접근, 인증서 저장 volume이 필요하다. [Caddy TLS](https://caddyserver.com/docs/automatic-https), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

Docker/Caddy가 설치된 환경에서 승인 **전** 구성 문법을 확인할 수 있다:

```sh
docker compose --env-file apps/mobile/.env.production.local -f compose.yaml -f deploy/compose.web.example.yaml config --quiet
```

이번 환경에는 Docker/Caddy 실행기가 없어 실제 Caddy/Compose 실행 검증은 하지 않았다. `up`/공개 DNS 연결/리소스 생성은 사용자 승인 뒤에만 한다. 정적 호스트 후보도 실제 서비스 생성 없이 구조만 비교했다.

## 게임 상태·복귀·배포 정책

- 실행 중 게임은 단일 프로세스 메모리에서 처리한다. `STATE_DB_PATH`가 없으면 개발 서버 재시작으로 방/핸드 상태가 사라진다. 운영은 경로 필수이며, 경로만 설정하고 ephemeral filesystem을 사용하면 재배포 때 파일이 사라질 수 있다.
- 기존 SQLite checkpoint는 방/칩/덱·패/턴/설정 등을 저장한다. 디스크에 비공개 카드와 방 자격 정보가 있으므로 암호화된 영속 디스크·최소 접근권한·비공개 백업을 사용한다. SQLite를 정적 웹 경로에 두지 않는다.
- 기존 복구는 24시간 미만 checkpoint를 읽고, 이미 오프라인인 좌석 만료 시간을 연장하지 않는다. 재시작 시 게임 시계 복구 및 약 30초 recovery 구간이 존재하지만 무조건 5분을 새로 주는 정책은 아니다. 장기 장애/만료된 좌석 복귀는 보장하지 않는다.
- 연결 상실 기본 좌석 보존은 5분이며 서버 판정이 기준이다. 그 사이 상대가 액션하거나 본인 턴이 timeout될 수 있으므로 복귀 상태는 **중단 전 화면 고정**이 아니라 최신 서버 상태여야 한다. 상대 비공개 패는 계속 숨긴다.
- 웹은 방 토큰을 영구 저장하지 않는다. Supabase 세션으로 `currentRoom` 인증 조회 후 복귀한다. 세션 만료 시 refresh 실패를 안내하고 다른 사용자 자격/이전 방 토큰으로 우회하지 않는다. 브라우저 데이터 삭제·시크릿 종료·다른 브라우저/기기·PWA 별도 저장소는 같은 익명 계정 복구를 보장하지 않는다.
- 서버 재시작/배포는 WS를 끊는다. 빈 방 시간대를 잡아 공지하고, SQLite 안전 백업과 복구 테스트 후 재시작한다. 이 단계는 무중단 배포를 구현하지 않았다. old/new 프로세스를 동시에 같은 방 권한자로 운영하지 않는다.
- 웹 새 버전은 다음 로드 때 가져오지만 열린 탭은 이전 JS를 계속 쓴다. Service Worker가 없어도 이 사실은 같다. 당분간 서버 메시지 호환성을 유지하고 게임 도중 강제 reload하지 않는다. 호환 불가능한 변경은 유지보수 시간에 전체 방 종료 후 배포한다.
- 단일 인스턴스로 시작한다. 메모리 방 상태/로컬 SQLite 때문에 단순 replica 증가나 라운드로빈으로 수평 확장하면 서로 다른 방 상태를 만들 수 있다. 먼저 자원·동접 한도를 측정하고 수직 확장한다. 향후 분산 방 라우팅/상태 저장 설계는 이번 범위 밖이다.
- `/health`, 인증 실패·WS 종료·persist 실패·연결수·메모리·이벤트루프 지연을 관찰한다. payload/JWT/refresh token/패/닉네임을 로그에 추가하지 않는다. persist 실패 시 기존 fail-closed 동작을 유지한다. proxy access log도 Authorization/query를 기록하지 않도록 검토한다.

## 실제 배포 전 승인 항목

사용자가 호스팅 후보·월 예산·지역·웹/게임 도메인·Supabase 개발/운영 프로젝트를 선택해야 한다. 유료 가입, 비용 리소스 생성, 도메인 구매, 공개 서버 배포, 운영 데이터 변경, 외부 비밀 키 등록은 별도 명시적 승인을 받는다. 그 전에는 로컬 검증과 예시 파일까지만 사용한다. 승인 뒤에도 먼저 스테이징 HTTPS에서 [실기기 체크리스트](web-device-checklist.md)를 수행한다.
