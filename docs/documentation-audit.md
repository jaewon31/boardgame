# 문서 체계 정비 기록

완료 기준일: 2026-11-17 KST. 11월 16일 조사 시작 후 이어서 완료. 범위는 문서만이며 게임 기능·엔진·프로토콜·설정·의존성을 변경하지 않았다.

## 저장소와 보존

실제 저장소는 play-ui-refresh, 브랜치는 codex/tempo-hand-history, HEAD 89229f5다. 상위 앱 폴더는 커밋 없는 master이며 friends-table은 초기 사본이다. 실제 저장소를 찾은 뒤 그곳에서만 문서를 수정했다.
최근 커밋은 89229f5, a666688, ce5605d, 9e741b2, b01e1fe 순으로 확인했다.
시작 당시 18개 추적 코드/테스트 파일 수정과 신규 webViewport.ts, browser fixture, 두 P0/P1 보고서, scripts/test-input-browser.cjs가 있었다. 완료 시에도 동일한 코드/테스트 수정 및 미추적 상태를 확인했다. 쓰기 작업은 아래 Markdown에만 한정했다. 특히 useWebLayout.web.ts와 webViewport.ts의 기존 수정 시각은 각각 11월 16일 23:19:35, 23:13:17로 문서 작성 이전 상태다.
초기 파일 해시를 임시 디렉터리에 기록했으나 후속 실행의 임시 경로에서 재조회할 수 없어 전체 파일의 시작/종료 해시 일치 검증은 완료하지 못했다. 따라서 보존 근거는 문서 전용 쓰기 범위, Git 변경 목록 및 대상 파일 수정 시각이며 전수 해시 비교 통과라고 주장하지 않는다. 초기화·checkout·게임 파일 쓰기는 수행하지 않았다.

## 생성·수정 목록

| 구분 | 파일 | 역할 |
| --- | --- | --- |
| 신규 | docs/README.md | 문서 지도·최신성 관리 |
| 신규 | docs/PROJECT_STATUS.md | 현재 단계·P0/P1/P2·검증·배포 분리 |
| 신규 | docs/architecture.md | 실제 소스 기반 흐름·보안 경계·Mermaid |
| 신규 | docs/decisions.md | 결정·근거·대안·영향·상태 |
| 신규 | docs/testing.md | 실제 명령·버전·수동 검증·결과 양식 |
| 신규 | docs/documentation-audit.md | 이번 감사·변경·검증 근거 |
| 수정 | AGENTS.md | 공통 시작/완료/보존/승인 규칙 |
| 수정 | README.md | SDK·제품 범위·재접속·타이머·저장·인증 설명 정정 |
| 수정 | GITHUB_WORKFLOW.md | 무조건 main 전환/병합/push 흐름 제거, 승인 경계 |
| 수정 | docs/web-deployment.md | 과거 후보/가격·현재 상태 분리 안내 |
| 수정 | docs/web-phase6-deployment-readiness.md | 당시 보고임을 명시, 최신 상태 연결 |
| 수정 | docs/private-beta-deployment.md | 초기 배포 대안·현재 운영 지침 구분 |
| 수정 | docs/friend-stats.md | 과거 Google 계정 검증과 현재 익명 인증 구분 |

CLAUDE.md의 단일 @AGENTS.md는 그대로 보존했다. .claude/settings.json의 Expo 플러그인 설정과 .github/workflows/check.yml도 변경하지 않았다. 새 자동화/CI는 추가하지 않았다.

## 발견한 불일치와 중복

- AGENTS/README의 Expo 57 안내는 실제 Expo 58.0.22와 불일치하여 정정. React 19.3.0, RN 0.88.1, RN Web 0.21.4, TS 6.0.3, Supabase JS 2.118.0을 manifest/lock/설치에서 대조. 서버 ws는 workspace 해석 결과 8.22.1이며 루트 ws 7.5.13과 다르다.
- README의 10초 다음 핸드, 30초 복귀, 메모리 전용 상태, 계정 미구현, 미배포 단정은 현재 코드/사용자 보고와 달라 정정. 행동 제한 기본 30초는 다른 개념이므로 유지.
- GITHUB_WORKFLOW의 로그인/게임 후속 작업 설명은 오래되어 현재 상태로 연결. main 전환·push·merge 안내는 현재 승인 정책과 충돌하여 수정.
- 친구 전적은 이미 구현되어 있다. P2 전체를 신규 전적 구현으로 기록하지 않고 기존 기능 접근성 및 제3자 두 친구 조회 검토로 분리.
- 친구끼리 게임은 제품 목적이지만 실제 방 참가 조건은 인증+초대 코드다. 친구 관계 강제 권한을 구현 완료로 기록하지 않음.
- P0/P1 보고서는 존재하지만 미추적이다. 자동 통과 기록은 보고 당시 결과이며 이번 재실행 결과가 아님. P0 웹 빌드 통과는 사용자 보고에만 있고 P0 검증 목록에는 없음. P1에는 명시됨.
- 6단계 보고서의 브랜치/미커밋/승인 대기와 현재 사용자 스테이징 URL 보고를 구분. 원격 런타임 SHA·현재 배포 기능은 미확인.
- 웹 배포/6단계/비공개 배포는 운영 설명이 겹친다. 삭제하거나 복제하지 않고 현재 상태→절차→과거 근거로 역할 분리.
- 계정 설정은 이미 익명 인증 문서로 안내하고 있어 중복 정정하지 않음. 오디오 및 웹 단계 보고서의 옛 수치/검증 수는 당시 이력으로 보존.

## 에이전트 연결 (공식 문서 확인)

- Codex: 저장소를 작업 디렉터리로 열고 AGENTS.md를 공통 진입점으로 사용한다. 상위/하위 및 override 지침, 사용자 설정의 영향을 받으므로 모든 환경에서 같은 파일만 자동 로드된다고 단정하지 않는다. [공식 AGENTS 안내](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- Claude Code: 기존 CLAUDE.md의 @AGENTS.md import 유지. 상대 import가 공식 지원되지만 사용 중인 버전/메모리 설정에서 실제 로드 여부는 확인해야 한다. [공식 memory 문서](https://code.claude.com/docs/en/memory).
- 기타 에이전트: 자동 인식을 가정하지 않고 AGENTS.md와 docs/README.md를 명시적으로 읽도록 요청한다.

작업 완료 시 모든 문서를 수정할 필요는 없다. 상태/검증은 project-status, 구조는 architecture, 결정은 decisions, 명령은 testing, 상세 근거는 해당 기능 보고서를 선택하여 코드와 함께 검토한다.

## 검증 및 후속 우선순위

문서 상대 링크와 AGENTS 참조 대상 존재, manifest/lock/설치 버전, 테스트 script/CI 경로, P0/P1 코드·보고 상태, Git 변경 목록을 검사했다. git diff --check는 통과했으며 기존 코드 파일의 LF/CRLF 경고는 내용 수정 없이 남겨두었다. 민감정보 패턴 검사와 수동 검토에서 신규 비밀키·토큰·개인정보를 기록하지 않았다. 외부 배포 절차/가격의 최신 유효성까지 재검증한 것은 아니다.
전체 테스트는 문서 전용 변경이므로 재실행하지 않았다. 커밋·원격 push·main 병합·배포·Supabase 변경·운영 데이터 변경은 모두 수행하지 않았다.

1. 우선: 현재 P0/P1 실기기·오디오 검증과 환경별 증거 기록. 미검증을 통과로 바꾸지 않는다.
2. 다음: 사용자 승인된 읽기 전용 배포 확인으로 웹/서버 SHA·Supabase 적용 이력·볼륨/Origin 상태를 현황표에 연결. 이후 커밋/배포는 별도 승인.
3. 다음: P2 UI/카드/전적 권한 범위 결정, 전체 핸드 저장 설계.
4. 필요성이 생길 때: 오래된 보고서 분류 확대와 가벼운 링크 검사 자동화 검토. 지금은 작업 규칙과 단일 현황표로 관리한다.
