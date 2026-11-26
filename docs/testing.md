# 개발·검증 절차

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

## 로컬 4인 브라우저 게임 E2E (카드 공개·효과음)

```powershell
node scripts/test-game-e2e.cjs
```

[실행기](../scripts/test-game-e2e.cjs)는 실제 웹 게임 경로(`useRoom`·`RoomClient`·`useGameAudio`·`GameScreen`, [fixture](../apps/mobile/test/browser/game-e2e-fixture.jsx))를 esbuild로 번들링하고, 127.0.0.1의 로컬 게임 서버(`attachLobby`, 메모리 로비)와 실제 Chrome 4개를 실행한다. 인증은 이 번들 안에서만 `authClient`를 대체하고, 서버는 실행마다 새로 만든 테스트 토큰 4개만 받는다. 운영 Supabase·Railway·Cloudflare에 연결하지 않으며 배포 환경 변수(`NODE_ENV=production`, `RAILWAY_ENVIRONMENT`, `CF_PAGES`)가 있으면 실행을 거부한다. 앱 빌드·서버가 이 파일들을 참조하지 않는지는 `apps/mobile/test/e2e-isolation.test.cjs`가 검사한다. 7핸드(빠른 체크/콜·레이즈·올인 런아웃+리버 스퀴즈·사운드 ON/OFF·칩 초기화 후 재시작)를 진행하고 `.qa-web/game-e2e/report.json`에 카드 값 없는 타이밍만 기록한다. 기본 경로는 `.qa-web/node_modules`의 esbuild·Playwright와 설치된 Chrome이며 `ESBUILD_PATH`·`PLAYWRIGHT_PATH`·`CHROME_PATH`로 바꿀 수 있다. headless에서는 소리를 듣지 않으므로 청취 품질은 별도 확인이 필요하다.

4명은 시작 전에 실제 좌석 UI로 착석한다(방장 1번 직접 선택, 나머지는 요청 후 방장 승인).

## 좌석·재접속·리바이 서버 테스트

`apps/server/test/seats.test.ts`(좌석 선택·승인), `seat-hold.test.ts`(3분 보존·칩 잔액), `reconnect-turn.test.ts`(다른 기기 인계·늦은 메시지 차단·끊긴 차례 즉시 처리·`RECONNECT_MS` 하한), `rebuy.test.ts`(리바이 C안·다음 핸드 참여), `grace-limit.test.ts`(연결 끊김 2초 유예·재접속 경쟁·재시작, 방 설정 리바이 최대 수량, 방장 본인 리바이, 요청 ID 중복 방지), `seat-events.test.ts`(좌석 진단 로그 6종·민감 정보 배제·상한·칩 총합 감사). 공용 하네스 `test/support/seat-harness.ts`는 `test/*.test.ts` 패턴에 포함되지 않는다. 서버 전체 명령(`node --test test/*.test.ts`)에 함께 실행된다.

### SQLite 백업·복구 리허설 (2026-11-25 17:15 KST, 테스트 Railway DB 사본, 대상 코드 `3a28b09`)

- 방법·절차·중단 범위 상세: [좌석 관리](seat-management.md) 12.5. Railway DB·변수·배포 변경 없음, 복원·서버 실행은 사용자 PC VM 격리 임시 폴더.
- 통과: 백업 2회 해시 동일(`boardgame.sqlite` `4e10c0a3…0845`, `stats.sqlite` `bf4bc263…4ef8`) · 사용자 PC 저장본 해시 일치 · 격리 복원 전체 SHA-256 일치 · `integrity_check` ok(시작 전·종료 후) · `3a28b09` 서버가 `STATE_DB_PATH`·`STATS_DB_PATH`의 복원 사본을 실제로 엶(배타 잠금·fd 확인, 기본 경로 파일 없음) · `/health` ok · error 0 · 종료 후 전적 파일 바이트 동일(58핸드·176결과·14계정)·체크포인트 방 0 유지 · 서버 코드로 전적 읽기 정상
- 백업 방법: 전적 DB는 실행 중 백업 API·`VACUUM INTO` 가능, 체크포인트 DB는 배타 잠금으로 불가 → 방 0개일 때 파일 복사. 실행 중 제자리 덮어쓰기는 DB 손상 재현(금지)
- 미검증: Railway Files Upload의 바이트 보존, 경로 변수 변경 후 Railway 재시작 실제 동작, 재시작 중단 시간(첫 배포에서 측정)

### 배포 전 점검 결과 (2026-11-25 14:30 KST, `feature/seat-management` 미커밋)

| 실행 | 환경 | 결과 |
| --- | --- | --- |
| 서버 `node --test test/*.test.ts` | VM Node 22 / 클라우드 Node 24 | 277/277 / 277/277 (진단 로그·칩 감사 +6) |
| 모바일 `node --test test/*.test.cjs` | 클라우드 Node 24 | 72/72 |
| `tsc --noEmit` | VM(저장소 node_modules) | shared·server·mobile 오류 0. 클라우드 mobile은 의존성 묶음에 타입 선언 2종이 없어 TS7016만 발생(환경 문제) |
| 좌석 E2E / 4인 E2E | 클라우드 Chrome 153, 최종 코드 | 29/29 / 통과(16/16) |
| Windows `.qa-web/seat-check/run-windows-checks-ft007.cmd`(1차, 진단 로그 추가 전 코드) | Windows Node v24.19.0, npm 12.2.1, Chrome 157 | 타입 검사 0, 서버 271/271(종료 0), 모바일 72/72(0), 좌석 E2E 29/29(0), **4인 E2E 종료 1**: 5/7핸드 후 "plan incomplete". 실행 중 PC 절전(연결 끊김 00:10, 종료 07:50)으로 8분 벽시계 기한 초과로 판단, 진행된 핸드의 결과 순서 12/12·콘솔/페이지 오류 0. 결과 원문 `windows-results-ft007-run1.txt` |
| Windows 최종 코드 재실행 | — | 미실시(PC 잠금 상태). **미검증** |
| SQLite 호환성 | 테스트 DB 사본, 이전 서버 `290cb8a`·`595cd676` | [좌석 관리](seat-management.md) 12.4절: 이전→새 정상, 새→이전 동작하나 새 상태 손실, 새→이전→새 정상 |

실사용 테스트 항목: [좌석 실사용 테스트 체크리스트](seat-playtest-checklist.md).

### 좌석·재접속·리바이 검증 결과 (2026-11-25 00:30 KST, `feature/seat-management` 미커밋)

| 실행 | 환경 | 결과 |
| --- | --- | --- |
| 서버 `node --test test/*.test.ts` | 사용자 PC VM 사본, Node 22.23.5 | 271/271 |
| 서버 같은 명령 | 클라우드 Linux, Node 24.22.3 | 271/271 × 3회 연속 |
| 모바일 `node --test test/*.test.cjs` | VM Node 22 / 클라우드 Node 24 | 72/72 / 72/72 |
| `tsc --noEmit` shared·server·mobile | VM Node 22 + 저장소 node_modules | 오류 0 |
| `node scripts/test-seat-e2e.cjs` | 클라우드, Chrome headless ×4(+다른 기기 1), 로컬 127.0.0.1 | 29/29, 스크린샷 19장 |
| `node scripts/test-game-e2e.cjs` (기존 4인 회귀) | 같은 환경 | 통과, 결과 순서 16/16 |

신규·변경 서버 테스트 범위: 2초 이내 재접속(같은 기기·다른 기기) 시 자동 행동 취소, 기본 2초 후 폴드(1950~3000 ms), 체크 가능 시 체크, 유예 중 차례 도달 시 남은 유예만 대기, 오래 끊긴 플레이어는 즉시, 닫힘·재접속 경쟁(새 소켓 먼저/동시/중복 종료), 실행된 폴드 미복구, 재시작 중 유예(복구 구간 동안 미처리·이후 처리·복구 구간 내 복귀 정상 조작), 리바이 한도 초과 거부, 설정 검증·저장·재시작 복원, 한도만 변경 시 칩 유지·그 외 변경 시 기존 초기화, 구 클라이언트 설정 저장 시 한도 유지, 한도 하향 시 대기 요청 재검증, 한도 변경 후 떠난 계정 잔액 복구, 방장 즉시 리바이·핸드 중 보류·한도 적용·타인 목록 미표시, 같은 요청 ID 재전송·재접속 후 재전송 1회 지급.

미검증: Windows Node 24, 실기기·모바일 브라우저·네이티브(키보드와 입력창 겹침 포함), Preview/테스트 서버 배포, 실제 3분 대기, 30초 복구 구간 실제 길이(테스트는 `recoveryMs` 단축), 방 설정 5단계 편집기의 브라우저 조작(단위 테스트만), 빈 좌석을 건너뛰는 딜러 순환 전용 테스트. 추적: `FT-TEST-012`.

## 로컬 좌석 선택·방장 승인 브라우저 E2E

```powershell
node scripts/test-seat-e2e.cjs
```

[실행기](../scripts/test-seat-e2e.cjs)는 위와 같은 fixture·격리(127.0.0.1, 테스트 토큰, 운영 접속 차단)로 Chrome 4개를 띄워 운영 경로(`autoSeat` 없음)의 방장 직접 착석, 요청·거절, 같은 좌석 동시 요청, 새로고침 복원, 게임 중 승인 후 다음 핸드 참여, 그리고 끊김 중 좌석 보존·유예 내 재접속 복구·"자리에서 일어나기" 버튼·핸드 후 해제·관전자 재착석 승인(FT-FEAT-003·004), 칩 추가 요청 입력·방장 승인/거절·게임 중 승인 보류·칩 총합, 같은 계정 다른 기기 복구·이전 세션 종료, 차례 중 연결 끊김 2초 유예 후 처리, 방장 본인 칩 추가(FT-FEAT-005·006, FT-BUG-004)를 확인하고 `.qa-web/seat-e2e/`에 결과(`report.json`)와 휴대폰 크기 스크린샷을 남긴다. 설계·정책은 [좌석 관리](seat-management.md).

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
