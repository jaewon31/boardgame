# P2 UI·친구 간 전적 구현 보고서

> 후속 보안 검증: [P2 RPC 보안 보고서](p2-rpc-security-review.md). 아래는 초기 구현 이력이다. 최신 007은 001~006·직접 호출 최신 세션 검사·명시 owner/ACL을 요구하며 운영 판정은 카탈로그/차단 모델 확인 전 보류한다.

2026-11-17 KST · `codex/tempo-hand-history` · HEAD `89229f5` · dirty 작업 트리.
기존 P0/P1 및 문서 미커밋/미추적 변경을 보존했다. 커밋·병합·push·스테이징/운영 배포·원격 DB 변경 없음.

## 코드 조사 및 설계

- 설정 변경 버튼은 실제 코드상 홈의 방 생성 영역과 대기실에 있다. 게임 중 GameScreen에는 설정 편집 버튼이 없다. 기존 구조를 유지하며 게임 중 설정 제한을 서버에서 계속 검증한다.
- 기존 버튼 높이는 이미 44였다. 새 높이는 48, 최소 폭 44이고 톱니바퀴, 배경, 테두리, 큰 텍스트로 발견성을 개선했다. 대기실에서는 방장만 표시하고 연결 해제 시 비활성화한다. 히스토리는 게임 화면의 오른쪽 패널이므로 새 설정 버튼과 같은 화면에서 충돌하지 않는다.
- 모든 카드 앞면은 CardArtwork를 재사용한다. 80 미만 폭에서는 작은 그림/여러 pip 대신 중앙 52 SVG 단위 무늬를 표시한다. 모서리 무늬 16→25, 랭크 26→36(10은 22→30), 검정/빨강 대비를 강화했다. 24px 좌석 카드에서도 중앙 무늬의 설계 크기는 12.48px이다. 카드 외곽 크기·뒷면·접근성 이름·정보 필터·모션/오디오 코드는 변경하지 않았다.
- FriendStatsStore의 SQLite `recorded_hands`, `account_results`를 그대로 재사용한다. 계정 UUID와 hand_id 조인으로 두 사람의 공동 참여 핸드를 집계하므로 신규 통계 테이블/소급 집계는 필요 없다.
- Supabase `friendships`는 requester/recipient UUID와 pending/accepted 상태를 가진다. 양방향 쌍의 unique index, 참가자만 SELECT 가능한 RLS, 본인 관계만 반환하는 list_friends가 있다. 기존 공개 키 + 사용자 토큰으로 제3자 관계 B↔C를 읽을 수 없으므로 기존 RPC만으로 안전하게 확장할 수 없다.
- project-status의 P0 웹 빌드 설명과 달리 현재 P0 보고서에는 Expo Web export 성공이 기재되어 있다. 과거 검증 이력의 배포 여부를 추정하지 않고 이번 별도 빌드 결과를 기록했다.

## 구현과 신뢰 경계

친구 탭 → 상대 전적 비교 → 본인/친구 첫 대상 → 다른 대상 → 기존 통계 화면. 기존 목록의 전적 버튼도 유지한다. 선택·요청은 UUID 기준이며 중복 닉네임에는 목록 순번을 함께 표시한다. 순번은 영구 식별자가 아니다. 오류·로딩·0판 빈 상태를 구분하고 재조회 시작 시 이전 결과를 제거한다.

- 기존 `GET /friends/{friend}/stats`: 유효 세션 + list_friends의 accepted 관계, 본인 대 친구 조회 유지.
- 신규 `GET /friends/{first}/{second}/stats`: 유효 세션·계정별 rate limit을 먼저 확인하고, 동일 사용자 Bearer 토큰으로 `can_compare_friend_stats(first_id,second_id)` RPC 호출. 정확한 boolean true일 때만 SQLite compare 실행.
- SQL은 호출자의 `auth.uid()`를 사용한다. caller ID 입력은 받지 않는다. A↔B, A↔C, B↔C의 모든 서로 다른 쌍이 accepted여야 한다. 본인이 포함된 비교는 중복 자기 관계를 제외한다. 동일 대상·null·프로필 없는 대상은 허용하지 않는다.
- SECURITY DEFINER + 빈 search_path + 완전한 스키마 이름 + authenticated만 EXECUTE. 테이블 RLS를 넓히지 않고 boolean만 반환한다. anon DB role은 실행 불가이며 익명 가입 사용자의 authenticated 세션은 기존 정책대로 허용한다.
- 매 요청 권한을 다시 확인하며 권한 캐시가 없다. 관계 해제 후 다음 조회는 403, RPC 부재/장애는 503이다. 이미 사용자에게 전달된 과거 화면까지 소급 삭제하는 실시간 구독 기능은 없다.
- 응답은 기존 숫자 통계만 사용한다. 카드·이메일·friend code·다른 사용자의 원본 DB 레코드는 반환하지 않는다. 닉네임은 이미 허용된 친구 목록에서 가져온다. 탈퇴 시 friendships의 FK cascade 및 대상 profile 존재 확인으로 차단한다.

## 지표의 의미

공동 참여 **핸드 수**, 각자의 **팟 획득 핸드 수**, **획득률 = 팟 획득 핸드 수 / 공동 참여 핸드 수**, 각자의 **공동 참여 핸드 전체 순 칩 증감**을 표시한다. 다인 테이블·분할/사이드 팟을 포함하므로 일대일 승률이나 두 사람 사이 칩 이동액이 아니다. 두 획득률의 합은 100%가 아닐 수 있다. SQLite에는 완료 시각/게임 세션 집계 정보가 없으므로 마지막 대결 시각과 게임 수는 표시하지 않았다.

## 브라우저 캡처 및 검증

Chrome 157.0.8103.79 / Playwright 1.65.1. 실제 RN Web 화면을 로컬 fixture로 번들링했다. 전후 이미지는 동일 fixture이며 CardArtwork/LobbyScreen의 이전 소스는 작업 시작과 동일한 HEAD 89229f5에서 읽는다. 인증/친구 목록/통계 HTTP 응답은 테스트용 stub이고 운영 로그인 E2E는 아니다.

| 화면 | 2~6인 비공개·쇼다운 카드 | 설정 권한/모달/44 이상 영역 | 비교·403·0판·기존 조회 |
| --- | --- | --- | --- |
| 1366×768, 1920×1080 | 통과 | 통과 | 통과 |
| 375×812, 390×844, 430×932 | 통과 | 통과 | 통과 |
| 844×390 가로 | 통과 | 통과, 대기실 스크롤 사용 | 통과, 하단 스크롤 사용 |

카드가 viewport 밖으로 잘리지 않음과 카드끼리의 경계 겹침 없음을 자동 검사했다. 2~6인에서 히스토리 열기/닫기를 확인했다. 가로 화면의 대기실/전적은 기존 스크롤형 화면이며 하단 컨트롤 접근을 확인했다. 실제 터치 정확도/OS 글꼴/Safari 렌더링은 미검증이다.

| 비교 | 이전 | 이후 |
| --- | --- | --- |
| 설정 | [이전](assets/p2/before-375-settings.png) | [이후](assets/p2/after-375-settings.png) |
| 카드 | [이전](assets/p2/before-390-cards.png) | [이후](assets/p2/after-390-cards.png) |

추가 캡처: [375](assets/p2/after-375-cards.png), [430](assets/p2/after-430-cards.png), [가로](assets/p2/after-844-cards.png), [1366](assets/p2/after-1366-cards.png), [1920](assets/p2/after-1920-cards.png), [히스토리](assets/p2/after-390-history.png), [대상 선택](assets/p2/after-390-selection.png), [통계](assets/p2/after-390-stats.png), [가로 통계 하단](assets/p2/after-844-stats-bottom.png), [결과 JSON](assets/p2/results.json).

## 자동 검증·실패 이력

- 전체 TypeScript 통과.
- 서버 176/176: 기존 P0 타이밍/권한/개인 카드/설정 경합 테스트 포함. 신규 HTTP+PGlite 통합은 세 관계 허용, A/B만·A/C만·B/C 부재, 각 관계 pending/해제, ID 변조, 동일 대상, 역순, 기존 본인 조회, 삭제 계정, anon/빈 auth.uid, RPC 장애/잘못된 응답, CORS를 검사했다. SQL 초안을 실제 로컬 PostgreSQL 호환 엔진에 두 번 적용해 재실행 호환성을 확인했다.
- 모바일 50/50 통과. 새 화면은 별도 실제 컴포넌트 브라우저 테스트로 검증했다.
- Expo Web export 및 Android/iOS JS·에셋 export 통과. APK/IPA·실기기 실행을 뜻하지 않는다.
- 기존 P1 Playwright IME/Enter/Backspace/포커스/100ms revision/키보드 가로·세로 시뮬레이션 통과.
- P2 Playwright 위 6 viewport 통과. git diff --check 통과.
- 최초 제한 환경의 서버 테스트는 loopback/권한 제약으로 실패했다. 로컬 HTTP/WS 허용 실행에서 176/176 통과했다.
- 최종 재검사 중 기존 multiplayer 세션 교체 테스트가 1회 timeout(175/176)했다. 해당 파일만 재검사 7/7, 이어 전체 서버 176/176 통과. 관련 게임 코드는 변경하지 않았으며 간헐적 타이밍 실패 가능성은 남긴다.
- 모바일 첫 실행은 보낸 요청 탭에도 새 비교 버튼이 보여 기존 테스트에 실패했다. 비교 버튼을 친구 탭에 한정한 뒤 50/50 통과했다. 기존 검증을 삭제하지 않았다.
- 브라우저 첫 실행은 fixture 루트 높이가 제한되지 않아 가로 전적의 오류 대기에서 timeout이 발생했다. SafeAreaProvider 높이를 실제 앱 셸처럼 100%로 고정한 후 모든 viewport 통과했다.

실기기 iPhone Safari·홈 화면 PWA, Android Chrome, Android/iOS native는 **미검증**. Safari safe area/회전/스크롤/키보드, 실제 한글 IME와 6인 패 식별, 오디오 동기화는 추가 확인해야 한다. 스테이징·운영 배포는 **미실행**.

## DB 초안과 승인 대기

[007 SQL 초안](../supabase/drafts/007_friend_stats_permission.sql)은 자동 migration 경로 밖에 있다. 기존 데이터 변경/삭제, 신규 테이블, RLS 변경, service-role key 추가가 없다. 001/002 이후 실행 가능한 함수 추가이며 기존 API는 RPC 미적용 상태에서도 유지된다. 신규 친구끼리 조회는 RPC가 없으면 실패하도록 닫혀 있다.

운영 사용에는 SQL 검토·승인 후 Supabase 함수 적용과 별도 승인된 서버/웹 배포가 필요하다. 이번 작업 범위는 로컬 개발·검증이며 이 단계에서 중단했다. 적용 승인 요청 대상은 이 SQL 초안이며 배포 승인은 별개다.

## 이번 P2 변경 파일

- 앱: `components/CardArtwork.tsx`, `screens/HomeScreen.tsx`, `screens/LobbyScreen.tsx`, `screens/FriendsScreen.tsx`, `screens/FriendStatsScreen.tsx`, 신규 `screens/FriendComparisonScreen.tsx` (모두 apps/mobile/src 아래).
- 서버: `apps/server/src/friendStatsApi.ts`, `apps/server/src/http.ts`. SQLite 저장소·게임 lobby/규칙은 P2에서 수정하지 않음.
- 테스트: `apps/mobile/test/FriendsScreen.test.cjs`의 신규 import stub, 신규 `apps/mobile/test/browser/p2-fixture.jsx`, `scripts/test-p2-browser.cjs`, `apps/server/test/friend-comparison.test.ts`.
- SQL: `supabase/drafts/007_friend_stats_permission.sql`.
- 문서: `docs/project-status.md`, `docs/friend-stats.md`, `docs/testing.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/README.md`, 이 보고서 및 `docs/assets/p2`.

현재 전체 git status에는 위 변경 외에 작업 시작 전 P0/P1·문서 변경도 포함된다. 이를 P2 변경으로 오인하지 않는다. 시작 diff는 ignored `.qa-web/p2-baseline/preexisting.diff`에 보존했다.
