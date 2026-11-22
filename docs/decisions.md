# 기술·제품 결정 기록

갱신: 2026-11-17 KST. 사용자 요구·기존 문서·코드에서 확인한 선택만 확정으로 분류한다. 대안은 비교 기록이며 당시 실제 평가했다는 뜻은 아니다. 변경 시 날짜·근거·대체 결정과 상태를 남긴다.

| 결정 / 상태 | 이유·근거 | 대안 | 영향 / 변경 시 고려 |
| --- | --- | --- | --- |
| 웹/PWA 우선, native 유지 / 채택 | 사용자 요구, web-pwa-migration, 플랫폼 분기 | native 전용 | 웹 저장·키보드·오디오와 native 회귀 각각 검증 |
| Expo / RN / RN Web 유지 / 채택 | 의존성 및 공통 UI 재사용 | 웹 전용 재작성 | SDK·모듈·브라우저 차이, lockfile 동기화 |
| Node HTTP + ws 권위 서버 / 채택 | lobby/holdem 상태·권한·정산 일원화 | 클라이언트 권위 | 프로토콜·재접속·단일 방 소유권 보존 |
| Supabase 인증·프로필·친구 / 채택 | accountSession, RLS/RPC | 자체 인증 | UUID·최신 로그인·친구 권한 유지, 변경 승인 |
| 익명 계정+닉네임 / 채택 | anonymous-auth, 간단한 진입 | 이메일/소셜 필수 | 데이터 삭제·기기 변경 복구 한계, 계정 자동 대체 금지 |
| 이메일 OTP 복구 / 보류 | 현재 UI 제거 및 사용자 요구 | OTP/계정 연결 도입 | 동일 UUID·메일 인프라·충돌·실기기 검증 설계 |
| 무료 가상 칩 / 채택 | 사용자 요구, 현재 현금/결제 없음 | 유료/현금 칩 | 경제 규칙 임의 변경 금지 |
| 친구끼리 비공개 방 / 제품 방향 채택 | 현재 인증+초대 코드, private-beta-deployment | 친구 관계 강제·방장 승인 | 친구 전용 권한 구현으로 오기 금지. 강화 시 서버/초대 호환성 검토 |
| Railway + Pages / 선택됨 | 6단계 및 사용자 URL 보고 | 과거 Render/VPS 후보 | 선택과 실제 배포 구분, main 자동 배포·볼륨·Origin·승인 확인 |
| 재사용 테스트 환경(Preview/Staging) / 채택 2026-11-22 | 반복 개발·배포 검증, 운영 데이터 보호. 11/18 별도 Staging 철회 중 서버·Supabase 부분과 "검증 후 테스트 리소스 삭제" 계획을 대체 | 운영 서버·Supabase 공유 검증, 검증마다 생성·삭제 | 별도 Railway 프로젝트(main 자동 배포 미연결)·별도 Supabase·별도 SQLite 볼륨·Pages Preview 별칭. Staging 전용 Git 브랜치는 만들지 않음. 운영 변경·push·리소스 삭제는 각각 별도 승인. [절차](deployment-workflow.md) |
| SQLite 상태/전적, 제한 리뷰 / 현 구현 유지 | stateStore/FriendStatsStore/lobby/hand | 전체 핸드 별도 보관 | 10핸드·150이벤트는 현 한계이며 영구 제품 정책 확정 아님. 보존·용량·권한·페이지 조회 설계 필요 |

근거: [웹 이행](web-pwa-migration.md), [익명 인증](anonymous-auth.md), [비공개 방](private-beta-deployment.md), [배포 선택](web-phase6-deployment-readiness.md), [P0](tempo-hand-history-report.md). P2 결정(2026-11-17): 제3자 전적은 A↔B·A↔C·B↔C가 모두 accepted일 때만 허용한다. 기존 공개 키/사용자 토큰을 유지하고 RLS 전체 공개나 service-role 도입 대신 boolean SECURITY DEFINER RPC를 추가하는 초안을 선택했다. 기존 SQLite·집계 정의를 유지하며 마지막 대결 시각은 저장 정보가 없어 제공하지 않는다. 카드 외곽/타이밍은 유지하고 공통 SVG의 작은 무늬를 개선했다. 로컬 검증 완료, SQL 운영 적용은 승인 대기. [P2 근거](p2-ui-friend-comparison-report.md). 미결정: 전체 기록 보존 기간. 이 문서는 구현/DB 변경 승인이 아니다.

2026-11-17 P2 보안 후속 결정: 서버 세션 검사만 신뢰하지 않고 permission RPC 직접 호출에도 006 read_account_session을 요구한다. STABLE 읽기 전용 검사, postgres owner, PUBLIC/anon/service_role revoke, 잔존 ACL 검사 채택. 의존성이 001/002에서 001~006으로 강화된다. 사용자 차단 모델을 임의로 가정하지 않으며 운영 카탈로그·차단 정책 확인 전 적용 판정을 보류한다. [근거](p2-rpc-security-review.md).
