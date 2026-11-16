# Web/PWA 확장 사전 분석

작성일: 2026-11-12 (Asia/Seoul). 범위: 요청한 1단계 분석과 기존 테스트 기준선 확인. 구현·패키지 설치·외부 배포는 하지 않았다.

## 1. 결론과 분석 대상

**Expo Web으로 기존 화면·통신·서버 규칙을 공유하는 방식이 현실적이다.** 별도 React 웹 앱이나 Expo Router 도입, 게임 엔진 재작성, DB 구조 변경은 웹 이식에 필요하지 않다. 다만 현재 상태는 웹 실행 준비가 끝난 앱이 아니다. 웹 의존성, 저장소, 확인창, 공유/초대, 브라우저 생명주기, 서버의 브라우저 접근 정책을 보완해야 한다.

- 대상: `C:/Users/jwseo/Documents/ChatGPT/앱/play-ui-refresh`
- Git origin: `https://github.com/jaewon31/boardgame.git`, branch `main`, HEAD `a666688` (`Refresh poker UI and separate all-in from raise`). 분석 시작 시 대상 저장소 `git status --short`는 비어 있었다.
- 상위 작업 폴더는 여러 작업 사본·스크립트가 들어 있는 별도 Git 루트다. 상위의 미추적 자료와 `friends-table` 초기 프로젝트를 수정하지 않았다.
- 아래 A/B/C/D는 **코드와 공식 문서에 따른 호환성 평가**이며, 실제 웹 기능 통과 판정이 아니다.
- `AGENTS.md`는 SDK 57 문서 확인을 요구하지만 설치된 프로젝트는 SDK 58이다. 지정 문서와 실제 SDK 58 문서를 모두 확인했다. SDK 다운그레이드는 권장하지 않는다.

## 2. 현재 구조

| 항목 | 확인 결과와 근거 |
|---|---|
| 실행 환경 | Node 24 계열 요구, 검사 환경 Node 24.19.0 / npm 12.2.1. npm workspaces `apps/*`, `packages/*` |
| 프런트엔드 | `apps/mobile/package.json`: Expo `~58.0.22` (설치 58.0.22), React 19.3.0, RN 0.88.1, TypeScript `~6.0.3`. RN 및 expo-asset 루트 overrides 존재 |
| 웹 준비 | `web: expo start --web` 스크립트와 favicon 설정만 존재. react-dom/react-native-web 직접 의존성 없음. 설치 SDK의 bundledNativeModules는 각각 19.3.0 / ~0.21.4, metro-runtime ~58.0.16을 지정 |
| 화면/내비게이션 | `App.tsx`의 상태 기반 분기: 계정/닉네임 → 홈 → 대기실 → 게임, 별도 친구 화면과 친구 전적. React Navigation/Expo Router 미사용. Android BackHandler와 Linking 사용 |
| 테이블 | `GameScreen.tsx` onLayout 측정 → `PokerTable.tsx` 상대 좌표 좌석 배치. 카드 `react-native-svg` 자체 렌더링, Animated 뒤집기/승리 효과, RiverSqueeze PanResponder. Canvas/WebGL 전용 엔진 없음 |
| 서버 | 설명의 Express와 달리 `node:http` + `ws`. `http.ts`, `lobby.ts`, `holdem/*`에서 HTTP·방·게임 관리 |
| 데이터 | Supabase Auth/프로필/친구/RPC/RLS. 게임 상태는 서버 메모리 + 선택적 SQLite checkpoint, 친구 전적도 별도 SQLite(`FriendStatsStore`). 전체 게임 상태를 Supabase에 저장하는 구조가 아님 |
| 통신 | `RoomClient.ts`: 브라우저에도 있는 WebSocket API 사용. JSON 메시지에 accessToken 첨부, HTTP 친구 전적은 Authorization Bearer. Supabase RPC는 SDK 사용 |
| 인증 | 익명 계정 생성/복구 `anonymousSession.ts`; `current_account_session` RPC 확인 후 프로필 로드. `authClient.ts` persistSession/autoRefreshToken/PKCE 사용, URL 세션 탐지 꺼짐. 현재 OAuth 진입 UI는 없음 |
| 저장소 | 인증 세션은 SecureStore 분할 저장 어댑터, 방 토큰과 소리 설정도 SecureStore 직접 호출. AsyncStorage 의존성/사용 없음 |
| 네이티브 관련 | expo-secure-store, expo-crypto, expo-audio, expo-dev-client, status-bar, safe-area-context, svg. 광고 SDK·Reanimated·gesture-handler는 현재 의존성에 없음 |
| 빌드/배포 | EAS development/preview/production, Android native 빌드 스크립트, iPhone 개발 스크립트. Docker/Compose/Caddy HTTPS 프록시. CI는 typecheck, 서버 테스트, Android/iOS export 및 서버 이미지 검사. 웹 export/브라우저 테스트/정적 웹 배포 설정 없음 |

`README.md`에 재접속 30초 등 오래된 설명이 있다. 현재 서버 설정 기본값과 클라이언트 재시도 창은 300,000ms이며 운영 `RECONNECT_MS`는 별도 확인해야 한다. 과거 문서의 테스트 결과나 배포 상태를 이번 검증 결과로 재사용하지 않았다.

## 3. 웹 호환성 분류

A: 해당 기능의 로직 변경 없이 재사용 예상. B: 소규모 적응 필요. C: 플랫폼 전용 구현 필요. D: 브라우저에서 보장 불가/제한. 웹 의존성 설치는 모든 항목의 공통 전제다.

| 기능 | 분류 | 근거 및 필요한 작업 |
|---|---|---|
| 홀덤 규칙·블라인드·팟·정산·턴 권한 | A | 서버 `holdem/hand.ts`, shared 계약 재사용. 웹에서 계산 결과를 권한 있는 상태로 만들지 않는다 |
| 계정/닉네임·친구 RPC | B | 네트워크 로직은 공유. 저장소·복귀 처리·계정 안내 문구 보완 후 검증 |
| AsyncStorage | 해당 없음 | 현재 사용하지 않음. 웹 지원을 이유로 신규 설치할 필요 없음 |
| SecureStore 인증/방/음량 저장 | C | 설치된 `ExpoSecureStore.web.ts`는 빈 구현. 웹 저장소 어댑터 필수. native 저장 형식·키 유지 |
| Alert.alert | C | 방 나가기, 친구 삭제/요청 취소, 새 경기, 올인 확인에 사용. 웹 확인 모달 구현으로 실행 콜백 보존 |
| Share 및 초대 링크 | C | 웹 공유 API 기능 탐지 + 복사/선택 가능한 텍스트 대체. 현재 invite parser는 friendstable/exp/exps만 허용하여 HTTPS 초대는 실패 |
| BackHandler/StatusBar/KeyboardAvoidingView | B | Android 동작 유지. 웹 뒤로가기 정책, 실제 입력창 가림 및 viewport 보완. native API가 브라우저에서 같은 효과를 낸다고 가정하지 않음 |
| 카드 SVG·이미지·폰트 | A/B | 로컬 PNG/WAV, 자체 SVG, 시스템/serif 폰트. 웹 폰트 다운로드 없음. SVG 글꼴·자산 경로·한글 폭 실기 검증 |
| Animated/PanResponder | B | 코드 공유 우선. native driver 경고/실제 카드 뒤집기, 마우스와 터치, 스크롤 충돌 검증. 불가 부분만 웹 분리 |
| 크기/회전/safe area | B | 기존 onLayout과 useWindowDimensions 재사용. 작은 가로 화면, 주소창 변화, 키보드, 홈 인디케이터 검증 |
| WebSocket | B | 표준 API·heartbeat·재시도 재사용. Origin 검증 및 브라우저 복귀 시 최신 snapshot 재동기화 보강 |
| Supabase 세션 | B/C | auth 로직 공유 + web storage. 동일 origin 여러 탭 동시 시작/refresh/연결 대체 검증 |
| 서버 주소 | B | 현재 환경변수 유지. 모바일 브라우저에서 localhost는 PC 서버가 아님. HTTPS 웹에서 ws는 사용하지 않음 |
| 효과음 | B/C | expo-audio 웹 구현 재사용 우선. 첫 사용자 동작 전 재생 차단·실패·백그라운드 복귀 처리. 음원 실패가 카드 표시나 게임을 막지 않는지 검증 |
| 광고 | 현재 없음 / 향후 C | 네이티브·웹 어댑터 분리 필요. 별도 보고서 참조 |
| 잠금 중 지속 연결/정밀 타이머/자동 재생 | D | 브라우저의 정지·종료를 막을 수 없음. 서버 타이머 유지, 복귀 시 상태 재조회로 대응 |
| 익명 계정의 데이터 삭제 후 복구/기기 간 이전 | D | 현재 계정 연결 기능 없음. 닉네임이나 친구 코드는 복구 자격증명이 아님 |

호환성 근거: [RN Web 호환 API](https://necolas.github.io/react-native-web/docs/react-native-compatibility/), [SDK 58 SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [SDK 58 Audio](https://docs.expo.dev/versions/v58.0.0/sdk/audio/).

## 4. 요구사항과 현재 기능 차이

- **개별 리바이 요청/방장 승인 API·UI·shared 메시지는 없다.** `resetChips`는 방장만 완료된 판에서 전체 참가자를 시작 칩으로 초기화하는 기능이다. 이를 리바이로 보고하거나 웹에서만 임의 구현하면 안 된다. 개별 리바이는 별도 서버 계약/게임 정책 작업이다.
- **전체 방 목록 API는 없다.** 현재 홈은 인증된 사용자의 현재 참여 방을 표시하고 코드로 입장한다. 비공개 방을 공개 검색 목록으로 바꾸지 않는다. 전체 목록이 필요하면 노출 범위를 별도 정의해야 한다.
- 플레이어는 서버 참가 순서 기반으로 배치된다. 수동 좌석 선택 기능은 확인되지 않았다.
- Check/Call/Fold/All-in과 베팅·레이즈 규칙은 존재한다. UI에서는 최초 베팅도 레이즈 금액 패널을 통하며 별도 Bet 버튼이 없는 점을 구분한다.
- 게임 기록/방 당일 결과·친구 전적은 존재하므로 그대로 이식한다. 과거 모든 경기의 별도 계정 히스토리 제품을 새로 만드는 범위로 해석하지 않는다.

## 5. 권장 구현 설계

### 저장소와 인증

`*.native.ts`/`*.web.ts` 또는 기존 기본 파일 + `.web.ts`로 작은 플랫폼 경계를 만든다. native SecureStore 분할·직렬 저장 형식은 유지하고, 웹은 origin별 localStorage를 Promise 인터페이스로 감싼다. 저장 실패/권한 거부/손상 데이터를 명시적으로 처리하며 메모리 저장으로 조용히 전환한 뒤 영구 세션인 것처럼 표시하지 않는다. 인증 불명확 시 익명 계정을 새로 만들지 않는 기존 `ensureAccountSession` 규칙을 유지한다.

웹 localStorage는 Keychain과 동등한 암호화 비밀 저장소가 아니며 같은 origin의 스크립트가 접근 가능하다. CSP·불필요한 외부 스크립트 제한·토큰 로그 금지, auth 데이터 서비스워커 캐시 금지를 함께 적용한다. 익명 계정 안내는 브라우저 데이터 삭제, 시크릿 창 종료, 다른 브라우저/기기 및 PWA 저장소 차이 가능성을 명시한다. Safari→홈 화면 설치 시 기존 계정이 이어지는지는 실기로 검증하고 자동 공유를 약속하지 않는다. [Supabase 익명 로그인 제약](https://supabase.com/docs/guides/auth/auth-anonymous)

인증된 `RoomClient.restore()`는 저장 토큰보다 `currentRoom`을 우선한다. 새로고침 복귀의 핵심은 **동일 Supabase 세션 + 서버의 참여 상태**이며, 로컬 방 코드를 근거로 임의 참여시키지 않는다. 동일 계정 두 탭은 독립 플레이어가 아니며 서버가 이전 연결을 대체한다. 기존 replaced 보호를 유지하고 여러 탭이 자동 복귀를 반복하며 연결을 빼앗지 않는지 검증한다. 익명 계정 최초 생성 동시 실행도 별도 교차 탭 검증 대상이다.

### 실시간·서버 접근

- 기존 메시지별 인증, account/session 일치, host 검사, handId/revision, 설정 revision, 6명 제한을 그대로 유지한다.
- AppState만으로 웹의 모든 복귀를 보장하지 않는다. web lifecycle 어댑터에서 visibilitychange/pageshow/online 등을 정리해 중복 listener 없이 연결 점검하고, 살아 있는 소켓이어도 최신 서버 상태를 확인하는 경로를 마련한다. 온라인 이벤트 자체를 서버 접속 성공으로 간주하지 않는다.
- 서버 `http.ts`/`friendStatsApi.ts`에는 CORS와 OPTIONS 처리가 없다. 별도 origin에서 Bearer로 친구 전적 요청 시 preflight가 필요하다. 개발/운영 명시적 origin allowlist와 필요한 GET/OPTIONS, Authorization 헤더를 지원한다. 오류 응답에도 일관되게 적용한다. 인증 검사는 유지한다.
- `lobby.ts`의 WebSocketServer에 Origin 검사 없음. CORS와 별개로 upgrade 단계에서 허용된 브라우저 Origin만 받는다. Origin 없는 기존 네이티브 연결은 기존 JWT 인증을 전제로 유지하고, `Origin: null`·위조 접미사·불일치 포트는 허용 목록으로 통과시키지 않는다. Origin은 인증 대체 수단이 아니다.
- 같은 origin 정적 웹 + `/lobby`, `/friends/*` 역방향 프록시는 운영 선택지다. 별도 origin 배포도 지원 가능하도록 설정을 문서화하되 플랫폼은 확정하지 않는다.

### 반응형 UI와 PWA

기존 테이블의 maxWidth 560은 있으나 데스크톱 전체 화면 중앙 배치와 헤더/하단 액션의 폭 제한은 부족하다. 웹 root 컨테이너를 중앙 정렬하고 기존 카드/좌석 디자인을 유지한다. 작은 가로 화면에서는 현재 최소 좌표·hero 높이와 카드가 겹칠 수 있어 가용 높이에 따른 배치 조정을 검증한다. 44px 이상 조작 영역 유지, 키보드/초점/Enter/Escape, 마우스 드래그도 확인한다.

웹 HTML에 viewport-fit=cover와 안전 영역, 동적 viewport 높이를 적용한다. 게임 표면에만 적절한 touch-action을 적용하고 페이지 전체 확대를 무조건 금지하지 않는다. 네이티브 portrait 설정은 웹 가로 대응을 위해 변경하지 않는다.

manifest(id/name/short_name/start_url/scope/display=standalone/theme/background/icons), 192/512 PNG와 maskable 검토, apple-touch-icon, 관련 HTML 메타와 연결 태그를 구성한다. 기존 PNG 재사용 가능 여부/아이콘 크롭은 시각 확인한다. 현재는 manifest/서비스워커/웹 HTML 커스터마이징이 없다.

첫 버전은 온라인 필수 모델로 **서비스워커 미도입을 우선 검토**한다. 설치 대상 브라우저에서 실제 설치·독립 실행을 검증한 뒤 필요할 때만 도입한다. HTML/manifest 재검증과 해시 자산 캐시를 분리하고 배포 시 구버전 탭의 서버 호환성도 검증한다. 서비스워커가 필요하면 인증/API/게임 snapshot은 캐시하지 않고, 버전별 정리와 진행 중 게임을 강제 새로고침하지 않는 갱신 UX를 설계한다. manifest 존재만으로 완료 처리하지 않는다. [Expo PWA 안내](https://docs.expo.dev/guides/progressive-web-apps/)

iPhone은 HTTPS URL을 Safari로 열고 공유 → 홈 화면에 추가 → 아이콘으로 실행하는 경로를 제공한다. 브라우저/PWA 배포에 App Store 서명이나 Apple Developer 계정을 사용하지 않는다. Android Chrome은 설치/홈 화면 추가 메뉴, PC는 브라우저가 제공하는 설치 UI를 검증한다. iOS 설치 안내를 Chromium 전용 설치 이벤트에 의존시키지 않는다. [WebKit 홈 화면 웹 앱 설명](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## 6. 단계별 예상 수정 범위와 완료 기준

| 단계 | 주된 예상 파일/범위 | 통과 기준 |
|---|---|---|
| 2 웹 실행 | mobile/package.json, lock, 필요시 Expo web 설정 | SDK 호환 `npx expo install react-dom react-native-web`; metro-runtime은 Expo 요구 확인 후만 추가. `expo export --platform web`, `expo start --web`, 첫 화면/콘솔 검사. native export 유지 |
| 3 인증 | authClient/storage 어댑터, useAccount, AccountScreen, audio 저장소 | 익명 최초 생성/닉네임/재실행, 저장 거부·손상·시크릿·다중 탭, 기존 계정 무단 교체 방지 |
| 4 친구/방 | 공통 확인·공유 어댑터, 관련 화면, invite, server CORS/Origin/config/tests | 친구 요청/수락/거절/삭제/전적, 방 생성/입장/설정/나가기/복귀, 기존 native 접속 |
| 5 게임/통신 | useRoom/lifecycle, 필요한 RoomClient 동기화, useGameAudio 및 테스트 | 2세션 액션·결과 동기화, 재접속/새로고침, 패 비공개 유지, 소리 실패에도 카드 진행 |
| 6 반응형 | GameScreen/PokerTable 및 웹 root 스타일, 필요시 RiverSqueeze 웹 파일 | 작은 세로/가로·데스크톱·안전 영역·터치/마우스·모달 검증 |
| 7 PWA | public manifest/icons, SDK 방식 HTML 연결, 선택적 SW | HTTPS 설치·독립 실행·계정 유지/차이 안내·갱신·오프라인 오류 UX 실기 검증 |
| 8 검증/문서 | CI web export, env examples, 배포 문서·회귀 테스트 | 기존 검사 + 브라우저 E2E + native 혼합 플레이, 미검증 구분 |

예상 변경은 위 경계별로 약 15~25개 기존 파일과 소수의 플랫폼 어댑터/웹 정적 파일·테스트다. 상세 파일 수는 브라우저 검증 후 결정하며, 단일 대규모 변경으로 묶지 않는다. 리바이와 전체 방 목록 신규 구현은 이 추정에서 제외한다.

## 7. 실제 수행한 검증

| 명령/검사 | 실제 결과 |
|---|---|
| `npm run typecheck` | 성공, workspaces 전체 exit 0 |
| `npm test` | 샌드박스 첫 실행은 localhost EACCES와 통신 timeout으로 실패·진행 정체하여 중단. 로컬 통신 허용 환경에서 동일 명령 재실행: **167/167 통과**, fail/skip/cancel 0 |
| `node --test apps/mobile/test/*.test.cjs` | **28/28 통과**, fail/skip/cancel 0. 루트 npm test가 포함하지 않는 모바일 테스트도 별도 실행 |
| 웹 export | mobile 디렉터리에서 CI=1, EXPO_OFFLINE=1로 로컬 Expo CLI `export --platform web --output-dir dist-web-analysis` 실행. **exit 1**, react-dom 19.3.0 / react-native-web ~0.21.4 미설치 오류. 설치/자동 수정하지 않음 |
| 브라우저 초기 화면/런타임 | 미검증. 웹 의존성 단계에서 중단되어 브라우저 정상 동작 주장을 할 수 없음 |
| Android/iOS export·네이티브 빌드 | 이번 분석에서는 미실행. 앱 코드·빌드 설정 변경 없음 |
| Supabase 실서비스·브라우저 다중 사용자·웹/Android 혼합·iPhone Safari/PWA | 미검증. 단위/로컬 통합 테스트 통과가 이를 대체하지 않음 |

로컬 로그(ignored): `web-analysis-typecheck.log`, `web-analysis-tests.log`(제한 환경), `web-analysis-repair-tests.log`(EACCES 진단), `web-analysis-tests-unrestricted.log`, `web-analysis-mobile-tests.log`, `web-analysis-export.log`. 테스트 실패 원인을 앱 회귀로 단정하지 않고 같은 테스트의 재실행 결과를 기록했다.

## 8. 이후 수동/브라우저 검증 절차

1. 별도 개발용 Supabase 프로젝트/인증 사용자와 게임 서버 사용. A/B는 서로 다른 브라우저 프로필 또는 독립 세션으로 준비한다. 같은 origin의 일반 탭 두 개는 같은 계정 테스트다.
2. A/B 최초 익명 접속 → 닉네임 → 친구 요청/수락, 거절·취소·전적까지 확인.
3. A 방 생성 → B 코드/HTTPS 링크 입장 → 6명 정원과 7번째 거절, 중복 생성/참여, 비방장 설정·시작 거절 확인.
4. 게임 시작 → Check/Call/Bet/Raise/Fold/All-in, 블라인드/타이머/팟·사이드팟/결과/자동 다음 판/기록 비교. 화면에 상대 비공개 패가 없는지도 확인.
5. B 새로고침, 짧은 오프라인→온라인, 탭 전환, 휴대폰 잠금→복귀, 재접속 유효 시간 경과를 나눠 시험. 같은 계정 탭 대체도 확인. 서버 상태와 복구 후 snapshot 일치 확인.
6. 현재 기능인 방장 전체 칩 초기화를 검증한다. 개별 리바이는 미구현으로 표시하고 통과 항목에 넣지 않는다.
7. Android 앱과 웹 사용자를 같은 서버/방에 연결해 반복. 실제 iPhone Safari 세로/가로·키보드·주소창 변화·음원 첫 재생·드래그를 시험하고 홈 화면 설치 후 종료/재실행한다.
8. 시크릿/저장 차단/데이터 삭제, Safari와 설치 PWA의 계정 관계를 확인한다. 앱 업데이트 후 재실행과 오래 열린 탭의 게임 통신, 서버 연결 실패 표시도 검증한다.

## 9. 로컬 실행 및 배포 준비

현재 `cd apps/mobile; npx expo start --web`은 의존성 보완 전 정상 실행 가능하다고 안내할 수 없다. 분석 검토 후 2단계에서 저장소 루트의 기존 의존성을 유지하고 mobile에서 호환 패키지를 설치한 다음 해당 목표 명령을 검증한다. 서버는 별도 터미널 `npm run server`를 사용한다.

환경변수는 기존 `EXPO_PUBLIC_GAME_SERVER_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 유지한다. public 값은 웹 번들에 노출된다. service_role/secret/JWT/개인 키를 넣지 않는다. 운영은 APP_ENV=production과 공개 `wss://.../lobby`를 설정하고, HTTP 전적 주소는 현재처럼 HTTPS로 유도한다. 새 웹 origin allowlist는 서버 전용 설정으로 추가한다.

배포 전 필요한 항목: 정적 호스팅·도메인 선택, TLS와 WSS 프록시, `/join/CODE` SPA fallback(사용 시), 정확한 origin 목록, Supabase 익명 로그인 활성화·기존 migration/RLS 적용 확인, 정적 파일 MIME/캐시/CSP, 영구 SQLite 볼륨/백업 및 단일 상태 소유 서버 유지. API/WS 경로는 SPA fallback에서 제외한다. 현재 Caddy는 전체 요청을 게임 서버로 보내므로 정적 웹 제공 구성을 별도로 마련해야 한다. 서버 수평 확장은 이번 이식에 포함하지 않는다.

Supabase URL 리다이렉트 허용 목록은 향후 계정 연결/OAuth를 넣을 때 필요하며 현재 익명 로그인에 가상의 콜백 흐름을 추가하지 않는다. 운영 환경의 실제 설정과 공개 endpoint는 이번 분석에서 접속·변경하지 않았다. 기존 배포 문서의 플랫폼은 참고만 하며 새로운 배포 플랫폼을 확정하지 않았다.

## 10. 우선순위 및 검토 지점

- P0: 웹 의존성, 인증/설정 저장소, 웹 확인창, CORS/Origin. 이를 완료하기 전 기능 동등성 주장 금지.
- P1: 최신 상태 복귀, HTTPS 초대, 오디오 실패 분리, 작은 화면/PC 대응, 실제 Safari/PWA·native 혼합 테스트.
- P2: 설치 UX/업데이트 운영 정리, 광고 적합성 검토.
- 범위 차이: 개별 리바이 승인·전체 방 목록·수동 좌석 선택은 현재 앱 기능과 다르다. 기존 웹 이식과 분리해 제품 요구를 확정해야 한다.

이번 결과는 분석 문서와 광고 문서뿐이다. 앱 코드·package/lock·서버·DB·Android/iOS 설정을 변경하지 않았으며, 요청대로 분석 검토 전 대규모 구현은 진행하지 않는다.

## 참고 문서

- [AGENTS 지정 SDK 57](https://docs.expo.dev/versions/v57.0.0/), [실제 SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Expo Web](https://docs.expo.dev/workflow/web/)
- [광고 별도 분석](web-ad-monetization.md)
