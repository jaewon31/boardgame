# 프로젝트 문서 안내

갱신: 2026-11-22 KST. 공통 규칙은 [AGENTS.md](../AGENTS.md)(Claude Code는 [CLAUDE.md](../CLAUDE.md) 경유). 새 세션은 [AI 인계](ai/HANDOFF.md), [공통 개발 체크리스트](DEVELOPMENT_CHECKLIST.md)와 현재 상태부터 읽고 관련 문서만 추가로 읽는다.

| 문서 | 역할 / 갱신 조건 |
| --- | --- |
| [공통 개발 체크리스트](DEVELOPMENT_CHECKLIST.md) | **Claude Code·Codex 공통 작업 항목의 단일 기준.** 작업 ID·상태(BACKLOG~VERIFIED)·담당·완료 조건·검증 결과, Phase 1~4 계획. 작업 시작/종료 시 갱신, 새 요구사항도 여기에 추가 |
| [현재 상태](PROJECT_STATUS.md) | 브랜치·P0/P1/P2·검증·배포의 요약 현황표. 작업 항목 상태는 체크리스트가 우선. 상태 변경 시 갱신 |
| [개발·인수인계 절차](DEVELOPMENT_WORKFLOW.md) | 작업 브랜치·커밋 승인·검증 결과·다음 작업 전달 |
| [AI 인계](ai/HANDOFF.md) | Codex ↔ Claude Code 교대용 기준점·진행 중 작업·다음 할 일·승인 대기. 작업 시작/종료 시 갱신 |
| [npm 보안 감사](security/npm-audit.md) | 감사 범위·잠금 버전·후속조치 |
| [아키텍처](architecture.md) | 코드 책임·데이터 흐름·권한 경계. 구조/계약 변경 시 갱신 |
| [결정 기록](decisions.md) | 이유·대안·영향·상태. 결정 변경 시 대체 이력 기록 |
| [검증 절차](testing.md) | 실제 명령·수동 점검·결과 양식. 검증 방법 변경 시 갱신 |
| [문서 감사](documentation-audit.md) | 이번 정비의 불일치·에이전트 연결·보존 검증 이력 |
| [P0](tempo-hand-history-report.md), [P1](p1-input-layout-report.md) | 해당 작업 시점의 구현/테스트 근거. 배포 증거가 아님 |
| [P2 설치 후 재검증](p2-rpc-verification-2026-11-18.md) | 11/18 실행 결과·운영 ACL 사용자 확인·실제 JWT 미검증 구분 |
| [P2 RPC 보안](p2-rpc-security-review.md) | 운영 전 SQL·세션·권한 검증, 읽기 전용 preflight 및 적용 보류 조건 |
| [P2](p2-ui-friend-comparison-report.md) | 설정·카드·친구끼리 전적 구현/로컬 검증, SQL 초안 승인 대기 |
| [반복 배포 절차](deployment-workflow.md) | **현재 반복 배포 절차.** Production/Preview·Staging 환경 구성, 운영 보호, 표준 흐름·재배포 생략 조건, 중지·재시작(검증 전 실행 금지), Production 체크리스트, `deploy:preview` 자동화 계획(미구현) |
| [기존 서버 재사용 배포 계획](web-existing-server-runbook.md) | **Production 배포 계획.** 기존 Railway·Supabase·Pages 재사용, 승인 경계·확인 항목·데이터 보존 위험. 로컬 검증 미실행 |
| [Staging 계획 철회 안내](web-staging-runbook.md) | 별도 Staging 서버·Supabase·배포 브랜치 계획 철회(2026-11-18). 서버·Supabase 부분은 2026-11-22 재사용 테스트 환경 결정으로 대체. 이전 초안은 50ea5cd, 당시 [분리 계획](staging-environment-plan.md)은 이력 |
| [웹 배포](web-deployment.md) | 설정·운영 절차. 과거 후보 가격은 현재 견적이 아님 |
| [6단계 준비](web-phase6-deployment-readiness.md) | 당시 원격 점검/승인 대기 이력. 최신 상태와 구분 |
| [실기기 체크리스트](web-device-checklist.md) | 기기별 수동 검증. 실제 실행한 항목만 표시 |

## 기존 문서의 역할

- web-pwa-migration 및 web-phase2~5-validation: 단계별 설계/검증 이력. 과거 통과를 현재 P0/P1 통과로 승격하지 않는다.
- [익명 인증](anonymous-auth.md)이 현재 인증 흐름. accounts-setup, single-session-setup, account-session-repair, friends-setup은 도입/수정 이력과 SQL 근거이며 현재 코드와 대조한다. SQL 실행은 별도 승인 대상이다.
- [전적](friend-stats.md), [방 복귀](room-return-settings.md), [방 수명](room-lifecycle.md): 기능 상세. 인증 방식·환경·테스트 수는 작성 당시 값일 수 있다.
- private-beta-deployment, cloud-multiplayer-validation: 초기 서버/네이티브 배포 절차와 이력. 현재 선택은 decisions, 배포 상태는 project-status를 우선한다.
- 오디오 보고서와 JSON: 조사·라이선스·검증 근거. 최신 P0 타이밍은 P0 보고서 및 코드 기준.
- mobile-poker-ui-review, web-ad-monetization: 검토 자료이며 구현 완료나 도입 승인이 아니다.
- android-sdk58-render-error: 과거 네이티브 오류 조사이며 현 브랜치 실기기 통과 증거가 아니다.

## 최신성 유지

변경한 책임 영역만 수정하고 날짜(KST), 브랜치/SHA, dirty 여부, 근거 경로, 결과·미실행 항목을 남긴다. 과거 보고서 본문을 새 결과로 덮어쓰지 않는다. 상충하면 실제 코드/최근 검증을 조사하고 이력과 현재를 구분한다. 키·토큰·개인정보 없이 기록한다. 세션 기억에만 의존하지 않는다.
