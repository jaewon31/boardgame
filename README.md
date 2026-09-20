# Boardgame · Friends Table

초대한 친구끼리 홀덤·섯다를 즐기는 Android/iOS 앱입니다.
Node.js 24 LTS와 npm workspaces로 앱·서버·공유 타입을 한 저장소에서 관리합니다.

## 디렉토리 구조

```text
boardgame/
├─ apps/
│  ├─ mobile/               # Expo 모바일 앱
│  │  ├─ App.tsx            # 앱 진입 컴포넌트
│  │  ├─ index.ts           # Expo 등록
│  │  ├─ src/screens/       # 화면 (현재 HomeScreen.tsx)
│  │  ├─ assets/            # 아이콘·이미지
│  │  └─ app.json           # Android/iOS 앱 설정
│  └─ server/               # Node.js 서버
│     ├─ src/index.ts       # 서버 실행
│     ├─ src/http.ts        # HTTP 서버, 현재 /health만 제공
│     └─ test/             # 서버 검증
├─ packages/shared/src/    # 앱과 서버의 공통 데이터 타입
├─ .github/workflows/      # 자동 검사
├─ package.json            # 전체 실행 명령과 workspace 목록
└─ package-lock.json       # 모든 workspace의 의존성 버전 고정
```

각 package.json은 해당 앱의 의존성을 선언합니다. 설치는 저장소 루트에서 한 번만 합니다.
화면이 늘어나면 mobile/src/components(공통 UI), services(서버 연결)를 추가합니다.
공유 패키지는 공개 데이터 계약만 포함합니다. 카드 배분·정산·비밀정보는 서버에서 관리합니다.

## 설치와 실행

저장소 루트에서 Node.js 24로 실행하세요.

```powershell
npm ci
npm start
```

Android 가상 기기 실행 (Windows):

```powershell
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
npm run android -- --lan
```

서버는 별도 터미널에서 실행합니다.

```powershell
npm run server
```

기본 주소는 http://127.0.0.1:3000/health 입니다. HOST와 PORT 환경 변수로 변경할 수 있습니다.
개발 서버 종료는 Ctrl+C입니다. Node.js 24의 TypeScript 실행 기능을 사용합니다.

iPhone은 SDK 57을 지원하는 Expo Go 또는 개발 빌드가 필요합니다.
실제 휴대폰에서는 새 터미널에서 npm start를 실행하고 같은 Wi-Fi로 연결합니다.
127.0.0.1 주소는 다른 휴대폰에서 사용할 수 없습니다.

## 검사

```powershell
npm run typecheck
npm test
npm run export:mobile
```

마지막 명령은 Android/iOS JavaScript와 에셋 번들 검사입니다. 설치용 APK/IPA 빌드는 아닙니다.
GitHub에서도 위 검사를 자동 실행합니다.

## 현재 구현 범위

홈 화면과 홀덤·섯다 선택, 서버 상태 확인까지 구현했습니다.
방 생성·입장, 로그인, 실제 게임 로직과 모바일-서버 연결은 다음 단계입니다.
형상관리는 GITHUB_WORKFLOW.md를 참고하세요.
