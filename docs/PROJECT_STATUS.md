# Friends Table 현재 개발·배포 상태

갱신: 2026-11-18 KST.

## 기준점

- 공식 개발 작업본은 Desktop의 `boardgame` 저장소다. Codex에서 공식 저장소 루트를 열고 실제 브랜치와 상태를 확인한다.
- 구현 기준은 `codex/consolidate-friends-table`의 `353723e`. 이 커밋에 Web/PWA 및 P0–P2가 포함되어 있다.
- 단계: 웹/PWA 우선 비공개 베타 개발. Android/iOS 유지, 최대 6인 무료 가상 칩. 방에는 인증과 초대 코드가 필요하다.

## 상태 구분

| 범위 | 구현 | 자동 검증 근거 | 실기기 | 스테이징 / 운영 |
| --- | --- | --- | --- | --- |
| 방 생성·참가·복귀·홀덤·친구·본인-친구 전적 | 코드 존재 | 기존 기능/단계 보고서 | 현 작업 트리 기준 미확인 | 기능별 배포 SHA 미확인 |
| P0 템포·오디오·히스토리 | 통합 커밋에 포함 | P0 보고: TS, 서버 175/175, 모바일 47/47, 오디오/카드 재검증 21/21 | 미완료 | 배포 확인 없음 |
| P1 입력·키보드 레이아웃 | 통합 커밋에 포함 | P1 보고: TS, 서버 175/175, 모바일 50/50, 웹 export, Playwright Chrome 통과 | 미완료 | 배포 확인 없음 |
| P2 RPC 최종 보안 검증 | 로컬 PASS, 운영 RPC 설치·ACL 사용자 확인 | [11/18 재검증](p2-rpc-verification-2026-11-18.md): TS, 서버 178/178, 모바일 50/50, 웹 빌드, P1/P2 Chrome PASS | 운영 JWT E2E 미검증 | RPC 설치 사용자 보고 / 서버·웹 새 배포 미실행 |
| P2 설정·카드·친구끼리 전적 | 통합 커밋에 포함, RPC 설치 사용자 보고 | [P2 보고서](p2-ui-friend-comparison-report.md): TS, 서버 176, 모바일 50, 웹/native export, Chrome 6 viewport | 미검증 | 미배포 |

현재 P0/P1 보고서 모두 웹 export 성공을 명시한다. 이전 문서 정비의 P0 미명시 설명을 바로잡았다. P2에서도 별도 웹 export를 통과했다. Chrome fixture의 IME/Enter/Backspace, 100ms WebSocket 갱신 중 포커스, 가로·세로 키보드 시뮬레이션은 운영 로그인 E2E나 OS IME/실기기 검증이 아니다.

### 통합 검증의 범위

통합 작업 당시 격리 복제본에서 TypeScript, 서버 178/178, 모바일 50/50, Web·Android·iOS 번들, P1/P2 Chrome이 통과했다. 기존 설치 의존성을 사용했다. 문서 정비 중 이 제품 검증을 재실행하지 않았다. Desktop에서 새 설치 및 직접 실행, 실기기 및 운영 인증 검증은 남아 있다. 현재 npm 권고는 [npm 보안 감사](security/npm-audit.md)에 있다.

## 구현과 잔여 위험

- P0: 홀카드 360→240ms, 보드 540→360ms (모션 1.5배속). 공개/사운드 시작 동기화, 홀카드 피치 보정, 셔플 fade. 서버 nextHandAt 기준 10→5초 및 재접속 기한 유지. 오른쪽 히스토리 패널에 핸드·액션·공개 카드·사이드 팟·복수 승자·칩 변동 표시.
- 한계: 최근 10핸드·핸드당 최대 150이벤트. 전체 핸드 영구 보관은 미구현이며 SQLite 누적 전적과는 별개다. 서버 재시작 시 nextHandAt 자체는 checkpoint에 저장되지 않는다.
- P1: 웹 입력 원문/제출 검증/Enter, 프로필 재조회 중 입력 유지, revision 갱신 중 레이즈 편집 유지, RN Web IME 처리 유지. table/input viewport 분리, 모달 이동·스크롤, 키보드 닫힘 복원.
- 잔여 위험: 실제 Safari 주소창/키보드/회전/포커스 스크롤, 네이티브 입력 회귀, 오디오 클릭음·피치·시청각 동기화 미검증. 코드 수정과 사용자 기기에서의 해결 확인은 별개다.

## 우선순위

1. P0/P1 iPhone Safari·홈 화면 PWA, Android Chrome, Android/iOS 네이티브 입력·오디오 실기기 검증. PC 실제 한글 IME도 확인. [실기기 목록](web-device-checklist.md), [P1 세부 목록](p1-input-layout-report.md) 사용.
2. [npm 권고](security/npm-audit.md)를 분류하고 호환 수정안을 검증한다.
3. P2 설정 버튼·카드 무늬 로컬 개선 완료. 6인/가로/세로 브라우저 검증 완료, 실기기 확인 필요.
4. P2 친구끼리 전적 UI·API·세 관계 권한 SQL 초안 구현 및 로컬 테스트 완료. 2026-11-18 운영 RPC 설치와 ACL 확인을 사용자가 보고함. 실제 JWT E2E 및 설치된 정의 대조, 별도 서버/웹 배포 검토가 남음. [상세](p2-ui-friend-comparison-report.md).
5. 전체 핸드 보관: 보존 기간·용량·권한·페이지 조회 설계 후 별도 구현. 전체 영구 기록 확장은 P2 범위 밖.

## 배포 (로컬 구현과 독립)

| 환경 | 근거 | 판단 |
| --- | --- | --- |
| [웹 스테이징](https://friends-table-staging.pages.dev) | 사용자 제공 URL | 존재 보고. 현재 응답·SHA·포함 기능은 이번에 미확인 |
| [게임 서버](https://boardgameserver-production.up.railway.app) | 사용자 URL, 6단계 이력의 사용자 확인 SHA 9e741b2 | 현재 런타임 SHA 미확인. P0/P1 배포 완료로 표시 불가 |
| 운영 웹 | 확인 자료 없음 | 운영 릴리스 여부 미확인 |
| Supabase | 11/18 사용자 확인: can_compare_friend_stats 설치, anon/service_role EXECUTE false·authenticated true | RPC 정의/의존 함수·실제 JWT 요청은 독립 검증하지 않음 |

6단계의 배포 승인 대기/deploy/web-staging 브랜치는 당시 기록이다. 현재 스테이징 URL 보고를 부정하지 않으며 URL만으로 최신 코드 배포를 증명하지도 않는다. Railway main 자동 배포 enabled는 당시 사용자 확인값으로 현재 설정은 재확인 필요. main push/병합을 피하고 승인 전 배포/DB 변경을 하지 않는다. [배포 절차](web-deployment.md), [6단계 이력](web-phase6-deployment-readiness.md) 참조.
