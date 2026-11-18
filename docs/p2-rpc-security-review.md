# P2 친구 전적 RPC 운영 적용 전 보안 검증

> 2026-11-18 후속: 사용자가 운영 RPC 설치·EXECUTE ACL 확인을 보고했다. 아래 미적용 설명은 11/17 이력이다. 최신 결과는 [설치 후 재검증](p2-rpc-verification-2026-11-18.md). 실제 JWT 운영 E2E는 여전히 미검증.

2026-11-17 KST · codex/tempo-hand-history · HEAD 89229f5 · dirty 작업 트리.
기존 P0/P1/P2 변경 보존. 운영 SQL 실행·배포·push·main 병합·커밋 없음.

## 결론

**로컬 보안 검증 통과. 운영 즉시 적용 판정은 보류한다.**

001~006 마이그레이션을 실제 로컬 PGlite에 적용한 스키마·권한과 서버 코드를 검증했다. 운영 Supabase 프로젝트의 카탈로그/정책/함수/배포 버전은 조회하지 못했다. 이 세션에 대상 프로젝트용 DB 연결·관리 API가 확인되지 않았고, 다른 프로젝트용 커넥터를 대신 사용하지 않았다. 로컬 파일과 운영 스키마가 일치한다고 단정할 수 없다.

또한 사용자 간 차단 모델이 저장소에 없다. 친구 관계 삭제와 pending은 차단하지만, accepted 관계와 별도로 저장되는 사용자 차단을 처리했다고 표시할 수 없다. 운영에 별도 차단 테이블/정책이 있으면 그 스키마와 정책을 먼저 확인하고 **신규·기존 전적 API 모두**에 반영해야 한다. 차단 기능이 없음을 제품 조건으로 확인하는 경우에는 현재 친구 권한 모델로 조건부 적용 가능하다.

## 9개 점검 결과

| 항목 | 결과 / 근거 |
| --- | --- |
| 1. 스키마 | 002의 requester/recipient는 NOT NULL uuid, status는 NOT NULL text이며 pending/accepted CHECK. UUID 양방향 쌍 unique index, auth.users FK cascade 확인. 003~006은 이 컬럼 계약을 바꾸지 않는다. 로컬 실제 카탈로그 테스트 일치. **운영 일치 여부 미확인**. |
| 2. DEFINER/소유자/권한 | 빈 search_path, 스키마 지정 SQL 유지. 소유자를 postgres로 명시. PUBLIC/anon/service_role 권한 revoke, authenticated EXECUTE만 grant. CREATE OR REPLACE가 보존하는 예상 밖 ACL 또는 authenticated의 grant option은 트랜잭션 오류로 적용 중단. 로컬 카탈로그 및 실제 역할별 호출 검증. 운영 owner/역할 상속은 별도 점검 대상. |
| 3. auth.uid | DEFINER의 current_user 대신 요청 JWT의 auth.uid를 사용한다. 새 함수는 auth.jwt.role=authenticated와 read_account_session()=auth.uid()를 추가 확인한다. A는 true, 무관한 D는 false, null caller/session·폐기/구 세션은 false. 로컬 테스트의 JWT claims GUC는 PostgREST를 모사하며 실제 서명 검증/E2E는 아니다. |
| 4. 서비스 키 | index.ts는 SUPABASE_PUBLISHABLE_KEY를 사용하고 accountAuthorizer는 sb_publishable_만 허용한다. friendStatsApi에도 독립적인 같은 제한 추가. 실제 authorizer→permission 호출 모두 동일 사용자 Authorization 토큰을 전달하는 테스트 추가. 서비스 JWT는 SQL 역할 조건으로 거부하고 service_role 직접 실행은 ACL로 차단. 운영 환경변수 값은 미검증. |
| 5. 세 관계/본인 비교 | accepted A-B·A-C·B-C 모두 필요. 방향과 순서에 무관하다. 본인이 대상이면 자기 자신과의 간선만 제외하고 실제 본인-친구 간선은 반드시 검사. first=second/null/무관 UUID 거부. 기존 단일 친구 API는 인증된 accountId만 본인으로 사용. |
| 6. 해제/차단/pending | 세 간선 각각 삭제/pending일 때 거부. auth.users 삭제에 따른 cascade 및 대상 프로필 부재 거부. **독립적 사용자 차단 기능은 현재 없음**. status=blocked도 현 CHECK가 허용하지 않으므로 이를 구현했다고 주장하지 않는다. Supabase 관리자 ban의 운영 설정/토큰 폐기 의미도 이번 검증 범위에서 확인하지 않았다. |
| 7. fail-closed | 정확한 JSON boolean true만 허용. false/null/문자열/배열/객체/숫자는 403; HTTP 오류·네트워크·timeout·파싱 실패는 503. 모든 거부에서 SQLite compare 호출 0회, 상세 오류/통계 비노출 및 no-store 확인. 미인증은 401, 권한 RPC 호출 자체 없음. |
| 8. 우회 경로 | FriendStatsStore.compare의 프로덕션 호출은 friendStatsApi의 보호된 두 경로뿐. HTTP는 health와 두 stats 경로 외 404, DB 파일 정적 제공 없음. 다른 URL·query caller 변조·POST·추가 path 테스트. Supabase에는 이 SQLite 전적 테이블이 없다. 아래 방 기록의 별도 권한 범위 참조. |
| 9. 기존 영향 | 함수 추가/owner/ACL만 변경하고 기존 데이터·테이블·RLS·기존 함수는 바꾸지 않는다. 기존 본인-친구 API 유지. SQL은 006 read_account_session에 새로 의존하므로 001/002만 적용된 DB에는 사용할 수 없다. 준비되지 않은 DB에서 오류를 숨기는 fallback 없음. 기존 publishable key 설정에서는 서버 추가 검사 영향 없음. |

## 이번 수정 및 발견 사항

1. 이전 초안은 서버의 최신 세션 검증 이후에만 쓰인다는 가정이었다. 따라서 이전 초안 RPC 자체를 직접 호출하는 오래된 세션은 boolean 관계 정보를 얻을 수 있었다. **SQLite 전적을 읽는 우회는 아니었지만**, RPC 경계를 강화하기 위해 006의 읽기 전용 최신 세션 검증을 추가했다. STABLE을 유지하고 세션 갱신을 일으키는 current_account_session을 새 SQL 안에서 호출하지 않는다.
2. 이전 초안은 실행자가 owner가 되는 기본 동작과 PUBLIC/anon revoke에 의존했다. 실제 Supabase 기본 권한/기존 함수 ACL을 고려해 postgres owner, service_role revoke, 잔존 ACL 검사로 강화했다. 예상 밖 ACL을 발견해도 다른 역할의 권한을 임의로 정리하지 않고 전체 적용을 롤백한다.
3. 서버 진입점의 publishable key 검사 외에 friendStatsApi 생성 시에도 secret/legacy key를 거부한다. 관리자 역할/DB 소유자는 신뢰 경계 밖의 관리자이며 이 함수가 DB 관리자 침해를 막는다고 주장하지 않는다.
4. 새 SQL은 보안 확인을 한 statement snapshot에서 수행한다. 관계 삭제가 커밋된 **이후 시작한 조회**는 차단된다. 이미 시작/완료된 요청이나 이미 전달된 화면을 소급 취소하는 보장은 없다. 기존 관계 상태를 캐시하지 않는다.

## 기존 방 기록과 API 범위

WebSocket lobby의 todayResults/handReviews는 인증된 방 참여자에게 제공되는 별도 기능이다. 해당 방은 기존 정책상 인증+초대 코드로 입장하며 친구 관계가 필수는 아니다. 이 경로는 FriendStatsStore의 계정 간 누적 조회를 하지 않으며, 사용자가 임의 UUID로 전역 전적을 요청하는 메시지도 없다. 다만 방에서 이미 공개된 결과를 참가자가 볼 수 있다는 사실은 유지된다. 친구 해제/차단이 모든 방 기록까지 숨겨야 한다는 정책은 이번 전적 권한과 별도 설계가 필요하다. 서버 비공개 카드 필터 및 방 참여 권한은 수정하지 않았다.

## 테스트 및 근거

- TypeScript 전체 workspace 통과.
- 서버 전체 **178/178 통과**. 기존 친구·세션·P0 게임/카드/오디오 회귀 포함.
- 모바일 **50/50 통과**. 이번 작업은 UI 변경이 없어 웹/native 빌드 및 브라우저 캡처를 반복하지 않았다. 이전 P2 결과는 해당 보고서의 이력이다.
- 신규 `apps/server/test/friend-stats-security.test.ts`: 001~006 카탈로그, RLS 보존, postgres owner/ACL/기본 service_role grant 제거, 잔존 ACL·grant option 거부, read-only preflight 실행, JWT 컨텍스트/구 세션/직접 호출, 서비스 역할, 실제 authorizer 토큰 전달, fail-closed에서 store 미호출, 우회 URL, 기존 API.
- 기존 `friend-comparison.test.ts`를 001/002 전용 mock에서 001~006 및 session 데이터가 있는 fixture로 확장했다. 세 간선 승인/해제/pending 및 역순/삭제 사용자 검증 유지.
- 최초 focused 실행은 fixture SQL 문자열의 dollar quoting 오타로 1개 실패했다. 테스트 fixture 수정 후 focused 3/3, 전체 178/178 통과. 제품 SQL/서버 오류를 숨기기 위해 테스트를 제거하거나 우회하지 않았다.
- 로그: ignored `.qa-web/p2-security-focused.log`, `p2-security-server.log`, `p2-security-typecheck.log`, `p2-security-mobile.log`.

로컬 PGlite는 실제 SQL·권한·세션 데이터 검사이며, Supabase API gateway의 JWT 서명 검사·운영 PostgREST 역할 전환을 실행한 것은 아니다. 실제 운영 검증과 구분한다.

## 운영 적용 전 남은 조건 및 영향

1. [읽기 전용 preflight](../supabase/drafts/007_friend_stats_preflight_readonly.sql)를 **의도한 프로젝트**에서 실행한 결과로 requester/recipient/status 타입·제약·FK·unique index·RLS 및 005/006 함수 정의를 대조한다. auth.uid/auth.jwt 구현, 모든 RPC overload, postgres owner/권한, API 역할 상속/default ACL도 확인한다. 사용자 데이터/JWT 값은 출력하지 않는다. 이번 세션에서는 로컬에서만 실행했다.
2. 실제 사용자 차단 기능/테이블의 존재와 적용 정책을 확인한다. 있다면 현재 초안을 그대로 적용하지 않는다.
3. 운영 서버가 publishable key + 사용자 Bearer 토큰을 사용하고 006의 세션 계약과 호환되는지 확인한다. 신규 SQL은 read_account_session이 인정한 세션만 허용하므로 권한을 완화해 missing migration을 우회하면 안 된다.
4. 위 조건 충족 후 사용자 승인된 별도 적용 단계에서 007 트랜잭션 실행 및 catalog/ACL 재확인. anon/service_role 거부, A/B/C 테스트 계정의 accepted/pending/해제 및 구 세션을 실제 gateway를 통해 검증한다. 이번 요청에서는 실행하지 않는다.
5. 007만 적용해도 기존 본인 API/게임 규칙/데이터에는 변경이 없고 신규 UI/서버를 자동 배포하지 않는다. 함수 추가 후에도 서버·웹 배포는 별도 승인 대상이다. 되돌릴 때는 새 함수만 제거하는 별도 승인 변경으로 충분하며 데이터 복원은 필요 없다.

## 변경 파일

- `supabase/drafts/007_friend_stats_permission.sql`
- `supabase/drafts/007_friend_stats_preflight_readonly.sql` (신규)
- `apps/server/src/friendStatsApi.ts`
- `apps/server/test/friend-comparison.test.ts`
- `apps/server/test/friend-stats-security.test.ts` (신규)
- 이 보고서, `docs/project-status.md`, `docs/friend-stats.md`, `docs/testing.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/README.md`, P2 보고서의 후속 검증 링크.

001~006 원본 SQL 및 P0/P1/P2 UI/게임 로직은 변경하지 않았다.

## 공식 문서 대조

SECURITY DEFINER는 owner 권한으로 실행하고 CREATE OR REPLACE는 기존 owner/ACL을 보존한다. PUBLIC EXECUTE는 명시적으로 제한해야 한다. [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html), [Supabase Database Functions](https://supabase.com/docs/guides/database/functions).

사용자 토큰의 인증 컨텍스트와 프로젝트 키의 역할을 구분하고, service_role/secret key의 RLS 우회 권한을 일반 사용자 조회에 사용하지 않는다. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
