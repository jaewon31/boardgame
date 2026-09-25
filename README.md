# Boardgame · Friends Table

초대한 친구끼리 홀덤·섯다를 즐기는 Android/iOS 앱입니다.
현재 **비공개 대기실**을 구현했습니다. 카드 배분·베팅·정산은 아직 없습니다.

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
  src/screens/                 # HomeScreen, LobbyScreen
  src/components/              # 공통 버튼
  src/hooks/useRoom.ts          # React와 연결 상태 결합
  src/services/RoomClient.ts    # WebSocket 연결·재접속·퇴장
  src/services/serverUrl.ts     # 개발/배포 서버 주소
apps/server/
  src/index.ts                 # HTTP + WebSocket 서버 실행
  src/http.ts                  # GET /health
  src/lobby.ts                 # 방·참가자·초대 코드·세션 관리
  test/                        # 서버와 모바일 통신 통합 테스트
packages/shared/src/index.ts   # 공통 요청/응답 타입
.github/workflows/check.yml    # 타입 검사·테스트·플랫폼 번들 자동 검사
```

Node.js 24 LTS와 npm workspaces를 사용합니다. 설치는 저장소 루트에서 한 번만 합니다.
게임 규칙과 비밀 패는 서버가 관리하며 모바일은 공개 상태만 표시하는 방향입니다.

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
- 계정 로그인, 영구 저장, 게임 시작은 다음 단계입니다.
- 실제 배포에는 TLS가 적용된 `wss://` 서버 주소를 명시해야 합니다.
- 서버 HOST/PORT 환경 변수로 바인딩 주소와 포트를 변경할 수 있습니다.

형상관리 방식은 [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md)를 참고하세요.
