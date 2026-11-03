# 친구 대상 비공개 배포

범위: 가상 칩 홀덤, 한 서버 프로세스, Android/iOS. 섯다는 첫 배포에서 제외한다.
유효한 Supabase 계정 세션(익명 계정 포함)과 방 코드로 입장한다. 친구 관계 자체가 방 참가 조건은 아니며 방장 승인·강퇴는 아직 없다.
공개 스토어 출시 전에는 등급분류, 개인정보 안내/문의처, 심사 접근 방법을 별도로 준비한다.

Railway 배포와 LTE/5G 검증은 [클라우드 검증 가이드](cloud-multiplayer-validation.md)를 먼저 참고한다.

## 서버

Node 24와 영구 디스크가 필요하다. 이 저장소의 Docker Compose는 서버 한 대와 Caddy HTTPS 중계로 구성된다.
배포할 Linux 서버에 Docker Compose를 설치하고, 보유한 도메인의 DNS를 서버에 연결한다.
외부에는 80/443만 열고 3000은 공개하지 않는다. 자동 휴면이 없는 서버와 암호화된 디스크를 사용한다.

저장소 루트에서:

```sh
cp .env.example .env
# .env의 GAME_DOMAIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY를 실제 값으로 설정
docker compose config --quiet
docker compose up -d --build
```


Compose는 루트 `.env` 또는 셸 환경변수에서 위 세 값을 읽는다. 기존 `export GAME_DOMAIN=...` 방식도 계속 사용할 수 있다.
`SUPABASE_URL`은 앱과 같은 프로젝트의 `https://<project-ref>.supabase.co`, 키는 `sb_publishable_`로 시작하는 publishable key를 사용한다. `service_role`이나 secret key를 넣지 않는다.
`apps/server/.env.example`은 서버 옵션 참고용이며 Compose가 자동으로 읽는 파일이 아니다. production에서는 모바일 `.env.local`도 읽지 않는다.
인증 변수가 없거나 빈 문자열이면 Compose가 변수 이름과 함께 즉시 실패한다. 직접 Docker로 실행할 때도 두 인증 변수를 `-e` 또는 `--env-file`로 전달해야 한다.
`STATE_DB_PATH=/data/boardgame.sqlite`와 영구 볼륨은 Compose에 이미 설정되어 있다. 기존 볼륨을 삭제하지 않는다.
`.env`는 Git 및 Docker 빌드 컨텍스트에서 제외된다. 설정 확인에는 값을 출력하지 않는 `docker compose config --quiet`를 사용한다.

CI는 가짜 publishable key와 컨테이너의 loopback으로 고정한 테스트 호스트를 사용해 기동·재시작과 `/health`의 상태 코드/JSON을 검사한다.
인증 변수 누락·빈값도 별도로 실패 검증한다. 이 검사는 실제 Supabase 로그인이나 RPC 연결 성공을 보장하지 않는다.

`https://도메인/health`가 200인지 확인한다. 앱 접속 주소는 `wss://도메인/lobby`이다.
Compose의 서버/중계 IP는 고정이며 `TRUSTED_PROXY_IPS`는 중계의 정확한 주소만 신뢰한다.
다른 호스팅으로 옮길 때는 신뢰 IP와 영구 볼륨 설정을 함께 바꾼다. 전달받은 IP 헤더를 무조건 신뢰하면 안 된다.
Caddy는 TLS를 종료하고 WebSocket을 전달한다. 인증서는 실제 도메인/DNS 및 80/443 접근이 준비된 후 발급된다.

SQLite 파일에는 개인 패, 남은 덱, 재접속 토큰이 포함된다. 공개 폴더, Git, 일반 로그에 넣지 않는다.
현재 상태를 원자적으로 저장한 다음 참가자에게 전달한다. 저장 실패 시 연결을 종료하며 이전 체크포인트로 재시작한다.
같은 DB에 두 프로세스가 접속하면 두 번째는 잠금 오류로 시작하지 못한다. 복제 수를 1로 유지한다.
기본 상한은 100개 방/240개 연결/IP당 24개이며 이는 성능 보장 수치가 아니다. 실제 부하 측정 후 조절한다.

## 복구 규칙

- 앱 강제 종료/연결 끊김 이후 기본 5분 동안 자리를 보존한다. 턴 제한은 30초로 계속 적용된다.
- 앱 재실행은 같은 서버에 저장된 토큰으로 자리를 되찾는다. 명시적으로 나가거나 세션 만료 시 토큰을 삭제한다.
- 서버 재시작은 동일한 방, 칩, 개인 패, 남은 덱과 공개 상태를 복원한다. 진행 중인 판은 재접속을 위해 30초의 새 타이머를 받는다.
- 복원된 모든 사용자는 우선 오프라인이다. 신규 판은 접속한 유자격 참가자 2명 이상일 때만 진행된다.
- 이미 만료된 오프라인 자리는 제거한다. 저장 시점부터 24시간 넘게 중단된 서버의 방은 복원하지 않는다.
- 경기 도중 신규 입장자는 관전하며 다음 판부터 참여한다.

## 점검, 백업, 롤백

1. 진행 중인 친구들에게 점검을 알리고 `docker compose stop server`로 정지한다.
2. `game-data` 볼륨을 암호화된 비공개 백업으로 보관한다. 실행 중인 SQLite 파일을 단순 복사하지 않는다.
3. 새 버전을 빌드하고 `docker compose up -d --build server`로 시작한다.
4. health와 로그를 확인하고 두 기기로 같은 방 복귀를 검사한다.

볼륨을 삭제하면 복구할 수 없다. 이전 커밋이 현재 체크포인트 버전을 이해하는지 확인한 후 롤백한다.
이전 메모리 전용 버전으로 되돌리면 DB를 읽지 못하므로 기존 경기는 복구되지 않는다.
운영 DB 스키마를 바꾸는 후속 배포에서는 마이그레이션/롤백 절차도 추가한다.

`docker compose logs server`에 시작/분당 방 수·연결 수·메모리·저장 실패가 기록된다. 패/토큰/닉네임/IP는 기록하지 않는다.
호스팅의 health 알림을 `/health`에 연결하고 재시작 반복·저장 실패를 알림 대상으로 설정한다.
외부 알림 서비스 및 모바일 오류 수집 서비스는 아직 연결하지 않았다.

## 앱 빌드

`apps/mobile`에서 EAS 명령을 실행한다. 루트 전체 모노레포를 유지한다.
Expo 계정으로 로그인하고 `eas init`으로 프로젝트를 연결한다.
`EXPO_PROJECT_ID` 환경 변수 또는 `app.json`의 `extra.eas.projectId`로 연결 정보를 유지할 수 있다.

EAS의 preview와 production 환경에 각각 `EXPO_PUBLIC_GAME_SERVER_URL=wss://실제도메인/lobby`를 설정한다.
이는 앱에 포함되는 공개 주소이므로 비밀 키를 넣지 않는다. 로컬 `.env.local`의 에뮬레이터 주소를 배포에 사용하지 않는다.
배포 프로필은 `APP_ENV`를 설정하며 주소가 비었거나 평문/로컬 주소이면 빌드가 실패한다.

```sh
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Android preview는 직접 설치할 APK이다. iOS internal 배포에는 Apple 개발자 계정과 등록된 테스트 기기가 필요하다.
TestFlight를 사용하려면 production 프로필로 서명된 빌드를 만들고 App Store Connect에 제출한다.
`com.jaewon31.boardgame`을 기본 식별자로 준비했으며, 최초 등록 전에 실제 계정에서 사용 가능한지 확인한다.
첫 배포는 휴대폰 대상으로 한정하고 iPad 지원을 끈 상태이다.
SecureStore 네이티브 모듈이 추가됐으므로 기존 독립 설치 앱은 새로 빌드해야 한다.

## 테스트와 남은 외부 작업

`npm ci`, `npm run typecheck`, `npm test`, `npm run export:mobile`을 저장소 루트에서 실행한다.
자동 테스트에는 SQLite 재시작, 동시 실행 잠금, 저장 실패 시 응답 차단, 세션 복구/취소/삭제, 프록시 헤더 위조 방지가 포함된다.
출시 전에는 서로 다른 네트워크의 Android/iPhone으로 앱 강제 종료, 통화/화면 잠금, 인터넷 전환, 서버 재시작을 검증한다.
이 코드 변경만으로 서버 임대·DNS·개발자 계정·앱 서명·스토어 심사·등급분류가 완료되지는 않는다.

확인 시점: 2026-10-12. 빌드 도구의 shell-quote/source-map-js 패치를 반영했다.
서버만 대상으로 한 `npm audit --omit=dev --workspace=@boardgame/server`는 0건이었다.
모노레포 전체에는 Expo 도구 체인의 보안 권고가 남아 있어 공개 출시 전 다시 확인해야 한다. `npm audit fix --force`로 Expo를 구버전으로 내려서는 안 된다.

참고: [Expo 출시 빌드](https://docs.expo.dev/deploy/build-project/), [Caddy WebSocket/프록시](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
