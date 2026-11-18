# Railway 연결 불안정 추가 조사

조사일: 2026-11-08 KST. 기준 커밋 `79b85847b5ae2d3c3071ba9d2b36ce985fde71ee`.
범위: 실제 저장 로그/ADB 읽기, 코드 분석, 로컬 수정과 테스트. 커밋·푸시·Railway 배포·설정 변경·APK 빌드를 하지 않았다. Supabase 설정/DB, 설치 앱 데이터와 익명 세션도 변경하지 않았다.

## 확인한 사실과 미확정 사항

1. 다운로드된 실제 Railway 파일 `C:\Users\jwseo\Downloads\logs.1794074993470.log`는 390행 중 375행이 본문 없는 `[inf]`다. `2026-11-07 18:02:00–18:07:59 UTC` 구간은 133행 모두 빈 본문이며 컨테이너 시작/종료 기록은 없다. 한국 시각은 **11월 8일 03:02–03:07 KST**다. 17:52:17–18 UTC 재시작은 앞서 수행한 배포 시각과 일치하며 이 구간의 반복 연결 손실 자체를 설명하지 않는다.
2. ADB에서 기존 앱 로그만 읽어 고정 진단 필드로 추렸다. 두 기기의 `client_account.accountRef`가 다르므로 **앱에 기록된 계정 UUID가 서로 다르다**. 닉네임만으로 판단한 이전 조사보다 강한 증거다. 원본 UUID/토큰은 추출하거나 출력하지 않았다. 서버가 실제 RPC로 검증한 UUID까지 비교하려면 서버 구조화 필드가 필요하다.
3. 읽은 Android 로그에는 heartbeat_timeout, join_timeout 및 1006이 반복된다. 4001/4003 교체는 이 표본에서 관측되지 않았다. 일부 1008도 이미 폐기된 generation의 stale close로 나타난다. 이번 증상을 동일 계정 자리 교체로 결론내리지 않는다.
4. **확인한 로깅 결함:** 현재 서버는 `console.info(JSON.stringify({event,...}))`를 출력하며 필수 `message`가 없다. Railway 공식 문서는 구조화 로그의 표시 본문으로 message를 요구한다. stdout 호출이 빈 문자열을 출력하는 것이 아니라, JSON 표시 규격을 충족하지 않는 것이다. 로컬 기본 stdout 테스트에서 event-only 기록의 message 부재를 재현하고 보정된 실제 소켓 로그의 비어 있지 않은 message를 확인했다.
5. **재현한 연결 판정 결함:** 마지막 pong 이후 시간이 길면 아직 새 ping을 보내지도 않았는데 OPEN 소켓을 끊는다. JS 타이머/앱 활성화가 늦어진 상황에서 불필요한 재접속을 일으킬 수 있다. 수정 전 재현 테스트에서 connected 대신 reconnecting이 발생했고 수정 후 통과했다. 단, 실제 Android 로그의 모든 timeout이 이 결함 때문임을 입증하지는 못했다.
6. 정상 두 사용자 동시 접속에서 상대 사용자 때문에 강제로 교대 종료되는 것은 로컬에서 재현되지 않았다. 실제 네트워크 손실, 에뮬레이터 스케줄링 지연, 토큰 조회 대기, Supabase RPC 지연 중 무엇이 운영에서 주된 원인인지는 다음 수집으로 분리해야 한다. `stale:false`인 실제 1006도 관측되어 로컬 선제 종료만 있는 것은 아니다.

## Railway 로그 출력·수집·표시 구분

- `apps/server/src/lobby.ts`의 기본 diagnostic은 JSON 한 줄을 stdout으로 쓴다. 기존에는 이벤트/연결 ID는 있지만 message/level/timestamp가 없었다. `index.ts`의 startup/stats/error 및 persistence 실패 로그에도 같은 문제가 있었다.
- [Railway 공식 로그 규격](https://docs.railway.com/observability/logs)은 `message` 필수, `level` 및 사용자 정의 필드를 설명한다. `console.info`를 `console.log`로 바꾸는 것만으로 해결할 문제가 아니다. 둘 다 이 코드에서 stdout 출력이다.
- 수정된 모든 해당 로그는 `event`, `message=event`, `level`, UTC ISO `timestamp`를 가진 단일 JSON 행이다. 허용한 숫자/고정 문자열/계정 해시만 추가한다. 별도 로깅 라이브러리·새 의존성을 도입하지 않았다.
- 실제 export에 빈 `[inf]` 행이 존재하므로 수집된 레코드 자체가 전혀 없는 상황과는 다르다. 로그 처리량 초과 경고도 해당 export에서 발견하지 못했다. 그러나 export가 누락한 custom attributes, 필터 상태, Railway 내부 파싱 결과는 이 파일만으로 복원할 수 없다.
- Railway 브라우저 직접 검사는 컴퓨터 사용 도구가 현재 브라우저 URL을 충분히 확신할 수 없다고 판단하여 중단됐다. 우회하지 않았다. 따라서 라이브 Railway UI의 각 빈 행 내부 필드를 직접 확인했다거나 로컬 수정이 운영 표시 문제를 이미 해결했다고 주장하지 않는다.
- 기존 로그를 찾을 때 단순 본문 검색 대신 `@event:ws_close`, `@event:ws_terminate`, `@event:ws_auth_unavailable` 같은 custom-attribute 필터를 시도할 수 있다. 속성이 실제 보존되어 있는지는 로그 상세/JSON 내보내기로 확인해야 한다. 이번에는 UI 필터를 변경하지 않았다.

## heartbeat와 종료 순서의 코드 근거

### 서버

- `lobby.ts`의 `alive: WeakSet<WebSocket>`는 각 소켓의 RFC WebSocket control pong을 추적한다. 기본 15초마다 alive를 지우고 control ping을 보낸다. 다음 확인까지 pong이 없으면 해당 소켓을 terminate한다. 다른 소켓의 pong이 서로의 생존 여부를 덮어쓰지 않는다.
- application JSON ping은 이 control ping과 별개다. 각 소켓의 직렬 요청 큐를 거치고 `accountAuthorizer`의 Supabase RPC 검증(요청당 최대 4초)을 받은 뒤 JSON pong을 보낸다. control pong 성공이 JSON ping 처리 성공을 보장하지 않는다.
- 서버 initial membership timeout은 15초다. 클라이언트 연결/방 조회 timeout은 소켓 생성 시점부터 8초이며 Android native connect timeout은 소스상 10초다. 느린 연결에서는 클라이언트가 먼저 폐기하고 서버는 뒤늦게 1008 Join timeout으로 닫을 수 있다. 이번에는 이 값을 임의로 늘리지 않았다.
- 같은 accountId/sessionId의 currentRoom/resume만 4001 교체, 같은 accountId의 새 loginId만 4003 교체다. IP당 Map은 개수만 기록하며 초과 시 새 소켓을 거절한다. 기존 연결 축출은 하지 않는다.
- 서버 저장 오류/종료는 전체 소켓을 종료할 수 있지만, 이번 장애 구간 export에는 재시작 증거가 없다. 빈 본문 때문에 persistence_failed 등 이벤트 유무는 그 파일만으로 판단할 수 없다.

### 클라이언트

- 기존 `checkConnection()`은 `Date.now() - lastPong >= 15000` 또는 readyState가 OPEN이 아니면 바로 `connectionLost()`를 호출했다. 첫 ping을 보낼 기회도 없었던 JS 지연 역시 같은 분기로 들어갔다.
- `connectionLost()` → `disconnect('connection_lost')` → generation 증가/타이머 해제/로컬 socket.close() → 재시도 예약 순서다. native close 이벤트가 뒤늦게 도착하면 원래 generation과 현재 값이 달라 `stale:true`다. 이 이벤트는 로그만 남기고 새 소켓에는 영향을 주지 않는다.
- 실제 예: A의 로그 시각 18:08:45.116에 heartbeat_timeout/cleanup이 먼저 있고 18:08:54.144에 이전 generation=20의 1006 stale close가 나타난다. 이는 1006이 그 cleanup을 유발한 순서가 아니다. 반대로 18:09:17.791에는 1006 stale=false가 먼저 나오고 cleanup이 이어지는 전송 종료 경로도 있다. 시각은 원본 Android 로그 표기를 유지했다.
- connectionLost 호출 경로는 transport close, OPEN 아님, heartbeat, 초기 연결/방 조회 timeout, 토큰 조회/송신 실패, 설정 저장 timeout, leave 응답 timeout, 재시도 가능 서버 오류, 명시적 재시도다. 새 `client_connection_lost.reason`으로 이 경로들을 구분한다.

## 로컬 수정

| 파일 | 변경 |
| --- | --- |
| `apps/mobile/src/services/RoomClient.ts` | 마지막 pong 나이만으로 폐기하지 않고 실제 pending ping의 대기시간 사용. 송신 전 큐/토큰 대기와 송신 후 pong 대기 각각 15초 예산. client_connection_lost를 cleanup 전에 기록. ping queued/sent/pong, queueWaitMs/tokenWaitMs, ping 대기시간·readyState 기록. 서버 연결 ID 수신 및 stale close에도 해당 소켓 ID 유지. native 오류는 timeout/dns/tls/refused/reset/closed/unknown 고정 분류만 출력. |
| `apps/mobile/src/hooks/useRoom.ts` | 계정 해시 진단도 공통 구조화 로그 형식 사용. 인증 저장/복구 흐름은 그대로 유지. |
| `apps/server/src/lobby.ts` | 서버 발급 임시 serverId/connectionId를 `connection` 메시지로 전달. control ping/pong/timeout, JSON ping 수신/큐 대기/인증시간/pong 송신 로그 추가. 회원 소유권, 인증 검증, heartbeat 강제 종료 정책 유지. |
| `apps/server/src/index.ts` | 시작/통계/오류 로그에도 message/level/timestamp 적용. |
| `packages/shared/src/connectionDiagnostics.ts` | 공통 logRecord, 연결 ID 형식 검사, native 오류 원문을 출력하지 않는 고정 범주 분류. |
| `packages/shared/src/index.ts` | 새 진단 메시지 타입과 공통 함수 export. |
| `apps/server/test/heartbeat-diagnostics.test.ts` | JS timer 지연, 무응답 pong, 종료 이벤트 순서, 토큰 조회 정체/지연, 연결 ID 검증과 stale 이벤트 보존 테스트. |
| `apps/server/test/connection-diagnostics.test.ts` | 실제 서버 기본 stdout, wire ID와 서버 로그 상관관계, 무응답 control pong 시 해당 소켓만 종료, 표시 본문 및 개인정보 비노출 검증. |

`connection`은 인증 전 소켓에 보낼 수 있는 진단 전용 메시지이며 계정/방/게임 정보가 없다. ID는 서버가 새로 만든 임시 값으로 사용자 UUID가 아니다. 이전 앱은 알 수 없는 message type을 무시하며 새 앱도 이 메시지 없는 기존 서버와 동작한다. 이 진단 메시지를 heartbeat 성공이나 로그인 성공으로 간주하지 않는다.

토큰·원본 계정 UUID·닉네임·IP·URL·방 코드·카드·payload·오류 원문은 추가 로그에 기록하지 않는다. 계정 해시는 이전 방식(SHA-256 앞 16자리)을 유지한다. 정상 게임 상태나 디스크 스키마는 변경하지 않았다. 기존 eas.json과 이전 조사 보고서도 보존했다.

## 재현과 테스트

- 수정 전 신규 테스트: 정상 OPEN 소켓에서 JS 시간을 60초 진행시킨 뒤 checkConnection을 호출하면 reconnecting으로 잘못 전환됨. 종료 원인을 cleanup 전에 남기는 진단도 없음.
- 수정 후: 같은 경우 ping을 전송하고 연결을 유지. 응답 없는 실제 pending ping은 정해진 시간 후 끊음. 토큰 조회가 멈춘 경우에도 무한 대기하지 않고 ping_send_timeout으로 분리. 만료된 generation의 뒤늦은 토큰 반환은 전송하지 않음.
- 실제 로컬 서버 테스트: control pong을 보내지 않는 소켓만 1006 종료, 같은 서버의 정상 소켓은 OPEN 유지. 송수신 연결 ID와 서버 로그가 일치. 기본 stdout JSON에는 비어 있지 않은 message/level/timestamp가 있음.
- 최종 `npm test`: **138/138 통과**(기존 130 + 신규 8), 실패/skip/cancel 0.
- 모바일 UI 테스트 `node --test apps/mobile/test/*.test.cjs`: **5/5 통과**.
- `npm run typecheck`: mobile/server/shared 모두 통과. `git diff --check` 통과(기존 CRLF→LF 정규화 경고만 있음).
- 실제 Android 네이티브 지연/패킷 손실과 Railway 수집기 자체는 로컬 테스트로 완전히 재현하지 않았다. 실제 배포 원인 확정에는 아래 검증이 필요하다.

## 다음 실기기 검증 방법 — 이번에는 실행하지 않음

1. 별도 승인 후 서버 수정과 새 preview APK를 함께 적용한다. 기존 사용자 데이터/익명 세션을 보존하고 앱 삭제나 데이터 초기화 없이 동일 서명 APK로 업데이트한다.
2. 두 에뮬레이터에서 3분 이상 동시에 같은 방에 머물며 한 판 진행한다. Android의 client_account를 비교하고, 각 client_server_connection의 serverId+connectionId를 Railway 로그의 같은 필드와 대조한다. timestamp는 UTC를 기준으로 맞춘다.
3. Railway에서 message가 정상 표시되는지 먼저 확인한다. 상세/JSON 로그에서 `@connectionId:<해당 임시 ID>`로 소켓 한 개의 흐름을 따라간다. 이전 배포의 빈 텍스트 export만 다시 모아서는 원인을 분리할 수 없다.
4. 같은 pingId로 `client_ping_queued → client_ping_sent → ws_app_ping_received → ws_app_pong_sent → client_pong`을 비교한다.
   - queued만 있음: 로컬 송신 큐/토큰 조회 대기. ping_send_timeout과 queueWaitMs/tokenWaitMs 확인.
   - sent는 있으나 서버 수신 없음: 네트워크·프록시·실제 송신 또는 서버 수신 이전 구간 확인. native send 반환은 전달 보장이 아니다.
   - 서버 수신 후 응답 없음/느림: ws_auth_unavailable 및 authMs, queueWaitMs 확인.
   - 서버 송신 로그는 있으나 앱 pong 없음: 다운링크/앱 이벤트 처리 지연 확인. 송신 호출 로그 역시 전달 보장은 아니다.
   - ws_transport_timeout: control pong 누락. 앱 수준 ping과 별개로 판독.
5. `client_connection_lost`와 `client_close` 순서를 비교한다. stale=true close만 보고 서버 축출로 결론내리지 않는다. remote_close + stale=false면 실제 종료 경로와 failureCategory를 확인한다. 오류 범주는 문자열 기반 단서이며 단독으로 네트워크 원인을 입증하지 않는다.
6. 한쪽을 백그라운드/일시 정지했다 복귀, 짧은 네트워크 단절 후 복구를 각각 검증한다. 오래 정지되어 서버가 이미 끊은 경우의 정상 재접속과, OPEN으로 남아 새 probe에 응답 가능한 경우를 구분한다. 정상 기기가 함께 종료되지 않는지 확인한다.

이번 작업의 중간 스크립트와 테스트 출력은 `C:\Users\jwseo\Documents\ChatGPT\앱\multiplayer-investigation` 및 작업 폴더의 phase2 로그에만 있다. 배포 산출물로 커밋하지 않았다.
