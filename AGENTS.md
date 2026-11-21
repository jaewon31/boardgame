# Friends Table AI 작업 지침 (Codex · Claude Code 공통)

친구끼리 즐기는 최대 6인 비공개 텍사스 홀덤. 무료 가상 칩, 웹/PWA 우선이며 Android/iOS 호환성을 유지한다. 현재 방 입장은 인증 + 초대 코드이며 친구 관계를 강제하지 않는다.

## 구조

- apps/mobile/: Expo / React Native / React Native Web 화면·입력·오디오·클라이언트 상태.
- apps/server/: Node HTTP/WebSocket, 게임 규칙·권한·동기화·SQLite 상태 및 전적.
- packages/shared/: TypeScript 프로토콜·공통 타입. Supabase는 인증·프로필·친구 RLS/RPC 담당.
- supabase/: SQL 이력, scripts/: 빌드·검증, deploy/: 배포 예시, .github/: CI, docs/: 설계·현황·근거.
- 버전은 package.json, lockfile, 해당 workspace에서 해석되는 설치 패키지를 대조한다. 현재 Expo 58 계열이다. SDK 57 지침은 폐기하며 API 변경 시 설치 버전의 공식 문서를 확인한다.

## 시작 순서

1. 저장소 루트, git status --short, git branch --show-current, git log -5 --oneline 확인. 미커밋·미추적 변경을 보존하고 reset하거나 다른 브랜치로 덮어쓰지 않는다.
2. [현재 상태](docs/PROJECT_STATUS.md), [문서 안내](docs/README.md)와 [개발·인수인계 절차](docs/DEVELOPMENT_WORKFLOW.md)를 읽는다.
3. 관련 코드·테스트·의존성·기존 동작을 확인한다. [아키텍처](docs/architecture.md), [결정 기록](docs/decisions.md) 참조.
4. 수정 범위·회귀 위험을 확인하고 보고와 코드가 다르면 차이를 기록한다.

## 보존 및 승인 경계

- 작업 범위에 해당하는 파일만 수정한다. 승인된 작업 브랜치를 사용하고 강제 초기화·정리, 타 작업 변경 덮어쓰기, 강제 푸시를 금지한다.
- 환경파일(.env.local 포함), SQLite 및 기타 DB 파일, 인증키와 토큰, Supabase 연결 캐시와 생성물을 Git에 추가하지 않는다. npm 보안 패치는 기능 변경과 분리하며, `npm audit fix --force`를 자동 실행하지 않는다. [npm 감사 기록](docs/security/npm-audit.md)을 확인한다.

- 기존 게임 규칙·칩 정산, 계정 소유권·친구 권한과 서버 검증을 보존한다. 클라이언트 검증은 서버 권한 검증을 대체하지 않는다.
- 비공개 홀카드를 타인에게 노출하지 않는다. 서버 저장 레코드를 응답에 직접 펼치지 않는다.
- WebSocket 구·신 클라이언트 호환성과 웹 변경의 네이티브 회귀를 검토한다. 기존 테스트를 삭제하거나 무력화하지 않는다.
- 사용자 명시적 승인 없는 Railway/Cloudflare 배포, Supabase DB·인증·RLS·보안 설정 변경, 원격 push 금지. main 병합·push는 기본 금지이며 별도 명시적 승인 대상이다. Railway 자동 배포를 유발할 수 있다.
- 운영 데이터 삭제·초기화 금지. Production Supabase 및 운영 서버 설정 변경에는 사용자 명시적 승인이 필요하다. 커밋은 사용자 별도 승인 후 수행한다. 문서의 배포 명령은 실행 허가가 아니다.
- 문서/로그에 비밀키·토큰·개인정보를 넣지 않는다.

## AI 교대 개발·검수 (Codex ↔ Claude Code)

- 이 파일이 두 AI의 공통 규칙이다. Claude Code는 [CLAUDE.md](CLAUDE.md)가 이 파일을 불러오며, 도구별 차이만 그 파일에 둔다.
- 두 AI는 같은 브랜치에서 교대로 작업할 수 있다. 같은 작업본을 동시에 수정하지 않는다. 병렬 작업이 필요하면 사용자 승인 후 `git worktree`로 폴더를 분리한다.
- 브랜치: `codex/`, `claude/` 접두사 모두 허용한다. 신규 브랜치는 AI 이름보다 작업 목적으로 이름 짓는다(예: `fix/multiplayer-stability`, `fix/invite-routing`, `feat/table-ui`, `refactor/websocket-auth`). 기존 브랜치 이름은 바꾸지 않는다. 브랜치 생성·전환은 사용자 승인 후 한다.
- 시작 시 [AI 인계](docs/ai/HANDOFF.md)를 읽고 `git status`와 대조한다. 종료 시 인계 문서의 기준점·현재 작업을 갱신하고 양식에 따라 기록한다.
- 상대 AI의 변경은 인계 문서 서술을 믿지 말고 diff와 테스트로 독립 검수한다. 검수 결과와 미검증 항목도 인계 문서에 남긴다.
- 작성자를 알 수 없는 미커밋 변경은 사용자 작업으로 간주해 덮어쓰거나 커밋에 섞지 않는다. 겹치면 편집을 멈추고 보고한다.

## 완료 순서

코드 수정 → [관련 테스트](docs/testing.md) → 결과 검증 → 관련 문서 갱신 → 실패·미검증·남은 작업 기록 → Git 변경사항 보고.
모든 작업에서 모든 문서를 수정하지 않는다. 코드 변경 없이 문서만 갱신할 수 있다. 불필요한 자동화/CI를 추가하지 않는다.
구현·자동 검증·실기기·스테이징·운영 배포를 분리한다. 검증하지 않은 내용을 사실로 기록하지 않는다.
현재 상태는 PROJECT_STATUS, 구조는 architecture, 결정은 decisions, 명령은 testing, 세부 근거는 기능 보고서에 기록한다. 상세 내용은 복제하지 말고 연결하고, 해당 코드 작업과 함께 검토·커밋할 수 있게 준비한다.
