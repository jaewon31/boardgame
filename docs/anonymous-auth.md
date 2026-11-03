# 익명 인증 전환 및 운영 절차

## 기존 구조와 호환성
- 최신 앱: apps/mobile. 이전 이메일 OTP/OAuth는 useAccount 및 AccountScreen에서 수행했다.
- Supabase Auth UUID → profiles.id, friendships.requester/recipient. 닉네임은 표시용이다.
- SecureStore의 기존 Supabase 세션 저장 키와 청크 저장 어댑터를 유지한다. 기존 이메일/소셜 계정 세션도 재사용한다.
- 게임 서버 accountAuthorizer는 Supabase REST current_account_session RPC로 JWT/최신 세션을 검증한다. 이메일 또는 is_anonymous=false 조건이 없으므로 익명 Auth UUID도 동일하게 처리된다.
- lobby는 검증한 accountId/loginId로 입장·재접속·중복 접속을 검사한다. 방의 playerId는 좌석 식별자이며 닉네임이 계정 키가 아니다.
- 방/패 기록은 서버 상태 저장소, 계정별 전적은 STATS_DB_PATH의 SQLite account_results에 UUID로 보관된다. handAccounts 스냅샷으로 퇴장 후에도 원래 계정에 정산하며 hand_id로 중복 기록을 방지한다.
- 친구 통계 API는 현재 세션과 수락된 친구 관계를 확인한 후 해당 두 UUID의 공동 경기만 조회한다. 승률 표시는 공동 경기의 팟 획득 횟수 / 경기 수이며 무승부·사이드 팟 때문에 합이 100%일 필요는 없다.

## 새 동작
1. 저장된 세션 재사용 → 없을 때 signInAnonymously. 동시 초기화를 합쳐 중복 생성을 막는다.
2. 기존 계정 표식이 있는데 세션이 사라졌거나 읽기/네트워크가 실패하면 새 계정으로 대체하지 않고 오류와 재시도를 제공한다.
3. 서버 세션 및 본인 프로필 조회 후 nickname_setup_complete=false이면 닉네임 화면. 저장은 이름과 완료 상태를 단일 UPDATE로 처리한다.
4. 이후 실행은 자동 메인 진입. OTP, 소셜 신규 로그인, 둘러보기 우회, 로그아웃 UI 및 미사용 OAuth 콜백/브라우저 의존성을 제거했다.
5. 익명 사용자에게 앱 삭제/데이터 초기화/기기 변경 시 계정·친구·기록 복구 불가 가능성을 안내한다. 세션이 없는 기존 이메일 사용자를 새 UUID와 자동 병합하지 않는다.

## DB 적용 (운영 DB에는 자동 실행하지 않음)
기존 001 → 002 → 003 적용 상태에서 supabase/migrations/004_anonymous_onboarding.sql을 SQL Editor 또는 기존 배포 경로로 실행한다. **모바일 업데이트 전에 적용**한다.
- profiles.nickname_setup_complete 추가 및 해당 열 UPDATE 권한 부여. 기존 이름 또는 기존 metadata 완료 표시를 보존해 backfill한다.
- 기존 owner 정책과 restrictive current-session 정책 유지. anon 역할에는 권한을 주지 않는다.
- list_friends는 내부 세션 검증이 account_sessions에 쓰므로 VOLATILE로 수정한다.
- 테이블 초기화, 계정/친구/경기 삭제 및 UUID 변경 없음. 재실행 가능.
- profiles는 본인 UUID만 읽기/수정, friendships는 당사자만 읽기, 변경 RPC는 수신자/당사자와 현재 세션을 검사한다. 제한 테이블은 직접 접근 불가다.

## Supabase 수동 설정
- Authentication 설정에서 Anonymous Sign-Ins를 활성화한다. 기존 이메일 공급자를 끌 필요는 없으며 기존 계정 데이터와 세션을 유지한다.
- 클라이언트 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 및 서버 SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY가 같은 프로젝트인지 확인한다. service_role 키를 앱에 넣지 않는다.
- 프로젝트에서 CAPTCHA를 강제하면 현재 클라이언트에는 토큰 수집 UI가 없어 신규 익명 가입이 차단된다. 운영 공개 전에 CAPTCHA 연동 여부와 익명 가입 rate limit을 결정하고 실제 기기에서 검증한다. 보안 설정을 자동으로 비활성화하지 않았다.
- 기존 계정 보존을 위해 익명 사용자 자동 정리 작업을 임의로 설정하지 않는다.

## 향후 Google/Apple 연결
현재 익명 세션에서 auth.linkIdentity({provider:'google'|'apple',options:{redirectTo:...}})를 사용하고 프로젝트의 manual linking을 활성화한다. signInWithOAuth로 새 계정을 만드는 흐름으로 대체하지 않는다. 연결 전후 user.id가 같은지 확인하고, 별도 기존 계정 충돌 시 자동 데이터 병합을 하지 않는다. OAuth callback 검증과 네이티브 브라우저 UI는 연결 기능 구현 시 추가한다. 현재 provider와 무관한 세션/UUID 경계를 유지했다.

## 변경 파일
- apps/mobile/App.tsx, app.config.ts, package.json
- apps/mobile/src/hooks/useAccount.ts
- apps/mobile/src/screens/AccountScreen.tsx
- apps/mobile/src/services/anonymousSession.ts, accountFlow.ts, authClient.ts, authErrors.ts
- 삭제: apps/mobile/src/services/authCallback.ts
- package-lock.json
- supabase/migrations/004_anonymous_onboarding.sql
- apps/server/test/anonymousSession.test.ts, anonymousRls.test.ts, anonymousAuthorizer.test.ts
- apps/server/test/account.test.ts, accountFlow.test.ts, authErrors.test.ts
- docs/anonymous-auth.md 및 docs/accounts-setup.md 안내 링크

## 검증과 배포 후 확인
자동 테스트: 세션 재사용/중복 생성 방지/실패/익명 설정 비활성화/계정 표식, 온보딩 경로, 전체 마이그레이션 실행과 재실행, 기존 데이터 보존, 타인 프로필 접근 차단, 친구 동의 및 세션 소유권, 서버 익명 토큰 검증. 기존 방 생성·재접속·전적 영속성 테스트도 함께 실행한다.
PGlite 테스트는 auth 스키마/JWT 함수를 모사하므로 실제 Supabase Auth 서비스와 기기 SecureStore 테스트를 대체하지 않는다.
배포 후: 새 설치 닉네임 → 재실행 동일 UUID → 서로 다른 기기 두 계정의 친구 요청/수락 → 방 생성/참가/재접속 → 경기 종료 후 전적 조회 → 제3자 접근 거부 → 기존 이메일 로그인 상태 업데이트를 확인한다. 실서비스 설정 변경과 실기기 검증은 이 작업에서 실행하지 않았다.

공식 참고: https://supabase.com/docs/guides/auth/auth-anonymous

## 실행 결과 (2026-11-01)
- npm run typecheck: mobile/server/shared 전체 통과.
- npm test: 95개 통과, 실패/건너뜀 0.
- npm run export:mobile: Android/iOS Hermes 번들 생성 성공.
- 운영 Supabase 적용 및 실제 기기 가입/복원 검증은 미실행.
