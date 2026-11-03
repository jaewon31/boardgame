# Railway 클라우드 멀티플레이 검증

점검일: 2026-11-02 (KST). 범위: iPhone LTE/5G + Android, 단일 서버의 비공개 테스트.
현재 판정: 코드 수준 준비 완료, 클라우드 및 실기기 검증 전. 실제 리소스 생성·유료 가입·배포·Git push는 수행하지 않았다. 아래 외부 작업은 사용자 확인 후 실행한다.

## 점검 결과

| 항목 | 결과 |
| --- | --- |
| 컨테이너 | Node 24, 서버/shared의 production 의존성만 설치. 루트 Dockerfile 사용. 시작은 `node apps/server/src/index.ts` |
| Compose | 단일 서버 + Caddy + 영구 볼륨인 VPS용 구성. Railway에는 서버 Dockerfile만 배포하고 Caddy/Compose를 함께 올리지 않음 |
| GitHub Actions | check.yml은 타입/테스트/모바일 export, server-image.yml은 Docker 빌드·환경변수 누락·health·재시작·Caddy 검증. 이미지 push나 클라우드 배포 작업은 없음 |
| 네트워크 | PORT 환경변수(기본 3000), HOST 기본 0.0.0.0. /lobby WebSocket, /health HTTP. HTTPS/WSS는 호스팅 프록시가 종료 |
| health | 준비 완료 시 200 JSON, 종료 시작 시 503. Supabase 접속 성공을 뜻하지 않으며 별도 인증 실증 필요 |
| 종료 | SIGTERM/SIGINT에서 상태 저장, 소켓 종료, SQLite close. 10초 후 강제 종료 안전장치. Railway 종료 유예를 15초로 설정 |
| 복구 | 메모리 전용이 아님. STATE_DB_PATH의 SQLite에 동기 체크포인트 저장. 계정 통계는 STATS_DB_PATH의 별도 SQLite |
| 인증 | 모든 게임 메시지를 current_account_session RPC로 검증. 익명 사용자 JWT 허용, 검증한 UUID/session_id로 소유권 검사 |
| 참가 권한 | 유효 계정 세션 + 방 코드로 참가. 친구 관계는 방 입장 조건이 아님. 친구 통계 API는 수락된 친구만 허용 |
| 앱 주소 | development에서만 LAN/에뮬레이터 fallback. preview/production APP_ENV의 빌드 시 공개 wss /lobby 검증, 릴리스 런타임에서도 검증 |

운영 상태 경로를 지정했어도 그 경로가 실제 영구 볼륨인지는 앱이 검증하지 못한다. 반드시 두 SQLite 파일 모두 /data에 둔다. 디스크 삭제·미연결·잘못된 경로면 재배포 시 방/패/전적이 유실될 수 있다. Supabase에는 방 상태가 저장되지 않는다. 기존 로컬 DB가 클라우드로 자동 이전되지도 않는다. 첫 검증은 새 방으로 시작한다.

복제 수 1을 유지한다. 같은 DB에 둘째 프로세스가 접근하면 잠금으로 실패하며, 서로 다른 DB를 쓰는 복제본은 방이 분리된다. 재배포 중 잠깐의 연결 끊김은 허용하고 재접속으로 복구한다. 기본 자리 보존은 5분, 복원한 진행 중 판에는 30초 복구 시간이 주어진다. 이미 만료된 자리와 24시간 이상 오래된 체크포인트의 방은 복구하지 않는다. 소켓 재연결과 같은 익명 계정 유지가 필요하다.

## 호스팅 선택과 비용

Railway를 우선 선택한다. Dockerfile과 영구 볼륨으로 현재 구조를 그대로 사용할 수 있다. WebSocket 및 관리형 TLS를 지원한다. Hobby는 월 최소 $5이며 포함 사용량을 넘으면 추가 과금된다. 공식 단가는 RAM $10/GB/월, CPU $20/vCPU/월, egress $0.05/GB, volume $0.15/GB/월이다. 예를 들어 평균 RAM 0.25GB + CPU 0.05vCPU + 디스크 1GB + egress 1GB이면 자원비 약 $3.70로 최소 $5, RAM 0.5GB + CPU 0.1vCPU이면 약 $7.20다. 실제 측정 전 예산은 월 $5~10 정도로 잡되 상한 보장은 아니다. 세금·환율·추가 서비스는 별도다. [Railway 요금](https://docs.railway.com/pricing/plans)

Render 대안은 유료 Web Service Starter(월 $7) + 영구 디스크(GB당 월 $0.25)로 1GB 기준 약 $7.25부터이며 추가 트래픽/워크스페이스 비용은 별도 확인한다. Docker, PORT, /health 및 /data 설정은 동일하다. 무료 서비스는 유휴 휴면과 영구 디스크 제약 때문에 게임 상태 보존 검증의 기준 환경으로 추천하지 않는다. [Render 요금 비교](https://render.com/articles/render-vs-railway), [디스크 가격](https://render.com/pricing), [무료 제한](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket)

Supabase는 기존 프로젝트를 유지한다. 호스팅 가격에 Supabase/EAS 요금은 포함되지 않는다. iPhone의 EAS 내부 배포 또는 TestFlight에는 Apple 개발자 멤버십이 필요하며 통상 연 $99(지역별 가격 상이)다. 이미 가입했다면 추가 가입하지 않는다. EAS는 계정의 무료 할당량과 현재 견적을 확인한다. [Apple 멤버십](https://developer.apple.com/programs/enroll/)

## Railway 화면에서 진행할 순서 — 사용자 승인 후

화면 명칭은 업데이트로 달라질 수 있다. GitHub 저장소 연결은 배포를 바로 시작할 수 있으므로 리소스 생성과 배포 승인을 받은 뒤 진행한다.

1. 로컬 변경을 검토하고 배포할 브랜치/커밋을 선택한다. 현재 미커밋 변경과 신규 파일이 많으므로 Dockerfile만 올리지 말고 서버·shared·lockfile·마이그레이션·앱의 일치하는 변경을 검토한다. .env, SQLite, 토큰은 제외한다. GitHub에 올린 커밋에서 Check project와 Verify server image 모두 성공해야 한다. 현재 작업에서는 commit/push하지 않았다.
2. Railway 대시보드에서 New Project → Empty Project를 만들고, + New → Empty Service를 추가한다. 이 순서는 소스를 연결하기 전에 볼륨과 변수를 준비하기 위한 것이다. 바로 GitHub Repo 경로를 선택하면 첫 자동 배포가 설정 전 실패할 수 있다.
3. 서비스에 Volume을 추가하고 Mount Path를 `/data`로 지정한다. 먼저 소규모 용량을 선택하고 서비스와 볼륨을 같은 리전에 둔다. 한국 기기와 Supabase 프로젝트 양쪽의 지연을 고려해 화면에서 사용 가능한 리전을 선택한다.
4. 서비스 Variables에 아래 값을 설정한다. 앱과 같은 Supabase 프로젝트의 publishable key를 사용한다. service_role/secret key는 사용하지 않는다.

| 변수 | 값 |
| --- | --- |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| PORT | 3000 (처음 검증 시 명시적으로 고정해 도메인 target과 일치시킴; 다른 주입 포트도 코드가 지원) |
| STATE_DB_PATH | /data/boardgame.sqlite |
| STATS_DB_PATH | /data/stats.sqlite |
| SUPABASE_URL | https://실제-project-ref.supabase.co |
| SUPABASE_PUBLISHABLE_KEY | 해당 프로젝트의 sb_publishable_ 키 |
| RAILWAY_RUN_UID | 0 |
| RAILWAY_DEPLOYMENT_DRAINING_SECONDS | 15 |
| RAILWAY_DEPLOYMENT_OVERLAP_SECONDS | 0 |
| TRUSTED_PROXY_IPS | 비워 둠 |

Railway는 볼륨을 root 소유로 마운트한다. 현재 Dockerfile은 USER node이므로 공식 안내에 따라 Railway에서만 RAILWAY_RUN_UID=0을 설정한다. 이는 컨테이너 앱을 root로 실행하는 절충이며 일반 Compose의 USER node는 유지한다. 추후 비root 실행이 필요하면 시작 시 볼륨 권한을 정리하고 권한을 내리는 별도 entrypoint를 Linux에서 검증해야 한다. 빌드 단계의 chown만으로 마운트 권한이 해결되지는 않는다. [볼륨 권한](https://docs.railway.com/volumes#permissions), [종료 변수](https://docs.railway.com/variables/reference)

5. 서비스 Settings에서 Replicas=1, Serverless/자동 휴면=Off, Healthcheck Path=`/health`, timeout=60초 이상, Restart Policy=On Failure(예: 최대 10회)를 설정한다. 계속 실패하면 Logs를 확인하며 무한 재시작으로 덮지 않는다. Railway의 배포 healthcheck는 상시 장애 감시를 대신하지 않는다.
6. Settings → Source에서 GitHub 저장소와 검토한 브랜치를 연결한다. Root Directory는 저장소 루트로 유지하고 Dockerfile 경로는 `Dockerfile`이다. apps/server를 루트로 잡으면 shared와 lockfile COPY가 깨진다. 커스텀 Build/Start Command는 비워 Dockerfile CMD를 사용한다. Pre-deploy에 DB 초기화를 넣지 않는다. 볼륨은 pre-deploy에서 사용할 수 없다. 필요하면 자동 배포를 끄고 검토한 커밋만 수동 배포한다.
7. Deploy를 실행하고 Logs의 server_started, durable:true를 확인한다. unable to open database/EACCES면 볼륨과 UID, locked면 복제 수/중복 프로세스, 인증 설정 오류면 변수명을 점검한다. 시작 성공만으로 실제 Supabase 인증이 검증되지는 않는다.
8. Settings → Networking → Public Networking → Generate Domain을 누르고 target port=3000으로 설정한다. HTTPS 인증서가 준비되면 `https://발급도메인/health`에서 200 및 `{"status":"ok","service":"boardgame-server"}`를 확인한다. 앱에는 `wss://발급도메인/lobby`를 사용한다. railway.internal 주소나 http/ws 주소를 넣지 않는다. 별도 도메인 구매/Caddy/TCP Proxy는 필요하지 않다. [공개 네트워크](https://docs.railway.com/networking/public-networking), [WebSocket/TLS](https://docs.railway.com/networking/public-networking/specs-and-limits)
9. Usage/Billing에서 예산 경고를 설정한다. 사용량 제한으로 서버가 중지될 경우 경기 중단도 발생한다. Metrics의 RAM/CPU와 저장 실패·재시작 로그를 확인한다. 볼륨 백업도 준비하되 운영 SQLite 파일을 실행 중 단순 복사하지 않는다.

프록시 주의: 현재 IP 추출은 정확한 TRUSTED_PROXY_IPS에 대해서만 X-Forwarded-For를 신뢰한다. Railway의 공개 프록시 계약과 일치하는 신뢰 경계를 구현하지 않은 상태에서 `*`, 임의 IP, Caddy 전용 172.30.50.2를 입력하지 않는다. 비워두면 안전하게 실제 소켓 peer를 사용하지만 여러 사용자가 같은 proxy IP로 집계되어 기본 24개 연결 제한을 공유할 수 있다. 두 기기 비공개 검증에는 기본값을 유지하고 공개 확대 전 proxy/IP 제한 설계를 별도 점검한다.

## Supabase 및 앱 준비

- 기존 Supabase의 Anonymous Sign-Ins 활성화와 001~006 마이그레이션의 적용 상태를 확인한다. 이미 적용한 운영 DB에 SQL을 무조건 재실행하지 않는다. 특히 005의 세션 검증과 006의 읽기 전용 RLS 보정이 현재 서버/앱과 일치해야 한다.
- 익명 사용자는 `anon` 역할이 아니라 `authenticated` 역할이다. 서버는 publishable key + 사용자 JWT로 current_account_session RPC를 호출하고, 성공 후에만 session_id를 신뢰한다. CAPTCHA 강제 시 현재 앱에 토큰 획득 UI가 없어 새 익명 가입은 실패할 수 있다. 설정을 임의로 끄지 말고 실제 상태를 확인한다. [익명 인증](https://supabase.com/docs/guides/auth/auth-anonymous)
- 앱의 EXPO_PUBLIC_SUPABASE_URL 및 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY와 서버 변수가 같은 프로젝트인지 확인한다. 기존 계정을 유지하고 테스트 중 앱 데이터 삭제/재설치를 피한다.
- EAS 프로젝트 preview/production 환경에 `EXPO_PUBLIC_GAME_SERVER_URL=wss://발급도메인/lobby`와 위 두 Supabase 공개 변수를 각각 설정한다. APP_ENV는 eas.json이 설정한다. EXPO_PUBLIC 값은 번들에 포함되므로 비밀값을 넣지 않는다. 환경변수 변경 후 앱을 다시 빌드한다.
- EAS 프로젝트 연결과 iOS 서명/기기 등록을 확인한 후 apps/mobile에서 `eas build --platform android --profile preview`, `eas build --platform ios --profile preview`를 실행한다. iOS 내부 배포는 기기 등록, TestFlight는 production 빌드와 App Store Connect 제출이 필요하다.
- LTE 검증에는 JS 번들이 포함된 설치형 APK/iOS 앱을 쓴다. 개발 클라이언트가 PC Metro/LAN 주소를 요구하면 게임 서버가 정상이어도 실행되지 않는다. Expo Go/터널 테스트만으로 독립 실행을 통과 처리하지 않는다.
- PC의 개발 서버와 Metro를 종료한 상태에서도 두 앱이 켜지고 클라우드 방에 참가해야 한다. development 환경의 로컬 주소 fallback은 유지한다.

## 실기기 테스트 계획 및 합격 기준

아래는 아직 실행하지 않은 계획이다. iPhone은 설정에서 Wi-Fi Off, 셀룰러 데이터 및 앱 데이터 권한 On. Android도 별도 모바일 회선을 우선 사용한다. USB reverse, 동일 핫스팟, VPN은 기준 시험에서 사용하지 않는다. 각 기기에 다른 익명 계정을 사용한다. 앱 버전/커밋, OS, 통신사, LTE/5G, 도메인, KST 시각, 결과와 복구 시간을 기록한다. 토큰·개인 패·SQLite 원본은 로그/스크린샷에 남기지 않는다.

| 시험 | 절차 | 합격 기준 |
| --- | --- | --- |
| 콜드 스타트 | PC 서버/Metro 종료, 두 폰 Wi-Fi Off, 앱 실행 | 앱 자체가 실행되고 로그인/프로필 로드; 새 테스트 계정은 닉네임 완료 |
| 계정 유지 | 앱 종료 후 다시 실행 | 동일 UUID/친구 코드, 친구 목록 유지; 새 익명 계정으로 바뀌지 않음 |
| 방 생성/참가 | iPhone 방 생성 → Android 코드 참가, 이후 역할 교대 | 같은 방/좌석/설정, 중복 좌석 없음 |
| 경기 진행 | 최소 3판 진행; check/call/raise/fold, 가능한 all-in 포함 | 양측 턴/보드/칩 동기화, 타인 비공개 카드 노출 없음, 결과 중복 정산 없음 |
| 친구 기능 | 기존 절차로 요청/수락, 경기 후 전적 조회 | 친구 목록과 승인된 친구 전적 정상; 친구가 아닌 제3자 전적 요청은 거절 |
| 짧은 단절 | 한 기기 비행기 모드 20초 후 복귀(5분 이내) | 동일 계정/좌석 복귀, 중복 행동/정산 없음. 단절 중 턴 시간은 계속 흐름 |
| 전환/백그라운드 | Wi-Fi→LTE, 화면 잠금 30초, 전화/백그라운드 후 복귀 | 복구 표시와 최신 상태 동기화. 네트워크 복원 후 통상 30초 내 복귀를 목표로 실측 |
| 앱 강제 종료 | 경기 중 강제 종료 후 1분 내 재실행 | 동일 계정과 자리 복귀, 친구·프로필 유지 |
| 장기 단절 | 기본 5분을 충분히 넘겨 오프라인 후 복귀 | 만료된 좌석이 부활하지 않고 정상적인 재참가 흐름 |
| 서버 재시작 | 두 기기 접속 중 Railway Restart, 같은 볼륨 유지 | health 복구, 동일 방/칩/패/진행 및 통계 복원, 새 좌석 생성 없음 |
| 재배포 | 검토한 동일 버전을 재배포, 같은 볼륨 유지 | 짧은 중단 뒤 위와 동일 복구; /data가 ephemeral이 아님을 실증 |
| 인증 거절 | 격리한 테스트 클라이언트에서 토큰 누락/위조 및 타인 resume 시도 | 게임 상태 접근/변경 차단. 운영 JWT를 문서나 커맨드 이력에 복사하지 않음 |
| 장시간 | LTE/5G에서 60~90분 실행, 토큰 갱신 구간 포함 | 갱신 후에도 플레이/재접속 성공, 서버 재시작 반복·지속적 메모리 증가 없음 |

실패를 분리한다: health 실패는 포트/볼륨/배포, health 성공 + WSS 실패는 /lobby/도메인/프록시, AUTH_UNAVAILABLE은 RPC/서버 outbound/Supabase 상태, AUTH_REQUIRED는 JWT/세션, 1013은 접속 제한 또는 일시 장애를 점검한다. 5분 초과 이탈과 턴 timeout은 정상 규칙일 수 있으므로 네트워크 실패로 오판하지 않는다.

## 이번 수정과 검증 기록

- Dockerfile HEALTHCHECK가 고정 3000 대신 PORT를 사용하도록 수정.
- 기존 server-image.yml 검증을 PORT=8080 컨테이너로 강화하고 Docker 자체 Health.Status도 확인하도록 수정. 기존 미커밋 CI 변경은 보존.
- 기존 비공개 배포 문서의 '계정 인증 없음' 설명을 현재 익명 인증 구조에 맞게 정정하고 이 문서 연결.
- 게임 규칙, 친구 추가, 방 생성, 익명 인증 및 모바일 주소 구현은 변경하지 않음.
- Node v24.19.0에서 전체 TypeScript 검사 및 기존 테스트 123개 통과(실패/skip 0). 실제 Supabase 요청은 모사 테스트와 구분한다.
- 이 PC에서 Docker CLI가 발견되지 않아 Linux 컨테이너 빌드/Compose/수정한 GitHub Actions 실행은 미검증. GitHub CI 성공 확인이 실제 배포 전 필수다. Windows 프로세스 종료 테스트는 Linux SIGTERM 검증을 완전히 대신하지 못한다.
- npm run export:mobile: Android/iOS Hermes 번들 생성 성공. git diff --check: 공백 오류 없음(기존 파일의 줄바꿈 변환 경고만 있음).
- 클라우드 URL, 실제 Supabase 인증, iPhone/Android 셀룰러 실증은 배포 승인 후 남은 작업이다.
