# 배포 후보 파일 목록 — 2026-11-19

> 최종 포함 목록은 [path 파일](release-candidate-paths-2026-11-19.txt)로 확정했다. 이 목록의 기존 포함 항목에 후속 문서 `docs/release-execution-plan-2026-11-19.md`와 path 파일 자체를 추가한다. 제외 항목은 유지한다. [최종 명령·검증](release-execution-plan-2026-11-19.md) 참조. stage/commit은 실행하지 않았다.

현재 작업 트리만 조사했다. 파일 삭제·이동·스테이징·커밋은 하지 않았다. 아래는 HEAD 위 변경 목록이며 HEAD의 기존 tracked 소스 전체도 후보의 기반이다. docs/staging-environment-plan.md 및 CLI 캐시를 제외한다. 자세한 판정은 [배포 후보 보고서](release-readiness-2026-11-19.md).

- 브랜치: codex/tempo-hand-history
- HEAD: 89229f58c73578583425a002f1ced3a1e9c66c0c
- 원격 main: a666688cd61452abbaebf415726b0900bfa9b20c (remote-only 0 / local-only 1)
- 최종 배포 커밋: 미생성; 아래 파일 검토 및 승인 후 확정
- 구현/설정/테스트 소스 manifest: `.qa-web/release-source-manifest-2026-11-19.json` (203개; docs 및 루트 안내 문서 제외)
- 소스 fingerprint SHA-256: `e391a9d09df95b8e2b207b529e5f9808096284705ca7baa71028d009de9b02f7`
- 웹 산출물: 22개, 개별 크기·해시는 `.qa-web/release-web-manifest-2026-11-19.json`

## 전체 미커밋·미추적 목록

`M`: HEAD 대비 수정, `??`: 미추적, `!!`: 이번 정리로 ignore한 기존 미추적 캐시. 문서는 상태가 계속 갱신될 수 있어 소스 fingerprint에서 제외한다.

| 상태 | 파일 | 제안 | 근거 |
| --- | --- | --- | --- |
| M | `.dockerignore` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `.gitignore` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `AGENTS.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `apps/mobile/src/components/CardArtwork.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/components/HandReview.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/components/RoomSettingsEditor.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/hooks/useGameAudio.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/screens/AccountScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| ?? | `apps/mobile/src/screens/FriendComparisonScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/screens/FriendsScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/screens/FriendStatsScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/screens/GameScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/screens/HomeScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/screens/LobbyScreen.tsx` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/services/audioScheduler.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/services/cardPresentation.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/services/soundCatalog.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/services/soundEvents.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/mobile/src/services/useWebLayout.web.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| ?? | `apps/mobile/src/services/webViewport.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| ?? | `apps/mobile/test/browser/input-fixture.jsx` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| ?? | `apps/mobile/test/browser/native-web-shim.js` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| ?? | `apps/mobile/test/browser/p2-fixture.jsx` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| M | `apps/mobile/test/FriendsScreen.test.cjs` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| M | `apps/mobile/test/web-ui.test.cjs` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| M | `apps/server/src/friendStatsApi.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/server/src/http.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/server/src/lobby.ts` | 포함: 구현/설정 | 현재 검증한 앱/서버/배포 구성 |
| M | `apps/server/test/audioScheduler.test.ts` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| M | `apps/server/test/cardPresentation.test.ts` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| ?? | `apps/server/test/friend-comparison.test.ts` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| ?? | `apps/server/test/friend-stats-security.test.ts` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| M | `apps/server/test/lobby.test.ts` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| M | `apps/server/test/soundEvents.test.ts` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| ?? | `docs/architecture.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/assets/p2/after-1366-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-1920-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-375-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-375-settings.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-390-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-390-history.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-390-selection.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-390-stats.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-430-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-844-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/after-844-stats-bottom.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/before-375-settings.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/before-390-cards.png` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/assets/p2/results.json` | 포함: 검토 근거 | P2 fixture 캡처/결과; 런타임 제외 |
| ?? | `docs/decisions.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/documentation-audit.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `docs/friend-stats.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/p1-input-layout-report.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/p2-rpc-security-review.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/p2-rpc-verification-2026-11-18.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/p2-ui-friend-comparison-report.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `docs/private-beta-deployment.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/project-status.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/README.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/release-candidate-files-2026-11-19.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/release-readiness-2026-11-19.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/staging-environment-plan.md` | 제외 | 별도 staging 인프라 계획; 현재 요청과 불일치, 로컬 보존 |
| ?? | `docs/tempo-hand-history-report.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `docs/testing.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `docs/web-deployment.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `docs/web-phase6-deployment-readiness.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `GITHUB_WORKFLOW.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| M | `README.md` | 포함: 문서 | 정책/구현/검증/운영 근거; 런타임 제외 |
| ?? | `scripts/test-input-browser.cjs` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| ?? | `scripts/test-p2-browser.cjs` | 포함: 테스트 | P0/P1/P2 회귀 검증 |
| !! | `supabase/.temp/cli-latest` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/gotrue-version` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/linked-project.json` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/pooler-url` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/postgres-version` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/project-ref` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/rest-version` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/storage-migration` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| !! | `supabase/.temp/storage-version` | 제외 | CLI 연결/캐시; Git/Docker ignore, 로컬 보존 |
| ?? | `supabase/drafts/007_friend_stats_permission.sql` | 포함: SQL 근거 | 로컬 테스트 의존성; 자동 migration/운영 실행 제외 |
| ?? | `supabase/drafts/007_friend_stats_preflight_readonly.sql` | 포함: SQL 근거 | 로컬 테스트 의존성; 자동 migration/운영 실행 제외 |

## 아티팩트 경계

Railway Dockerfile은 서버 src, shared src 및 필요한 package manifest/lock만 이미지에 복사한다. 이번 .dockerignore로 .qa-web, dist-web, Supabase CLI 캐시도 build context에서 제외했다. Pages 업로드 대상은 apps/mobile/dist-web 내용만이다. 테스트·SQL·문서·캡처·환경 파일·SQLite는 정적 업로드에 포함하지 않는다.

P0의 오디오/히스토리와 P2 카드/설정은 웹 호스팅의 기술적 필수는 아니지만 최신 기능 후보로 함께 검증했다. 별도 제외할 경우 GameScreen 등 혼합 변경을 분리한 뒤 재검증해야 한다. 현재 목록은 선택 적용된 새 커밋이나 독립 checkout을 뜻하지 않는다.
