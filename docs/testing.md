# 개발·검증 절차

> 최신 실행: [2026-11-19 배포 후보 검증](release-readiness-2026-11-19.md). 서버 178/178, 모바일 50/50, TypeScript, Web/PWA production, Android/iOS Hermes, P1/P2 Chrome PASS. 제한 환경의 최초 소켓 실패와 허용 환경 재실행을 구분한다. 운영 JWT E2E/실기기/배포 미실행.

확인: 2026-11-17 KST. package.json·CI·테스트 실행기 기준. PowerShell 실행 정책 문제 시 npm.cmd 사용. 아래 명령은 이번 문서 작업에서 재실행한 테스트 결과가 아니다.

## 버전과 설치

| 항목 | manifest | lock / 설치 확인 |
| --- | --- | --- |
| Node | >=24 <25 | 실행 환경 24.19.0 |
| Expo | ~58.0.22 | 58.0.22 |
| React | 19.3.0 | 19.3.0 |
| React Native | 0.88.1 | 0.88.1 |
| React Native Web | ^0.21.4 | 0.21.4 |
| TypeScript | ~6.0.3 | 6.0.3 |
| Supabase JS | ^2.118.0 | 2.118.0 |
| ws (server) | ^8.21.3 | 8.22.1 |

루트의 다른 의존성용 ws 7.5.13을 서버 버전으로 오인하지 않는다. apps/server에서 resolve한 패키지 기준이다. SDK 57 지침은 폐기한다. 설치가 필요할 때 저장소 루트에서 npm ci로 lockfile을 재현한다. 문서 작업만을 위해 기존 환경을 재설치하지 않는다.

## 자동 검증

```powershell
npm run typecheck
npm test
npm run test --workspace=@boardgame/mobile
npm run export:web --workspace=@boardgame/mobile
npm run export:mobile
```

typecheck는 모든 workspace의 tsc --noEmit. npm test는 서버 test/*.test.ts이며 카드/오디오 클라이언트 로직 테스트도 포함한다. 모바일 test/*.test.cjs는 별도 명령이 필요하다. export:mobile은 Android/iOS JS·에셋 번들이며 APK/IPA 또는 실기기 통과가 아니다.
[CI](../.github/workflows/check.yml)는 기본 웹 출력에 아래 정적 검사도 한다.

```powershell
node scripts/check-web-release.cjs apps/mobile/dist
node -e "require('./scripts/build-pages.cjs').checkPages('apps/mobile/dist')"
```

배포용 환경/빌드는 [기존 배포 절차](web-deployment.md)에 둔다. 빌드 성공은 배포 성공이 아니다.

## Playwright 입력 fixture

Chrome 설치와 로컬 loopback 허용 필요. npm Playwright script는 없으므로 실제 실행기를 사용한다. 필요 시 ignored .qa-web에만 테스트 도구를 설치한다.

```powershell
npm install --prefix .qa-web --no-save playwright@1.65.1 esbuild@0.28.2
node scripts/test-input-browser.cjs
```

[실행기](../scripts/test-input-browser.cjs)는 실제 화면을 번들링하고 로컬 WS/친구 스텁을 사용한다. 영문/숫자/Enter/Backspace, CDP IME, revision 갱신, 가로/세로 viewport를 확인한다. 운영 로그인 E2E나 실제 키보드는 검증하지 않는다. fixture/실행기는 P1 작업의 미커밋 파일이다.

## 수동·통합 점검

[실기기 목록](web-device-checklist.md)과 [P1 목록](p1-input-layout-report.md)을 재사용한다.

- PC Chrome/Edge: 실제 한글 조합·후보·Enter/Backspace·붙여넣기, 프로필 재조회/WS 갱신 중 포커스.
- iPhone Safari와 홈 화면 PWA 각각: 주소창·safe area·키보드·회전·모달 스크롤·히스토리·백그라운드 복귀.
- Android Chrome 및 Android/iOS native: 입력·터치·공통 Enter 회귀·키보드·레이아웃, 오디오 fade/피치/시청각 동기 실청취.
- 복수 테스트 계정: 생성→초대→최대 6인→레이즈/올인/폴드→사이드 팟/동률/칩 합계 정산. 타인의 비공개 카드 비노출.
- 단절→기한 내 동일 자리/최신 상태/nextHandAt 복귀. 명시적 퇴장, 만료, 새 로그인, 서버 checkpoint 복원은 별도 시나리오. 재시작은 격리 로컬 데이터로 검증하고 운영 재시작은 승인 후 수행.
- 전적: 미인증 거부, 수락된 친구만 허용, 친구 해제 후 거부. P2 제3자 비교는 세 accepted 관계를 모두 검사. 테스트는 운영 RLS 적용 증거가 아니다.

## 실패 대응과 기록 양식

테스트를 삭제/무력화하지 않는다. 코드 결함과 환경·loopback 권한 실패를 구분하고 최초 실패/원인/재실행을 함께 기록한다. 문서만 변경했다면 링크·버전·상태·보존 검증으로 충분하며 전체 테스트는 필수가 아니다.

```text
날짜(KST) / 담당:
브랜치 / HEAD / dirty 여부:
범위 / 대상 빌드·서버 식별자:
명령 또는 시나리오 / 환경·기기·버전:
결과: 통과·실패·차단·미실행 / 개수 / 근거:
실패 원인 / 재실행 결과:
미검증·잔여 위험:
배포: 없음 또는 승인·환경·배포 SHA (검증과 분리):
관련 문서 갱신:
```

## P2 로컬 검증 — 2026-11-17

codex/tempo-hand-history / 89229f5 / dirty. [상세 결과·실패 이력·캡처](p2-ui-friend-comparison-report.md).

- typecheck 통과, 최종 서버 176/176, 모바일 50/50. 서버 재검사 중 기존 세션 교체 timeout 1회 후 분리 7/7 및 전체 재실행 통과(간헐적 실패 이력 보존).
- Expo Web 및 Android/iOS JS·에셋 export 통과. 배포/실기기 아님.
- 기존 P1 브라우저 실행기 통과. 신규 P2는 Chrome 157.0.8103.79에서 1366×768, 1920×1080, 375×812, 390×844, 430×932, 844×390 검증.
- P2 fixture의 친구/인증/통계 응답은 stub. 서버 테스트는 실제 HTTP+SQLite와 로컬 PGlite SQL을 연결한다. 원격 Supabase 설정 검증은 아님.

재현: 기존 .qa-web Playwright/esbuild 설치 후 다음을 실행한다.

```powershell
node scripts/test-p2-browser.cjs
node --test apps/server/test/friend-comparison.test.ts
```

서버/브라우저 실행에는 로컬 loopback 권한이 필요하다. P2 실행기는 89229f5의 카드/대기실 소스로 이전 화면을 번들링하여 현재 화면과 같은 fixture로 비교한다. 자동 migration 폴더 밖의 supabase/drafts/007_friend_stats_permission.sql만 로컬 메모리 DB에 적용한다. 원격 DB에 적용하지 않는다. 전체 캡처/로그는 ignored .qa-web, 대표 근거는 docs/assets/p2.

iPhone Safari/PWA의 실제 키보드·회전·safe area·터치, Android/iOS native는 미검증. 스테이징/운영 배포 없음.

## P2 RPC 보안 후속 검증

2026-11-17 / codex/tempo-hand-history / 89229f5 dirty. TypeScript, 서버 178/178, 모바일 50/50 통과. [보안 결과](p2-rpc-security-review.md). UI 변경이 없어 브라우저/번들 빌드는 재실행하지 않았다.

```powershell
node --test apps/server/test/friend-comparison.test.ts apps/server/test/friend-stats-security.test.ts
```

001~006 실제 로컬 SQL, owner/ACL·역할·세션·RLS 보존·fail-closed/store 미호출·우회 URL을 검사한다. JWT claims는 PostgREST가 검증한 값을 모사하며 서명/운영 gateway 검증이 아니다. 최초 fixture dollar quoting 오타 수정 후 통과. 운영 읽기 전용 점검 SQL은 로컬 구문 검증만 완료. 운영 적용/배포 없음.

## 2026-11-18 P2 RPC 설치 후 재실행

[검증 보고서](p2-rpc-verification-2026-11-18.md): TypeScript PASS, 서버 178/178 PASS, 모바일 50/50 PASS, 웹 export PASS, 기존 P1 및 P2 Playwright PASS, diff check PASS. 이번 실행 실패 0. friend-comparison.test.ts에 본인-친구 허용 및 본인-비친구 거부(기존/두 대상 API) assertion을 추가했다. 운영 ACL은 사용자 확인이며 실제 JWT 검증을 통과한 것으로 간주하지 않는다. 운영 current_account_session 호출은 쓰기를 일으킬 수 있어 미실행했다.
