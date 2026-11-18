# P2 친구 전적 비교 재검증 — 2026-11-18

브랜치 `codex/tempo-hand-history`, HEAD `89229f5`, 기존 미커밋 작업 트리 보존.

## 결론과 검증 범위

**로컬 코드·SQL·자동 테스트 PASS. 실제 로그인 JWT를 이용한 운영 E2E는 미검증.**

사용자가 운영 `public.can_compare_friend_stats(uuid,uuid)` 설치와 EXECUTE 권한(anon false / authenticated true / service_role false)을 SQL Editor에서 확인했다고 보고했다. 이를 운영 설치·권한의 사용자 확인 근거로 반영한다. 이번 에이전트 실행에서 운영 함수 정의·의존 함수·소유자·PostgREST 동작을 독립 조회한 것은 아니다.

별도 테스트 계정·안전하게 사용할 로그인 JWT·격리된 Supabase 환경이 확인되지 않았다. 기존 사용자 자격 증명이나 브라우저 저장소를 추출하지 않았고, 새 운영 계정/친구 관계 생성·세션 폐기·RPC 실행을 하지 않았다. `supabase/.temp`의 CLI 연결 메타데이터 존재는 테스트 사용자 세션이나 환경 격리의 증거가 아니며 값을 출력하거나 수정하지 않았다.

특히 서버가 호출하는 `current_account_session`은 `account_sessions`에 INSERT/UPDATE할 수 있다. GET 전적 조회라도 그 인증 과정까지 운영 읽기 전용이라고 볼 수 없으므로 운영 사용자 JWT로 시험하지 않았다. `read_account_session`과 새 permission RPC는 읽기 전용이지만 전체 서버 경로의 쓰기 가능성을 없애지는 않는다.

## 실제 코드 경로

1. `FriendStatsScreen.tsx`: authClient.auth.getSession의 access_token을 Authorization Bearer로 게임 서버에 보낸다. UUID는 비교 대상이고 요청자 인증을 대신하지 않는다.
2. 본인-친구는 `GET /friends/{friend}/stats`, 두 친구는 `GET /friends/{first}/{second}/stats`. `index.ts`가 실제 accountAuthorizer를 friendStatsApi에 주입한다.
3. `accountSession.ts`: 동일 JWT와 publishable key로 Supabase `current_account_session`을 호출한다. RPC 승인 후 JWT의 session_id를 해석한다. 로컬 JWT decode만으로 인증하지 않는다. 실제 서명/만료 검증은 Supabase gateway에 의존하며 이번 로컬 테스트에서는 이를 모사한다.
4. 기존 본인 API는 같은 JWT의 `list_friends` 결과에서 accepted 대상만 허용한다. 005의 list_friends도 current_account_session을 검사한다.
5. 두 대상 API는 같은 JWT의 `can_compare_friend_stats`가 정확한 JSON boolean true일 때만 SQLite compare를 호출한다. false/기타 값은 403, RPC 오류/파싱 실패는 503, 무효 인증은 401이다.
6. 저장소의 007은 JWT role=authenticated, auth.uid, 006의 read_account_session과 세 accepted 관계를 확인한다. read_account_session은 account_sessions.user_id/session_id, JWT session_id, auth.sessions의 최신 세션을 대조한다. 본인이 포함되면 자기 간선만 제외한다.

## 시나리오별 결과

| 항목 | 로컬 결과 | 실제 운영 JWT |
| --- | --- | --- |
| A와 수락된 친구 B | PASS: 기존 API 200, 두 대상 RPC true | 미검증 |
| A와 친구가 아닌 C | PASS: 기존 API 및 두 대상 API 403 | 미검증 |
| A-B, A-C, B-C 모두 친구 | PASS: 200 및 저장된 숫자 통계 일치 | 미검증 |
| A-B, A-C만 친구, B-C 없음 | PASS: 403 | 미검증 |
| 무효화된 세션 | PASS: 구 세션/삭제된 최신 세션에서 SQL false, authorizer 거부 시 HTTP 401·전적 미조회 | 미검증 |
| false·오류 응답에서 차단 | PASS: 권한 없는 요청의 SQLite compare 호출 0회 | 미검증 |
| 운영 RPC 설치·EXECUTE ACL | 사용자 확인: 설치됨, anon false/authenticated true/service_role false | 에이전트 독립 확인 미검증 |

로컬 SQL은 001~006 및 저장소 007을 PGlite에 실제 적용한다. HTTP/SQLite도 로컬 실행하지만 Supabase JWT 검증 응답/claims GUC는 fixture다. 테스트용 문자열을 실제 로그인 JWT라고 표시하지 않는다. SQL Editor 소유자 권한으로 실행한 결과도 사용자 JWT 검증의 대체물이 아니다.

## 테스트 실행 결과

| 명령 | 결과 |
| --- | --- |
| npm run typecheck | PASS: 전체 workspace |
| npm test | PASS: 서버 178/178, 실패 0 |
| npm run test --workspace=@boardgame/mobile | PASS: 50/50, 실패 0 |
| npm run export:web --workspace=@boardgame/mobile | PASS: Expo Web dist 생성 |
| node scripts/test-input-browser.cjs | PASS: 기존 P1 로컬 Chrome 입력/IME/포커스/키보드 fixture |
| node scripts/test-p2-browser.cjs | PASS: 6 viewport, 2~6인, 설정·카드·전적 선택/오류/빈 상태 fixture |
| git diff --check | PASS |

이번 실행에서 테스트 실패 없음. 지난 검증의 간헐적 timeout 등은 이전 보고서의 이력이며 이번 결과와 구분한다. 로그는 ignored `.qa-web/p2-20261118-{server,typecheck,mobile,web,input-browser,browser}.log`에 저장했다. 웹 빌드는 배포하지 않았다. 실기기 검증은 미실행.

## 발견 사항과 수정 파일

- 새 제품 코드 결함은 발견하지 않았다. 운영 JWT/설치된 함수 정의가 로컬과 동일한지는 미검증이다.
- 테스트의 비친구 거부 근거를 명확히 하기 위해 `apps/server/test/friend-comparison.test.ts`에 A-B 허용, A-C 비친구 거부(기존/두 대상 API)의 명시적 HTTP 검증 3개를 추가했다. 테스트 케이스 수는 178개로 동일하며 내부 assertion을 확장한 것이다.
- `current_account_session`의 세션 등록 쓰기는 기존 설계다. 운영 데이터 불변 검증에서는 이 경로를 호출하면 안 된다. 이를 제거하려면 로그인 시점의 세션 등록 흐름까지 별도로 설계/회귀 검증해야 하므로 이번에 변경하지 않았다.
- 운영 설치 완료 보고를 반영하도록 project-status/friend-stats/testing 및 문서 README와 이전 보안 보고서의 후속 안내를 갱신했다. 제품 SQL·서버·앱 코드는 이번에 수정하지 않았다.

## 실제 배포 전 남은 작업

1. 운영 007의 정의/owner/search_path와 005/006 의존 함수가 검증한 로컬 코드와 일치하는지 기존 읽기 전용 preflight로 확인한다. 이번 사용자 제공 결과는 EXECUTE ACL까지만 증명한다.
2. 별도 Supabase 환경과 테스트 계정을 준비한 뒤 실제 발급 JWT로 위 다섯 시나리오를 앱→게임 서버→Supabase→SQLite 경로에서 실행한다. 친구 관계 구성/해제와 세션 폐기는 격리 환경에서만 수행한다.
3. 실제 배포할 서버/웹 코드 버전과 환경 설정을 확인한다. 운영 RPC 설치가 새 서버/웹 코드의 배포를 뜻하지 않는다.
4. 기존 별도 사용자 차단 모델 미확인, 실제 Safari/PWA·네이티브 검증 잔여 사항은 이전 보안/P2 보고서대로 유지한다.

운영 사용자 데이터/인증 데이터 변경, Railway/Pages 배포, main 병합, push, 커밋 없음. 비밀번호·실제 JWT·서비스 키 출력 없음.
