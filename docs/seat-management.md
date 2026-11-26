# 좌석 선택·방장 착석 승인 (FT-FEAT-001 ~ 006)

작성: 2026-11-24 KST · Claude Code · 브랜치 `feature/seat-management`(기준 `fix/multiplayer-stability` `e230511`) · 미커밋
갱신: 2026-11-24 14:20 KST — 방장도 직접 좌석 선택, 좌석 승인·리바이 승인 분리(`seating.ts`), 타이밍 테스트 원인 수정, 브라우저 E2E
갱신: 2026-11-24 17:30 KST — 3단계(3분 재접속 유예)·4단계(좌석 해제 후 칩 잔액 보존)·자발적 일어서기 구현(9절)
갱신: 2026-11-24 23:55 KST — 재접속 보완(다른 기기·이전 세션 무효화·`RECONNECT_MS` 하한), 끊긴 플레이어 즉시 체크/폴드, 5단계 리바이 C안, 6단계 다음 핸드 참여(10절)
갱신: 2026-11-25 00:30 KST — 연결 끊김 2초 유예, 방 설정 리바이 최대 수량, 방장 본인 즉시 리바이, 요청 ID 중복 방지(11절). **10절과 다르면 11절이 우선**한다.

> 구현 상태(2026-11-25): 이 문서의 1~12절 내용은 모두 **구현 완료·자동 검증 통과**(실기기·Preview 미검증, `FT-TEST-012` — [실사용 체크리스트](seat-playtest-checklist.md)). 정책만 확정되고 구현되지 않은 항목은 없다. 11.5절의 기본값은 사용자가 확정했다.

전체 목표 **6단계를 모두 구현**했다(자동 테스트·로컬 브라우저 검증까지, 실기기 미검증).

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 6개 좌석 빈자리 표시·직접 선택(방장 포함) | 구현 (`FT-FEAT-001`) |
| 2 | 일반 플레이어 착석·재착석은 방장 승인/거절, 방장 본인은 즉시 착석 | 구현 (`FT-FEAT-002`). 일어서기·유예 만료 후 요청은 `resit` |
| 3 | 연결 끊김 시 3분 좌석·칩 보존 | 구현 (`FT-FEAT-003`, 9절) |
| 4 | 좌석 해제 후 칩 잔액 보존 + 자발적 일어서기 | 구현 (`FT-FEAT-004`, 9절) |
| 5 | 리바이 C안(희망 수량 요청 → 방장 승인) | 구현 (`FT-FEAT-005`, 10절). 좌석 요청과 분리된 별도 큐·승인 |
| 6 | 게임 중 착석 시 다음 핸드부터 참여 | 구현 (`FT-FEAT-006`, 10절). 착석·리바이·일어서기·끊김이 겹쳐도 핸드 경계에서 정리 |

## 1. 정책

- 방 생성자(방장)를 포함해 **모든 참가자는 미착석 상태로 입장**하고 6개 좌석 중 하나를 직접 고른다.
- 방장이 고른 좌석은 승인 없이 즉시 착석. 일반 플레이어의 선택은 착석 요청이 되고 방장이 승인/거절한다.
- 방장은 미착석 상태에서도 요청을 승인/거절할 수 있다. 게임 시작에는 접속 중인 착석자 2명 이상이 필요하다(방장 본인 착석 여부와 무관).
- 좌석 결정은 칩을 옮기지 않는다. 리바이는 별도 요청·별도 승인이다(3절).

## 2. 서버 상태 모델

좌석 로직은 `apps/server/src/seating.ts`(순수 함수, 칩 쓰기 없음)에 있고 `lobby.ts`는 메시지 파싱·권한 연결·브로드캐스트만 한다. 방 참여·인증·초대 코드·인원 제한(6명)·핸드 규칙·칩 정산(`hand.ts`)은 바꾸지 않았다.

```text
Member (lobby.ts, SeatMember 구조 충족)
  id, accountId, loginId, nickname, token, socket, expiresAt   (기존 그대로)
  stack: number            칩 잔액. 좌석이 아니라 멤버에 붙어 있음 → 4·5단계 전제
  seat: number | null      고정 좌석 0..5, null = 방에는 있지만 미착석(딜 제외)
  seatedBefore?: boolean   이 방에서 앉은 적 있음 → 다음 요청은 kind 'resit'
  seatNotice?: {requestId, seat, approved, at}   본인에게만 보이는 마지막 결정(거절 후 새로고침 복구)

Room
  seatRequests: SeatRequest[]
SeatRequest (seating.ts)
  id(uuid), playerId, seat, kind: 'sit' | 'resit', stack(요청 시점 기록, 표시용), requestedAt
  ※ 칩 지급 필드 없음 — 리바이는 별도 큐(향후 rebuyRequests)
```

불변 조건(서버만 보장, 클라이언트 검증은 보조):

- 좌석 하나에 최대 1명 착석 + 최대 1건 요청. 요청 중인 좌석은 **예약**되어 다른 사람이 요청·착석할 수 없다(동시 요청 시 먼저 처리된 1건만 남고 나머지는 `SEAT_UNAVAILABLE`, 다른 화면에서는 즉시 "요청 중"으로 비활성).
- 멤버당 최대 1좌석 + 최대 1건 요청(중복 착석 방지). 같은 계정은 기존 규칙대로 한 방에 한 멤버만 존재(`ALREADY_JOINED`, 새 로그인은 이전 멤버십·요청을 정리).
- 승인·거절·취소·퇴장 시 요청을 즉시 제거 → **결정은 1회용**. 같은 요청 ID 재승인은 `SEAT_REQUEST_INVALID`.
- 방장이 오프라인이어도 요청은 체크포인트에 남고, 재접속하거나 방장이 위임되면 새 방장이 처리한다.
- 핸드는 `seat !== null && 접속 중 && stack > 0`인 멤버만 **좌석 번호 순(시계 방향)**으로 시작한다. 진행 중 핸드에는 손대지 않으므로 게임 중 승인된 사람은 다음 핸드부터 참여한다.

### 체크포인트 호환

- 새 체크포인트: `seatLayout: 6`, 멤버 `seat`(null 가능)·`seatedBefore`·`seatNotice`, 방 `seatRequests`. 버전 번호(1) 유지, 필드만 추가.
- 기존(배포 중) 체크포인트: `seat`이 계속 증가하던 값(6 이상 가능). 복원 시 같은 순서로 0..n-1에 재배치하고 `dealerSeat`도 같은 사람 기준으로 바꿔 딜러 순환 유지(테스트로 고정). 기존 방의 참가자는 모두 착석 상태로 이어진다.
- 잘못된 저장값(범위 밖·중복 좌석, 더 이상 맞지 않는 요청)은 미착석/폐기 처리.
- **롤백 주의**: 이 버전이 저장한 체크포인트를 이전 서버가 읽으면 `seat: null` 멤버를 착석자로 취급할 수 있다. 롤백은 방 0개 상태에서 한다.
- DB 마이그레이션 없음(SQLite에는 체크포인트 JSON만 저장). Supabase 변경 없음.

## 3. 좌석 승인과 리바이 승인의 분리 (C안 대비)

- 좌석 요청 메시지·상태에는 칩 금액이 **없다**. `requestSeat`에 `rebuyAmount`를 넣으면 `INVALID_REQUEST`로 거부(실수로 좌석 승인이 칩 지급이 되는 경로 차단).
- `seating.ts`는 칩 잔액을 읽기만 한다(요청 표시용). "좌석 결정은 어떤 경로로도 잔액을 바꾸지 않는다"를 단위 테스트로 고정.
- 리바이 구현 시 권장 구조: `rebuy.ts` + `room.rebuyRequests`(요청자당 1건, id·amount·requestedAt), 메시지 `requestRebuy {amount}` / `cancelRebuyRequest` / `resolveRebuyRequest {requestId, approve}`. 좌석 요청과 독립이라 ① 기존 잔액만으로 재착석 승인, ② 리바이만 승인(착석 중), ③ 둘 다 승인, ④ 하나만 거절이 모두 가능. 클라이언트는 "재착석 + 추가 칩" 화면에서 두 요청을 함께 보내되 방장 화면에는 두 결정을 따로 표시한다.
- 지급 규칙: 승인 분기에서 요청 제거와 같은 동기 구간에서 1회만 `stack += amount`, `persist()` 실패 시 롤백. 핸드 진행 중에는 지급을 다음 핸드 전까지 보류(현재 핸드 칩·`startingStacks`·일일 기록·전적 집계를 건드리지 않음). 상한·하한(예: 시작 칩 이내)과 요청 빈도 제한은 정책 확정 필요.

## 4. WebSocket 프로토콜 (`packages/shared/src/index.ts`)

| 클라이언트 → 서버 | 처리 |
| --- | --- |
| `{type:'requestSeat', seat}` | seat 0..5 정수. 방장이면 즉시 착석, 아니면 요청 등록. 추가 필드(`rebuyAmount`)가 있으면 거부 |
| `{type:'cancelSeatRequest'}` | 본인 요청 취소 |
| `{type:'resolveSeatRequest', requestId, approve}` | 방장만. 승인 시 서버가 좌석 배정 |
| `{type:'standUp'}` | 착석자만. 진행 중 핸드에 있으면 핸드 종료 후, 아니면 즉시 좌석 해제. 칩 필드는 무시(서버 잔액만 사용) |

서버 → 클라이언트: 새 메시지 타입 없음. `room`/`joined` 스냅샷에 `players[].seat?: number|null`, `seatRequests?: SeatRequestView[]`(전원에게, 예약 표시용 — 닉네임·칩은 원래 공개 정보), `seatNotice?`(본인 것만) 추가. 오류 코드 `SEAT_UNAVAILABLE`·`SEAT_REQUEST_INVALID`(둘 다 `recoverable: true`).

구·신 호환:

- **신 클라이언트 + 구 서버**: `seat` 필드가 없으면 전원 착석으로 보고 좌석 선택을 막는다(`SeatPanel.seatsOf`).
- **구 클라이언트 + 신 서버**: 입장은 되지만 좌석 UI가 없어 **방장을 포함해 누구도 새 방에서 착석할 수 없다**(게임 시작 불가). 웹은 서버와 함께 배포되므로 문제 없지만, 설치된 네이티브 앱 빌드는 서버 배포 전에 업데이트해야 한다. 배포 중 저장된 기존 방은 체크포인트 변환으로 전원 착석 상태라 계속 진행된다.

## 5. 클라이언트

- `RoomClient.requestSeat/cancelSeatRequest/resolveSeatRequest`, `useRoom` 노출.
- `components/SeatPanel.tsx`: 1~6번 고정 좌석 타일(착석자·요청 중·빈자리), 내 요청 상태·취소, 거절 안내, 방장 요청 목록(요청자·좌석·보유 칩·재착석 표시·승인/거절). 기존 대기실 타일 스타일 재사용.
- 대기실: 기존 "참가자" 목록 대신 좌석 패널. "홀덤 시작"은 접속 중 착석자 2명 이상일 때 활성.
- 게임 화면: 미착석자에게는 좌석 선택 줄, 착석한 방장에게는 대기 요청이 있을 때 승인/거절 줄만(`seatPanel` prop, `App.tsx`에서 주입).
- 테이블(`PokerTable`)의 좌석 그림 배치는 바꾸지 않았다(`FT-UI-003` 범위).
- (FT-FEAT-003·004) `RoomClient.standUp`/`useRoom.standUp`, `SeatPanel`의 "자리에서 일어나기" 버튼(대기실·게임 화면 하단), 일어서기 예약 안내, 관전자 보유 칩 표시, 끊긴 착석자 "연결 끊김 · 자리 보존 중" 표시. 게임 화면 하단 줄 표시 조건은 `showGameSeatPanel`(App·E2E fixture 공용). 구 서버(`standingUp` 필드 없음)에는 버튼을 표시하지 않는다.

## 6. 타이밍 테스트 간헐 실패 원인 (FT-BUG-008)

- 대상: `apps/server/test/game-timing.test.ts` "enabling timing does not change the messages players receive". 타이밍 로그 꺼짐/켜짐 두 판의 상태 순서를 `deepEqual`로 비교.
- 원인: 두 판이 **서로 다른 무작위 덱**이었다. 턴 시점에 두 사람 점수가 같으면 리버 스퀴즈가 생략되어 상태가 하나 줄어든다. 실제 `HoldemHand`로 2만 판 재현 시 턴 동점 1.56%, 두 독립 판의 순서가 다를 확률 **3.07%**(관측 2/61 ≈ 3.3%와 일치). 부하·타이머·좌석 변경과 무관.
- 재현: 동점 덱과 스퀴즈 덱을 각각 넣으면 기존 assertion이 3/3 확정 실패.
- 수정: 비교하는 두 판이 **같은 무작위 덱**을 쓰도록 테스트 전용 `LobbyOptions.deck`(환경 변수로 켤 수 없음, `turnMs` 등과 같은 성격)을 추가. assertion·타임아웃 변경 없음. 수정 후 단독 60/60, 전체 스위트 Node 24 8회 전부 통과.
- 별건: 변경 전 사본에서 1회 관측된 `runout.test.ts` "turn loser, not eventual loser…" 실패는 고정 덱 동기 테스트라 이 원인과 다르다. 시간 관련 assertion은 `deadline > now + 14초`(여유 1초) 하나이며 재현되지 않아 원인 미확정, 코드 변경 없음.

## 7. 검증

명령·결과는 [체크리스트](DEVELOPMENT_CHECKLIST.md) `FT-FEAT-001` 검증 결과. 브라우저 시나리오는 `node scripts/test-seat-e2e.cjs`(로컬 127.0.0.1 서버, 실제 Chrome 4개, 결과·스크린샷 `.qa-web/seat-e2e/`).

## 8. 다음 단계 구현 시 주의사항

- **3·4단계**: 구현 완료(9절). 아래는 당시 설계 메모로 9절이 우선한다.
- **5단계(리바이)**: 3절 구조. 좌석 코드(`seating.ts`)는 수정하지 않고 별도 모듈로 추가.
- **6단계**: 자리 해제/재착석이 생기면 `startNextHand`의 딜러 계산(`p.seat > dealerSeat`)이 빈 좌석을 건너뛰는지 테스트로 고정.
- 서버 회귀 테스트 다수는 `autoSeat: true`(입장 즉시 착석, 테스트 전용)로 기존 게임 흐름을 검증한다. 운영 경로 검증은 `seats.test.ts`와 `test-seat-e2e.cjs`, 기존 4인 E2E(`test-game-e2e.cjs`)는 이제 실제 UI로 착석한 뒤 진행한다.

## 9. 재접속 유예·칩 잔액 보존 (FT-FEAT-003·004, 2026-11-24 17:30 KST)

방 참여(멤버십)와 착석을 분리한 1~2단계 모델 위에 좌석 해제 시점과 잔액 장부를 더했다. 핸드 규칙·칩 정산(`hand.ts`), 끊긴 플레이어 차례 처리(`FT-BUG-004`, 기존 턴 타이머 그대로)는 바꾸지 않았다.

```text
Member 추가 필드 (lobby.ts / seating.ts SeatMember)
  seatHeldUntil?: number            연결이 끊긴 착석자의 좌석 보존 기한(서버 시계, epoch ms)
  standPending?: 'voluntary'|'expired'   진행 중 핸드가 끝나면 좌석 해제(자발적 / 유예 만료)
Room 추가 필드
  chipLedger: { [accountId]: { playerId, stack, settingsRevision, savedAt } }   방을 떠난 계정의 잔액
```

- **유예 시간**: `seatHoldMs` 기본 180초. 멤버십 유예(`seatRetentionMs` = `RECONNECT_MS`, 기본 300초)보다 길 수 없다(`min`). 운영 `RECONNECT_MS`가 180초 미만이면 좌석 유예도 그만큼 짧아진다. 운영 값은 확인하지 않았다(원격 조회 대상).
- **끊김**: 착석자의 소켓이 닫히면 `seatHeldUntil = now + seatHoldMs`. 좌석은 점유 상태로 남아 다른 사람이 요청·착석할 수 없다. 끊긴 사람은 새 핸드에 딜되지 않는다(기존 규칙: 접속 중 착석자만).
- **3분 이내 재접속**(같은 계정·같은 로그인 세션의 `currentRoom`, 또는 같은 계정의 `resume`): 보존을 해제하고 좌석·칩을 그대로 돌려준다. 방장 승인 없음.
- **3분 경과**: 진행 중 핸드에 참여하고 있으면 `standPending='expired'`로 핸드 종료까지 좌석 유지. 핸드가 끝나는 `syncGame`에서 `settleStanding`이 좌석을 해제한다. 핸드에 없으면 즉시 해제. 유예가 지난 뒤 재접속해도 해제는 취소되지 않는다.
- **자발적 일어서기**: `standUp`. 핸드 중이면 `standPending='voluntary'`로 그 핸드를 끝까지 플레이(폴드 처리하지 않음)한 뒤 해제, 아니면 즉시 해제. 중복 요청은 `SEAT_REQUEST_INVALID`.
- **해제 후**: `seat=null`, 멤버로 남아 관전. `seatedBefore=true`라 다음 요청은 `resit`이고 방장 승인이 필요하다(방장 본인은 기존 규칙대로 즉시). 게임 중 승인되면 다음 핸드부터 딜된다. `startNextHand`는 `standPending` 멤버를 딜하지 않는다.
- **칩 잔액(서버 단독 관리)**: 멤버의 `stack`은 좌석과 무관하게 유지된다. 멤버십이 끝나면(나가기, 멤버십 유예 만료, 같은 계정의 새 로그인으로 교체) `remove()`가 핸드 퇴장 처리 후 잔액을 `chipLedger[accountId]`에 기록한다. 같은 계정이 같은 방에 다시 들어오면 **한 번만** 복구하고 항목을 지운다(중복 복구 방지). 같은 플레이어 ID를 재사용하므로 일일 기록·핸드 기록도 이어진다. 장부의 잔액은 덮어쓰기(대입)만 하므로 중복 지급이 없다. 올인 상태로 떠난 플레이어가 그 핸드에서 이기면 `syncGame`이 장부 잔액을 갱신한다.
- **장부 무효화**: 항목에 `settingsRevision`을 기록한다. 방장이 칩 초기화·설정 변경을 하면 revision이 바뀌어, 자리에 없던 계정도 시작 칩으로 돌아온다. 방이 비어 닫히면 장부도 사라진다.
- **클라이언트 입력**: 칩 값은 어떤 메시지로도 받지 않는다(`join`·`standUp`에 붙은 `stack` 필드는 파서가 버림). 좌석 승인은 칩을 지급하지 않는다(기존).
- **체크포인트**: 멤버 `seatHeldUntil`·`standPending`, 방 `chipLedger`를 저장한다(버전 1 유지, 필드만 추가, 잘못된 값은 버림). 재시작 후에는 모두 끊긴 상태이므로 보존 기한이 없던 착석자는 `savedAt + seatHoldMs`(갱신 안 함, 기존 멤버십 규칙과 동일), 기한이 지났으면 핸드 종료 후 해제된다.
- **공개 필드**: `players[]`에 `stack`·`seatHeldUntil`(끊긴 동안만 값)·`standingUp` 추가. 칩은 원래 테이블에서 공개되는 정보다. 토큰·계정 ID는 여전히 노출하지 않는다.
- **구·신 호환**: 구 클라이언트는 새 필드를 무시하고 기존처럼 동작한다(일어서기 버튼만 없음). 신 클라이언트 + 구 서버는 `standingUp`이 없으므로 일어서기 버튼을 숨긴다. 이 버전이 저장한 체크포인트를 이전 서버가 읽으면 새 필드를 무시한다(장부 잔액은 사라짐). 롤백은 기존 주의대로 방 0개 상태에서 한다.
- ~~정책 확인 필요~~ → 10절에서 해결: ① 다른 로그인 세션도 같은 방 복귀 시 좌석 복구 ② 끊긴 플레이어 차례 즉시 체크/폴드.

## 10. 재접속 보완·끊긴 차례 처리·리바이 C안·다음 핸드 참여 (2026-11-24 23:55 KST)

`hand.ts`(규칙·팟·사이드팟·환불·정산)는 바꾸지 않았다. 자동 체크/폴드도 일반 `act` 경로를 쓴다.

### 10.1 상태 모델 추가

```text
Member (lobby.ts)
  offlineConfirmed?: boolean      서버가 소켓 종료를 확인함(close/heartbeat). 응답 지연과 구분
  pendingRebuy?: number           승인됐지만 아직 반영되지 않은 리바이 칩(참여 중인 핸드 정산 후 반영)
  rebuyNotice?: {requestId, amount, approved, applied, at}   본인 리바이 결정(새로고침 복구)
  seatRestore?: {seat, stack, at} 유예 안 재접속으로 좌석이 돌아왔다는 안내(다음 핸드 시작 시 제거)
Room
  rebuyRequests: {id, playerId, amount, requestedAt}[]   요청자당 1건
  rebuyLog: {requestId, playerId, amount, approvedAt, appliedAt?}[]   승인 지급 내역(최근 50건)
  settledHandId?: string          결과를 멤버 잔액에 한 번 복사한 핸드. 이후 같은 핸드의 재동기화는 잔액을 덮지 않음
  recoveryTimer                   재시작 복구 30초 종료 시 syncGame
ChipLedgerEntry.extra?: number    방을 떠날 때 남은 pendingRebuy
```

### 10.2 재접속 정책

- **다른 기기·다른 로그인 세션**: 같은 계정의 새 로그인이 같은 방으로 돌아오면(`currentRoom`, 그 방 초대 코드 `join`, 그 멤버 토큰 `resume`) 멤버십을 새 세션으로 넘긴다(`takeOver`). 좌석·칩·착석/리바이 요청·플레이어 ID가 그대로 유지되고, 유예 안이면 승인 없이 좌석이 복구된다. 새 로그인이 **다른 방**을 만들거나 들어가면 이전 멤버십은 기존대로 즉시 정리된다.
- **이전 세션 무효화**: 인계 즉시 이전 소켓을 4003 `Account replaced`로 닫는다. `member.socket`이 새 소켓을 가리키므로, 이전 소켓에서 인증 대기 중이던 메시지나 늦게 도착한 메시지는 처리 직전 검사(`membership.member.socket !== socket`)에서 버려진다. 행동은 `handId`·`revision`도 맞아야 한다.
- **보존 시간**: 좌석 보존 180초(`seatHoldMs`). 서버 설정 `RECONNECT_MS`가 180000 미만이면 180000으로 올린다(허용 범위 30000~1800000 검사는 유지, 거부하면 기존 배포가 시작하지 못하므로 올림). 테스트용 `attachLobby` 옵션은 기존처럼 짧게 줄 수 있다.
- **핸드 중 멤버십 만료**: 유예가 끝났는데 아직 진행 중인 핸드에 남아 있으면 폴드(`depart`)하지 않고 핸드 종료 후 정리한다(장부에 칩 보존).
- **재시작**: 보존 기한은 마지막 저장 시각 기준이며 늘어나지 않는다(9절). 재시작 직후 모두 끊긴 상태이므로 30초 복구 구간에는 자동 체크/폴드를 하지 않고, 구간이 끝나면(타이머로 `syncGame`) 돌아오지 않은 플레이어의 차례부터 처리한다.

### 10.3 끊긴 플레이어의 차례 (FT-BUG-004)

- (11절에서 변경: "즉시" → 연결 종료 확인 후 **2초 유예** 뒤)
- `syncGame` 시작 시 `autoActOffline`: 현재 베팅 차례인 플레이어가 `confirmedOffline`이면 `legalFor`가 체크를 허용할 때 체크, 아니면 폴드. 다음 차례도 끊긴 플레이어면 이어서 처리(최대 64회 보호).
- 차례가 아닐 때 끊기면 아무것도 하지 않고, 차례가 오는 순간 처리한다. 리버 스퀴즈·런아웃은 기존 처리(`skipDisconnectedSqueeze`·타이머) 그대로.
- 소켓이 살아 있는 응답 지연은 처리하지 않는다(기존 턴 타이머).
- 같은 차례를 두 번 처리할 수 없다: 행동은 현재 차례 플레이어에게만 적용되고, 소켓 종료 이벤트는 그 소켓이 멤버십을 가진 경우에만 한 번 반영된다.
- ~~새로고침도 소켓 종료이므로 자기 차례에 새로고침하면 즉시 체크/폴드된다~~ → 11절 2초 유예로 2초 안에 돌아오면 처리되지 않는다.

### 10.4 리바이 C안 (FT-FEAT-005, `apps/server/src/rebuy.ts`)

- 요청: `requestRebuy {amount, clientRequestId?}`. `amount`는 1 이상 **방 한도(11.2절)** 이하 정수만 허용(`REBUY_REQUEST_INVALID`), 숫자가 아니면 `INVALID_REQUEST`. 요청자당 대기 1건. 착석 여부와 무관. 방장은 11.3절(승인 없이 지급).
- 결정: `resolveRebuyRequest {requestId, approve}`는 방장만. 요청을 먼저 큐에서 지운 뒤 처리하므로 같은 ID의 재승인·재전송은 `REBUY_REQUEST_INVALID`이고 칩이 다시 지급되지 않는다. 결과는 본인 `rebuyNotice`(새로고침·재접속 후에도 표시).
- 지급 시점: 요청자가 진행 중인 핸드에 참여 중이면 `pendingRebuy`에 보류했다가 그 핸드 결과가 잔액에 복사된 뒤 더한다(`applyPendingRebuys`). 참여 중이 아니면(관전자, 게임 중 착석 승인자, 핸드 없음) 즉시 더한다. 다음 핸드 시작 직전에도 한 번 더 적용한다.
- 정산 보호: 완료된 핸드의 결과는 `settledHandId`로 한 번만 멤버 잔액에 복사한다. 그래서 핸드 종료 후 더한 리바이 칩이 같은 핸드의 재동기화(패 공개·끊김 등)로 덮이지 않는다. 핸드 기록(`holdem.players[].stack`)·일일 기록·전적 집계는 실제 핸드 결과만 쓴다.
- 좌석과의 관계: 좌석 결정은 칩을 주지 않고 리바이 승인은 좌석을 옮기지 않는다. 일어선 뒤 리바이 → 재착석 요청, 리바이 없이 재착석 모두 가능.
- 방을 떠날 때 보류분은 장부의 `extra`로 보존되어 같은 계정이 돌아오면 함께 복구된다.
- ~~방장 본인의 리바이도 같은 큐에 들어가 방장이 승인한다.~~ → 11.3절: 방장은 승인 없이 지급.

### 10.5 다음 핸드 참여 (FT-FEAT-006)

- 딜 대상: 착석 + 접속 중 + 칩 > 0 + 일어서기 예약 없음, 좌석 번호 순. 진행 중 핸드에는 아무도 추가되지 않는다.
- 핸드 경계 처리 순서(`syncGame`): 핸드 결과를 잔액에 복사 → 기록 → 일어서기·유예 만료 좌석 해제 → 보류 리바이 반영 → 다음 핸드 예약 → 방송 → 핸드 중 만료된 멤버십 정리.
- 착석 승인·리바이 승인·일어서기 예약·끊김 보존이 같은 핸드에 겹쳐도 위 순서로 한 번에 정리된다(서버 테스트 "seat approval, rebuy, stand-up and a disconnect in the same hand…").

### 10.6 WebSocket 메시지

| 클라이언트 → 서버 | 처리 |
| --- | --- |
| `{type:'requestRebuy', amount}` | 리바이 요청(양의 정수) |
| `{type:'cancelRebuyRequest'}` | 본인 리바이 요청 취소 |
| `{type:'resolveRebuyRequest', requestId, approve}` | 방장만. 승인 시 서버가 1회 지급(보류 가능) |

서버 → 클라이언트: 새 메시지 타입 없음. 스냅샷에 `players[].pendingChips`, `rebuyRequests[]`(`id, playerId, nickname, amount, stack, pendingChips, expectedStack, requestedAt`, 전원 공개), `rebuyNotice`(본인), `seatRestore`(본인) 추가. 오류 코드 `REBUY_REQUEST_INVALID`(recoverable). 다른 기기 인계 시 이전 소켓 종료 코드 4003(기존 클라이언트는 "다른 기기에서 로그인" 안내 후 자동 재접속하지 않음).

### 10.7 UI (`apps/mobile/src/components/RebuyPanel.tsx`, `SeatPanel.tsx`)

- "칩 추가 요청" 버튼: 대기실·게임 화면 하단에서 "자리에서 일어나기"와 같은 줄. 누르면 모달(레이즈 금액 패널과 같은 방식, `KeyboardAvoidingView`)로 보유 칩·추가 요청 칩(숫자 키패드, 숫자 외 입력 제거)·승인 후 예상 칩을 보여 주고 "요청 보내기"/"닫기". 하단 행동 버튼과 겹치지 않는다.
- 요청자: 승인 대기(취소 가능)·승인 후 이번 판 끝나면 반영·추가 완료·거절 상태 표시.
- 방장: 요청자·보유 칩(보류분 포함)·요청 수량·승인 후 예상 칩과 "거절"/"칩 지급 승인". 게임 화면에서는 1건과 "외 N건".
- 좌석 상태: 유예 안 재접속 시 "연결이 복구됐어요. N번 자리와 보유 X칩을 그대로 이어가요.", 게임 중 착석 시 "N번 자리에 앉았어요. 다음 판부터 카드를 받아요."
- 구 서버(`rebuyRequests` 필드 없음)에는 리바이 UI를 표시하지 않는다.

### 10.8 저장 형식 호환

- 체크포인트 버전 1 유지, 필드만 추가(`rebuyRequests`·`rebuyLog`·멤버 `pendingRebuy`·`rebuyNotice`·`seatRestore`, 장부 `extra`). 잘못된 값은 복원 시 버린다. 이전 체크포인트는 새 필드 없이 그대로 읽힌다.
- 이 버전이 저장한 체크포인트를 이전 서버가 읽으면 새 필드를 무시한다: **보류 중인 리바이 칩과 대기 요청은 사라진다**(이미 반영된 칩은 잔액에 있으므로 유지). 롤백은 방 0개 상태에서 한다(기존 주의와 같음).
- 운영 SQLite 전적(`stats`)·Supabase 스키마 변경 없음.


## 11. 추가 정책: 2초 유예·리바이 최대 수량·방장 본인 리바이 (2026-11-25 00:30 KST)

사용자 확정 정책(2026-11-24 23:25). 결정 이유는 [결정 기록](decisions.md). `hand.ts`는 바꾸지 않았다.

### 11.1 연결 끊김 2초 유예 (FT-BUG-004 변경)

- 서버가 연결 종료를 확인하면(`close`·heartbeat 종료) `member.offlineAt = now`. 그 플레이어의 베팅 차례는 `offlineAt + offlineGraceMs`(기본 2000 ms)가 지난 뒤에만 자동 처리한다(체크 가능하면 체크, 아니면 폴드).
- 끊긴 순간 차례였거나 유예 중에 차례가 오면, 남은 유예만큼 `room.offlineTimer`를 걸고 깨어날 때 `syncGame`. 유예가 이미 지난 뒤 차례가 오면 즉시 처리.
- 2초 안에 같은 계정이 돌아오면(같은 기기 `currentRoom`/`resume`, 다른 기기 인계 10.2절) `offlineConfirmed`·`offlineAt`가 지워져 타이머가 깨어나도 아무것도 하지 않는다. 좌석·칩·핸드(내 카드 포함)는 그대로.
- 이미 실행된 자동 행동은 되돌리지 않는다(재접속 후에도 폴드 유지).
- 경쟁 상태: 새 소켓이 먼저 붙고 이전 소켓이 나중에 닫히면 그 종료는 멤버십을 갖지 않아 무시(끊김 아님). 닫힘과 재접속이 동시에 와도 유예 안이면 취소. 같은 소켓의 중복 종료 이벤트는 처음 한 번만 반영. 같은 차례를 두 번 처리할 수 없다(현재 차례 플레이어에게만 행동 적용).
- 서버 재시작: 유예 타이머·`offlineAt`은 저장하지 않는다. 재시작 직후 모두 끊긴 상태이며 30초 복구 구간(2초 유예보다 김) 동안 자동 처리하지 않고, 구간이 끝나면 돌아오지 않은 플레이어의 차례부터 처리한다. 3분 좌석 보존 기한은 저장 시각 기준(9절) 그대로.
- 소켓이 살아 있는 응답 지연은 처리하지 않는다(기존 턴 타이머).

### 11.2 방 설정 리바이 최대 수량 (`settings.maxRebuy`)

- `RoomSettings.maxRebuy?`: 1회 리바이 요청 한도, 1 이상 1,000,000,000 이하 정수(`validRoomSettings`). 공통 `rebuyLimit(settings) = maxRebuy ?? min(startingChips, 1e9)` — 값이 없는 기존 방·구 클라이언트는 **시작 칩이 한도**.
- 설정 편집기 5단계 "리바이 1회 최대"(프리셋 1,000/5,000/10,000), 대기실 설정 요약에 "리바이 최대 N" 표시. 기존 4단계(시작 칩·SB·BB·제한 시간)와 검증은 그대로.
- 서버: 요청·승인 시 한도 초과를 거부(`REBUY_REQUEST_INVALID`, "1회 최대 N칩"). 클라이언트 폼도 한도를 표시하고 초과 입력을 막지만 최종 판단은 서버.
- 설정 변경 시 대기 중인 요청을 새 한도로 다시 검사: 초과 요청은 취소되고 요청자에게 `rebuyNotice {approved:false, reason:'limit', limit}`("리바이 최대 수량이 N칩으로 바뀌어 … 취소됐어요"). 한도 안의 요청은 남는다. 한도를 다시 올려도 취소된 요청은 돌아오지 않는다.
- 칩 초기화 규칙: 시작 칩·SB·BB·제한 시간 중 하나라도 바뀌면 기존대로 전원 시작 칩으로 초기화. **한도만 바뀌면 칩을 유지**한다. 떠난 계정의 잔액 장부는 새 `room.chipRevision`(칩 초기화 때만 증가)으로 유효성을 판단하므로 한도만 바꾼 저장은 장부를 무효로 만들지 않는다.
- 구 클라이언트가 `maxRebuy` 없이 설정을 저장하면 방의 기존 한도를 유지한다.
- 저장: `settings`에 포함되어 체크포인트에 저장·복원(잘못된 값이면 기존처럼 기본 설정으로). `chipRevision` 저장, 없던 체크포인트는 `settingsRevision`으로 시작(기존 장부와 일치).

### 11.3 방장 본인 리바이

- 방장이 `requestRebuy`를 보내면 큐를 거치지 않고 `grantHostRebuy`: 같은 한도 검사 → 핸드 참여 중이면 `pendingRebuy`로 보류 후 핸드 종료 시 반영, 아니면 즉시 반영. 지급 내역(`rebuyLog`)에 기록, 본인 `rebuyNotice` 표시.
- 다른 플레이어 화면의 승인 대기 목록에 방장 요청은 나오지 않는다(큐에 들어가지 않음. 방장이 되기 전 남아 있던 본인 요청은 다른 사람 화면에서 숨김).
- UI: 방장에게는 버튼 "칩 추가", 폼 제목 "칩 추가", 안내 "방장은 승인 없이 바로 추가돼요", 확인 버튼 "칩 추가하기".

### 11.4 중복 요청·지급 방지

- 클라이언트(`RoomClient.requestRebuy`)가 탭마다 UUID `clientRequestId`를 붙인다. 서버는 최근 요청 ID 200개(`room.rebuySeen`, 체크포인트 저장, 복원 시 대기 요청·지급 내역의 ID도 포함)를 기억하고, 같은 ID가 다시 오면 아무것도 하지 않는다. 방장 즉시 지급의 재전송·재접속 후 재전송, 일반 요청의 재전송(대기 중이든 이미 결정됐든) 모두 해당.
- ID 형식은 UUID만 허용(방장 결정 메시지의 `requestId` 형식과 같게). 형식이 다르거나 없으면 서버가 새 ID를 만든다(재전송 보호 없음, 기존 구 클라이언트 동작).
- 승인 결정은 기존대로 요청을 먼저 지운 뒤 처리하므로 1회만 적용.

### 11.5 ~~확인 필요~~ → 확정 (2026-11-25 사용자 결정)

- `maxRebuy` 미설정 방의 한도 = 시작 칩(확정).
- 리바이 횟수·빈도 제한 없음, 요청당 한도만(확정).

### 11.6 WebSocket·저장 형식 변경 요약

- 클라이언트 → 서버: `requestRebuy`에 선택 필드 `clientRequestId`(UUID). `updateSettings`/`create`의 `settings`에 선택 필드 `maxRebuy`.
- 서버 → 클라이언트: `room.settings.maxRebuy?`, `rebuyNotice.reason?: 'limit'`·`limit?`. 새 메시지 타입 없음.
- 체크포인트(버전 1 유지, 필드 추가): 방 `rebuySeen`·`chipRevision`, `settings.maxRebuy`. 이전 서버로 롤백하면 이 필드들은 무시된다(한도는 사라지고 리바이는 이전 버전 규칙으로 동작). 롤백은 방 0개 상태에서.
- 서버 옵션(테스트·운영 설정 아님): `offlineGraceMs`(기본 2000), `recoveryMs`(기본 30000, 테스트 훅).


## 12. 배포 전 점검: 진단 로그·칩 총합 감사·호환성·배포 절차 (2026-11-25)

### 12.1 좌석 진단 로그 (`apps/server/src/seatEvents.ts`)

| 이벤트 | 언제 | 주요 필드 |
| --- | --- | --- |
| `seat_hold` | 끊긴 착석자 좌석 보존 시작(`started`), 3분 안 복귀(`reclaimed`), 3분 경과(`expired`), 3분 뒤 복귀(`expired_on_return`) | `seat`, `holdMs`/`leftMs`, `inHand` |
| `seat_released` | 좌석 해제(일어서기 `voluntary`, 보존 만료 `expired`) | `seat`, `reason`, `stack` |
| `auto_action` | 끊긴 플레이어 차례 자동 처리 | `action`(check·fold), `offlineMs`, `afterRestart`, `handRef` |
| `membership_takeover` | 같은 계정 새 로그인이 멤버십 인계(다른 기기) | `previousConnected`, `seat` |
| `rebuy` | `requested`·`approved`·`rejected`(host·limit)·`cancelled`·`host_granted`·`applied`·`dropped_limit`·`duplicate_ignored` | `amount`, `held`, `limit` |
| `chip_audit` | 핸드 정산마다(`hand`), 기준 재설정(`baseline`: chip_reset·settings_reset·restored) | `expected`, `actual`, `delta`, `ok`, `kind`(excess·missing) |

- 공통 필드: `event`, `level`, `timestamp`, `roomRef`(방 코드의 프로세스별 HMAC 16자리), `accountRef`(계정 id sha256 앞 16자리 — 기존 `ws_*` 진단과 같은 값이라 연결 로그와 이을 수 있음, 계정 없으면 `anon`). 닉네임·방 코드·계정/세션 id·토큰·카드는 기록하지 않는다(테스트로 고정).
- 제어: 서버 설정 `SEAT_EVENT_LOG`(기본 켜짐, `0`이면 끔). 방당 분당 120건 상한, 넘친 건수는 다음 창에서 `seat_events_suppressed` 1건으로 알림. 감사 실패(`level:error`)는 상한과 무관하게 항상 기록.
- 성능: 꺼져 있으면 호출마다 즉시 반환(해시·직렬화 없음). 켜져 있어도 이벤트는 좌석·리바이·핸드 단위라 빈도가 낮고, 게임 요청 경로에 대기(await)를 추가하지 않는다. 기존 `ws_*` 연결 진단, `GAME_TIMING_LOG`는 그대로.
- 추적 예: 재접속 = `ws_close`(accountRef) → `seat_hold started` → `ws_membership`(같은 accountRef) → `seat_hold reclaimed`. 2초 자동 처리 = `seat_hold started` 후 약 2초 뒤 `auto_action`.

### 12.2 칩 총합 감사

- 방마다 `chipExpected`(체크포인트 저장)를 둔다. 바뀌는 경우는 정상 조정뿐: 새 멤버의 시작 칩(+), 승인된 리바이·방장 리바이 지급(+, 보류 시점에 계산), 계정 없는 멤버 퇴장 시 그 칩(−), 칩 초기화·칩을 초기화하는 설정 변경(기준 재설정). 떠난 계정의 잔액 이동·재입장 복구·보류 리바이 반영은 총액을 바꾸지 않는다.
- 실제 총액 = 멤버 칩 + 보류 리바이 + 유효한 떠난 계정 잔액. 진행 중 팟이 없는 **핸드 정산 직후**에만 비교한다(핸드당 1회, O(인원)).
- 실제 > 기대 → `kind: excess`(예: 지급이 두 번 반영), 실제 < 기대 → `kind: missing`(정산 누락·칩 유실). `level:error`로 1회 기록 후 그 값을 새 기준으로 삼는다(게임은 계속).
- 기준이 없는 이전 체크포인트는 재시작 후 첫 정산에서 기준을 설정(`baseline restored`)한다.
- 한계: 핸드 중간 상태는 감사하지 않는다. 계정 없는 멤버가 올인 후 떠나 이긴 칩은 실제로 사라지므로 `missing`으로 보고된다(운영은 인증 필수라 해당 없음).

### 12.3 테스트 배포·백업·롤백 절차 (이 브랜치)

기존 [반복 배포 절차](deployment-workflow.md)를 따르고 아래를 더한다. 모든 원격 작업은 실행 직전 별도 승인.

1. **커밋(승인 필요)**: 배포 소스는 깨끗한 커밋이어야 한다. 이 브랜치는 아직 커밋이 없다. 커밋 대상·제외 목록은 [AI 인계](ai/HANDOFF.md) 2절 최신 블록.
2. **백업**: 테스트 Railway 로그·`/health`로 방 0개 확인 → Railway Files(또는 볼륨 백업)로 `/data/boardgame.sqlite`·`/data/stats.sqlite` 내려받기 → 파일 해시 기록. 운영 데이터는 건드리지 않는다.
3. **서버**: 후보 커밋의 깨끗한 `git worktree`에서 테스트 프로젝트 ID를 명시해 `railway up`. 새 환경 변수는 필요 없음(`SEAT_EVENT_LOG` 기본 켜짐). `RECONNECT_MS`가 있으면 값만 확인(180000 미만이면 서버가 180000으로 올림).
4. **웹**: `apps/mobile/.env.preview.local`(테스트 값) → `node --env-file=... scripts/build-pages.cjs` → 결과물 검사 → `wrangler pages deploy ... --branch fix-multiplayer-stability`(기존 Preview 별칭 유지 → 서버 Origin 설정 변경 불필요).
5. **점검**: `/health` 200·durable, 허용·차단 Origin, WSS `AUTH_REQUIRED`, 요청 목적지가 테스트 서버·테스트 Supabase뿐인지, 로그에 `server_started`·`ws_*`·`seat_*` 출력.
6. **테스터 안내**: Preview 웹만 사용(설치된 구버전 네이티브 앱은 새 서버에서 착석 불가).
7. **롤백**(방 0개일 때): 서버는 직전 배포 `290cb8a`를 같은 방식으로 다시 업로드, 웹은 이전 Preview 배포로 되돌림. 방이 남아 있으면 아래 12.4의 손실이 생기므로, 필요하면 2의 백업 파일로 `/data`를 되돌린다.

### 12.4 SQLite 호환성 검증 (테스트 DB 사본, 2026-11-25)

| 방향 | 방법 | 결과 |
| --- | --- | --- |
| 이전 → 새 | 브랜치 이전 형식 체크포인트(증가형 좌석 번호, 새 필드 없음, 진행 중 핸드)를 실제 SQLite 파일에 기록 후 새 서버로 시작 | 정상. 전원 고정 좌석 0..n-1 착석, 진행 중 핸드·칩 3,000 유지, 파일이 새 형식으로 다시 저장(버전 1 유지), `chipRevision`은 이전 `settingsRevision`에서 시작, 감사 기준은 첫 정산에서 설정 |
| 새 → 이전(롤백) | 새 서버로 모든 새 상태(관전자, 보류 리바이 300, 떠난 계정 잔액 1,200, 일어서기 예약, 좌석 요청, `maxRebuy` 5000, 진행 중 핸드)를 만든 SQLite의 **사본**을 `git archive`로 꺼낸 이전 서버 `290cb8a`(테스트 서버)·`595cd676`(운영)으로 시작 | 두 버전 모두 시작·방 복원·재접속·핸드 진행 정상. 단 첫 저장에서 새 필드가 사라짐: 보류 리바이·떠난 계정 잔액·리바이 한도/요청/내역·일어서기 예약·좌석 요청·감사 기준 손실, 관전자(D)가 다음 판부터 딜됨 |
| 새 → 이전 → 새 | 이전 서버가 쓴 파일을 다시 새 서버로 | 정상. 전원 착석으로 변환(좌석 번호 재배치), 칩·진행 중 핸드 유지, 한도는 기본값(시작 칩) |

- stats DB(`stats.sqlite`) 스키마는 바뀌지 않았다. 방 상태 DB는 테이블 구조 변경 없이 JSON 한 행(`checkpoint.payload`)이라 마이그레이션이 필요 없다.
- 운영 DB는 읽지도 바꾸지도 않았다. 실험 파일은 사용자 PC VM 임시 폴더의 사본이다.

### 12.5 SQLite 백업·복구 리허설과 Railway 복구 절차 (2026-11-25 17:15 KST, 테스트 환경)

리허설은 테스트 Railway(`friends-table-mp-test`/`boardgame-server-test`)의 `/data`를 **내려받기만** 하고, 복원·서버 실행은 사용자 PC VM의 격리된 임시 폴더에서 `3a28b09` 서버 코드로 했다. Railway DB 파일·변수·배포는 바꾸지 않았다.

**저장 방식(코드 기준, `stateStore.ts`·`FriendStatsStore.ts`)**

| DB | journal_mode | 잠금 | 서버 실행 중 다른 연결 |
| --- | --- | --- | --- |
| `boardgame.sqlite`(방 체크포인트) | DELETE | `locking_mode=EXCLUSIVE`(시작 시 `BEGIN EXCLUSIVE`로 획득, 종료까지 유지) | 읽기·백업 API·`VACUUM INTO` 모두 `database is locked` |
| `stats.sqlite`(친구 전적) | DELETE(기본) | 일반 | 읽기·백업 API·`VACUUM INTO` 가능(`busy_timeout`) |

- WAL을 쓰지 않으므로 `-wal`·`-shm` 파일은 생기지 않는다. 테스트 `/data`(17:00 무렵): `boardgame.sqlite`·`boardgame.sqlite-journal`·`stats.sqlite`·`lost+found/`만 있음. EXCLUSIVE 모드에서는 커밋 뒤에도 저널 파일이 남지만 헤더가 0으로 지워진다(받은 저널 첫 8바이트 `00…00` = 미완료 트랜잭션 없음).
- 서버는 **시작할 때와 SIGTERM 종료 때 체크포인트를 다시 저장**한다(`index.ts` `shutdown` → `lobby.close()` → `persist()`). 방이 없으면 그 사이에는 쓰지 않는다(테스트 파일 수정 시각이 11-23 그대로).

**백업 방법 검증(격리 VM, 실제 서버 저장소 코드로 DB를 연 상태에서 별도 프로세스로 시도)**

- 체크포인트: 백업 API·`VACUUM INTO` 불가(잠금). **방 0개·파일 미변경 상태의 파일 복사**만 가능 → 두 번 복사 해시 동일·`integrity_check` ok 확인.
- 전적: 백업 API(6페이지)·`VACUUM INTO` 모두 성공, 결과 `integrity_check` ok. 실행 중 백업이 필요하면 이 방법이 우선(Railway에서는 컨테이너 셸 명령 = 별도 승인).
- 실행 중 파일을 **제자리에서 덮어쓰면 손상**: 서버 실행 중 체크포인트 파일 위에 다른 백업을 복사하고 종료하자 `database disk image is malformed`. → 복구는 항상 **새 경로에 두고 경로 변수를 바꾸는 방식**.

**실제 테스트 DB 리허설 결과**

| 단계 | 결과 |
| --- | --- |
| 백업 시점 | `server_stats` 16:38~16:40 `rooms 0 · connections 0`, 파일 11-23 이후 미변경 |
| 내려받기(Files 브라우저 Download, 각 2회) | `boardgame.sqlite` 90,112 B `4e10c0a3e60faa95958062407e856dbb521af739eca5d7e445b3990a70410845`(2회 동일) · `stats.sqlite` 73,728 B `bf4bc263253653e19a5dd86e7d73678b98c449eaa6d7c81432a1efc33c664ef8`(2회 동일) · 사용자 PC 저장본 해시 사용자 확인 일치 |
| 격리 복원(VM 임시 폴더로 복사, 원본 `.qa-web/db-rehearsal` 읽기만) | 전체 SHA-256 일치, `integrity_check` 둘 다 ok, journal_mode delete |
| 내용(개수만) | 체크포인트 version 1·방 0(payload 48 B, 11-23 10:07 UTC 저장) · 전적 `recorded_hands` 58·`account_results` 176·계정 14 |
| 새 서버(`3a28b09`)로 시작 | `NODE_ENV=production`, `STATE_DB_PATH`·`STATS_DB_PATH`=복원 사본 → `server_started durable:true`, `/health` ok, 복원 체크포인트에 배타 잠금 걸림·두 파일 모두 서버 프로세스가 엶·기본 경로 파일 생성 없음 → **두 경로 변수가 실제 적용됨**, error 로그 0 |
| SIGTERM 종료 후 | 두 DB `integrity_check` ok, 체크포인트 다시 저장(방 0 유지), 전적 파일 **바이트 동일**(해시 불변)·개수 동일, 서버 코드 `FriendStatsStore.compare`로 읽기 정상 |
| 경로 변수(테스트 Railway 읽기) | `STATE_DB_PATH=/data/boardgame.sqlite`, `STATS_DB_PATH=/data/stats.sqlite`(볼륨 Mount `/data`) |

같은 스크립트로 진행 중 핸드가 있는 이전 형식 사본도 시작·종료 후 방·핸드 유지 확인(12.4와 같은 사본).

**Railway 복구 절차(필요할 때만, 각 원격 단계 별도 승인)**

1. 판단: 새 코드가 데이터를 망가뜨렸을 때만 복구한다. 단순 코드 롤백은 12.3의 7(이전 서버 재배포)로 충분하다(12.4: 이전 서버가 새 체크포인트를 읽음).
2. 현재 상태 보존: `server_stats`로 방 수 확인. 방 0개면 현재 `/data` 파일도 내려받아 둔다(사고 분석용, 삭제 금지).
3. 업로드: Files 브라우저 Upload로 백업을 **새 이름**으로 올린다. 예 `/data/restore-YYYYMMDD-HHMM/boardgame.sqlite`·`stats.sqlite`(폴더를 만들 수 없으면 `/data/boardgame.restore-YYYYMMDD-HHMM.sqlite` 형식). 기존 파일을 덮어쓰거나 지우지 않는다. 올린 파일을 다시 내려받아 SHA-256이 백업과 같은지 확인한다(Upload의 바이트 보존은 아직 미검증 → 첫 사용 때 확인).
4. 경로 전환: 테스트 서비스 변수 `STATE_DB_PATH`·`STATS_DB_PATH`를 새 경로로 바꾼다. 재배포 소스가 분명하도록 `railway variable set … --skip-deploys`로 바꾼 뒤 같은 커밋 worktree에서 `railway up`으로 다시 띄우는 것을 기본으로 한다(대시보드 staged "Deploy"의 재빌드 소스는 미확인).
5. 확인: `server_started durable:true`, `/health` 200, error 로그 0, Files 브라우저에서 새 경로 체크포인트 수정 시각이 시작 시각으로 바뀌고 옛 파일은 그대로인지.
6. 되돌리기: 문제가 있으면 변수를 원래 `/data/boardgame.sqlite`·`/data/stats.sqlite`로 돌리고 같은 방식으로 재시작(옛 파일은 손대지 않았으므로 그대로 복귀).
7. 정리: 옛 파일·복구 폴더 삭제는 안정화 뒤 별도 승인.

**서비스 중단 범위**

- 볼륨이 붙은 서비스는 배포가 겹치지 않으므로 재시작 동안 서버 전체가 멈춘다. 빌드는 이전 컨테이너가 돌아가는 동안 진행되고, 중단은 이전 컨테이너 종료 → 새 컨테이너 시작 → healthcheck 통과까지다. 시간은 아직 측정하지 않았다(첫 실제 배포에서 로그 시각으로 측정·기록).
- 그동안 모든 WebSocket이 끊기고 클라이언트는 재연결한다. 방·핸드는 복원한 체크포인트 시점으로 돌아가며, 그 뒤 생긴 방·칩 변화와 그 뒤 기록된 전적 핸드는 사라진다(방 0개일 때 받은 백업이면 방 손실 없음). 재시작 직후 30초 복구 창 동안 자동 체크/폴드는 하지 않는다.
- Supabase(계정·로그인)와 Cloudflare 웹은 영향 없음.
