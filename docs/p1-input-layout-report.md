# P1 입력·모바일 레이아웃 수정 보고서

작업 브랜치: `codex/tempo-hand-history`.
기존 P0 미커밋 변경을 유지했다. 작업 시작 시 저장한 diff와 비교하여 GameScreen의 의도적인 P1 확장을 제외한 P0 파일 변경 내용이 동일함을 확인했다. 카드 모션/사운드/5초 전환 서버 코드는 이번 작업에서 수정하지 않았다. 프로토콜·Supabase 스키마 변경, Railway/Cloudflare 배포, main 병합, 원격 푸시 없음.

## 1. 원인 분석

### PC 입력

- GameScreen의 effect가 `hand.id, hand.revision, minRaiseTo`에 의존해 매 revision 변화마다 레이즈 값을 초기화하고 패널을 닫았다. 같은 턴의 스냅샷 갱신도 편집 세션을 종료할 수 있었다. 테스트용 로컬 WebSocket에서 100ms마다 revision을 갱신하며 현재 코드는 포커스/문자열을 유지하는 것을 검증했다. 운영 서버에서 사용자가 경험한 모든 입력 실패의 원인이 이것 하나라고 단정하지 않는다.
- AccountScreen은 이미 프로필이 있어도 profileLoading 동안 입력창을 스피너로 교체했다. 토큰 갱신에 따른 프로필 재검증 중 입력 DOM이 사라지는 경로였다.
- 홈 초대 코드, 친구 코드, 방 설정 숫자는 onChangeText에서 대문자 변환/문자 삭제를 수행했다. 브라우저 IME의 미완성 문자열과 캐럿 위치를 앱이 즉시 덮어쓸 수 있는 경로였다.
- 레이즈, 방 설정, 친구 코드에는 onSubmitEditing이 없어 Enter가 목적에 맞는 동작을 하지 않았다. React Native Web 단일행 TextInput은 기본적으로 Enter에서 blur한다.
- 설치된 React Native Web 0.21.4는 `isComposing || keyCode === 229`일 때 Enter 제출을 억제하고 keydown 전파를 차단한다. 자체 전역 keydown/keyup 게임 단축키는 없었다. 닉네임 입력 자체는 원문을 유지하고 있었다. 실제 채팅 컴포넌트는 현재 소스에 없다.
- 홈의 invite object identity effect도 같은 코드의 새 객체를 받으면 입력값을 재설정할 수 있어 의존성을 invite.code로 좁혔다.

### 모바일 키보드

- useWebLayout.web.ts가 visualViewport.height를 --table-viewport로 그대로 기록하고 root 전체 높이에 적용했다. 키보드가 viewport를 줄이면 게임 테이블 부모도 줄어드는 구조였다.
- 같은 높이를 입력 모달과 게임 루트가 공유했고, viewport.offsetTop/scroll은 처리하지 않아 Safari의 시각 viewport 이동을 보정하지 못했다.
- 화면 높이 기반 media query는 Android의 layout viewport 축소 시 게임 배치 모드를 변경할 수 있었다.
- 이전 전체 화면 리뷰용 CSS가 P0 오른쪽 패널에도 width/max-width, 높이, flex-shrink 규칙을 적용하고 있었다.

## 2. 수정 파일

| 파일 | 변경 |
| --- | --- |
| apps/mobile/src/screens/GameScreen.tsx | 편집 세션을 핸드/actor/deadline/행동 가능 여부에 연결. 패널 열 때 최소 금액 설정. 유효한 레이즈 Enter 처리, 웹의 무효 Enter는 blur하지 않음. 웹 KeyboardAvoidingView 비활성화. |
| apps/mobile/src/screens/AccountScreen.tsx | 기존 프로필 재검증 시 입력창 유지. 웹 KeyboardAvoidingView 비활성화. |
| apps/mobile/src/screens/HomeScreen.tsx | 웹 코드 입력 원문 유지, invite.code 기준 갱신, 웹 KeyboardAvoidingView 비활성화. |
| apps/mobile/src/screens/FriendsScreen.tsx | 웹 입력 원문 보존, 제출 시 코드 정규화 및 검증, Enter 친구 요청. |
| apps/mobile/src/components/RoomSettingsEditor.tsx | 웹 입력 중 숫자 삭제 제거, 제출 시 숫자 형식/범위 검증. Enter 다음 단계/최종 적용. |
| apps/mobile/src/services/webViewport.ts | table/input viewport 분리, touch 입력 중 테이블 높이 유지, offsetTop 보정, rAF 이벤트 병합, 입력 모달 내부 스크롤, 이벤트 정리. |
| apps/mobile/src/services/useWebLayout.web.ts | 루트 고정/페이지 외부 스크롤 차단, 입력 모달에 가시 viewport 높이·offset 적용, 테이블 크기 기준 container query, 오래된 리뷰 전용 규칙 제거. |
| apps/mobile/test/web-ui.test.cjs | 키보드/blur/회전/확대/데스크톱/fallback/cleanup 회귀 테스트. |
| apps/mobile/test/browser/input-fixture.jsx | 실제 화면 컴포넌트를 사용하는 테스트 전용 앱. 로컬 WebSocket 스냅샷 사용. |
| apps/mobile/test/browser/native-web-shim.js | 테스트 번들에서 RN Web와 사용되지 않는 네이티브 SVG 사운드 모듈 연결. |
| scripts/test-input-browser.cjs | Playwright Chrome 입력/IME/포커스/키보드 시뮬레이션 검증 실행기. |

## 3. PC 입력 처리

브라우저에서는 입력 원문을 React state에 그대로 보관한다. 한글 조합을 위해 별도 전역 키 이벤트, 수동 value 재할당, 강제 focus/blur 루프를 추가하지 않았다. RN Web의 composition-aware Enter 처리를 유지한다. 닉네임은 기존 제출 시 NFC 정규화, 방 코드는 대문자 검증, 친구 코드는 normalizeFriendCode, 숫자는 숫자 문자열/범위 검증 후 제출한다.

Enter 동작: 닉네임 저장/방 입장(기존), 친구 요청(추가), 방 설정 다음 단계/적용(추가), 유효한 금액 레이즈(추가). 무효 레이즈는 제출하지 않고 웹 포커스를 유지한다. 실제 턴/핸드가 바뀌어 법적 액션이 달라지면 패널은 닫히며 서버 액션 검증은 그대로 유지된다.

Android/iOS 네이티브는 기존 입력 필터와 KeyboardAvoidingView 동작을 유지한다. 공통 Enter 처리와 편집 수명 개선은 적용되지만 네이티브 실기기 회귀 검증은 아직 하지 않았다.

## 4. iPhone Safari/PWA 대응

- visualViewport.height는 --input-viewport, 유지할 테이블 높이는 --table-viewport로 분리한다.
- coarse pointer 환경에서 편집 시작 시 테이블 높이를 유지한다. blur가 키보드 닫힘보다 먼저 도착해도 viewport가 회복될 때까지 유지한다. 화면 폭 변경은 회전/리사이즈로 처리한다.
- visualViewport의 resize와 scroll, window resize, focusin/out을 requestAnimationFrame 한 번으로 병합한다. Safari의 offsetTop에 맞춰 루트와 포털 모달의 top을 조정한다.
- 입력 모달만 줄이고 내부 스크롤을 허용한다. 활성 입력이 모달 바깥으로 잘리면 해당 패널의 scrollTop만 조절한다. 게임 테이블과 document를 scrollIntoView하지 않는다.
- 게임의 작은 화면/가로 배치 규칙은 root container 크기를 기준으로 적용하여 키보드에 의한 layout viewport 축소와 분리한다.
- safe-area-inset을 유지하고 확대(scale != 1) 때 viewport 값을 재설정하지 않는다. 기기명 판별이나 특정 iPhone 키보드 높이 상수는 사용하지 않았다. 기존 입력 폰트 크기는 모두 16px 이상이며 그대로 유지했다.
- Safari와 standalone PWA에 동일 경로를 적용한다. 실제 Safari 주소창 변화/홈 화면 safe area/키보드 애니메이션은 실기기에서 확인해야 한다.

설계 참고: [VisualViewport의 layout/visual viewport 차이와 offset](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport), [IME isComposing](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing). 제출 동작은 설치된 node_modules/react-native-web/dist/exports/TextInput/index.js를 직접 조사했다.

## 5. 테스트 결과

- TypeScript 전체 workspace: 통과.
- 서버: 175/175 통과. 로컬 WebSocket 허용 실행 사용.
- 모바일: 50/50 통과.
- Expo Web export: 성공. 배포하지 않음.
- Chrome 157.0.8103.52 + Playwright 1.65.1: 통과.
  - 클릭 후 포커스, 영문·숫자, Backspace, Enter.
  - CDP IME 조합(ㅎ→한→한글) 및 조합 중 Enter 제출 억제. OS 물리 한글 키보드 실청취/수동 테스트가 아닌 브라우저 프로토콜 조합 검증이다.
  - 프로필 재검증 시 입력 DOM·값·포커스 유지.
  - 초대 코드/친구 코드 제출 정규화, 방 설정 Enter 이동/저장.
  - 100ms마다 로컬 WebSocket revision 메시지 수신 중 레이즈 입력 값·포커스 유지.
  - 무효 레이즈 Enter 미전송, 유효 레이즈 한 번 전송.
  - 390×844, 844×390에서 히스토리 열기/닫기 후 테이블 좌표 유지.
  - visual viewport 축소 및 Android 방식 window.innerHeight 축소 시뮬레이션에서 테이블 좌표 유지, 입력 가시 영역 확인, 키보드 닫힘 후 좌표 복원.
- 테스트 픽스처는 실제 화면/RN Web를 번들링하지만 인증·운영 서버는 사용하지 않는다. 친구 훅은 로컬 스텁이며 로컬 WebSocket은 상태 갱신을 재현한다. 전체 로그인→실제 방 입장 E2E를 검증한 것은 아니다.
- 화면 캡처: .qa-web/input-browser/desktop.png, mobile-portrait.png, mobile-landscape.png. 최종 UI를 확인했으며 가로 키보드 영역에서는 모달 내부 스크롤을 사용한다.

재실행 (프로젝트 루트, Chrome 설치 필요):

```powershell
npm install --prefix .qa-web --no-save playwright@1.65.1 esbuild@0.28.2
node scripts/test-input-browser.cjs
npm run typecheck
npm run test --workspace=@boardgame/mobile
npm test
npm run export:web --workspace=@boardgame/mobile
```

테스트 도구는 gitignore된 .qa-web에만 설치했다. 앱 package.json/lockfile은 변경하지 않았다.

## 6. 실기기 검증 체크리스트 — 미완료

- Windows/macOS 실제 한글 IME 후보 선택, 조합 중 Backspace/Enter, 한영 전환, 붙여넣기, 중간 삽입/선택 영역 변경.
- iPhone Safari 세로/가로: 주소창 확장·축소와 함께 키보드 열기/닫기, Done, 키보드 종류 전환, 키보드가 열린 상태의 회전, 연속 focus 이동, pinch zoom 복귀.
- iPhone 홈 화면 PWA: 동일 시나리오와 safe area, 백그라운드 복귀, 하드웨어 키보드 연결.
- iPhone에서 레이즈 모달 내부 스크롤/액션 버튼 접근, 히스토리 열기→닫기→입력 전환.
- Android Chrome 실제 IME 및 네이티브 Android/iOS 입력 회귀.
- 운영과 같은 다중 클라이언트 게임에서 지연/재접속/턴 전환 중 입력 종료가 적절한지 확인.

시뮬레이션 결과를 실제 iPhone Safari/PWA 검증 완료로 표시하지 않는다. 회전 중 실제 키보드의 layout viewport 보고 방식, 주소창 상태 변화 및 OS focus 자동 스크롤은 잔여 위험이다.

## 7. 잔여 사항 / P2 권장 순서

P1 코드 수정과 자동 검증은 완료했지만 위 실기기 항목은 남아 있다. P0의 최근 10핸드·최대 150이벤트 저장 한계는 그대로이며 이번 작업에서 확장하지 않았다.

요청한 P2 순서대로 방 설정 버튼 크기·가시성, 카드 무늬 가독성, 홈/친구 화면의 상대 전적 접근성을 개선하는 것을 권장한다. 기존 FriendStatsScreen과 친구 목록 전적 버튼이 있으므로 마지막 항목은 저장/조회 범위를 먼저 확인해 재사용하는 편이 적절하다. 이번 작업에는 P2 UI 변경을 포함하지 않았다.
