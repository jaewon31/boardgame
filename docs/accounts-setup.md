# 계정 기능 1단계

이메일 OTP, Google/Apple OAuth(PKCE), 기기 내 암호화 세션 저장, 고유 계정 ID·친구 코드·닉네임을 준비했습니다. 실제 서비스 프로젝트가 연결되어야 인증됩니다.

## 연결 순서

1. https://supabase.com/dashboard 에서 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/001_accounts.sql`을 한 번 실행합니다.
3. 프로젝트 URL과 **publishable key**를 `apps/mobile/.env.local`에 추가합니다. service_role/secret key는 앱에 넣지 않습니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_AUTH_GOOGLE=false
EXPO_PUBLIC_AUTH_APPLE=false
```

4. 이메일 OTP는 custom SMTP를 먼저 연결해야 합니다. 기본 발송 서비스에서는 템플릿 편집이 잠길 수 있고 허용 수신자/발송량도 제한됩니다. SMTP 연결 후 **Confirm signup과 Magic Link 두 템플릿 모두** 본문에 `{{ .Token }}`을 표시합니다. 기존 메일 링크는 쓰지 않고 새 인증 코드를 요청해서 앱에 입력합니다. SMTP가 준비되지 않았다면 Google 로그인부터 검증합니다.
5. Redirect URLs에 `friendstable://auth/callback`을 정확히 등록합니다.
6. Google 제공자에 Google Cloud OAuth client 설정을, Apple 제공자에 Apple Developer Service ID·키 설정을 등록합니다. 공급자에게 등록할 서버 콜백은 Supabase 대시보드에 표시되는 주소를 사용합니다. 비밀 키는 Supabase 대시보드에서만 관리합니다.
7. 설정이 완료된 제공자만 해당 환경변수를 `true`로 바꿉니다.
8. Expo 재시작. 이메일 OTP는 Expo Go로 테스트할 수 있습니다. OAuth는 `friendstable` 스킴이 포함된 설치형 빌드에서 테스트합니다. 개발 빌드/실기기로 취소·재시도·재실행도 검사합니다.

## 이번 단계의 범위와 다음 단계

- 로그인 서비스 미설정 시 기존 게스트 게임은 계속 가능합니다.
- 공개 프로필은 본인만 조회·수정 가능합니다. 친구 검색/친구 요청 API와 정책은 다음 단계에서 추가합니다.
- 게임 서버의 임시 좌석 ID와 인증 사용자 ID는 아직 연결하지 않았습니다. **지금은 로그인해도 경기 기록이 계정 전적으로 저장되지 않습니다.** 다음 단계에서 서버가 토큰을 검증한 뒤 경기 참가자와 계정을 연결해야 합니다. 클라이언트가 보낸 사용자 ID를 그대로 신뢰하면 안 됩니다.
- 이메일이 서로 다른 로그인 수단은 별도 계정이 될 수 있습니다. 임의 이메일 매칭/계정 병합을 하지 않습니다. 본인 인증을 거친 연결 기능은 추후 추가합니다.
- 스토어 출시 전 계정 삭제, 개인정보 처리방침·약관, 운영 인증 제한과 복구 절차를 완성해야 합니다.

## Git 작업 방식

기능별 `codex/` 브랜치 → 검증 → 커밋·푸시 → Draft PR → 검토 후 병합 순서로 관리합니다. 현재는 기존 PR 위에 쌓인 브랜치이므로 부모 PR을 먼저 병합하거나 새 PR의 기준 브랜치를 조정합니다. main 병합은 자동으로 하지 않습니다.

## Windows에서 설치형 Android 앱 테스트

1. Android Studio 에뮬레이터 Pixel_7을 켭니다.
2. 저장소 루트에서 `npm.cmd run android:build`를 실행합니다. 처음 빌드는 Gradle/SDK/NDK 다운로드로 오래 걸릴 수 있습니다. 다른 AVD는 `npm.cmd run android:build -- -Device Boardgame_Guest`로 지정합니다.
3. 별도 터미널에서 `npm.cmd start -- --lan --port 8081` 실행 후 앱을 다시 엽니다. 이 앱의 기본 개발 서버 포트는 8081입니다.
4. Google Cloud의 앱이 테스트 상태면 Audience(대상)의 테스트 사용자에 로그인할 이메일을 추가합니다.
5. Supabase Redirect URLs에 `friendstable://auth/callback`을 등록합니다. Google Cloud의 웹 OAuth 리디렉션 URI는 Supabase의 `https://PROJECT_REF.supabase.co/auth/v1/callback`입니다.
6. 첫 화면 로그인 → Google을 선택합니다. 실제 Google 인증은 사용자가 직접 진행합니다. 완료 후 닉네임과 친구 코드가 표시되는지 확인합니다.

Supabase Google 제공자가 활성화되어도 로컬 `EXPO_PUBLIC_AUTH_GOOGLE=true` 설정과 Expo 재시작이 필요합니다. 비밀 키는 Supabase에서만 보관합니다.
