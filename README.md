# Boardgame · Friends Table

초대한 친구끼리 홀덤·섯다를 즐기는 Android/iOS 앱입니다.
현재 **비공개 대기실과 노리밋 홀덤**을 구현했습니다. 섯다는 대기실까지만 지원합니다.

## 홀덤 플레이

두 명 이상 입장한 뒤 방장이 **홀덤 시작**을 누릅니다. 시작 칩은 1,000개, 블라인드는 10/20이며 2~6명이 참여합니다.
개인 패 → 프리플롭 → 플롭 → 턴 → 리버 → 결과 순서로 진행합니다. 폴드, 체크, 콜, 레이즈, 올인을 지원합니다.
레이즈 입력은 **이번 라운드에 낼 총 금액**입니다. 최소 레이즈보다 작은 올인은 남은 칩을 모두 낼 때만 가능합니다.
행동 제한은 30초이며 시간이 지나면 체크할 수 있을 때 체크, 아니면 폴드합니다.

서버가 카드 셔플·차례·족보·사이드 팟·무승부 분배·미성립 베팅 반환을 계산합니다.
진행 중에는 자기 패만 전달합니다. 쇼다운에서 팟을 받은 참가자(사이드 팟·무승부 포함)의 패는 자동 공개하고, 패배한 참가자의 패는 본인이 공개할 때까지 다른 클라이언트에 전달하지 않습니다.
패배한 참가자는 내 카드 두 장을 위로 천천히 밀어 째볼 수 있습니다. 80pt 이상 넘기고 놓으면 서버에 공개 요청을 보내고, 짧게 밀거나 취소하면 다시 덮습니다. **내 패 모두에게 공개** 버튼으로도 같은 동작을 할 수 있습니다.
칩 정산은 쇼다운 즉시 완료됩니다. 공개를 기다리지 않고 방장이 다음 판을 시작할 수 있으며, 이전 판의 미공개 패는 그대로 비공개로 끝납니다. 폴드한 패와 상대 전원 폴드로 끝난 판은 공개 대상이 아닙니다.

화면은 내 자리를 아래로 두고 참가자들이 타원형 테이블을 둘러앉도록 표시합니다. 자리마다 패 두 장·칩·딜러/블라인드 표시가 있고, 공용 카드는 가운데, 베팅 버튼은 하단에 표시됩니다. 카드 등장·뒤집기 애니메이션과 기기의 동작 줄이기 설정을 지원합니다.
이전 판의 칩으로 다음 판을 진행하고 딜러가 이동합니다. 칩이 없는 참가자는 쉬며, 판 종료 후 방장이 모두의 칩을 1,000개로 초기화할 수 있습니다.
진행 중에는 신규 입장이 제한되지만 기존 참가자는 30초 안에 재접속할 수 있습니다.
직접 퇴장하거나 재접속 기한이 지나면 폴드합니다. 이미 올인한 패는 정산 자격을 유지하지만 퇴장한 자리는 복구할 수 없습니다.
현금이나 결제 기능은 없는 가상 칩 게임입니다.

## 현재 기능

- 닉네임(1~12자)과 게임 종류를 선택해 방 생성
- 무작위 8자리 초대 코드로 입장 (코드를 아는 사람이 입장할 수 있는 방식)
- 최대 6명 참가자 목록, 방장 표시, 코드 공유, 방 나가기
- 참가자 입장·퇴장·연결 상태를 WebSocket으로 실시간 동기화
- 연결 종료 감지 후 30초 동안 자리 유지 및 앱 내 자동 재접속
- 방장 퇴장/재접속 기한 만료 시 남은 참가자에게 방장 이전
- 입력 검증, 중복 닉네임·정원 초과·잘못된 코드 오류 표시

## 구조

```text
apps/mobile/
  App.tsx                      # 홈/대기실 표시와 SafeArea 설정
  src/screens/                 # HomeScreen, LobbyScreen, GameScreen
  src/components/              # 공통 버튼
  src/hooks/useRoom.ts          # React와 연결 상태 결합
  src/services/RoomClient.ts    # WebSocket 연결·재접속·퇴장
  src/services/serverUrl.ts     # 개발/배포 서버 주소
apps/server/
  src/index.ts                 # HTTP + WebSocket 서버 실행
  src/http.ts                  # GET /health
  src/lobby.ts                 # 방·참가자·초대 코드·세션 관리
  src/holdem/                  # 카드·족보 판정과 홀덤 규칙
  test/                        # 서버와 모바일 통신 통합 테스트
packages/shared/src/index.ts   # 공통 요청/응답 타입
.github/workflows/check.yml    # 타입 검사·테스트·플랫폼 번들 자동 검사
```

Node.js 24 LTS와 npm workspaces를 사용합니다. 설치는 저장소 루트에서 한 번만 합니다.
게임 규칙과 비밀 패는 서버가 관리하며 모바일에는 참가자별로 허용된 정보만 전달합니다.

## Windows에서 실행

VS Code에서 `C:\Users\jwseo\Desktop\boardgame` 폴더를 열어 터미널 **2개**를 사용합니다.
`npm.cmd`는 PowerShell 실행 정책에 영향받지 않는 npm 호출 방식입니다.

처음 내려받았거나 의존성이 바뀐 경우:

```powershell
cd "$env:USERPROFILE\Desktop\boardgame"
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm.cmd ci
```

**터미널 1 — 게임 서버** (방과 참가자 관리, 포트 3000):

```powershell
cd "$env:USERPROFILE\Desktop\boardgame"
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm.cmd run server
```

**터미널 2 — Expo 앱** (앱 코드 제공, 포트 8082):

```powershell
cd "$env:USERPROFILE\Desktop\boardgame"
$env:Path = "C:\Program Files\nodejs;$env:Path"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "127.0.0.1"
npm.cmd run android -- --lan --port 8082
```

Android Studio Device Manager의 Pixel_7을 실행할 수 있습니다.
둘 다 켜 둬야 합니다. Expo만 켜면 첫 화면은 보이지만 방에는 접속할 수 없습니다.
종료는 각 터미널에서 Ctrl+C입니다.

## 실제 휴대폰 두 대로 확인

### 에뮬레이터 두 대에서 연결이 끊길 때

가상 네트워크 주소 `10.0.2.2`에서 반복 끊김이 생기면 각 기기의 ADB 포트 연결을 사용합니다.
`apps/mobile/.env.local`에 `EXPO_PUBLIC_GAME_SERVER_URL=ws://127.0.0.1:3000/lobby`를 설정하고 Expo를 다시 실행한 뒤, 두 에뮬레이터를 켜고 저장소 루트에서 `npm.cmd run android:devices`를 실행합니다.
이 명령은 연결된 기기마다 Expo 8082와 게임 서버 3000 포트를 연결하고 앱을 엽니다. 에뮬레이터를 껐다 켜면 다시 실행합니다.
다른 Expo 포트는 `npm.cmd run android:devices -- -Port 8083`처럼 지정할 수 있습니다.
앱은 5초마다 서버에 응답을 요청하고 15초간 응답이 없으면 연결을 교체합니다. 화면으로 돌아올 때도 연결을 검사합니다.

실제 휴대폰을 Wi-Fi로 테스트할 때는 `.env.local`의 localhost 설정을 지우거나 아래의 PC LAN 주소로 바꿔야 합니다. `.env.local`은 `.env`보다 우선합니다.

### 같은 Wi-Fi의 휴대폰

1. PC와 휴대폰 두 대를 같은 Wi-Fi에 연결합니다.
2. PC에서 `ipconfig`로 Wi-Fi의 IPv4 주소를 확인합니다.
3. `apps/mobile/.env.example`을 같은 폴더의 `.env`로 복사하고 다음 값을 지정합니다.

```dotenv
EXPO_PUBLIC_GAME_SERVER_URL=ws://192.168.0.10:3000/lobby
```

예제 IP는 실제 PC 주소로 바꿉니다. 게임 서버는 기본적으로 `0.0.0.0:3000`에 바인딩됩니다.
Windows 방화벽이 물으면 신뢰하는 개인 네트워크에서 Node.js 통신을 허용합니다.
공용 인터넷을 위한 포트 포워딩은 이 단계에서 필요하지 않습니다.

4. Expo 터미널에서 Ctrl+C로 종료하고 아래처럼 LAN 주소로 다시 실행합니다.

```powershell
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
npm.cmd start -- --lan --port 8082
```

5. 두 휴대폰에서 SDK 57 호환 Expo Go로 QR 코드를 엽니다.
6. 첫 휴대폰에서 방 생성 → 두 번째 휴대폰에서 다른 닉네임과 초대 코드로 입장합니다.
7. 양쪽 참가자 목록이 같아지는지 확인하고, 한 명이 나가면 다른 쪽에서도 사라지는지 확인합니다.

Android 에뮬레이터는 PC 주소로 `10.0.2.2`를 사용할 수 있습니다.
실제 휴대폰에서 `127.0.0.1`은 PC가 아니라 휴대폰 자신을 뜻합니다.
`.env` 변경 후 Expo를 재시작하세요. EXPO_PUBLIC_* 값은 앱에 포함되므로 비밀 키를 넣지 않습니다.

## 검사

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run export:mobile
```

테스트는 임의의 빈 포트로 실제 WebSocket 서버를 열어 여러 클라이언트를 연결합니다.
입장 동기화, 방 분리, 자리 제한, 세션 보안·만료, 자동 재접속과 나가기 취소를 검증합니다.
export:mobile은 Android/iOS JavaScript·에셋 번들 검사이며 APK/IPA 빌드는 아닙니다.

## 현재 운영 범위

- 로컬/같은 Wi-Fi 개발 환경입니다. 인터넷 게임 서버는 아직 배포하지 않았습니다.
- 방과 재접속 세션은 서버 메모리에만 있습니다. 서버 재시작 시 방이 초기화됩니다.
- 재접속 토큰은 앱 메모리에만 저장합니다. 앱을 완전히 종료하면 새로 입장해야 합니다.
- 계정 로그인, 영구 저장, 섯다 게임은 이후 단계입니다.
- 실제 배포에는 TLS가 적용된 `wss://` 서버 주소를 명시해야 합니다.
- 서버 HOST/PORT 환경 변수로 바인딩 주소와 포트를 변경할 수 있습니다.

형상관리 방식은 [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md)를 참고하세요.
