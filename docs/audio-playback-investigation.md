# Android 오디오 재생 결함 조사·수정

2026-11-09 KST. 기준 main 커밋: 97fb21d31ef02d98180030890a5ef6d3956d2fb0. 최초 조사 시 로컬 수정으로 검증했다. 이후 배포 테스트 준비를 위해 동일 검사를 재실행했으며 결과는 아래와 같다.

## 확인된 원인과 증거 범위

1. **종료된 Android 플레이어 재사용 불가**: 설치된 expo-audio 58.0.11의 AudioModule.kt 직접 isLoaded getter는 STATE_READY만 true다. AudioPlayer.kt의 currentStatus는 STATE_ENDED도 isLoaded=true로 반환한다. 기존 scheduler는 직접 getter가 false이면 seekTo(0)에 도달하지 못했다. 네이티브 상태를 모사한 재현 테스트에서 두 번째 재생이 누락됐다. currentStatus.isLoaded를 우선 사용하도록 수정했다. 소스를 임의로 재생성하거나 패키지를 변경하지 않았다.
2. **큐 앞 음원의 준비 상태가 뒤 음원까지 차단**: 우선순위 첫 음원만 확인하고 준비되지 않았으면 해당 lane 전체를 건너뛰었다. 이전에 재생한 potCollect가 위 결함으로 재생 불가가 되면 아직 준비된 victory도 차단될 수 있었다. 재현 테스트로 확인하고 재생 가능한 대기 항목을 선택하도록 수정했다.
3. **정상 승리음도 1.5초 만료**: 이미 재생 중인 효과음 0.9초 + potCollect 0.834초 이후 승리 차례가 오면 1.5초를 넘는다. 이 시나리오에서 승리음이 사라지는 것을 재현했다. 일반 액션은 기존 1.5초를 유지하고 결과음 두 종류만 최대 5초 대기, 핸드 전환·음소거·background·게임 재접속 취소는 유지한다. 서버 timeout과 무관하다.
4. **비동기 volume setter 즉시 read-back**: Android Playable.setVolume은 mainQueue coroutine으로 반영한다. 기존 코드는 volume을 설정한 직후 getter가 아직 0이면 재생을 포기했다. 지연된 native setter를 모사한 테스트에서 재현했고, JS에서 계산한 gain으로 판단하도록 수정했다. master/event gain이나 음원 amplitude는 올리지 않았다.

Android TEST 기기의 sound_effects_enabled=1을 읽기 전용으로 확인했다. 기존 Pressable은 기본 클릭음을 막지 않았다. 따라서 앱 효과음이 차단될 때 서로 다른 버튼에서도 Android 클릭음만 들릴 수 있다. 이것이 사용자가 들은 소리였다는 청취 증거까지 확보한 것은 아니다. SoundSettings·GameScreen·ActionButton에 android_disableSound를 적용했다.

이 네 결함은 **설치된 네이티브 소스의 동작에 맞춘 실행 테스트로 재현**했다. 수정 전 신규 4개 모두 실패, 수정 후 통과했다. 수정 APK를 실제 Android에서 재생해 정상이라고 판정한 것은 아니다.

## 음원·설치 APK 조사

6개 WAV를 FFmpeg 7.0.2로 각각 디코딩했다. 모두 RIFF/WAVE, format=1 PCM16 little-endian, 44.1kHz mono이며 헤더 크기와 data 길이가 일치한다. PCM SHA-256이 전부 달라 파일 복제·동일 데이터 오류가 아니다.

| 파일 | 길이(초) | peak / RMS(dBFS) | 시작 / 끝 −45dBFS 이하 구간(ms) |
| --- | --- | --- | --- |
| card-deal.wav | 0.584082 | −7.001 / −31.514 | 2.063 / 92.109 |
| card-reveal.wav | 0.258503 | −7.001 / −34.459 | 3.220 / 46.168 |
| chips-bet.wav | 0.253288 | −8.000 / −32.074 | 82.245 / 48.957 |
| chips-raise.wav | 0.355079 | −6.000 / −34.140 | 5.193 / 21.882 |
| cards-fold.wav | 0.692834 | −10.000 / −37.428 | 3.900 / 12.902 |
| pot-collect.wav | 0.833719 | −9.000 / −32.600 | 1.746 / 3.673 |

위 저레벨 구간은 완전 무음을 의미하지 않는다. chips-bet의 초반 조용한 부분과 각 음원의 낮은 RMS는 기기 청취 시 추가 검토 대상이다. 수치만으로 체감 음색을 보증하지 않는다.

원본 OGG를 mono float PCM으로 디코딩하고 기존 trim/fade/peak gain/PCM16 변환을 재현했다. 현재 WAV와 **샘플 단위 오차 0**이다. 앞뒤 trim에서 제거한 원본 신호 에너지는 최대 0.05509%로, 주요 동작의 대규모 절단 증거는 없었다. 세부 수치·PCM 해시는 audio-pcm-audit.json에 있다. 음원 바이트와 CC0 증거는 변경하지 않았다.

실제 emulator-5554 설치 APK의 패키지 파일만 ADB로 읽고 WAV 10개를 검사했다. 새 6개 파일이 전부 저장소/라이선스 manifest의 출력 SHA-256과 일치했다. 따라서 이 기기는 단순히 이전 음원만 포함한 APK가 아니었다. 계정 저장소나 토큰은 읽지 않았다.

최근 logcat의 ExoPlayerImplInternal/AudioTrack/AudioFlinger error 필터에는 오류가 나오지 않았다. 이는 짧은 읽기 표본일 뿐 정상 출력의 증거가 아니다. Expo Audio 오류는 JS 상태 이벤트로만 전달될 수도 있으므로 그 이벤트를 안전한 오류 표시로 처리하도록 추가했다.

## 미리듣기와 실제 게임 경로

- SoundSettings의 13개 버튼을 실제 JSX로 렌더링해 각각 올바른 sound key를 전달하는지 확인했다. 훅의 13개 플레이어도 각 require와 일치한다. call/bet은 의도적으로 chips-bet.wav를 공유하지만 플레이어 객체는 다르다. flop/turn/river 공개도 의도적으로 card-reveal.wav를 공유한다. check는 기존 card.wav, victory는 기존 win.wav다. 잘못된 전역 플레이어 참조를 찾지는 못했다.
- 미리듣기는 게임 큐와 동일한 상태·연결 gate를 공유했다. 이제 설정이 열린 동안 게임 cue는 소리를 내지 않고 상태 기준만 갱신하며, 미리듣기는 네트워크 연결과 독립적으로 동작한다. 설정을 닫으면 미리듣기를 취소한다. background와 mute는 항상 적용한다.
- 빠른 미리듣기는 마지막 선택을 우선하여 앞 선택의 재생/대기를 취소한다. 진행 중 seek가 완료될 때까지 동일 음원의 seek lock은 유지하며, 늦은 promise가 취소된 재생을 시작하지 못한다. 일반 게임 큐의 비선점 재생은 유지한다.
- 서버 확정 액션 종류, 팟·승리 이벤트 선택 자체는 정상이다. 실제 HoldemHand에서 승자가 발생한 스냅샷을 훅에 전달하여 potCollect와 victory가 각각 한 번 재생 요청되는 테스트를 추가했다. 공유 이벤트/서버 로직은 수정하지 않았다.
- game_audio 로그는 phase와 고정 sound 이름만 기록한다. play_requested는 네이티브 play 호출까지 갔다는 뜻이며 실제 스피커 출력 성공을 뜻하지 않는다. finished/cancelled/error를 함께 비교한다. 핸드 ID·계정·카드·native 오류 원문은 기록하지 않는다.

## 기존 테스트가 놓친 이유

기존 플레이어 mock은 재생 완료 뒤에도 isLoaded=true였고, volume 대입이 즉시 getter에 반영됐다. 이는 Android 실제 구현과 달랐다. 완료 콜백을 즉시 호출하여 이전 음원+팟 획득의 실제 시간 경과도 모사하지 않았다. 버튼 렌더링→선택 이벤트→실제 require 매핑을 모두 확인하거나 빠른 미리듣기와 게임 전환을 결합한 테스트도 없었다. PCM·번들 검증은 파일 무결성만 확인하며 네이티브 상태기계 문제를 발견할 수 없다.

## 수정 파일

- apps/mobile/src/services/audioScheduler.ts: ended 상태 재사용, 준비된 항목 선택, 비동기 volume 안전 처리, 결과별 대기 예산, 명시적 preview 취소, 오류/진단.
- apps/mobile/src/services/soundCatalog.ts: potCollect/victory의 대기 예산만 명시. gain 유지.
- apps/mobile/src/hooks/useGameAudio.ts: preview 모드, 네트워크/게임 이벤트 격리, 오류 처리와 안전 로그.
- apps/mobile/src/components/SoundSettings.tsx: preview 모드 생명주기·버튼 접근성 이름·Android 클릭음 비활성화.
- apps/mobile/src/screens/GameScreen.tsx, apps/mobile/src/components/ActionButton.tsx: Android 기본 클릭음 비활성화.
- apps/server/test/audioScheduler.test.ts, apps/mobile/test/audio-hook.test.cjs, apps/mobile/test/sound-settings.test.cjs: 재현·회귀·UI/실제 엔진 통합 테스트.
- docs/audio-playback-investigation.md, docs/audio-pcm-audit.json: 증거와 검증 결과.

## Android APK에서 남은 확인

이번 변경은 아직 설치 APK에 적용되지 않았다. 향후 승인된 새 APK에서 다음을 확인한다.

1. 같은 종류를 3회 이상 반복한 뒤 다른 종류로 바꿔도 정상적으로 재생되는지 확인한다. 특히 potCollect를 먼저 미리듣고 실제 승리 상황을 만든다.
2. 설정의 모든 버튼을 천천히 비교하고 빠르게 교차 선택한다. 마지막 선택만 남아야 하며, 기본 Android 클릭음이 섞이지 않아야 한다. call/bet과 3종 카드 공개는 의도적으로 같은 파일이다.
3. 실제 게임에서 팟→승리 두 음원을 확인한다. game_audio의 play_requested/finished가 potCollect와 victory 모두에 있는지 대조한다. 네트워크 재접속 시 게임음 취소는 의도된 동작이다.
4. 미리듣기 중 서버 연결이 끊겨도 로컬 재생은 유지되지만 음소거/background/설정 닫기는 즉시 취소해야 한다. 0→양수 gain 복귀와 앱 재시작 설정 복원도 확인한다.
5. 기본 gain과 실제 스피커/이어폰에서 저음량 마찰·칩 소리의 가청성을 평가한다. 현재 gain을 임의로 올리지 않았으므로 청취 후 필요한 경우 근거를 갖춰 개별 믹싱을 진행한다.

heartbeat·인증·Supabase·Railway 데이터는 변경하지 않았다. 기존 eas.json 미커밋 변경도 보존했다.

## 최종 자동 검증 결과 (2026-11-09)

- 모바일 테스트: 13/13 통과.
- 서버 전체 테스트: 157/157 통과. 포함된 audioScheduler 테스트 12/12 통과. 새 원인 재현 4건은 수정 전 실패, 수정 후 통과.
- 모바일·서버·shared TypeScript 검사: 통과.
- Expo Android/iOS export: 모두 성공. 각 플랫폼 metadata의 WAV SHA256를 라이선스 증거 문서와 대조해 신규 6개 모두 일치 확인.
- 6종 WAV PCM 및 원본 OGG 비교: 모두 통과. 음원 데이터·gain·CC0 라이선스 파일 변경 없음.
- git diff --check: 통과 (Windows 줄바꿈 안내 제외).

번들 산출물·설치 APK 분석 사본은 저장소 밖 작업 디렉터리에 보관했다. 배포 테스트 준비 재검증에서도 모바일 13/13·서버 157/157·전체 TypeScript·Android/iOS export 및 양쪽 음원 해시 검사가 통과했다. EAS 빌드·배포는 실행하지 않았다. 자동 검증은 새 APK의 실제 Android 청음을 대체하지 않는다.
