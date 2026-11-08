# Friends Table 음원 출처·적용 현황

최종 커밋 전 재검증: [final-audio-validation.md](final-audio-validation.md). 아래 적용 당시 기록과 구분한다.

2026-11-08 KST. 3단계 실제 파일 적용. 이전 웹 다운로드 실패 기록 이후 사용자가 지정한 로컬 파일을 직접 확인했다.

## 실제 원본 확인

- ZIP: %USERPROFILE%\Downloads\kenney_casino-audio.zip (876,839 bytes). 정상 ZIP이며 작업 폴더에 새로 압축 해제했다.
- 사용자가 지정한 폴더: %USERPROFILE%\Downloads\kenney_casino-audio. ZIP에서 새로 추출한 Audio 파일 54개와 해당 폴더의 파일 해시가 모두 일치한다.
- Audio 디렉터리: **54개 OGG Vorbis, 44.1kHz stereo**. 카드 23개, 칩 19개, 주사위 12개. Preview.ogg는 별도 미리 듣기이며 앱 효과음에서 제외했다.
- 원본 ZIP SHA-256: f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18.
- 출처: [Kenney Casino Audio](https://kenney.nl/assets/casino-audio), 제작자 Kenney Vleugels (Kenney.nl), 팩 버전 1.1. 공식 페이지의 표시 개수보다 실제 ZIP 목록을 기준으로 삼았다.

## 라이선스 근거

ZIP의 원본 [License.txt](audio-sources/kenney-casino/License.txt)를 그대로 보존했다. CC0와 개인·상업 프로젝트 사용 허용, 크레딧 선택 사항이 명시되어 있다. 공식 출처 페이지도 CC0로 표시한다. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)을 적용하며 별도 유료 계약이 필요한 파일은 도입하지 않았다.

[audio-phase3-license-evidence.json](audio-phase3-license-evidence.json)에 ZIP·원본·편집본·라이선스 해시, 원본 경로, 변환 내역, 이벤트 매핑과 수치를 기록했다. 선택한 원본 OGG 6개도 docs/audio-sources/kenney-casino에 보관했다. CC0 크레딧은 필수는 아니지만 문서에 제작자를 유지한다.

## 실제 교체한 파일

모든 출력은 **WAV PCM16 / 44.1kHz / mono**다. peak/RMS 단위는 dBFS이며 전체 파일의 sample peak와 RMS다. 체감 음량이나 LUFS 측정으로 해석하지 않는다.

| 원본 | 앱 파일 | 사용 이벤트 | 출력 길이 | peak / RMS | 기존 event gain 유지 |
| --- | --- | --- | --- | --- | --- |
| card-slide-2.ogg | card-deal.wav | deal | 0.584초 | -7.001 / -31.514 | deal 0.65 |
| card-place-2.ogg | card-reveal.wav | flopReveal, turnReveal, riverReveal | 0.259초 | -7.001 / -34.459 | flopReveal 0.6, turnReveal 0.6, riverReveal 0.6 |
| chip-lay-3.ogg | chips-bet.wav | call, bet | 0.253초 | -8 / -32.074 | call 0.8, bet 0.85 |
| chips-stack-3.ogg | chips-raise.wav | raise | 0.355초 | -6 / -34.14 | raise 0.9 |
| card-shove-3.ogg | cards-fold.wav | fold | 0.693초 | -10 / -37.428 | fold 0.4 |
| chips-handle-5.ogg | pot-collect.wav | potCollect | 0.834초 | -9 / -32.6 | potCollect 0.8 |

| 원본 | 원본 길이 | 원본 float decode peak / RMS | 앞 / 뒤 제거 | 편집 gain |
| --- | --- | --- | --- | --- |
| card-slide-2.ogg | 0.584초 | 1.291 / -23.222 | 0 / 0초 | -8.291dB |
| card-place-2.ogg | 0.456초 | 1.019 / -28.907 | 0.039 / 0.159초 | -8.019dB |
| chip-lay-3.ogg | 0.266초 | 0.266 / -24.013 | 0.004 / 0.009초 | -8.266dB |
| chips-stack-3.ogg | 0.371초 | 1.829 / -26.499 | 0.016 / 0초 | -7.829dB |
| card-shove-3.ogg | 0.693초 | -1.553 / -28.979 | 0 / 0초 | -8.447dB |
| chips-handle-5.ogg | 0.834초 | 0.968 / -22.628 | 0 / 0초 | -9.968dB |

### 음색·적합성 판단과 한계

- 배분: card-slide-2는 카드 미는 동작으로 분류된 마찰음이며 0.584초라 짧은 배분 효과에 맞는다. 한 번의 배분 이벤트에 재생하며 여러 사람에게 나눠주는 전체 동작을 녹음한 파일이라고 주장하지 않는다.
- 공개: card-place-2는 카드 착지음이다. 앞뒤 저레벨 구간을 정리하여 0.259초로 사용한다. 전용 flip 녹음은 아니므로 카드 뒤집기의 착지 표현에 사용한다.
- 베팅: chip-lay-3의 짧은 칩 놓기 동작을 콜·베팅에 공유한다. 이벤트별 기존 gain은 각각 유지한다.
- 레이즈: chips-stack-3은 칩 쌓기 동작이며 짧은 충돌 피크가 두드러진다. 베팅보다 높은 출력 peak를 허용하되 -6dBFS를 넘지 않게 했다. 전체 RMS는 베팅보다 낮으므로 체감상 더 크게 들린다고 단정하지 않는다.
- 폴드: card-shove-3은 카드 밀기 동작이다. 당초 0.15~0.30초 목표보다 긴 0.693초를 유지했다. 원본 동작을 임의로 중간 절단하지 않고 작은 gain으로 사용한다.
- 팟: chips-handle-5는 **일반 칩 취급음**이다. ZIP에 전용 pot-collect/sweep 파일은 없으며 이를 팟 획득 표현의 대체음으로 사용했다. 0.834초로 당초 0.75초 목표보다 길지만 1초 미만이고 큐 정책 범위 안이다.
- 위 음색 평가는 실제 원본 동작명, 길이, 피크/RMS·신호 포락선에 근거한 선정이다. 직접 청취나 실기기에서 자연스러움·고급스러움을 확정한 결과는 아니다. 최종 음색·스피커 체감 튜닝은 남아 있다.

## 변환 방법과 재생 정책

설치되어 있던 FFmpeg 7.0.2로 OGG를 float PCM으로 디코딩한 뒤 mono 44.1kHz로 변환했다. 일부 원본 Vorbis의 재구성 피크가 0dBFS를 넘으므로 PCM16으로 먼저 클리핑하지 않고 float 단계에서 감쇠했다. -45dBFS 기준 앞뒤 구간을 3ms 앞/15ms 뒤 여유와 함께 정리하고 2ms fade-in, 10ms fade-out 후 선형 peak 정규화를 적용했다. 피치·속도 변경, 합성음 추가, 강한 압축·리미터는 적용하지 않았다.

재생 큐, 우선순위, 중복 방지, 1.5초 대기 만료, 5초 watchdog, master×event gain, 사용자 저장 음량 설정은 변경하지 않았다. useGameAudio.ts의 9개 이벤트 require만 새 6개 파일로 연결했다. 모든 파일은 1초 미만이다.

## 유지한 임시 음원·부족한 녹음

- check → 기존 card.wav: 전용 체크 탭 음원이 없으므로 유지.
- victory → 기존 win.wav; myTurn → 기존 turn.wav; warning → 기존 warning.wav: 6종 교체 범위 밖이며 적합한 전용 알림은 이 팩에서 선택하지 않았다.
- 기존 deal.wav/chips.wav/collect.wav 등 파일은 삭제하지 않았다. 새 매핑에서 제외된 파일이며 다른 참조·비교를 보존한다.
- 전용 팟 쓸기와 카드 뒤집기 녹음은 확보하지 못했다. 각각 일반 칩 취급/카드 착지로 대체했으며, 더 정밀한 녹음 확보 시 별도 검토해야 한다.
- 기존 합성 WAV 출처는 scripts/generate-table-audio.cjs다. 프로젝트 자체 생성물이며 별도 CC0가 부여된 외부 음원이라고 표시하지 않는다.

## 전체 조사 목록

54개 각각의 길이·코덱·샘플레이트·채널·peak·RMS·저레벨 앞뒤 구간·해시는 [inventory.json](audio-sources/kenney-casino/inventory.json)에 있다. 카드 펼치기(card-fan)는 배분과 동작이 다르고, shuffle은 3초 이상으로 길어 제외했다. pack-open/take-out은 포장 동작, dice 계열은 주사위여서 제외했다. 나머지 place/slide/shove/lay/stack/handle 변형은 이번 선택본의 대안으로만 남겼다. 실제 없는 효과음을 목록에 추가하지 않았다.

## 실제 기기 확인

기본 master 50%와 사용자 저장 gain에서 연속 콜→공개, 레이즈, 폴드→팟 획득의 체감 균형과 잘림을 확인한다. 특히 긴 fold/collect 뒤 대기 효과음 만료, 첫 재생 지연, 빠른 음소거·background·재접속을 점검한다. 블루투스와 기기 스피커의 출력 지연은 번들 테스트로 확인할 수 없다. 실제 설치 APK는 이번 로컬 변경만으로 업데이트되지 않는다.

## 이번 적용의 검증 결과

- 모바일 테스트: `node --test apps/mobile/test/*.test.cjs` **9/9 통과**.
- `npm run typecheck`: mobile/server/shared 모두 통과.
- 로컬 Expo export: Android 858 modules, iOS 859 modules Hermes 번들 생성 성공. 새 WAV 6개 + 유지 음원 4개가 양쪽 asset 목록에 포함됨.
- 양쪽 번들의 실제 asset 바이트와 기록된 6개 출력 SHA-256을 대조하여 모두 일치함을 확인했다.
- 6개 WAV의 PCM 헤더·디코딩·길이(<1초)·peak(≤−6dBFS), 원본/출력/라이선스 해시 검증 통과.
- `git diff --check` 통과. 기존 module-type/콘솔 색상 경고는 있었으나 실패는 아니다.
- 네이티브 청취·APK 설치·EAS 빌드·Railway 배포는 수행하지 않았다. 커밋·푸시 및 DB/볼륨 변경도 없음.

원본 peak/RMS 수치는 원본 OGG를 44.1kHz mono float로 디코딩한 분석 신호 기준이다. 원본 컨테이너는 stereo이며 stereo 각 채널의 peak나 true-peak 값을 표기한 것은 아니다.
