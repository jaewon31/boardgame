# current_account_session 복구 조사 — 2026-11-01

## 확인된 사실과 남은 확인

실제 저장소: `C:/Users/jwseo/Desktop/boardgame`.
모바일 `.env.local`의 프로젝트: `znnmzowesjrrshimukwv.supabase.co`.
로컬 게임 서버는 환경 변수 override가 없으면 동일 모바일 설정을 읽는다.
운영 서버의 환경 변수는 이 조사에서 확인하지 않았다.

- 모바일 `useAccount.ts`: `client.rpc('current_account_session')`, 인자 없음, 기본 public 스키마.
- 서버 `accountSession.ts`: POST `/rest/v1/rpc/current_account_session`, JSON `{}`.
- `003_single_session.sql`: `public.current_account_session() returns uuid`, SECURITY DEFINER, 빈 search_path, authenticated 실행 허용, anon 실행 금지.
- 함수는 JWT의 사용자/세션과 auth.sessions를 비교하고 최신 세션을 account_sessions에 기록한다. 클라이언트가 사용자 ID를 인자로 넘기는 API가 아니다.
- 현재 원격 응답: 해당 RPC 404/PGRST202, account_sessions 404/PGRST205. profiles와 friendships는 401/42501(테이블 권한 거부).
- 따라서 호출부와 저장소 SQL 사이의 인자/스키마 불일치는 없다. 003 미배포가 가장 유력하나, REST 응답만으로 실제 함수 누락과 오래된 스키마 캐시를 확정 구분할 수 없다.
- 401 응답은 nickname_setup_complete 존재 여부나 001/002 전체 적용을 입증하지 않는다. 익명 역할에 SELECT 권한을 주는 식으로 우회하지 않는다.
- DB 관리 연결 및 CLI 프로젝트 연결 정보가 없어 원격 pg_proc/마이그레이션 이력은 미조회. 사용자가 SQL Editor 진단 결과를 공유하는 경로로 진행 중이다.

## 진단 결과 해석

`diagnose-account-session.sql` 실행 결과를 확인한다.

1. functions에 해당 함수가 없고 account_sessions가 null: 003 누락 또는 부분 배포. 001/002 선행 객체 확인 후 아래 복구 적용.
2. 함수가 다른 스키마에만 있거나 arguments가 비어 있지 않음: 배포된 함수 계약이 앱과 다르다. 다른 함수를 삭제하거나 클라이언트 인자를 임의 변경하지 말고 public의 무인자 UUID 반환 계약을 복원한다.
3. public 무인자 함수와 테이블이 있고 실행 권한도 정상: 먼저 `NOTIFY pgrst, 'reload schema';` 실행 후 REST 재확인. 계속 실패하면 Data API의 public 노출과 앱 프로젝트 일치를 확인한다.
4. authenticated_execute=false: 권한 배포 문제. anon_execute는 false여야 한다.
5. nickname_column=false 또는 list_friends volatility가 s: 004의 변경이 누락돼 있다. list_friends는 내부 세션 함수가 쓰기 작업을 수행하므로 v(VOLATILE)여야 한다.
6. migration_history_table이 있다면 별도 `select version from supabase_migrations.schema_migrations order by version;` 조회. SQL Editor 수동 실행은 이력에 남지 않을 수 있으므로 실제 객체와 함께 판단한다.

## 적용 방법 — 기존 데이터 유지

원격 SQL 실행은 아직 하지 않았다. 진단 결과가 캐시 문제만 가리키면 캐시 갱신만 수행한다.

001/002 기반 테이블이 존재하고 003/004 누락이 확인되면 SQL Editor에서
`supabase/migrations/005_repair_account_session.sql` 전체를 한 번 실행한다.
이 파일은 003/004의 보안 계약을 하나의 트랜잭션으로 재설치하는 복구 마이그레이션이다.
선행 테이블이 없으면 예외로 중단한다. 반환 타입 등 호환되지 않는 기존 함수가 있으면
CREATE OR REPLACE가 실패하여 트랜잭션이 롤백되므로 오류를 숨기거나 DROP CASCADE하지 않는다.

- account_sessions 생성, 무인자 세션 함수와 친구 RPC/제한 정책 재설치.
- nickname_setup_complete 추가, 기존 닉네임/metadata의 완료 상태 반영.
- list_friends VOLATILE 및 스키마 캐시 갱신.
- 기존 사용자/UUID/친구/세션/경기 데이터 삭제 없음. 기존 세션 테이블 행 유지.
- 004 적용 프로젝트 및 003/004 누락 프로젝트에서 재실행과 데이터 보존을 테스트했다.
- 새 DB는 기존 순서 001 → 002 → 003 → 004 → 005를 따른다. 기존 DB에 001을 무조건 재실행하거나 reset하지 않는다.
- CLI 이력을 관리하는 프로젝트는 관리자가 실제 이력과 수동 적용을 조정한다. 누락 파일을 확인 없이 적용 완료로 표시하지 않는다.

적용 후 진단을 다시 실행한다. unauthenticated RPC는 함수 탐색 404 대신 권한 거부가
정상이며, 실제 앱의 authenticated 세션에서는 RPC 결과가 user.id와 같아야 한다.
앱의 다시 시도 버튼으로 동일 계정 프로필/닉네임을 조회하고, 두 계정의 친구 요청→수락→방 생성/참가를 확인한다.
앱 데이터 삭제, 로그아웃, 새 익명 계정으로 대체, APK 재빌드는 필요하지 않다.

## 인증 코드 상태

현재 앱은 SecureStore의 기존 Supabase 세션을 먼저 복원하고, 세션도 기존 계정 표식도 없는 경우에만 signInAnonymously를 호출한다.
동시 초기화는 합쳐서 중복 생성을 막는다. 계정 표식이 있는데 세션이 없으면 복구 오류를 표시하고 새 UUID를 만들지 않는다.
익명 Auth 사용자도 authenticated 역할이므로 기존 RLS/친구/방 인증을 그대로 사용한다.
기존 이메일 또는 소셜 세션이 남아 있으면 같은 UUID로 재사용한다.

활성 앱 소스에 signInWithOtp/verifyOtp 호출과 이메일 OTP 화면, OAuth callback은 이미 제거돼 있다.
상위 작업 폴더의 오래된 useAccount.ts/authCallback.ts는 현재 앱 진입점이 아니다.
authClient의 PKCE 설정이나 EXPO_PUBLIC_AUTH_APPLE/GOOGLE 값만으로 로그인 기능이 활성화되지는 않는다.
이 작업은 인증 방식, 공급자 설정, 세션 저장 키를 변경하지 않았다. 이메일 OTP 신규/재로그인 동작은 현재 앱에서 검증할 수 없다.

## 변경과 검증 범위

앱은 PGRST202/PGRST205를 데이터베이스 배포 오류로 분류하고, 개발 모드에서 허용 목록에 있는 오류 코드만 기록한다.
원본 오류 메시지/토큰은 기록하지 않는다. 프로필 검증 실패 시 기존 계정을 보존한다.

PGlite 테스트는 Auth 스키마/JWT를 모사한다. 실제 SQL로 새 프로필 생성→본인 조회→닉네임 저장→친구 요청/수락→동일 SQL 검증 ID로 로컬 WebSocket 방 생성까지 확인한다.
최신 세션 제한, 타인 접근 차단, 익명 DB 역할 거부와 기존 데이터 보존/재적용도 검증한다.
이는 호스팅 Supabase Auth·PostgREST와 Android 기기의 실서비스 종단 검증을 대체하지 않는다.
운영 종단 검증은 진단 결과 확인 및 원격 적용 후 남아 있다.

초기 샌드박스 테스트에서는 localhost 통신 제한으로 소켓 테스트가 실패했다. 네트워크 허용 환경에서 전체 테스트를 재실행했다.
결과 로그는 ChatGPT 작업 폴더 `rpc-repair/test-results.log`, `rpc-repair/typecheck-results.log`에 보관한다.

공식 캐시 갱신 안내: https://supabase.com/kb/troubleshooting/refresh-postgrest-schema

최종 로컬 결과: npm run typecheck 전체 통과; npm test 98개 통과, 실패/건너뜀 0. APK 빌드 및 운영 데이터 변경 없음.

## 원격 적용 후 확인 (2026-11-01)
사용자가 SQL Editor에서 복구 적용 후 제공한 카탈로그 결과에서 public.account_sessions 및 public.current_account_session() RETURNS uuid 존재를 확인했다. 함수는 VOLATILE / SECURITY DEFINER, authenticated 실행 허용, anon 실행 금지이며 list_friends와 nickname 열도 정상이다. 적용 전 결과에는 세션 함수와 테이블이 실제로 없었으므로 원인은 003의 핵심 객체 누락으로 확정된다. 004 변경 흔적이 있는 부분 배포 상태였다.

적용 후 동일 프로젝트 REST에 사용자 JWT 없이 POST {} 재요청: 기존 404/PGRST202 대신 401/42501(permission denied for function current_account_session). 이는 함수가 REST에 인식되고 anon 실행이 차단되는 정상 결과다. 권한을 anon에 추가할 필요가 없다.

migration_history_table=null은 여전히 수동 SQL 적용 이력이 없음을 의미하며 RPC 실패 원인은 아니다. 사용자 JWT를 사용하는 Android 앱의 프로필 조회, 두 실제 계정 친구 요청/수락, 운영 방 생성은 아직 확인되지 않았다. 로컬 98개 테스트 통과와 운영 종단 검증을 구분한다.


## 다시 시도 실패 추가 진단
게임 서버 /health 200, Metro /status 200, ADB reverse 8081/3000 정상. 실제 Android 로그에서 session_rpc 통과 후 profile_read 단계 SQLSTATE 25006을 확인했다. PostgREST GET은 READ ONLY이고 기존 profiles RLS가 호출하는 current_account_session은 INSERT/UPSERT를 수행하므로 실패한다. 이전 일반 SQL 테스트는 이 조건을 놓쳤다.
006_readonly_session_policies.sql은 쓰기 RPC를 유지하고 RLS만 STABLE 읽기 전용 검증 함수로 전환한다. 이 함수는 저장된 최신 세션 및 실제 auth.sessions의 최신 세션이 JWT와 모두 일치해야 허용한다. 세션 기록이 없으면 먼저 기존 POST RPC가 필요하다. 기존 사용자/친구 데이터 삭제나 인증 방식 변경 없음. 005 다음 006을 SQL Editor에서 실행해야 한다. 원격 006은 아직 미적용.
회귀 테스트에서 이전 정책의 BEGIN READ ONLY 실패(25006)를 재현하고 006 두 번 적용 후 읽기 전용 프로필·친구 조회 성공을 확인했다. 전체 98개 통과.
공식 근거: https://docs.postgrest.org/en/stable/references/transactions.html
