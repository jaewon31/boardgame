# Friends Table P0 구현 및 검증 보고서

기준: deploy/web-staging, 89229f5. 작업 브랜치: codex/tempo-hand-history.
운영 Railway 배포, Supabase DB 변경, main 병합/푸시, 원격 푸시 없음.

## 타이밍과 오디오

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| 홀카드 공개 모션 | 360ms | 240ms |
| 보드 카드 한 장 | 540ms | 360ms |
| 플랍 3장 모션 합계 | 1,620ms | 1,080ms |
| 다음 핸드 기본 대기 | 10,000ms | 5,000ms |
| 카드 효과음 원본 | 360ms | 파일 유지; 홀카드 1.5배속 약 240ms, 보드 원속도 360ms |
| 셔플 원본 | 5,688.0045ms | 파일 유지; 서버 5초 구간 안에서 재생 |

모션 시간은 cardPresentation.ts 상수와 PokerCards.tsx의 Animated.timing 실행 경로를 조사한 값이다. WAV는 RIFF 헤더를 직접 읽어 44,100Hz와 길이를 확인했다. 실제 디바이스 프레임/스피커 출력 시간을 측정한 값은 아니다. 순차 재생에는 오디오 준비, 기존 액션 효과음, JS 스케줄러 tick 지연이 추가될 수 있다.

음원 play 호출과 시각 onStart를 같은 스케줄러 실행에서 시작한다. 보드는 원음을 그대로 유지하며 홀카드 효과음만 Expo setPlaybackRate(1.5, 'high')와 shouldCorrectPitch를 사용한다. 디바이스별 음질은 실청취 검증이 필요하다. 중복 ID, 오래된 revision, 재접속 첫 스냅샷 억제와 느린 seek의 무음 시각 처리 경로를 유지했다.

셔플은 원본이 5초보다 길어서 반복 연결을 만들지 않는다. 결과 효과음 이후 기존 table lane에서 한 번 재생하며, 대기 중 이미 지난 만큼 원본을 seek한다. 서버 nextHandAt을 단조 시계 종료 시각으로 변환하여 남은 구간만 재생한다. 60ms fade-in, 마지막 180ms fade-out을 16ms scheduler tick에서 적용한다. 새 핸드, 음소거, 백그라운드, 연결 해제 시 기존 취소 경로로 정리한다. 최초/재접속 스냅샷은 소급 재생하지 않는다. 실제 클릭음 부재는 아직 청취로 확인하지 못했다.

서버 lobby.ts scheduleNextHand의 기본값만 5초로 줄였다. 연결 끊김이 기존 nextHandAt을 초기화하지 않도록 했다. 기한에 연결된 유효 플레이어가 2명 미만이면 진행을 보류하고, 복귀 시 지난 기한을 사용해 재시작한다. 명시적 퇴장으로 유효 플레이어 자체가 1명이 되면 타이머를 취소한다. 액션 제한시간, runout/리버 스퀴즈, 정산, 딜러/블라인드 알고리즘은 변경하지 않았다.

## 히스토리 데이터와 UI

기존 LobbyRoom.handReviews → 서버 lobby.ts reviews → holdem/review.ts saveReview/reviewFor → HoldemHand.reviewFor/viewFor 경로를 재사용한다. 서버는 상대 비공개 홀카드를 null로 필터링하고 자기 카드만 해당 플레이어에게 복원한다. UI에서 원본 로그나 private ownCards를 조회하지 않는다.

오른쪽 고정 화살표로 열기/접기, 닫기 버튼, 완료된 핸드 최신순 목록/선택 상세, 승자별 지급/족보, 최종 팟, 메인·사이드 팟별 공동 승자, 반환금, 최종 칩 순변동, 스트리트별 서버 기록 순서와 공개 보드를 표시한다. PC/모바일 모두 절대 위치 패널을 사용해 게임 테이블의 크기를 변경하지 않는다. 진행 중에도 열 수 있으며 서버 명령을 보내지 않는다.

서버는 최근 10개 핸드를 저장하며 각 핸드 이벤트는 최대 150개이다. 이 범위를 UI에 표시했다. 실제 행동 시각 필드는 없으므로 시간이나 누락 액션을 생성하지 않고 배열 순서만 사용한다. 기록 없는 손익은 '기록 없음'으로 표시한다. 선택한 핸드가 목록에서 제거되면 현재 최신 핸드로 표시한다.

SQLite stateStore.ts의 checkpoint.payload에 reviews가 보관된다. 저장소가 설정된 경우 서버 재시작에도 체크포인트에서 복구된다. 브라우저 새로고침/재접속은 인증된 기존 방 세션의 스냅샷으로 다시 받는다. 방 종료/유예 만료 후 삭제되며 영구 아카이브가 아니다. Supabase 마이그레이션에는 프로필, 친구, 세션 테이블이 있고 상세 핸드 기록 테이블은 없다. 운영 DB 실제 스키마에는 접근하지 않았다.

## 저장 구조 변경이 필요한 미충족 범위와 계획

현재 게임의 모든 완료 핸드와 모든 액션 보관은 10개/150개 제한 때문에 충족하지 못한다. 제한을 임의로 제거하거나 DB/프로토콜을 변경하지 않았다.

추가 구현안: 게임/핸드 식별자 기준의 서버 보관 레코드와 보관 수명/용량을 먼저 결정하고, 기존 서버 카드 필터를 적용하는 인증된 페이지 조회를 설계한다. 새 핸드 broadcast 전체 크기가 계속 증가하지 않도록 커서 페이지 조회를 사용하며 새로고침 복원, 권한, 미공개 카드, 사이드 팟, 방 삭제 정책을 통합 테스트한다. 새 저장소와 조회 메시지/API가 필요하므로 별도 검토 범위다. 현재 UI는 기존 최근 기록만 소비한다.

서버 재시작 직전의 nextHandAt은 기존 체크포인트에 저장되지 않는다. 브라우저 재접속 시 기한 유지는 검증했지만 서버 재시작까지 기한을 유지하려면 체크포인트 필드 확장/호환성 검토가 추가로 필요하다. 현재 프로토콜/체크포인트 스키마는 변경하지 않았다.

## 변경 파일

- apps/mobile/src/components/HandReview.tsx: 오른쪽 패널, 목록, 상세 액션/팟/손익.
- apps/mobile/src/screens/GameScreen.tsx: 완료 시 전용 버튼 대신 상시 패널 배치.
- apps/mobile/src/services/cardPresentation.ts: 240/360ms 모션.
- apps/mobile/src/services/audioScheduler.ts: 홀카드 피치 보정 속도, 서버 대기 종료, seek/fade.
- apps/mobile/src/services/soundEvents.ts: 5초 대기 구간 셔플 이벤트.
- apps/mobile/src/services/soundCatalog.ts: 셔플 큐 대기 허용 구간.
- apps/mobile/src/hooks/useGameAudio.ts: 서버 nextHandAt을 셔플 종료 시각으로 연결.
- apps/server/src/lobby.ts: 5초 기본값, 재접속 기한 유지.
- apps/server/test/audioScheduler.test.ts: 속도/피치, seek, fade, 기한 만료 테스트.
- apps/server/test/cardPresentation.test.ts: 1.5배속, 순차 사운드/시각 시간 검증.
- apps/server/test/soundEvents.test.ts: 5초 이벤트/중복/재접속 검증.
- apps/server/test/lobby.test.ts: 기본 5초, 참여자 동일 기한, 기한 경과 재접속, 기록 복원 검증.

## 검증

- TypeScript 전체 workspace 통과.
- 서버 전체 175/175 통과 (로컬 WebSocket 연결이 허용되는 실행에서 검증).
- 모바일 47/47 통과.
- 마지막 fade 시작 시각 수정 이후 관련 오디오/카드 21/21 재검증 통과.
- Expo Web export 성공. 배포하지 않음.
- git diff --check 통과.
- 최초 샌드박스 테스트는 127.0.0.1 EACCES로 실패했고, 로컬 연결 허용 실행에서 전체 통과했다.
- 브라우저 도구는 http://127.0.0.1:5189 접속 ERR_CONNECTION_TIMED_OUT으로 UI 검증 미완료.
- PC/모바일 실제 패널 배치/키보드 접근, 멀티 디바이스 시청각 지연, 오디오 클릭음/음질, 재접속 네트워크 실기기 검증은 미완료.

## 후속 우선순위

P0 전체 기록 저장 범위와 브라우저/실기기 QA가 남아 있다. P1 PC 키보드 입력/모바일 키보드 화면 이동, P2 방 설정 버튼/카드 무늬/친구 상대 전적은 이번 변경에 구현하지 않았으며 요청한 순서로 후속 작업 대상이다. 전체 요청 완료로 간주하지 않는다.
