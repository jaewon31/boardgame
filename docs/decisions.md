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

2026-11-24 좌석·재접속·리바이 결정(사용자 지시, 구현 `feature/seat-management` 미커밋, 상세 [좌석 관리](seat-management.md) 9·10절):
- 연결 끊긴 플레이어 차례(FT-BUG-004): 서버가 연결 종료를 확정한 경우(소켓 close·heartbeat 종료)에만 즉시 체크 가능 시 체크, 아니면 폴드. 소켓이 살아 있는 응답 지연은 기존 턴 타이머. 재시작 직후 30초 복구 구간은 제외.
- 재접속: 같은 계정이면 다른 기기·다른 로그인 세션도 3분 안에 같은 방으로 돌아오면 좌석·칩을 복구하고, 이전 세션은 즉시 무효(4003, 늦은 메시지 무시). 실제 보존 시간이 180초보다 짧아지지 않도록 `RECONNECT_MS` < 180000은 180000으로 올린다(서버 시작 실패를 피하려고 거부하지 않음). 재시작은 보존 기한을 늘리지 않는다.
- 리바이 C안(FT-FEAT-005): 플레이어가 수량을 입력해 요청, 방장 승인 시 서버가 기존 잔액에 1회 더함. 핸드에 참여 중이면 그 핸드 정산 후 반영. 좌석 요청과 별도 큐·별도 승인. 칩 추가 없는 재착석 허용. 상한 1회 1,000,000,000(정책 확정 전 기술적 상한).

2026-11-24 23:25 KST 좌석 정책 추가 결정(사용자 확정, 구현 완료·`feature/seat-management` 미커밋, 상세 [좌석 관리](seat-management.md) 11절). 위 2026-11-24 결정 중 해당 부분을 대체한다:
- 끊긴 플레이어 차례: 연결 종료 확정 후 **2초 유예** 뒤 체크 가능하면 체크, 아니면 폴드(위의 "즉시"를 대체). 이유: 새로고침·순간 끊김으로 바로 폴드되는 것을 막되 테이블을 오래 멈추지 않기 위해. 2초 안에 같은 계정(다른 기기 포함)이 돌아오면 예약된 자동 행동은 취소, 이미 실행된 자동 행동은 되돌리지 않음. 3분 좌석 보존은 그대로. 재시작 시 유예 타이머는 이어 가지 않고 30초 복구 구간이 대신함(유예보다 길다).
- 리바이 최대 수량: 방 설정 `maxRebuy`(1회 요청 한도, 양의 정수, 최대 1,000,000,000)로 방장이 지정. 서버가 초과 요청을 거부하고, 설정 변경 시 대기 중인 요청을 새 한도로 다시 검사해 초과분은 사유와 함께 취소. 값이 없는 기존 방·구 클라이언트는 **시작 칩을 한도로 본다**(기본값은 Claude가 정함, 변경 가능 — 확인 필요). 이유: 방장이 칩 인플레이션을 통제. 위의 "상한 1회 1,000,000,000(정책 확정 전 기술적 상한)"은 기술적 최대값으로만 남는다.
- 리바이 한도만 바꾼 설정 저장은 칩을 초기화하지 않는다(시작 칩·블라인드·제한 시간이 하나라도 바뀌면 기존대로 전원 초기화). 이유: 한도 조정만으로 게임 기록이 사라지지 않게.
- 방장 본인 리바이: 수량을 입력하면 승인 없이 지급(같은 한도), 핸드 참여 중이면 그 핸드 종료 후 지급. 다른 플레이어의 승인 대기 목록에 표시하지 않는다. 이유: 승인권자 본인에게 승인 단계는 의미가 없음.
- 중복 지급 방지: 클라이언트가 요청마다 UUID(`clientRequestId`)를 붙이고 서버가 최근 요청 ID를 기억해 같은 ID의 재전송은 아무것도 하지 않는다(방장 즉시 지급·일반 요청 모두).

2026-11-25 좌석 관리 배포 전 결정(사용자 확정, `feature/seat-management` 미커밋, 상세 [좌석 관리](seat-management.md) 11.5·12절):
- 리바이 1회 최대 수량 기본값 = 시작 칩(방장이 방 설정에서 변경), 리바이 **횟수 제한 없음**, 방장 본인 리바이는 승인 없이 지급, 핸드 참여 중 리바이는 핸드 종료 후 지급 — 위 23:25 결정의 "확인 필요"를 확정으로 바꾼다.
- 좌석 진단 로그 6종(`seat_hold`·`seat_released`·`auto_action`·`membership_takeover`·`rebuy`·`chip_audit`) 추가 승인. 계정·방은 해시 식별자만, 닉네임·방 코드·토큰·세션·카드 기록 금지. 기본 켜짐(`SEAT_EVENT_LOG=0`으로 끔), 방당 분당 120건 상한. 이유: 실사용 테스트에서 재접속·자동 행동·리바이·정산을 로그로 추적할 수단이 없었다.
- 칩 총합 감사: 핸드 정산마다 "기대 총액(초기 칩 + 승인된 리바이 + 정상 조정)"과 실제 총액을 비교해 초과(중복 지급 등)·부족(정산 누락)을 `level:error`로 기록. 게임 진행은 막지 않는다(관측 전용).
- 롤백: 이전 서버(`290cb8a`·`595cd676`)는 새 체크포인트를 읽고 동작하지만 새 상태(보류 리바이, 떠난 계정 잔액, 리바이 한도·요청, 관전자 구분)는 잃는다(테스트 DB 사본으로 확인). 따라서 롤백은 방 0개일 때 하거나 배포 전 백업으로 되돌린다.

2026-11-25 SQLite 백업·복구 방식(테스트 DB 리허설 결과 확정, 상세 [좌석 관리](seat-management.md) 12.5):
- 체크포인트 DB는 배타 잠금이라 실행 중 백업 API·`VACUUM INTO`를 쓸 수 없다 → 배포 전 백업은 **방 0개·파일 미변경 확인 후 파일 내려받기 2회·해시 비교**로 한다. 전적 DB는 실행 중에도 백업 API·`VACUUM INTO`가 되므로 필요하면 그 방법을 쓴다(컨테이너 명령 = 별도 승인).
- 복구는 실행 중 파일을 **절대 제자리에서 덮어쓰지 않는다**(리허설에서 손상 재현, 서버가 종료 때 체크포인트를 다시 저장). 백업을 새 경로에 올리고 `STATE_DB_PATH`·`STATS_DB_PATH`를 그 경로로 바꿔 재시작한다. 이유: 옛 파일이 그대로 남아 즉시 되돌릴 수 있고, 잠금 충돌이 없다. (백업·복구 리허설 결과 확정)

2026-11-25 23:21 KST 실사용 테스트 환경 고정(사용자 결정). 2026-11-22 "재사용 테스트 환경" 결정을 구체화한다:
- 고정 환경(이 조합만 실사용 테스트에 사용):
  - 웹: `https://fix-multiplayer-stability.friends-table-staging.pages.dev`(Cloudflare Pages `friends-table-staging`, Preview 브랜치 `fix-multiplayer-stability`)
  - 서버: Railway 프로젝트 `friends-table-mp-test`, 서비스 `boardgame-server-test`(테스트 프로젝트 내부 환경 `production`)
  - 인증·친구: 기존 테스트 Supabase(`lahnhofedtomephzmoty`) 유지
  - 저장소: 기존 Railway Volume `boardgame-server-test-volume`(`/data`)과 `STATE_DB_PATH=/data/boardgame.sqlite`·`STATS_DB_PATH=/data/stats.sqlite` 유지
- 데이터 보존: 친구들과 계속 쓰는 실사용 환경이므로 이후 배포에서도 기존 계정(테스트 Supabase)·친구 목록·경기 전적(`stats.sqlite`)·방 상태를 보존한다. 배포 전 방 0개 확인과 SQLite 백업(해시 2회 일치·`integrity_check`)을 매번 한다([좌석 관리](seat-management.md) 12.5).
- 재사용: 신규 기능·새 브랜치도 실사용 테스트 배포는 이 환경에 한다(Preview 브랜치명·URL 그대로, 다른 Pages 브랜치·Railway 서비스·Supabase 프로젝트를 새로 만들지 않음).
- 금지(사용자 명시 승인 없이): DB 초기화·SQLite 파일 덮어쓰기·삭제, Volume 삭제·교체, Supabase 프로젝트 변경, 테스트 URL(Preview 브랜치명) 변경, 경로 변수 변경. 복구가 필요해도 임의로 하지 않고 보고한다(복구 방식은 새 경로 + 경로 변수 전환, 12.5).
- 호환성: 저장 형식(체크포인트 JSON·`stats.sqlite` 스키마)이나 Supabase 스키마를 바꾸는 변경은 기존 데이터를 그대로 읽는지 테스트 DB 사본으로 먼저 검증하고, 테스트 Supabase 마이그레이션 적용은 별도 승인.
- 자동화 테스트 격리: 자동 테스트·E2E는 실제 테스트 사용자 데이터에 접근하지 않는다. 현재 서버 테스트는 임시/메모리 DB와 가짜 Supabase 주소, 브라우저 E2E(`scripts/test-seat-e2e.cjs`·`test-game-e2e.cjs`)는 `127.0.0.1` 서버·메모리 로비·테스트 토큰을 쓰고, 게임 E2E는 번들에 `supabase.co`·`railway.app`·`pages.dev`가 있으면 실패한다. 새 자동화도 이 격리를 따른다(테스트 서버·테스트 Supabase를 대상으로 하는 자동 스크립트 금지).
- 배포 후 확인(스모크)은 기존 테스트 계정으로 최소 동작만 하고, 만든 방은 나가서 닫는다. 핸드를 진행하면 전적이 기록되므로 필요한 경우에만 한다.
- 이유: 친구들과 지속적으로 실사용 테스트를 하므로 계정·친구·전적이 배포마다 사라지면 안 되고, 테스트 주소가 바뀌면 친구들이 따라올 수 없다. 운영 환경은 이 정책과 무관하게 기존대로 변경 금지.

2026-11-26 00:13 KST Git push와 배포 분리(사용자 결정, 상세 [체크리스트](DEVELOPMENT_CHECKLIST.md) 1.8절):
- 원칙: Git commit·push는 어떤 브랜치든 배포와 독립이다. push는 배포를 일으키지 않으며, 실제 서비스 배포는 명시적 승인 후 정해진 명령으로만 한다.
- Cloudflare Pages `friends-table-staging`: Git 연결은 유지(끊으면 다시 연결 불가, Direct Upload 전환도 불가)하고 Branch control에서 **Production 자동 배포 끔**, **Preview 브랜치 None**(사용자 설정, 2026-11-26 00:13 이전). 배포는 `wrangler pages deploy <dist> --project-name friends-table-staging --branch <고정 브랜치>`만 사용: 실사용 테스트 `fix-multiplayer-stability`, 운영 `deploy/web-staging`(운영은 별도 승인). `--branch` 생략 금지.
- Railway 운영 `@boardgame/server`: 저장소(`main`) 연결은 유지, **자동 배포 끔**(2026-11-26 00:13 확인 "Auto deploy is disabled"). `main` 병합·push만으로는 운영이 바뀌지 않으므로 운영 반영은 별도 승인 후 수동 배포(방법은 실행 전 확인·기록).
- Railway 실사용 테스트 `boardgame-server-test`: 소스 연결 없음, 기존처럼 깨끗한 worktree에서 ID를 명시한 `railway up`(승인 후)만.
- PR 환경은 두 Railway 프로젝트 모두 꺼짐 유지. GitHub Actions(`check.yml`·`server-image.yml`)는 검사만 하며 배포하지 않는다.
- 배포 전후 기록: 배포 전 현재 배포 ID를 확인하고, 배포 후 새 ID·커밋을 HANDOFF와 체크리스트에 남긴다. 자동 배포 설정을 다시 켜는 것은 별도 승인.
- 이유: 개발 브랜치를 자유롭게 push(백업·리뷰)하면서도 운영과 친구들이 쓰는 실사용 테스트 환경이 의도치 않게 바뀌지 않게 한다. 특히 Git 브랜치 `fix/multiplayer-stability`의 자동 Preview 빌드는 실사용 테스트 URL과 같은 별칭(`fix-multiplayer-stability`)을 써서 덮어쓸 수 있었다(2026-11-23 `563519fd` 사례).
- 확인 한계: Cloudflare 대시보드는 에이전트 브라우저 로그인 실패로 직접 읽지 못했다. 설정은 사용자 보고 기준이며, 2026-11-26 `feature/seat-management` push 뒤 Pages 배포 목록에 새 배포가 없는지로 간접 확인한다.
- 결정 시점 배포 ID(기준선):
  | 대상 | 배포 ID | 코드 | 방식 |
  | --- | --- | --- | --- |
  | Railway 운영 `Friends Table`/`@boardgame/server` | `31138bb5-8c6f-4026-a324-5b876b510be1` | `e230511` | GitHub 자동 배포(2026-11-23, 자동 배포 끄기 전) |
  | Railway 실사용 테스트 `friends-table-mp-test`/`boardgame-server-test` | `e6a6ab8b-b39f-462e-aea1-cee2f46befbc` | `3a28b09` | CLI `railway up`(2026-11-25 17:55) |
  | Pages 운영 `friends-table-staging.pages.dev`(브랜치 `deploy/web-staging`) | `8c79e8b3-8dd9-4e96-ac1d-3d282d3ab5fb` | `e230511` | 2026-11-23 |
  | Pages 실사용 Preview `fix-multiplayer-stability` | `e35d3e5e-34f0-4013-ab45-a76977942beb` | `3a28b09` | `wrangler pages deploy --branch fix-multiplayer-stability`(2026-11-25 17:59) |
