# Friends Table 공통 개발 체크리스트 (Claude Code · Codex)

작성: 2026-11-23 17:45 KST · Claude Code · 기준 브랜치 `fix/multiplayer-stability` / HEAD `8b34827` (작성 시 dirty: `docs/ai/HANDOFF.md` 수정, `supabase/migrations/007_friend_stats_permission.sql` 미추적 — 이 문서 작업과 무관, 보존)

이 문서는 Claude Code와 Codex가 함께 쓰는 **작업 항목 상태의 단일 기준**이다. 작업 ID·상태·담당·완료 조건·검증 결과는 여기서만 확정한다. 다른 문서와의 역할 구분:

| 문서 | 담는 것 | 이 문서와의 관계 |
| --- | --- | --- |
| [AGENTS.md](../AGENTS.md) | 두 AI 공통 규칙·승인 경계 | 규칙의 원본. 여기서는 체크리스트 운영 규칙만 둔다 |
| [AI 인계](ai/HANDOFF.md) | 세션 단위 기준점, 진행 중 세부 기록, 원격 리소스 ID, 인계 기록 | 상세 근거·측정값은 인계 문서에 두고 여기서는 링크한다 |
| [현재 상태](PROJECT_STATUS.md) | 기능·배포 요약 현황 | 요약. 작업 항목 상태가 다르면 이 문서가 우선하고 차이를 기록한다 |
| [검증 절차](testing.md) · [실기기 체크리스트](web-device-checklist.md) | 명령·수동 시나리오·결과 양식 | 검증 방법의 원본. 여기서는 어떤 항목을 검증하는지만 연결한다 |
| [결정 기록](decisions.md) | 정책·설계 결정 | 항목이 결정을 기다리면 결정 후 그곳에 기록하고 여기서 링크한다 |

---

## 1. 운영 규칙

### 1.1 상태

| 상태 | 의미 | 체크박스 |
| --- | --- | --- |
| `BACKLOG` | 향후 개발 예정. 요구사항·선행 조건 미확정 | `[ ]` |
| `READY` | 요구사항과 선행 조건 확인 완료, 착수 가능 | `[ ]` |
| `IN_PROGRESS` | 담당자가 진행 중 (담당·시작 시각 필수) | `[ ]` |
| `IMPLEMENTED` | 구현 완료, 정의된 검증 미완료 | `[ ]` |
| `VERIFIED` | 완료 조건의 검증을 모두 통과(근거 필수) | `[x]` |
| `BLOCKED` | 선행 작업·결정·문제로 진행 불가 (사유 필수) | `[ ]` |
| `REOPENED` | 완료 후 문제 발견 (발견 근거·새 버그 ID 필수) | `[ ]` |
| `CANCELLED` | 취소 (사유·결정자 필수) | `[ ]` |

- `[x]`는 `VERIFIED`에서만 쓴다. 자동화 테스트·단일 PC 브라우저·봇 테스트만 통과한 항목은 실기기 검증이 완료 조건에 있으면 `VERIFIED`로 올리지 않는다.
- 요구사항이 불명확한 항목은 `BACKLOG`로 두고 **확인 필요** 표시와 질문을 적는다. 확인 전에는 구현하지 않는다.
- 상태를 내릴 때(`VERIFIED`→`REOPENED` 등)는 기존 검증 기록을 지우지 않고 아래에 새 기록을 덧붙인다.

### 1.2 ID

- 형식 `FT-<분류>-<3자리>`. 분류: `BUG`(결함), `TEST`(검증 작업), `OPS`(환경·배포·저장소 관리), `UI`, `ANIM`, `SOCIAL`, `FEAT`(그 외 기능).
- 새 ID는 해당 분류의 **최대 번호 + 1**. 기존 ID는 변경·재사용하지 않는다. 취소된 ID도 남긴다.
- 서로 다른 브랜치에서 같은 번호가 발급되면 병합 시 나중에 병합되는 쪽이 번호를 다시 발급하고, 원래 번호를 "이전 ID"로 남긴다.

### 1.3 항목 필드

모든 항목은 4~7절의 상세 블록에 다음을 가진다: ID · 작업명 · 우선순위 · 상태 · 담당 · 관련 파일/모듈 · 선행 · 구현 범위 · 완료 조건 · 검증 방법 · 검증 결과 · 관련 커밋/보고서. 아직 정할 수 없는 필드는 `미정`으로 쓰고 비우지 않는다.

- 우선순위: `P0` 게임 무결성·데이터·보안 / `P1` 실사용 차단·주요 체감 문제 / `P2` 개선 / `P3` 검토·향후
- 담당: `Claude Code`, `Codex`, `사용자`(실기기·청취·결정), `미지정`

### 1.4 작업 절차 (두 AI 공통)

**시작 전**
1. `git status --short --branch`, `git branch --show-current`, `git log -5 --oneline`으로 상태 확인. 미커밋·미추적 변경은 보존한다.
2. 이 문서와 [AI 인계](ai/HANDOFF.md)를 읽고 `git status`와 대조한다.
3. 대상 항목의 선행 조건과 상태 확인. `IN_PROGRESS`이고 담당이 다른 AI면 착수하지 않고 사용자에게 확인한다.
4. 관련 코드·문서 확인 후 작업 범위와 완료 조건을 확정한다(사용자 요청 범위 밖은 하지 않는다).

**진행 중**
5. 착수 시 상태를 `IN_PROGRESS`, 담당과 시작 시각(KST)·브랜치를 기록한다.
6. 승인된 범위만 수정한다. 서버 게임 규칙·칩 정산·권한 검증 변경이 필요하면 이유와 영향을 먼저 보고하고 승인을 받는다.
7. 새 버그는 새 ID로 등록한다. 범위가 바뀌면 기존 블록을 덮어쓰지 말고 "변경 이력" 줄을 추가한다.

**종료 시**
8. 변경 파일, 실행한 테스트(명령·환경·통과/실패 수), 미실행·미검증 범위, 커밋 해시를 해당 항목 "검증 결과"에 기록한다. 실패·미실행은 숨기지 않는다.
9. 상태를 갱신한다(대부분 `IMPLEMENTED`. `VERIFIED`는 완료 조건 전부의 근거가 있을 때만).
10. 남은 위험·후속 작업을 새 항목 또는 해당 항목에 기록하고, 8절 작업 이력과 [AI 인계](ai/HANDOFF.md) 5절 양식에 인계를 남긴다.

### 1.5 충돌 방지

- 담당 기록은 파일 잠금이 아니다. 작업 시작·커밋 전에 `git status`와 `git diff`로 실제 충돌을 확인한다.
- 같은 항목을 두 AI가 동시에 구현하지 않는다. 같은 작업본을 동시에 쓰지 않으며, 병렬 작업은 사용자 승인 후 `git worktree`로 분리한다([AGENTS.md](../AGENTS.md)).
- 다른 브랜치에서 이 문서가 바뀌었으면 병합 시 항목별로 대조한다. "최신 파일로 통째 덮어쓰기"를 하지 않는다. 같은 항목의 상태가 다르면 근거가 있는 쪽을 따르고, 판단할 수 없으면 두 기록을 모두 남기고 사용자에게 보고한다.
- 작성자를 알 수 없는 미커밋 변경은 사용자 작업으로 간주해 보존한다. force push, `reset`, `clean`, 임의 `checkout`을 하지 않는다. 충돌이 나면 임의로 해결하지 말고 파일과 영향을 보고한다.

### 1.6 새 요구사항 등록

새 체크리스트 파일을 만들지 않고 이 문서에 추가한다. ① 기존 항목과 중복 확인(있으면 그 항목에 변경 이력 추가) → ② ID 발급 → ③ 분류·우선순위·선행 → ④ 구현 범위·완료 조건 → ⑤ 담당(미정이면 `미지정`) → ⑥ 관련 문서 링크 → ⑦ 요약표에 행 추가 → ⑧ 8절 작업 이력에 한 줄.

---

## 2. 현재 프로젝트 상태 (2026-11-23 17:45 KST)

### 2.1 확인된 구현 상태

- 구조: `apps/mobile`(Expo 58 / RN Web, 화면·입력·오디오), `apps/server`(Node HTTP/WebSocket, 게임 규칙·권한·SQLite), `packages/shared`(프로토콜 타입), `supabase`(인증·프로필·친구 RLS/RPC). 상세는 [아키텍처](architecture.md).
- 존재하는 기능(코드 확인): 익명 로그인·닉네임, 방 생성·초대 코드·초대 링크, 최대 6인 홀덤(올인·사이드팟·스플릿·런아웃·리버 스퀴즈), 쇼다운 참여자의 본인 패 공개(`revealCards`), 칩 리셋(`resetChips`), 핸드 리뷰(최근 10핸드), 친구·친구 전적 비교, 효과음(음소거·전체 음량 4단계·효과음별 음량), 턴 타이머 바, 닉네임 이니셜 아바타, 베팅 프리셋 패널.
- 없는 기능(코드 검색 결과 관련 메시지·화면 없음): 채팅, 이모티콘·리액션, 쇼다운 없는 핸드의 SHOW/MUCK, 래빗 헌팅, 칩 이동 애니메이션, 애니메이션 강도 설정, 핸드 리플레이·공유.

### 2.2 최근 검증 결과와 범위

| 일시 (KST) | 대상 | 범위 | 결과 | 근거 |
| --- | --- | --- | --- | --- |
| 11-22 | `290cb8a` | 로컬 4인 headless Chrome E2E(로컬 서버·인증 대체) 7핸드 | 통과. 카드 공개 p50 10–12ms, 늦은 액션음 0/351. 청취 불가 | [인계](ai/HANDOFF.md) 5절 11-22 20:30 기록, [testing](testing.md) |
| 11-23 14:20 | 테스트 Railway 서버(`290cb8a`) | health·Origin 허용/거부·인증 거부·Supabase 연결 | 통과 | [인계](ai/HANDOFF.md) 2절 "서버 단독 검증" |
| 11-23 15:18 | Preview 웹(HEAD `8b34827`, 앱 코드는 `290cb8a`와 동일) + 테스트 서버 | 2인(A 실제 UI, B 프로토콜 봇) 4핸드, 초대 링크 재입장, 새로고침·재접속 | 통과. B UI 미검증 | [인계](ai/HANDOFF.md) 2절 "2인 E2E" |
| 11-23 15:50 | 위와 동일 | 4인(A 실제 UI, 봇 3) 6핸드: 액션·올인·사이드팟·순환·칩 보존·끊김·새로고침·초대 링크 | 12항목 통과. 봇 UI·청취·실기기 미검증 | [인계](ai/HANDOFF.md) 2절 "4인 E2E" |

모든 E2E는 **한 PC의 내장 브라우저**에서 실행했다(실제 사람 4명이 서로 다른 기기·네트워크로 한 테스트가 아님).

### 2.3 실기기 검증 여부

**미완료.** 현재 수정본(카드 공개·효과음 분리 `21c7297`, 초대 링크 `86656e4`, 재접속 `29085e1` 포함)은 사용자의 실제 플레이 검증이 끝나지 않았다. iPhone Safari·PWA, Android Chrome, 서로 다른 기기·네트워크, 실제 청취, 5~6인은 모두 미검증이다. [실기기 체크리스트](web-device-checklist.md)의 항목도 전부 미검증 상태다.

### 2.4 미해결 버그·결정 대기

- `FT-BUG-004` 끊긴 플레이어 차례 처리 정책 — 사용자 결정 대기
- `FT-BUG-005` WebSocket 메시지마다 Supabase 인증 RPC 호출(측정 `authMs` p50 53.7 · p95 163.4 · max 330.2 ms)
- `FT-BUG-007` 앱 화면 클릭 중 OS 클립보드 쓰기 경고 1회 관찰(원인 미확인)
- `FT-BUG-001~003, 006` 구현 완료, 실기기 검증 대기

### 2.5 다음 개발 착수 조건 (Phase 게이트)

- **Phase 2 이후(UI·애니메이션·소셜)는 Phase 1의 실플레이 검증(`FT-TEST-001`)이 끝나고 사용자가 착수를 승인하기 전까지 시작하지 않는다.** 분석·설계 문서 작성도 사용자 요청이 있을 때만 한다.
- 실플레이에서 발견된 문제는 새 `FT-BUG` 항목으로 등록하고, 관련 기존 항목은 `REOPENED`로 바꾼다. P0·P1 버그가 열려 있으면 Phase 2 착수 전에 처리 여부를 사용자와 정한다.

### 2.6 기존 문서 간 차이 (근거 없이 한쪽을 정답으로 정하지 않음)

| 위치 | 기록 | 실제 확인 | 처리 |
| --- | --- | --- | --- |
| [인계](ai/HANDOFF.md) 1절 "미커밋 변경: 없음 예정" (11-22 22:57 갱신) | 미커밋 없음 | 11-23 17:45 `git status`: HANDOFF 자체 수정 + `007` 마이그레이션 미추적 | 인계 2절 본문(11-23 기록)이 더 최신. 1절 갱신은 해당 작업자 몫, 이 작업에서는 미수정 |
| [인계](ai/HANDOFF.md) 3절 표 #2·#3 "수정(미커밋)" | 미커밋 | 커밋 `21c7297` 존재, 같은 문서 2절은 "완료(`21c7297`)" | 3절 표가 오래된 서술로 보임. 미수정 |
| [현재 상태](PROJECT_STATUS.md) 갱신일 11-18 | 테스트 환경 "구축 미완료" | 인계 문서 11-23 기록: 구축·배포·E2E 진행 | 이 체크리스트에서 링크로 연결, 요약표 갱신은 별도 작업(`FT-OPS-007`) |
| `supabase/drafts/007_*` vs `supabase/migrations/007_*` | 문서 다수가 draft 경로 참조 | 두 파일 존재, 본문 동일(인계 기록), migrations 쪽은 미커밋 | `FT-OPS-002` |

---

## 3. 요약표

| ✓ | ID | 작업명 | 우선 | 상태 | 담당 | 선행 |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | FT-TEST-001 | 4~6인 실제 멀티플레이 검증(실기기·서로 다른 네트워크) | P0 | IN_PROGRESS | 사용자 | — |
| [ ] | FT-TEST-002 | 입장·퇴장·재접속 | P0 | READY | 사용자 | — |
| [ ] | FT-TEST-003 | 새로고침 후 게임 상태 복원 | P0 | READY | 사용자 | — |
| [ ] | FT-BUG-001 | 플랍·턴·리버 공개 지연 | P1 | IMPLEMENTED | — | — |
| [ ] | FT-TEST-004 | 턴 진행·타이머 동기화(타임아웃 포함) | P0 | READY | 사용자 | — |
| [ ] | FT-TEST-005 | 액션 버튼과 서버 처리 일치 | P0 | READY | 사용자 | — |
| [ ] | FT-TEST-006 | 칩 총합 보존 | P0 | READY | 사용자 | — |
| [ ] | FT-TEST-007 | 올인·사이드팟 정산 | P0 | READY | 사용자 | — |
| [ ] | FT-TEST-008 | 쇼다운·승자 판정 | P0 | READY | 사용자 | — |
| [ ] | FT-BUG-002 | 게임 효과음–카드 표시 동기화 | P1 | IMPLEMENTED | — | — |
| [ ] | FT-TEST-009 | 효과음 실제 청취 평가 | P1 | READY | 사용자 | FT-BUG-002 |
| [ ] | FT-TEST-010 | 모바일 브라우저·PWA 검증 | P1 | READY | 사용자 | — |
| [ ] | FT-BUG-003 | 초대 링크 `/join/*` 404 | P1 | IMPLEMENTED | — | — |
| [ ] | FT-BUG-004 | 연결 끊긴 플레이어 차례 처리 | P1 | BLOCKED | 미지정 | 사용자 정책 결정 |
| [ ] | FT-BUG-005 | WS 메시지별 Supabase 인증 지연 | P1 | BACKLOG | 미지정 | 설계 결정 |
| [ ] | FT-BUG-006 | 재접속 교체 경쟁(4001) | P0 | IMPLEMENTED | — | — |
| [ ] | FT-BUG-007 | 앱 화면 클릭 중 OS 클립보드 쓰기 경고 | P2 | BACKLOG | 미지정 | 재현 |
| [ ] | FT-TEST-011 | 친구 전적 비교 실제 JWT E2E | P2 | BACKLOG | 미지정 | FT-OPS-002 |
| [ ] | FT-OPS-001 | 테스트 환경 중지·재시작 데이터 보존 검증 | P2 | BACKLOG | 미지정 | — |
| [ ] | FT-OPS-002 | 007 마이그레이션 정식 등록·draft 경로 정리 | P2 | BLOCKED | 미지정 | 사용자 승인 |
| [ ] | FT-OPS-003 | GitHub 원격 백업 push | P2 | BLOCKED | 사용자 | 사용자 결정(보류) |
| [ ] | FT-OPS-004 | Windows·Node 24에서 로컬 4인 E2E 실행기 실행 | P2 | READY | 미지정 | — |
| [ ] | FT-OPS-005 | Codex의 AGENTS.md 실제 로딩 확인 | P2 | BLOCKED | Codex | 2026-11-25 이후 사용량 |
| [ ] | FT-OPS-006 | npm 감사 권고 분류·호환 수정안 | P3 | BACKLOG | 미지정 | — |
| [ ] | FT-OPS-007 | PROJECT_STATUS 현황표 갱신 | P3 | READY | 미지정 | — |
| [ ] | FT-UI-001 | 액션 버튼–게임 로직 연결 분석·UI 변경 범위 결정 | P1 | BACKLOG | 미지정 | Phase 1 게이트 |
| [ ] | FT-UI-002 | 디자인 방향·색상·토큰 정의(독자 디자인) | P1 | BACKLOG | 미지정 | FT-UI-001 |
| [ ] | FT-UI-003 | 세로형 테이블·최대 6인 좌석 배치 | P1 | BACKLOG | 미지정 | FT-UI-002 |
| [ ] | FT-UI-004 | 플레이어 아바타·칩 정보 | P2 | BACKLOG | 미지정 | FT-UI-003 |
| [ ] | FT-UI-005 | 카드·팟 가독성 | P1 | BACKLOG | 미지정 | FT-UI-003 |
| [ ] | FT-UI-006 | 액션 바(Fold/Check/Call/Bet/Raise/All-in) | P1 | BACKLOG | 미지정 | FT-UI-001 |
| [ ] | FT-UI-007 | 베팅 슬라이더·금액 프리셋 | P1 | BACKLOG | 미지정 | FT-UI-006 |
| [ ] | FT-UI-008 | 다양한 모바일 화면 크기 대응·검증 | P1 | BACKLOG | 미지정 | FT-UI-003~007 |
| [ ] | FT-ANIM-001 | 서버 상태–시각 연출 분리 구조 설계 | P1 | BACKLOG | 미지정 | Phase 1 게이트 |
| [ ] | FT-ANIM-002 | 카드 배분 애니메이션 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-003 | 플랍·턴·리버 공개 연출 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-004 | Fold 시 카드 이동 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-005 | Call/Bet/Raise 칩 이동 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-006 | All-in 칩 연출 | P3 | BACKLOG | 미지정 | FT-ANIM-005 |
| [ ] | FT-ANIM-007 | 중앙 팟 형성 | P2 | BACKLOG | 미지정 | FT-ANIM-005 |
| [ ] | FT-ANIM-008 | 팟 승리 후 칩 이동 | P2 | BACKLOG | 미지정 | FT-ANIM-007 |
| [ ] | FT-ANIM-009 | 사이드팟별 수령자 연출 | P1 | BACKLOG | 미지정 | FT-ANIM-008 |
| [ ] | FT-ANIM-010 | 쇼다운·승리 연출 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-011 | 현재 턴 플레이어 강조 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-012 | 턴 타이머 애니메이션 | P2 | BACKLOG | 미지정 | FT-ANIM-011 |
| [ ] | FT-ANIM-013 | 리바이 칩 충전 연출 | P3 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-014 | 효과음–애니메이션 동기화 | P1 | BACKLOG | 미지정 | FT-ANIM-002~013 |
| [ ] | FT-ANIM-015 | 애니메이션 강도·음량 설정 | P2 | BACKLOG | 미지정 | FT-ANIM-001 |
| [ ] | FT-ANIM-016 | 모바일 웹/PWA 성능 검증 | P1 | BACKLOG | 미지정 | FT-ANIM-002~015 |
| [ ] | FT-SOCIAL-001 | 방 내부 실시간 채팅 | P2 | BACKLOG | 미지정 | Phase 1 게이트 |
| [ ] | FT-SOCIAL-002 | 플레이어 옆 채팅 말풍선 | P2 | BACKLOG | 미지정 | FT-SOCIAL-001 |
| [ ] | FT-SOCIAL-003 | 채팅 기록 보관 정책 | P2 | BACKLOG | 사용자 | 확인 필요 |
| [ ] | FT-SOCIAL-004 | 채팅 길이·전송 빈도 제한 | P1 | BACKLOG | 미지정 | FT-SOCIAL-001 |
| [ ] | FT-SOCIAL-005 | 채팅 숨김·음소거 | P2 | BACKLOG | 미지정 | FT-SOCIAL-001 |
| [ ] | FT-SOCIAL-006 | 기본 이모티콘·리액션(아바타 주변 표시) | P2 | BACKLOG | 미지정 | Phase 1 게이트 |
| [ ] | FT-SOCIAL-007 | 리액션 전송 빈도 제한 | P1 | BACKLOG | 미지정 | FT-SOCIAL-006 |
| [ ] | FT-SOCIAL-008 | 개인별 리액션 숨김 | P2 | BACKLOG | 미지정 | FT-SOCIAL-006 |
| [ ] | FT-SOCIAL-009 | 핸드 종료 직후 SHOW/MUCK | P2 | BACKLOG | 미지정 | 확인 필요 |
| [ ] | FT-SOCIAL-010 | 래빗 헌팅 | P3 | BACKLOG | 미지정 | 확인 필요 |
| [ ] | FT-SOCIAL-011 | 핸드 리플레이(향후 검토) | P3 | BACKLOG | 미지정 | 확인 필요 |
| [ ] | FT-SOCIAL-012 | 승리 핸드 공유(향후 검토) | P3 | BACKLOG | 미지정 | 확인 필요 |
| [ ] | FT-SOCIAL-013 | 친구 간 비금전적 칩 던지기 연출(향후 검토) | P3 | BACKLOG | 미지정 | 확인 필요 |

---

## 4. Phase 1 — 게임 안정화 및 수정본 검증

검증 대상: 테스트 서버 `290cb8a`(Railway `friends-table-mp-test`), Preview 웹 `https://fix-multiplayer-stability.friends-table-staging.pages.dev`(HEAD `8b34827` 빌드). 리소스·환경 상세는 [AI 인계](ai/HANDOFF.md) 2절, 배포 절차는 [반복 배포 절차](deployment-workflow.md). 수동 시나리오는 [실기기 체크리스트](web-device-checklist.md)를 사용하고 결과는 그 문서의 양식으로 남긴 뒤 여기 링크한다.

### FT-TEST-001 · 4~6인 실제 멀티플레이 검증
- 우선순위: P0 · 상태: IN_PROGRESS(사용자 실플레이 검증, 2026-11-23 기준 진행 중으로 간주) · 담당: 사용자
- 관련: 전체 게임 흐름. `apps/server/src/lobby.ts`, `apps/server/src/holdem/hand.ts`, `apps/mobile/src/screens/GameScreen.tsx`
- 선행: 없음(테스트 환경 구축 완료 — 인계 2절)
- 범위: 사람 4~6명이 서로 다른 기기·네트워크에서 한 방에서 여러 핸드 진행. FT-TEST-002~010의 시나리오를 함께 수행
- 완료 조건: 4인 이상(가능하면 6인) 실제 플레이에서 FT-TEST-002~008이 모두 통과, 발견 문제는 ID로 등록
- 검증 방법: [실기기 체크리스트](web-device-checklist.md) "멀티플레이" 외 해당 행, 서버 Deploy Logs `@level:error`/`warn` 확인
- 검증 결과: 부분 — 단일 PC 2인·4인(봇 포함) E2E 통과(11-23). 실제 사람·다기기·5~6인 미검증
- 관련: [인계](ai/HANDOFF.md) 2절 "2인 E2E"·"4인 E2E"

### FT-TEST-002 · 플레이어 입장·퇴장·재접속
- P0 · READY · 사용자 · 관련 `lobby.ts`, `apps/mobile/src/services/RoomClient.ts`, `roomLifecycle*.ts` · 선행 없음
- 범위: 방 생성·코드 입장·초대 링크 입장, 자발적 퇴장, 네트워크 끊김 후 재접속, 같은 계정 새 탭 교체, 재접속 기한(5분) 경계
- 완료 조건: 실기기에서 좌석 중복 없음, 끊김 표시와 복귀가 모든 화면에 반영, 기한 후 만료 안내
- 검증 방법: [실기기 체크리스트](web-device-checklist.md) 방 생성/입장·네트워크 전환·잠금 복귀·5분 경계·중복 연결
- 검증 결과: 부분 — 4인 E2E에서 봇 강제 종료 후 0.7초 재입장, 다른 화면 `(off)` 표시 확인(단일 PC). 퇴장·5분 경계·실기기 미검증

### FT-TEST-003 · 새로고침 후 게임 상태 복원
- P0 · READY · 사용자 · 관련 `RoomClient.ts`, `sessionStore*.ts`, `apps/server/src/stateStore.ts` · 선행 없음
- 완료 조건: 실기기 브라우저·PWA에서 진행 중 핸드의 본인 카드·보드·팟·스택·차례·타이머가 같은 hand ID로 복귀
- 검증 방법: 실기기 체크리스트 "게임 중 reload"·"앱 종료 후 재접속"
- 검증 결과: 부분 — Preview 2인·4인 E2E에서 A(내장 브라우저) 새로고침 2회 복귀 통과. 실기기 미검증

### FT-BUG-001 · 플랍·턴·리버 공개 지연
- P1 · IMPLEMENTED · 담당(구현 기록) Claude Code 세션 · 관련 `apps/mobile/src/services/cardPresentation.ts`, `audioScheduler.ts`, `soundEvents.ts` · 선행 없음
- 원인: 카드 공개가 효과음 큐 완료를 기다림(인계 3절 #2)
- 범위: 상태 수신 즉시 카드 공개(플랍 3장 한 단위). 서버·프로토콜 변경 없음
- 완료 조건: 실기기에서 상대 액션 직후 보드 공개가 체감 지연 없이 표시
- 검증 방법: 실플레이 관찰 + (선택) 타이밍 로그 opt-in `friends-table.diagnostics.game-timing=1`로 `client_card_reveal` 확인
- 검증 결과: 자동 — 서버 시뮬레이션 p50 1.15s→≤0.3ms, 로컬 4인 headless p50 10–12ms, Preview A 화면 수신→표시 1.9–4.7ms. 실기기 미검증
- 커밋/보고서: `21c7297`, [card-audio-sync](card-audio-sync.md)

### FT-TEST-004 · 턴 진행 및 타이머 동기화
- P0 · READY · 사용자 · 관련 `hand.ts`(timeout), `lobby.ts`(`syncGame`), `PokerTable.tsx`(타이머 바)
- 완료 조건: 모든 기기에서 차례 표시·남은 시간이 일치, 30초 만료 시 자동 체크/폴드가 서버·화면 모두 동일
- 검증 결과: 부분 — 딜러·블라인드·첫 행동자 순환은 4인 E2E 통과. **타임아웃 자동 폴드 미검증**, 기기 간 타이머 표시 비교 미검증

### FT-TEST-005 · 액션 버튼과 서버 처리 일치
- P0 · READY · 사용자 · 관련 `ActionButton.tsx`, `GameScreen.tsx`, `apps/mobile/src/services/betting.ts`, `hand.ts`(`legalFor`)
- 완료 조건: Fold/Check/Call/Bet/Raise/All-in 및 프리셋 금액이 실기기에서 서버 처리 결과와 일치, 차례가 아닐 때 비활성, 중복 전송 없음
- 검증 결과: 부분 — A UI에서 콜·체크·레이즈(프리셋)·폴드 일치(내장 브라우저). 올인 버튼 UI·실기기 미검증

### FT-TEST-006 · 칩 총합 보존
- P0 · READY · 사용자 · 관련 `hand.ts`, `review.ts`
- 완료 조건: 모든 핸드 종료 시 Σ스택 = 시작 총합(리셋 제외), 핸드 리뷰의 칩 변동 합 0
- 검증 결과: 부분 — 4인 E2E 6핸드 모든 상태 수신 시점 Σ = 4000 통과. 실플레이 미검증

### FT-TEST-007 · 올인 및 사이드팟 정산
- P0 · READY · 사용자 · 관련 `hand.ts`, `apps/server/test/holdem.test.ts`·`runout.test.ts`
- 완료 조건: 3인 이상 서로 다른 스택 올인에서 메인/사이드팟 금액·수령자가 기대값과 일치, 화면 표시 일치
- 검증 결과: 부분 — 4인 E2E 1건(메인 2040·사이드 740) 기대값 일치. 다중 사이드팟·스플릿 사이드팟·실기기 미검증

### FT-TEST-008 · 쇼다운과 승자 판정
- P0 · READY · 사용자 · 관련 `apps/server/src/holdem/cards.ts`, `hand.ts`
- 완료 조건: 실플레이 쇼다운의 족보 판정·스플릿·패 공개 표시가 정확
- 검증 결과: 부분 — E2E에서 투페어·트리플·스트레이트·스플릿 정상. 실플레이 미검증

### FT-BUG-002 · 게임 효과음–카드 표시 동기화
- P1 · IMPLEMENTED · 관련 `audioScheduler.ts`, `soundEvents.ts`, `apps/mobile/src/hooks/useGameAudio.ts`
- 범위: lane별 비차단, 최신 우선, 500ms 초과 생략, 결과음 순서 유지
- 완료 조건: 상태보다 늦게 시작한 액션음 0, 결과음 순서 유지, **사용자 청취로 수용 가능(FT-TEST-009)**
- 검증 결과: 자동 — 시뮬레이션 0/324, 로컬 headless 0/351, 결과음 32/32. 청취 미검증. 알려진 동작: 빠른 연속 액션에서 앞 액션음 잘림·공개음과 겹침(현재 정책 유지 결정)
- 커밋/보고서: `21c7297`, [card-audio-sync](card-audio-sync.md)

### FT-TEST-009 · 효과음 실제 청취 평가
- P1 · READY · 사용자 · 선행 FT-BUG-002
- 완료 조건: 실기기(iPhone·Android 각 1 이상)에서 잘림·겹침·지연이 거슬리지 않음을 사용자가 판정. 수정 필요 시 새 BUG ID
- 검증 결과: 미실행

### FT-TEST-010 · 모바일 브라우저 및 PWA 검증
- P1 · READY · 사용자 · 관련 `apps/mobile/public/manifest.webmanifest`, `webViewport.ts`, `useWebLayout*.ts`
- 완료 조건: [실기기 체크리스트](web-device-checklist.md) 설치/실행 환경 5종과 반복 시나리오 통과
- 검증 결과: 미실행(체크리스트 전 항목 미검증)

### FT-BUG-003 · 초대 링크 `/join/*` 404
- P1 · IMPLEMENTED · 관련 `apps/mobile/public/_redirects`, `scripts/build-pages.cjs`, `apps/mobile/test/pages.test.cjs`
- 범위: rewrite 대상 `/index.html`→`/`, 빌드 검사·회귀 테스트
- 완료 조건: 실기기에서 미인증·인증 사용자 모두 `/join/<코드>`로 해당 방 입장
- 검증 결과: Preview에서 내장 브라우저로 `/join/QPHJAJST`·`/join/XFAE7X9N` 입장 통과(11-23). 미인증 신규 기기·실기기 미검증
- 커밋: `86656e4`

### FT-BUG-004 · 연결 끊긴 플레이어 차례 처리
- P1 · BLOCKED(사용자 정책 결정 필요) · 관련 `lobby.ts`(`syncGame`), `hand.ts`(`timeout`)
- 현상: 끊긴 플레이어에게도 전체 턴 시간(기본 30초) 적용, 재접속 기한 동안 매 스트리트 대기(인계 3절 #4). 4인 E2E에서 8초 동안 차례 유지 확인
- 확인 필요: 즉시 체크/폴드, 짧은 유예, 다음 핸드 sit-out 중 어떤 정책인가
- 완료 조건: 결정 기록 → 서버 테스트로 고정 → 실플레이 확인
- 검증 결과: 미착수

### FT-BUG-005 · WebSocket 메시지별 Supabase 인증 지연
- P1 · BACKLOG(설계 결정 필요) · 관련 `apps/server/src/accountSession.ts`, `lobby.ts`(`handle`)
- 현상: ping 포함 모든 메시지가 `current_account_session` RPC를 캐시 없이 호출, 소켓별 직렬 처리. Preview 측정 `game_request_done` total p50 61.6·p95 167 ms, 대부분 `authMs`
- 제약: 단일 세션 강제·권한 검증 유지(완화 금지). 설계안(짧은 TTL 캐시, 입장 시 검증 + 주기 재검증 등)은 [결정 기록](decisions.md) 대상
- 완료 조건: 설계 승인 → 서버 테스트(세션 교체·만료 포함) → 지연 재측정
- 검증 결과: 미착수

### FT-BUG-006 · 재접속 교체 경쟁 상태(close 4001)
- P0 · IMPLEMENTED · 관련 `RoomClient.ts`
- 완료 조건: 실기기 중복 탭·백그라운드 복귀에서 무한 재접속·좌석 탈취 없음
- 검증 결과: 서버 188/188, 격리 40/40(11-18). 실기기 미검증
- 커밋/보고서: `29085e1`, [조사](multiplayer-stability-investigation.md)

### FT-BUG-007 · 앱 화면 클릭 중 OS 클립보드 쓰기 경고
- P2 · BACKLOG(재현 필요) · 관련 미정(초대 공유 `shareInvite*.ts` 가능성 — 미확인 추정)
- 현상: 11-23 4인 E2E 중 A(Preview 앱) 화면 클릭 시 데스크톱 앱이 클립보드 쓰기 경고 1회 표시. 사용자 의도 없는 복사인지, 공유 버튼 클릭인지 미확인
- 완료 조건: 재현 조건 확정 → 의도된 동작이면 CANCELLED, 아니면 수정
- 검증 결과: 미착수 · 근거 [인계](ai/HANDOFF.md) 2절 4인 E2E 비고

### FT-TEST-011 · 친구 전적 비교 실제 JWT E2E
- P2 · BACKLOG · 관련 `apps/server/src/friendStatsApi.ts`, `can_compare_friend_stats` · 선행 FT-OPS-002
- 완료 조건: 테스트 환경에서 세 관계(본인·친구·비친구) 실제 JWT로 허용/거부 확인
- 검증 결과: 미실행 · [P2 재검증](p2-rpc-verification-2026-11-18.md)

### FT-OPS-001 · 테스트 환경 중지·재시작 데이터 보존 검증
- P2 · BACKLOG · 관련 [반복 배포 절차](deployment-workflow.md) 6절
- 완료 조건: 중지→재시작 후 SQLite·방 checkpoint 보존 확인(원격 작업, 실행 직전 승인)
- 검증 결과: 미실행

### FT-OPS-002 · 007 마이그레이션 정식 등록과 draft 경로 정리
- P2 · BLOCKED(사용자 승인 필요) · 관련 `supabase/migrations/007_friend_stats_permission.sql`(미커밋), `supabase/drafts/007_*`, 서버 테스트 `friend-comparison`·`friend-stats-security`
- 범위: migrations 파일 커밋 여부 결정, draft와 동기 유지 또는 테스트 경로 전환, 문서 경로 갱신
- 검증 결과: 테스트 Supabase 적용·운영 정의 동일 확인(인계 2절). 저장소 반영 미결정

### FT-OPS-003 · GitHub 원격 백업 push
- P2 · BLOCKED(사용자 결정 2026-11-22 보류) · 담당 사용자
- 메모: 로컬 커밋 다수가 원격에 없음. `main` push는 Railway 운영 자동 배포를 유발할 수 있음. force push 금지. 계획은 [인계](ai/HANDOFF.md) 1절

### FT-OPS-004 · Windows·Node 24에서 로컬 4인 E2E 실행기 실행
- P2 · READY · 관련 `scripts/test-game-e2e.cjs`, [testing](testing.md)
- 완료 조건: 사용자 PC에서 `node scripts/test-game-e2e.cjs` 통과 기록
- 검증 결과: 클라우드 Node 22에서만 통과

### FT-OPS-005 · Codex의 AGENTS.md 실제 로딩 확인
- P2 · BLOCKED(Codex 사용량 한도, 2026-11-25 이후) · 담당 Codex
- 완료 조건: Codex 새 세션에서 AGENTS.md의 규칙(시작 순서·이 체크리스트 확인)을 인지하는지 확인하고 결과 기록
- 검증 결과: 미실행

### FT-OPS-006 · npm 감사 권고 분류·호환 수정안
- P3 · BACKLOG · [npm 감사](security/npm-audit.md) · 기능 변경과 분리, `npm audit fix --force` 금지

### FT-OPS-007 · PROJECT_STATUS 현황표 갱신
- P3 · READY · 관련 [현재 상태](PROJECT_STATUS.md)
- 범위: 11-18 이후 테스트 환경·E2E 결과 반영(요약만, 상세는 인계·이 문서 링크)

---

## 5. Phase 2 — WPL 벤치마킹 UI 리뉴얼

**착수 조건: 2.5 Phase 게이트.** 목표는 세로형 모바일 홀덤 UI의 전문성. 윈조이 WPL은 레이아웃·정보 배치의 참고 대상일 뿐이며 이미지·로고·색 조합·아이콘을 복제하지 않는다(기존 원칙: [UI 검토](mobile-poker-ui-review.md) "참고 앱 자산 복사 안 함").

공통 제약: 게임 규칙·서버 권한·프로토콜 변경 없음이 기본. 변경 필요 시 사전 보고. Android/iOS 네이티브 회귀 확인. 기존 테스트 삭제·무력화 금지. 기존 자료: [UI 검토](mobile-poker-ui-review.md), [P1 입력·레이아웃](p1-input-layout-report.md), [P2 UI](p2-ui-friend-comparison-report.md).

### FT-UI-001 · 액션 버튼–게임 로직 연결 분석 및 UI 변경 범위 결정
- P1 · BACKLOG · 관련 `GameScreen.tsx`, `ActionButton.tsx`, `PokerTable.tsx`, `betting.ts`, `hooks/useRoom.ts`, `RoomClient.ts`, `packages/shared/src/holdem.ts`(`legal`)
- 범위: 버튼→명령→서버 검증→상태 반영 경로, 프리셋 패널·IME 처리(P1) 의존성 정리 후 UI만 바꿀 수 있는 경계와 위험 목록 작성. 코드 변경 없음
- 완료 조건: 분석 문서와 변경 범위를 사용자가 승인
- 검증 방법: 문서 검토

### FT-UI-002 · 디자인 방향·색상·토큰 정의
- P1 · BACKLOG · 선행 FT-UI-001
- 범위: 저채도·눈 피로가 적은 팔레트, 고급스러운 테이블 질감, 타이포·간격 토큰. WPL과 구별되는 독자 디자인
- 완료 조건: 시안(Design 산출물 또는 문서)을 사용자 승인

### FT-UI-003 · 세로형 테이블·최대 6인 좌석 배치
- P1 · BACKLOG · 관련 `PokerTable.tsx`, `webViewport.ts` · 선행 FT-UI-002
- 완료 조건: 2~6인 모든 인원수에서 좌석 겹침·잘림 없음(FT-UI-008 화면 크기 목록)

### FT-UI-004 · 플레이어 아바타 및 칩 정보
- P2 · BACKLOG · 선행 FT-UI-003
- 현재: 닉네임 첫 글자 원형 아바타 + 스택 텍스트
- **확인 필요**: 아바타 이미지 출처(기본 아이콘 세트 선택 / 사용자 업로드 / 이니셜 유지). 업로드면 Supabase 저장소·RLS 변경 → 별도 승인
- 완료 조건: 결정된 방식으로 표시, 스택·베팅·BB 표기 가독성 확인

### FT-UI-005 · 카드와 팟의 가독성
- P1 · BACKLOG · 관련 `PokerCards.tsx`, `CardArtwork.tsx` · 선행 FT-UI-003
- 완료 조건: 최소 화면(375×667)에서 보드·홀카드 무늬·숫자, 메인/사이드팟 금액 판독 가능

### FT-UI-006 · 액션 바(Fold/Check/Call/Bet/Raise/All-in)
- P1 · BACKLOG · 선행 FT-UI-001
- 완료 조건: 서버 `legal`과 버튼 활성 상태 1:1 일치, 한 손 조작 영역, 오조작 방지(올인 확인 등 기존 동작 유지 여부 결정)

### FT-UI-007 · 베팅 슬라이더와 금액 프리셋
- P1 · BACKLOG · 관련 `betting.ts` · 선행 FT-UI-006
- 완료 조건: 최소/최대 레이즈·BB 단위 반올림이 서버 검증과 일치, IME·키보드 입력(P1 결과) 회귀 없음

### FT-UI-008 · 다양한 모바일 화면 크기 대응·검증
- P1 · BACKLOG · 선행 FT-UI-003~007
- 완료 조건: 기존 viewport 목록(`docs/web-phase4-viewports.json`) + 실기기(iPhone·Android) 세로/가로, Safari 주소창 변화에서 잘림 없음
- 검증 방법: 자동 viewport 캡처 + 실기기 체크리스트

---

## 6. Phase 3 — 게임 애니메이션 및 효과음

**착수 조건: 2.5 Phase 게이트.** 원칙: 서버 게임 상태가 기준이고 연출은 클라이언트 표현이다. 애니메이션 지연·실패·생략이 상태 반영·액션 버튼·타이머를 막지 않는다(FT-BUG-001의 교훈). 새로고침·재접속 시 연출은 생략하고 최종 상태를 바로 표시한다.

기존 구현(확인됨): 홀카드·보드 카드 모션(P0, 240/360ms), 리버 스퀴즈(`RiverSqueeze.tsx`), 승자 강조(`WinnerGlow.tsx`), 턴 타이머 바, 효과음 음량 설정. 각 항목은 이 기존 구현을 대체할지 확장할지 FT-ANIM-001에서 정한다.

| ID | 작업 | 범위·완료 조건 요약 | 관련 |
| --- | --- | --- | --- |
| FT-ANIM-001 | 상태–연출 분리 구조 설계 | 상태 diff→연출 이벤트 큐, 취소·건너뛰기 규칙, 재접속 시 생략. 설계 승인 | `cardPresentation.ts`, `audioScheduler.ts`, `GameScreen.tsx` |
| FT-ANIM-002 | 카드 배분 | 딜러 기준 순서대로 배분, 비공개 카드는 뒷면만 | `PokerCards.tsx` |
| FT-ANIM-003 | 플랍·턴·리버 공개 | 상태 수신 즉시 시작(FT-BUG-001 지연 재발 금지) | `cardPresentation.ts` |
| FT-ANIM-004 | Fold 카드 이동 | 폴드 시 카드가 테이블 중앙/머크로 이동 | `PokerTable.tsx` |
| FT-ANIM-005 | Call/Bet/Raise 칩 이동 | 좌석→베팅 영역, 금액은 서버 값 | `PokerTable.tsx` |
| FT-ANIM-006 | All-in 칩 연출 | 과하지 않은 강조, 강도 설정 반영 | — |
| FT-ANIM-007 | 중앙 팟 형성 | 스트리트 종료 시 베팅→팟 수집 | — |
| FT-ANIM-008 | 팟 승리 칩 이동 | 팟→승자 좌석 | `WinnerGlow.tsx` |
| FT-ANIM-009 | 사이드팟별 수령자 | 팟마다 정확한 수령자·금액(서버 정산 결과만 사용, 클라이언트 재계산 금지) | `review.ts` 결과 |
| FT-ANIM-010 | 쇼다운·승리 연출 | 공개 순서·족보 표시 | — |
| FT-ANIM-011 | 현재 턴 강조 | 좌석 강조, 색 외 형태 구분 | `PokerTable.tsx` |
| FT-ANIM-012 | 턴 타이머 애니메이션 | 서버 `deadline` 기준, 기기 시계 차이 보정 | `PokerTable.tsx` |
| FT-ANIM-013 | 리바이 칩 충전 | `resetChips` 결과 연출. **확인 필요**: "리바이"가 기존 칩 리셋과 같은 기능인지, 별도 리바이 규칙(금액·횟수)을 원하는지 | `lobby.ts` `resetChips` |
| FT-ANIM-014 | 효과음–애니메이션 동기화 | 시작 시점 정렬, 상태보다 늦게 시작하는 소리 0 유지 | `audioScheduler.ts` |
| FT-ANIM-015 | 강도·음량 설정 | 애니메이션 끔/약/보통 + 기존 음량 설정 통합, OS 동작 줄이기 존중 | `SoundSettings.tsx`, `settingsStorage*.ts` |
| FT-ANIM-016 | 모바일 웹/PWA 성능 | 중저가 Android·iPhone에서 프레임 저하·발열·배터리, 6인 최대 연출 | 실기기 |

모든 FT-ANIM 항목 공통 — 우선순위·선행은 3절 요약표, 상태 BACKLOG, 담당 미지정. 검증 방법: 자동 테스트(이벤트 순서·취소), 로컬 4인 E2E 실행기 타이밍, 실기기 관찰. 완료 조건에 "연출 실패 시에도 게임 진행·상태 표시 정상"을 반드시 포함한다.

---

## 7. Phase 4 — 소셜 기능

**착수 조건: 2.5 Phase 게이트.** 공통 원칙: 모든 소셜 메시지는 서버가 방 멤버십·인증을 검증하고 중계한다. 서버 게임 규칙·칩 정산에 영향을 주지 않는다. 비공개 홀카드를 노출하지 않는다. WebSocket 구·신 클라이언트 호환(새 메시지 타입을 모르는 클라이언트가 오류 없이 무시)을 확인한다.

### 채팅
- **FT-SOCIAL-001 방 내부 실시간 채팅** — 범위: 새 프로토콜 메시지(`packages/shared`), 서버 멤버십 검증·중계(`lobby.ts`), 클라이언트 입력·목록(`GameScreen.tsx`). 완료 조건: 같은 방 멤버만 수신, 비멤버·만료 세션 거부, 재접속 시 정책(FT-SOCIAL-003)대로 표시
- **FT-SOCIAL-002 플레이어 옆 말풍선** — 좌석 근처 일정 시간 표시, 연속 메시지 처리, 액션 버튼·카드 가리지 않음
- **FT-SOCIAL-003 채팅 기록 보관 정책** — **확인 필요**: 저장 안 함(메모리만) / 방 수명 동안 / 핸드 리뷰처럼 최근 N개 checkpoint 저장 중 선택. 저장 시 개인정보·삭제 정책 기록([결정 기록](decisions.md))
- **FT-SOCIAL-004 길이·빈도 제한** — 서버에서 강제(클라이언트 제한은 보조). 완료 조건: 초과 시 거부 응답, 연결 유지
- **FT-SOCIAL-005 숨김·음소거** — 개인 설정(전체 채팅 숨김, 특정 플레이어 음소거). 서버 전송은 그대로, 표시만 제어

### 이모티콘·리액션
- **FT-SOCIAL-006 기본 이모티콘·리액션** — 고정 세트(서버가 허용 ID 목록 검증), 아바타 주변 표시. 저작권 있는 캐릭터·상표 이미지 사용 금지
- **FT-SOCIAL-007 전송 빈도 제한** — 서버 강제
- **FT-SOCIAL-008 개인별 리액션 숨김** — 플레이어별·전체 끄기

### FT-SOCIAL-009 · 핸드 종료 직후 SHOW / MUCK
- P2 · BACKLOG(확인 필요) · 관련 `hand.ts`(`canReveal`/`revealCards`), `lobby.ts`(결과 창·다음 판 예약 `nextHandAt`)
- 현재 구현: 쇼다운에 참여한 본인 패만 공개 가능(`revealCards`). 쇼다운 없이 끝난 핸드·폴드한 플레이어의 공개는 없음
- 범위: 핸드 종료 후 제한 시간 동안 SHOW/MUCK 선택, 서버가 공개 권한 검증, 시간 초과 시 자동 비공개, 다음 핸드 시작과 충돌 없음(기존 "공개가 결과 창을 늘리지 않음" 규칙 유지)
- **확인 필요**: ① 폴드한 플레이어도 공개 가능한가 ② 한 장만 공개 허용 여부 ③ 제한 시간(현재 다음 판까지 5초)
- 완료 조건: 권한 없는 공개 요청 거부 테스트, 다음 핸드 시작 후 공개 요청 거부, 모든 화면 동기화

### FT-SOCIAL-010 · 래빗 헌팅
- P3 · BACKLOG(확인 필요) · 관련 `hand.ts`(덱 보관), `review.ts`
- 범위: 쇼다운 없이 끝난 핸드에서 플레이어 요청으로 남은 커뮤니티 카드를 실제 덱 순서대로 공개, 결과는 전체 동기화, 승패·칩 정산 영향 없음, 다음 핸드 지연 없음
- 보안 주의: 남은 덱 정보를 핸드 종료 전 어떤 클라이언트에도 보내지 않는다. 핸드 종료 후에만 서버가 계산해 전송
- **확인 필요**: ① 요청 가능자(핸드 참여자만? 폴드한 사람 포함?) ② 핸드당 1회·요청 횟수 제한 ③ 공개 결과가 핸드 리뷰에 남는지
- 완료 조건: 공개 카드가 실제 덱 순서와 일치(서버 테스트), 칩 변동 0, 다음 핸드 시작 시각 불변

### 향후 검토 (요구사항 미확정 — 구현 금지)
- **FT-SOCIAL-011 핸드 리플레이** — 현재 최근 10핸드·핸드당 150이벤트 리뷰만 있음. 전체 보관은 보존 기간·용량·권한 설계 필요([현재 상태](PROJECT_STATUS.md) 우선순위 5)
- **FT-SOCIAL-012 승리 핸드 공유** — 공유 범위(방 안/외부 링크), 상대 패 노출 규칙 확인 필요
- **FT-SOCIAL-013 친구 간 비금전적 칩 던지기 연출** — 실제 칩 이동 없는 순수 연출인지 확인 필요. 가상 칩 이동이면 정산 로직 변경으로 P0 검토 대상

---

## 8. 작업 이력 (최신이 위, 덮어쓰지 않고 추가)

| 일시 (KST) | 작업자 | 내용 | 커밋 |
| --- | --- | --- | --- |
| 2026-11-23 17:45 | Claude Code(클라우드 세션) | 문서 신설. 기존 인계·현황·테스트 문서를 조사해 Phase 1~4 항목 등록(FT-TEST 001–011, FT-BUG 001–007, FT-OPS 001–007, FT-UI 001–008, FT-ANIM 001–016, FT-SOCIAL 001–013). 기존 HANDOFF 3절 #1–#7을 각각 FT-BUG-003·001·002·004·005·006, FT-UI-001로 대응(HANDOFF는 미커밋 변경이 있어 수정하지 않음, 원문 보존). AGENTS.md·CLAUDE.md·DEVELOPMENT_WORKFLOW·docs/README·PROJECT_STATUS에 참조 추가. 코드 변경 없음, 테스트 미실행(문서만) | 이 문서를 추가한 커밋(`git log -- docs/DEVELOPMENT_CHECKLIST.md`) |
