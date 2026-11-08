# 사운드 1~3단계·연결 진단 최종 검증

2026-11-08 KST. 기준 커밋 0cd3eaaf74e783d7240c5cf2b927dca6bd74a7f6. 사용자가 관련 변경의 커밋과 origin/main 푸시를 요청한 최종 검증 기록이다. 이전 보고서의 로컬 작업/미푸시 문구는 해당 시점의 기록이다.

- 서버 npm test: 최종 153/153 통과.
- 모바일 node --test apps/mobile/test/*.test.cjs: 9/9 통과.
- npm run typecheck: mobile/server/shared 모두 통과.
- Android/iOS Expo export: 양쪽 Hermes 번들 생성 성공. 신규 Kenney WAV 6개와 기존 음원 4개 포함. 출력 SHA-256을 양쪽 bundle asset과 대조해 검증했다.
- WAV 6개 헤더·PCM16 mono 44.1kHz·디코딩·1초 미만 길이·최대 −6dBFS 피크 및 원본/라이선스 해시 검증 통과.
- 기존 heartbeat timeout, 인증, 재접속 정책 유지. AppState/JS 지연/인증·큐/서버 이벤트 루프 진단 유지.
- 큐·중복 방지·우선순위·이벤트별 저장 볼륨 유지. 신규 WAV 6개가 9개 이벤트에 연결됨.

## 최초 테스트 실패와 재확인

첫 전체 서버 실행은 다른 검사와 병행 중 same account/session 세션 교체 테스트의 최종 상태 대기에서 timeout으로 1개 실패했다. 해당 멀티플레이 파일 단독 실행은 6/6, 이후 다른 검사와 겹치지 않은 전체 실행은 153/153 통과했다. 코드나 timeout을 바꾸지 않았다. 부하 관련 간헐 실패 가능성은 있으나 원인을 확정하지 않았으며 최초 실패를 숨기거나 테스트를 제외하지 않았다.

## 포함·제외 범위

포함: 관련 소스·테스트, 신규 WAV 6개, 음원 README, CC0 원문, 선택 원본 OGG 6개(출처 검증용), 영구 음원 목록·해시 증거·설계/검증 문서. 원본 OGG 6개의 합계는 약 52KB이며 ZIP 전체를 넣지 않는다.

제외: 기존 apps/mobile/eas.json 변경, 이전 단계의 별도 미추적 조사 문서 2개, 다운로드 ZIP, 임시 분석/변환 스크립트, 로그, 번들 출력, node_modules, 환경 파일, DB/볼륨, 개인 로컬 사용자 경로.

## 기존 합성 파일

deal.wav, chips.wav, collect.wav는 현재 앱 코드의 정적·동적 참조에서 사용되지 않는다. 생성 스크립트에는 각 파일의 생성 정의가 남아 있다. 현재 번들의 asset 목록에서도 제외되어 있다. 요청에 따라 삭제하지 않았다. card.wav(check), win.wav(victory), turn.wav(myTurn), warning.wav(warning)는 계속 사용한다.

## 남은 확인

실제 Android/iOS 청취·출력 지연과 고급스러운 음색의 최종 판정은 별도 기기 검증이 필요하다. 공개음은 카드 착지 녹음, 팟 획득은 일반 칩 취급음 대체다. 실제 네트워크 장애 원인 확정도 남아 있다. Railway 수동 배포와 EAS 빌드는 실행하지 않는다.
