# 멀티플레이 진단·사운드 개선 결과

2026-11-08 KST. 기준 HEAD: `0cd3eaaf74e783d7240c5cf2b927dca6bd74a7f6`.

## 범위와 제한

로컬 소스만 수정했다. 기존 `apps/mobile/eas.json`과 두 조사 문서는 보존했다. Supabase 데이터·Railway SQLite 볼륨·운영 서버·설치 APK를 변경하지 않았다. 신규 패키지 설치, 커밋, 푸시, 배포, EAS 빌드를 하지 않았다.

실제 Android/Railway 장애는 이번에 재현하거나 원인을 확정하지 않았다. heartbeat 5초/15초, 서버 control heartbeat 15초, 초기 연결 timeout, 재시도 간격·기간, 인증 검증과 소유권 확인 분기를 변경하지 않았다.

## 연결 진단

- `RoomClient.ts`: 허용 목록으로 정규화한 AppState 기록, heartbeat 실행 지연(`performance.now()` 기준), 토큰 조회 시작/큐 대기 기록. 기존 송신 로그의 tokenWaitMs와 함께 읽는다.
- `useRoom.ts`: 초기 상태 및 foreground/background 변화마다 기록. 기존 active 시 refresh 정책 유지.
- `lobby.ts`: message 도착 시 payload를 파싱·기록하지 않고 소켓별 receiveSequence와 queueDepth 기록. 처리 시작 시 같은 sequence, pingId, queueWaitMs 연결. 인증 완료·실패 시간 기록. `ws_auth_completed`는 검증 함수 반환을 의미하며 인증 성공 여부는 후속 authenticated/rejected 이벤트로 판단한다.
- 서버 프로세스별 이벤트 루프 지연 평균·최대를 15초마다 기록한다(20ms resolution). 정지 시 모니터와 타이머를 해제한다. 측정값에는 샘플링 간격이 포함되므로 20ms 정도의 값 자체를 장애로 판단하지 않는다.
- 로그에 토큰, 원본 계정/세션 UUID, 카드, 닉네임, 방 코드, payload, 오류 원문은 추가하지 않았다. 기존 해시 accountRef/sessionRef와 서버가 발급한 임시 serverId/connectionId만 상관관계에 사용한다.

### 수집·판독 순서

1. 설치 APK의 빌드 식별자와 운영 서버 커밋이 이 코드인지 먼저 확인한다. 향후 별도 배포·빌드 전에는 새 로그가 설치 앱/운영 서버에 나타나지 않는다.
2. 서로 다른 두 사용자로 같은 방에서 10분 이상 플레이하고, 증상 시각을 기기별 기록한다. 시각은 UTC로 맞추되 기기 간 시계 오차를 고려한다.
3. clientId/generation → serverId/connectionId → pingId로 `queued → token_wait_started → sent → message_enqueued → request_started → auth_completed → pong_sent → client_pong`을 연결한다. enqueued는 아직 pingId를 모르는 단계이므로 receiveSequence로 처리 시작 로그와 연결한다.
4. `message_enqueued`가 있고 `request_started`가 늦으면 서버 큐, authMs가 높으면 인증, client timerLagMs가 높으면 앱 JS 스케줄링, server_event_loop가 높으면 서버 지연 후보다. 각 값만으로 네트워크 원인을 단정하지 않는다.
5. `client_connection_lost → cleanup → stale close`는 앱 선제 종료 흐름이다. `stale=false close → loss`와 서버 `ws_close_requested/ws_terminate/ws_transport_timeout`을 비교해 실제 종료를 구분한다. 1006만으로 서버 종료라고 결론내리지 않는다.
6. 한쪽 백그라운드 3초/20초 후 복귀, 3초/20초 네트워크 단절을 각각 분리해 재현한다. 다른 기기의 정상 연결 유지, 최신 게임 상태 복구, 중복 베팅·칩 차감 부재를 확인한다. 자리 보존은 턴 타이머 정지가 아니다.

## 사운드 구현

- 공유 HoldemView에 선택적인 `audioAction: { revision, kind }`를 추가했다. 서버가 성공적으로 처리한 check/call/bet/raise/fold만 분류하고, 짧은 올인 콜과 오프닝 올인 베팅도 구분한다. 클라이언트가 보낸 임의 액션 이름을 그대로 신뢰하지 않는다.
- 메타데이터는 실시간 `viewFor(viewer, true)`에만 포함한다. 기본 게임 뷰·복기·checkpoint 스키마와 게임 규칙은 그대로다. 과거 서버에는 이 필드가 없어도 클라이언트가 동작하며 액션 소리를 추측해 만들지 않는다.
- `soundEvents.ts`: deal, check, call, bet, raise, fold, flopReveal, turnReveal, riverReveal, potCollect, victory, myTurn, warning 분리. 액션·보드·결과를 독립 감지한다. 숨겨진 리버 카드를 받았다는 이유로 공개음을 내지 않는다.
- 이벤트 식별자, revision, 핸드 번호로 중복·오래된 업데이트를 억제한다. 최초·재접속·foreground 복원은 무음으로 기준 상태만 갱신한다. 최신 스냅샷에 없는 중간 액션을 재구성하거나 재접속 후 소리를 몰아서 재생하지 않는다.
- `audioScheduler.ts`: 테이블/알림 2개 재생 경로. 진행 중인 소리는 후속 이벤트로 중단하지 않고 완료 콜백으로 끝낸다. 대기 이벤트만 우선순위 적용(팟 획득 > 승리 > 카드 > 일반 액션, 시간 경고 > 내 차례). 큐 최대 16개, 중복 ID 최대 512개, 대기 TTL 1.5초. 완료 콜백 장애의 5초 watchdog은 일반 재생 우선순위와 별개다.
- seek가 끝나기 전에 음소거·백그라운드·연결 손실이 발생하면 재생하지 않는다. 취소된 seek가 끝나기 전에는 동일 음원의 다음 seek를 시작하지 않는다. 오래된 완료 콜백도 새 재생을 종료하지 않는다.
- `soundCatalog.ts`, `SoundSettings.tsx`: 이벤트별 gain, 미리 듣기, 0~100% 조절 및 저장. 최종 볼륨은 master × event gain. 승리·알림 기본 gain을 낮췄다. 진짜 녹음 교체 전의 임시 믹스이며 기기 청취 튜닝은 필요하다.
- `useGameAudio.ts`: Expo 플레이어와 완료 이벤트 어댑터. play 직전 gain 적용, 설정 저장 실패 안내, 즉시 음소거/백그라운드 취소, 핸드 전환 시 대기 효과음 정리. 재생 큐는 100ms마다 확인하되 React 시계 갱신은 기존처럼 250ms 간격이다.

## Expo Audio와 음원

설치된 `node_modules/expo-audio/package.json`은 58.0.11이다. 설치 소스의 AudioModule.types.ts/Audio.types.ts에서 `isLoaded`, volume, pause/play, seekTo Promise, `playbackStatusUpdate.didJustFinish`, `addListener().remove()`를 확인했고 타입 검사를 통과했다. Expo/React Native/패키지 버전은 변경하지 않았다. 저장소 지침의 v57 문서는 읽었으나 실제 API 호환성 판단은 설치된 58.0.11 타입·소스를 기준으로 했다.

새 외부 녹음은 도입하지 않았다. 기존 합성 WAV 7개는 그대로이며, 자연스러운 카드·칩 녹음 확보와 청취 튜닝은 남아 있다. 개별 출처, 임시 매핑, 교체 파일 목록 및 라이선스 확인 절차는 `docs/audio-assets.md` 참조.

## 실제 기기 확인 항목

- 두 Android 기기에서 콜 직후 플롭 공개, 빠른 체크/레이즈, 폴드로 팟 종료, 올인 리버 째기, 분할 팟을 재생하며 누락·중복·순서를 청취한다.
- 첫 판 asset 로딩과 seek 지연, 스피커·유선/블루투스 출력 지연을 구분한다. 로컬 파일이어도 native 출력 지연은 테스트 스텁으로 입증할 수 없다.
- 재생/seek 중 음소거, 빠른 background→active, 짧은 연결 손실, 앱 재실행 후 이벤트별 볼륨 복원을 확인한다. 해제 후 과거 효과음이 몰려 나오지 않아야 한다.
- Android 미디어 볼륨·오디오 포커스, iOS 무음 모드, 작은 화면과 큰 글꼴의 설정 모달을 확인한다. 실제 설치 APK에 이번 코드가 포함되는 것은 향후 승인된 빌드 이후다.

## 변경 파일

진단: apps/mobile/src/services/RoomClient.ts, apps/mobile/src/hooks/useRoom.ts, apps/server/src/lobby.ts.

사운드: packages/shared/src/holdem.ts, apps/server/src/holdem/hand.ts, apps/mobile/src/services/{soundEvents,soundCatalog,audioScheduler}.ts, apps/mobile/src/hooks/useGameAudio.ts, apps/mobile/src/components/SoundSettings.tsx.

테스트: apps/server/test/{soundEvents,audioScheduler,diagnostic-observability}.test.ts, apps/mobile/test/audio-hook.test.cjs.

문서: docs/audio-assets.md, docs/stability-audio-report.md.

## 최종 검증 결과

- `npm test`: 서버 회귀 테스트 **153/153 통과**, 실패·skip·cancel 0. 기존 138개 대비 순증 15개(기존 사운드 테스트 확장 포함).
- `node --test apps/mobile/test/*.test.cjs`: **9/9 통과**. 기존 UI 5개와 실제 훅+네이티브 경계 스텁 오디오 4개.
- `npm run typecheck`: mobile/server/shared 모두 통과.
- `git diff --check`: 통과.
- 기존 모듈 형식/실험적 SQLite 경고는 있었으며 테스트 실패는 아니다. 이 작업에서 관련 패키지 설정을 바꾸지 않았다.
- 실제 네이티브 청취·출력 지연·운영 장애 재현은 수행하지 않았다. 테스트 스텁은 Expo 네이티브 런타임 자체를 검증하지 않는다.
- 전체 테스트 중 처음 발견된 view/checkpoint 비교 실패 2개는 사운드 메타데이터를 실시간 wire 뷰에만 포함하도록 수정해 해결했다. 기존 저장·복기 테스트의 비교 기준을 완화하지 않았다.
