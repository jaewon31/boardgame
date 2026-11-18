# 두 Android 클라이언트 연결 교체 조사

조사일: 2026-11-08 (KST). 실제 프로젝트: `C:\Users\jwseo\Desktop\boardgame`, 기준 HEAD `152747a`.
기존 `apps/mobile/eas.json`의 미커밋 변경은 그대로 보존했다. 커밋·푸시·Railway 설정 변경·배포·EAS 빌드는 하지 않았다.

## 결론과 검증 한계

- 서로 다른 검증된 익명 UUID 두 개가 같은 IP에서 접속하는 경우, 기존 연결을 교체하는 현상은 로컬 통합 테스트에서 재현되지 않았다. 방 생성/참가, 게임 진행, 한쪽 연결 손실/재접속, 동시 개별 방 생성이 통과했다.
- 같은 계정 UUID와 로그인 세션을 공유하는 두 클라이언트에서는 `4001 Session replaced`가 재현됐다. 서버의 한 자리당 한 연결 정책에 따른 동작이다.
- **확인한 클라이언트 버그:** `4001`로 종료된 클라이언트가 `error` 상태가 된 뒤 AppState `active` 이벤트에서 `refresh()`를 호출하여 기존 자리를 자동으로 재탈환한다. 상대도 같은 동작을 하면 서로 교체할 수 있다. 수정 전 통합 테스트에서 기대 `error`, 실제 `connected`로 실패했고, 수정 후 통과했다.
- 이 버그가 사용자 Railway 사례의 실제 원인이라는 것은 아직 확정하지 못했다. 설치된 preview APK의 코드/배포 서버 버전, 실제 두 기기의 UUID 및 종료 코드는 확보하지 못했다. 서로 다른 닉네임만으로 서로 다른 계정이라고 단정할 수 없다.
- ADB에서 `emulator-5554`는 `TEST`, `emulator-5556`는 `TEST2`이며 두 앱 프로세스가 실행 중인 것은 확인했다. 제한된 최근 앱 로그에는 알려진 연결/인증 오류가 없었다. 이는 정상 동작의 증거가 아니라 기존 진단 로그 부재다. 인증 저장소 추출, 앱 데이터 삭제, 계정 생성/교체, 운영 게임 상태 변경은 하지 않았다.
- 테스트는 실제 로컬 HTTP/WebSocket 서버 + 실제 RoomClient + 실제 accountAuthorizer를 사용한다. 외부 Supabase HTTP 응답만 모사한다. Android 네이티브 SecureStore/실제 Supabase/Railway 환경의 종단간 검증을 대신하지 않는다.

## 서버 연결 및 상태 구조

| 구조/단계 | 코드와 판정 |
| --- | --- |
| 시작 | `apps/server/src/index.ts`: Supabase 설정이 없으면 기동 실패. 검증 함수 `accountAuthorizer`를 `attachLobby`에 주입. 서버 전체가 인증 없이 운영되는 fallback 없음. |
| WebSocket 생성 | `lobby.ts`: `/lobby`, payload 최대 12288B, 압축 해제. HTTP 업그레이드 시점에는 사용자 식별 없이 소켓을 만들고 각 메시지에서 인증. |
| 전체 연결 | `wss.clients`는 소켓별 Set. 단일 전역 currentSocket으로 다른 사용자를 덮어쓰는 구조가 아님. |
| IP 제한 | `connectionsByIp: Map<string, number>`는 개수만 기록. 기본 전체 240, IP당 24. 초과 시 **새 소켓**을 1013으로 거절하며 기존 소켓은 종료하지 않음. 닉네임/UUID/사용자 연결 소유권으로 사용하지 않음. |
| 방/자리 | `rooms: Map<roomCode, Room>` → `room.players: Member[]`. 각 Member에 accountId, loginId, player id, 재접속 token, socket을 별도로 저장. 닉네임은 방 내 표시/중복 검사 용도. |
| 연결별 상태 | `membership`, 요청 큐, 속도 제한 카운터, join timeout은 connection 콜백의 지역 상태. 요청 큐는 소켓별 직렬 실행. |
| heartbeat | `alive: WeakSet<WebSocket>`, 소켓별 pong. 기본 15초마다 확인, 응답 없는 해당 소켓만 terminate. 클라이언트는 별도 앱 수준 ping을 기본 5초마다 전송하고 15초 무응답을 감지. |
| 인증 | `accountSession.ts`: Bearer 토큰으로 Supabase `current_account_session` POST 호출(4초 timeout). 성공한 RPC의 UUID를 accountId로 사용하고, 검증이 성공한 JWT에서만 session_id를 사용. 클라이언트가 보낸 accountId/nickname을 신뢰하지 않음. |
| 인증 후 대기 검사 | await 이후 socket OPEN 및 현재 소유권을 재검사. 인증 대기 중 종료/교체된 소켓은 방을 변경하지 않음. |
| 세션 교체 | 같은 accountId + 다른 loginId: 이전 자리를 제거하고 이전 소켓을 4003으로 종료. 다른 accountId는 이 조건을 만족하지 않음. |
| currentRoom | 검증된 accountId + loginId가 같은 기존 자리를 찾고 새로운 소켓을 먼저 할당한 다음 이전 소켓을 4001로 종료. 다른 사용자의 currentRoom은 상대 자리를 가져오지 않음. |
| resume | code/token과 인증 계정 소유권을 확인. 새로운 소켓을 할당한 후 이전 소켓을 4001로 종료. 현재 앱은 인증이 있으면 저장된 방 토큰보다 currentRoom 조회를 우선. |
| 종료 cleanup | IP 개수 감소 후 `membership.member.socket === socket`인 경우에만 offline 처리. 교체된 소켓의 늦은 close가 새 연결을 제거하지 않음. 기본 5분 동안 자리 보존. 명시적 leave는 즉시 자리 정리/방장 위임. |
| 전체 종료 | persistence 오류, 치명적 통계 저장 오류, 서버 shutdown은 전체 종료 가능. B의 단순 접속이 전역 종료를 직접 호출하는 경로는 없음. 운영 오류 로그와 함께 구분해야 함. |

## Supabase 익명 UUID와 클라이언트 cleanup

- `anonymousSession.ts`의 WeakMap은 `auth` 객체별 진행 중 Promise 중복 제거용이며 완료 후 삭제된다. 두 설치가 네트워크로 공유하는 전역 계정 Map이 아니다.
- `ensureAccountSession`은 기존 getSession 결과를 우선 보존하고 세션/계정 표식이 없는 설치에서만 signInAnonymously를 호출한다. UUID 하드코딩이나 닉네임으로 UUID를 만드는 코드가 없다.
- `authClient.ts`의 Supabase 클라이언트와 SecureStore 어댑터는 앱 프로세스/설치 내 singleton이다. 같은 APK/프로젝트 공개 키를 쓰는 것 자체가 같은 익명 계정이라는 뜻은 아니다. 설치별 저장소 격리는 모사 테스트로 확인했으며 실제 에뮬레이터의 데이터 복제 여부는 미확인이다.
- `003_single_session.sql`, `005_repair_account_session.sql`, `006_readonly_session_policies.sql`은 auth.uid() 사용자별 세션을 조회한다. 전역 최신 사용자 한 명만 허용하는 쿼리가 아니다. `account_sessions`의 primary key는 user_id다. 실제 운영 SQL 적용 상태는 이번에 조회/변경하지 않았다.
- `useRoom.ts`는 accountId별 RoomClient를 만들고 계정 변경/cleanup에서 subscription 제거 및 dispose를 실행한다. 토큰 공급 시 현재 session.user.id와 해당 accountId가 같은지 확인한다.
- `RoomClient.ts`의 generation 검사는 이전 socket의 늦은 open/message/close 및 늦은 토큰 조회가 새 연결에 영향을 주지 않게 한다. disconnect는 해당 인스턴스의 타이머/소켓만 정리한다. dispose는 서버 leave가 아니므로 재접속 자리를 보존한다.
- `App.tsx`는 계정/profile 검증 실패로 sessionBlocked가 되면 useRoom에 null을 전달할 수 있다. 이 경우 해당 기기의 cleanup/재생성이 일어날 수 있지만, 다른 계정의 소켓을 직접 종료하지 않는다. 새 `client_cleanup`의 `dispose` 및 인증 로그로 구별할 수 있다.

## 원인 후보와 다음 판별 기준

| 후보 | 근거/예상 로그 |
| --- | --- |
| 두 설치가 동일 인증 세션을 공유 | `ws_authenticated.accountRef`와 `sessionRef` 모두 같고 `ws_replaced` code 4001. 로컬에서 증상 재현. 복제한 AVD 데이터/동일 세션 사용 여부는 아직 추정. |
| 같은 계정의 서로 다른 로그인 | accountRef 같음, sessionRef 다름, 4003 Account replaced 또는 Account session expired. 정상적인 단일 로그인 정책. |
| 앱 foreground의 자동 재탈환 | 4001 뒤 AppState active에서 새로운 currentRoom 접속. 확인하여 수정한 부분. |
| IP/전체 연결 제한 | 1013 + Too many connections / Server busy. 기존 연결 축출 구조는 아니므로 2개만으로 교대 종료되는 직접 설명은 아님. 프록시를 같은 IP로 집계할 수는 있음. |
| 네트워크/에뮬레이터 정지/인증 지연 | 1006, ws_terminate heartbeat_timeout, client_timeout, ws_auth_unavailable 등을 확인. 현재 운영 증거 없음. |
| 서버 재시작/상태 저장 실패 | serverId 변경, server_shutdown, persistence_failed/stats_persistence_failed 등. 운영 로그 확인 필요. |
| 다중 replica/서로 다른 배포 버전 | serverId 및 배포 버전 확인 필요. 상태는 프로세스별이며 분산 membership 저장소가 아님. |

## 수정 파일

- `apps/mobile/src/services/RoomClient.ts`: 교체/인증 거절 후 자동 foreground refresh 억제. 명시적 refresh와 정상적인 네트워크 재접속 유지. 안전한 연결/종료/timeout/retry/cleanup 로그 추가.
- `apps/mobile/src/hooks/useRoom.ts`: AppState 이벤트는 `refresh(true)`, 사용자 retry는 기존 `refresh()` 사용. UUID의 SHA-256 앞 16자리만 `client_account.accountRef`로 기록.
- `apps/server/src/lobby.ts`: 접속·admission·검증·membership·교체·close 요청·close 완료·terminate·cleanup 진단. 교체 정책/게임 규칙/저장소 구조는 유지.
- `packages/shared/src/connectionDiagnostics.ts`, `packages/shared/src/index.ts`: 종료 reason 허용 목록과 export. 임의 reason 문자열은 `redacted`로 기록.
- `apps/server/test/multiplayer.test.ts`: 실제 로컬 소켓을 사용하는 통합 테스트 6개.
- `apps/server/test/anonymous-isolation.test.ts`: 설치별 인증 저장소/중복 요청/재시작 UUID 보존 테스트 1개.
- 이 보고서.

`replaced` 차단은 현재 RoomClient 수명 내 자동 foreground 재시도를 막는 최소 수정이다. 사용자의 명시적 재접속, 앱 재실행/계정 effect 재생성은 계정의 자리를 다시 조회할 수 있다. 두 기기가 동일 인증 정보를 공유한다면 이 수정만으로 서로 다른 두 사용자가 되는 것은 아니다. 원인을 확인하지 않은 상태에서 익명 계정을 자동으로 새로 만들거나 기존 데이터를 지우지 않았다.

## 진단 로그 판독

서버에는 `serverId`, `connectionId`, 검증 후 `accountRef`/`sessionRef`가 기록된다. identity ref는 SHA-256의 첫 16 hex 문자이며 실제 인증 판단에는 사용하지 않는다. 클라이언트는 기기 로그 안에서 `clientId`와 `generation`을 함께 보고 `client_account.accountRef`를 서버의 accountRef와 대조한다. 원본 UUID, JWT/access/refresh token, 방 재접속 token, 닉네임, 방 코드, 메시지 payload, 오류 원문은 추가 로그에 출력하지 않는다. 로그 sink 예외도 연결 상태에 영향을 주지 않도록 처리했다.

1. 향후 검토된 서버 변경 및 새 preview APK 적용 후, 두 기기에서 연결을 시도한 시각의 `client_account`, `client_close`, `ws_authenticated`, `ws_replaced`, `ws_close_requested`, `ws_close`를 비교한다. 이번에는 APK 교체나 배포를 하지 않았다.
2. accountRef가 다르면 서로 다른 UUID다. 같으면 동일 계정일 가능성이 매우 높으므로 별도 닉네임만으로 독립 사용자라고 판단하지 않는다. 인증 ref는 진단용 축약 해시이므로 암호학적으로 절대적인 유일성 보장은 아니다.
3. `ws_replaced.previousConnectionId`로 교체 대상 소켓을 찾고 그 소켓의 `ws_close`를 확인한다. `ws_cleanup.ownsMembership=false`는 이전 소켓이 새 자리 소유권을 건드리지 않았다는 뜻이다.
4. `client_close.stale=true`는 이미 폐기된 generation의 종료 이벤트다. 진단에는 남지만 현재 상태/재시도는 바꾸지 않는다.
5. 4001=동일 자리 교체, 4003=계정 세션 거절/교체, 1008=가입 timeout 또는 요청 제한, 1013=접속 제한/인증 일시 장애, 1011=요청 처리 오류. 1006은 관측된 비정상 종료이며 단독으로 원인을 단정하지 않는다. 서버가 요청한 close 코드와 클라이언트가 관측한 코드가 다를 수도 있다.

## 검증 결과

- 수정 전 전체 기존 테스트: **123/123 통과**.
- 수정 전 신규 재현 테스트: 독립 두 사용자 2개 통과, 동일 세션 foreground 자동 재탈환 방지 1개 실패(기대 error, 실제 connected).
- 수정 후 신규 테스트: **7/7 통과**.
- 최종 `npm test`: **130/130 통과**, 실패/skip/cancel 0. 기존 방 생성·참가·설정·게임·재접속·계정/RLS·영속화/재시작 검증 포함.
- `npm run typecheck`: mobile/server/shared 모두 통과.
- `npm run export:mobile`: Android/iOS Hermes 번들 생성 성공. APK 설치/네이티브 실행 테스트와는 구분한다.
- `git diff --check`: 통과.
- 기존 Node의 MODULE_TYPELESS_PACKAGE_JSON/실험적 SQLite 등 경고는 실패로 취급되지 않았다. 관련 패키지 설정 변경은 하지 않았다.

## Railway 설정 변경 여부

이번 증거로는 Railway 설정 변경이 필요하다고 확정할 수 없다. 확인할 항목은 다음과 같으며 실제 설정은 읽거나 변경하지 않았다.

- 현재 서버의 로컬 메모리/SQLite 구조는 replica 1을 전제로 한다. 실제 값이 여러 개라면 단일 replica 또는 별도 분산 상태 설계 검토가 필요하다.
- MAX_CONNECTIONS/ MAX_CONNECTIONS_PER_IP가 비정상적으로 낮거나 프록시 IP로 연결이 몰리는지는 1013과 admission 개수를 보고 판단한다. 기본 IP당 24는 정상적인 두 연결을 수용한다. TRUSTED_PROXY_IPS를 임의로 넓히지 않는다.
- 서버의 Supabase 프로젝트/현재 RPC 정의와 APK가 사용하는 프로젝트가 일치하는지 확인한다. 지금 SQL 재적용/환경변수 교체가 필요하다는 증거는 없다.
- 추가 서버 로그를 운영에서 보려면 추후 검토 후 서버 배포가 필요하다. 클라이언트 수정/로그는 새 APK 빌드·설치가 필요하다. 이번 작업에서는 둘 다 수행하지 않았다.
