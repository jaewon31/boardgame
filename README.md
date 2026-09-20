# Friends Table

초대한 친구끼리 홀덤·섯다를 즐기는 Android/iOS 앱 프로젝트입니다.

## 현재 상태

- Expo + React Native + TypeScript 프로젝트
- 한국어 시작 화면과 홀덤/섯다 선택
- 방 생성, 로그인, 실시간 게임 서버는 아직 구현하지 않았습니다.

## Windows에서 Android 실행

새 PowerShell 터미널에서 프로젝트 폴더로 이동한 뒤 실행합니다. 처음 복사하거나 내려받은 경우 `npm ci`로 의존성을 설치합니다.

```powershell
cd 'C:\Users\jwseo\Desktop\boardgame'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
npm run android -- --lan
```

Android Studio의 Device Manager에 구성된 Pixel_7 가상 기기를 사용합니다.
첫 실행 시 Expo CLI가 호환되는 Expo Go 앱을 내려받을 수 있습니다.
서버 종료는 Ctrl+C입니다. App.tsx를 저장하면 실행 중인 앱에 반영됩니다.

## 검사

```powershell
npm run typecheck
```

## iPhone에서 초기 화면 확인

Expo Go가 프로젝트 SDK를 지원하는 경우 같은 Wi-Fi에 연결하고 `npm start`로
표시되는 QR 코드를 iPhone 카메라로 스캔합니다. Android 에뮬레이터 전용의
`127.0.0.1` 실행 주소는 다른 휴대폰에서 사용할 수 없습니다.
실제 휴대폰으로 테스트할 때는 새 터미널을 열어 위 환경 변수 설정 없이 실행합니다.
정식 개발 빌드와 친구 대상 테스트 배포는 후속 단계에서 구성합니다.

## 다음 단계

1. 게임 규칙 및 비공개 방 입장 방식 결정
2. 서버에서 방 생성·입장, 두 기기 사이 상태 동기화
3. 홀덤 카드 배분·베팅·족보·정산 구현
4. 재접속과 비공개 패 접근 제어 검증
5. 섯다 구현 및 Android/iOS 테스트 빌드 배포
