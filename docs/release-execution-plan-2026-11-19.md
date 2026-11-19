# 운영 배포 후보 확정 및 승인 후 실행 계획

2026-11-19 KST. 사용자가 확정 path 목록의 로컬 stage/commit만 승인했다. commit 메시지는 `feat: prepare Friends Table web release`다. 이 문서는 원격 실행 승인이 아니다. push, main 병합, 운영 설정/배포/백업/테스트 데이터 생성은 금지 상태다. 추가 기능 개발 없음.

## 확정 입력과 준비 상태

- 사용자 확인: Railway production / @boardgame/server / GitHub main, Pages friends-table-staging / production branch deploy/web-staging / https://friends-table-staging.pages.dev, 기존 Supabase 재사용.
- 위 도메인을 그대로 사용한다. WEB_ALLOWED_ORIGINS와 EXPO_PUBLIC_WEB_APP_URL은 모두 `https://friends-table-staging.pages.dev` (끝 슬래시 없음).
- 로컬 커밋 준비: **READY**. P0/P1/P2·관련 테스트·SQL 근거·문서 포함 목록을 `release-candidate-paths-2026-11-19.txt`에 확정했다. index/commit은 아직 변경하지 않았다.
- 운영 실행: **NOT READY / 승인 대기**. preview 자동배포 설정, 운영 백업 및 복구 확인, Docker/clean Linux 빌드와 실기기·운영 smoke test가 미완료다.
- Pages 롤백 정보는 사용자가 이전 Cloudflare MCP 조회 결과로 제공했다. 성공 배포 `f43122dd-ab19-4067-9541-955dcf8afc39`, SHA `89229f58c73578583425a002f1ced3a1e9c66c0c`, 성공 시각 2026-11-16 20:56:55 KST. 실제 배포 직전에 현재 production 배포 및 롤백 가능 여부를 다시 확인한다.

## 후보 소스와 최종 검사

현재 경로 `play-ui-refresh`만 사용한다. 브랜치 codex/tempo-hand-history, HEAD `89229f58c73578583425a002f1ced3a1e9c66c0c`. 원격을 읽기 조회한 결과 main=`a666688cd61452abbaebf415726b0900bfa9b20c`, deploy/web-staging=`89229f58c73578583425a002f1ced3a1e9c66c0c`, codex/tempo-hand-history는 원격에 없다. 다른 작업 트리의 변경을 섞지 않았다.

후보는 HEAD 전체 + 확정 path 목록의 변경이다. P0 오디오/템포/히스토리, P1 입력/viewport, P2 카드/설정/두 친구 API와 보안 테스트를 함께 포함한다. 문서/fixture 캡처는 리뷰용이며 런타임 업로드 대상이 아니다. 007 SQL은 테스트 근거로 보존하며 운영 실행하지 않는다. 상세 파일 역할은 [후보 목록](release-candidate-files-2026-11-19.md)을 참조한다.

제외: docs/staging-environment-plan.md, supabase/.temp/**, .qa-web/**, 실제 .env*, node_modules, SQLite/로그, 생성 번들. 삭제하지 않고 로컬에 보존한다. Git tracked 예시 설정은 유지한다.

| 최종 재실행 | 결과 | 근거 |
| --- | --- | --- |
| npm test | 178/178 PASS, fail/skip 0 | .qa-web/final-server.log |
| mobile test | 50/50 PASS, fail/skip 0 | .qa-web/final-mobile.log |
| npm run typecheck | 모든 workspace PASS | .qa-web/final-types.log |
| production Web/PWA | PASS, 22 static files | .qa-web/final-web.log |
| Android/iOS production export | 두 Hermes 번들 PASS | .qa-web/final-native.log |
| CORS/WS Origin, 인증/세션·복구, 두 친구 API | 전체 서버/모바일 suite에서 PASS | 위 로그 |
| diff 검사 | PASS | git diff --check |

이번 재실행의 실패는 0이다. 앞선 제한 환경의 소켓 실패 이력은 [readiness 보고서](release-readiness-2026-11-19.md)에 보존한다. P1/P2 Chrome은 앞선 실행에서 PASS이며 구현/테스트 소스 203개 hash가 그대로인 것을 확인해 다시 실행하지 않았다. 운영 JWT, 실제 기기, APK/IPA, Docker 이미지·Linux clean 설치 성공을 의미하지 않는다. Docker 실행기가 없어서 이미지 빌드는 여전히 미검증이다. 소스 fingerprint는 `e391a9d09df95b8e2b207b529e5f9808096284705ca7baa71028d009de9b02f7`이다.

## 자동배포 경계

| 작업 | 영향 |
| --- | --- |
| 로컬 add/commit | 원격 배포 없음. 확정 path 목록과 지정 메시지에 한해 사용자 승인 |
| codex/tempo-hand-history push | 저장소 CI 실행. Railway main 자동배포 대상 아님. Pages preview 설정에 따라 공개 preview가 생길 수 있음 |
| deploy/web-staging push | Pages production 자동배포가 켜져 있으면 즉시 배포될 수 있음. Railway main에는 영향 없음 |
| main push/merge | Railway main 자동배포 가능. 이번 계획에서도 하지 않음 |
| Railway variable set | 일반적으로 재배포 유발; 아래 --skip-deploys로 설정만 먼저 저장 |
| Railway redeploy --commit | 연결된 GitHub 저장소의 특정 SHA를 일회 배포. main branch 설정 유지 |

Pages preview 설정을 확인하기 전 candidate push도 하지 않는다. preview가 전체 브랜치로 켜져 있으면 **별도 승인으로 기존 프로젝트의 preview 자동배포를 None으로 제한**한 후 candidate push한다. 이미 None/후보 제외면 변경 불필요. production 자동배포가 꺼져 있다면 이를 임의로 켜지 말고 최종 단계에서 기존 프로젝트의 해당 커밋 수동 배포를 별도 승인한다. [Cloudflare branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

후보는 main보다 앞서 있으므로 수동 Railway 배포 후 main은 여전히 구버전이다. 이후 main push로 구버전 서버가 재배포되지 않도록 릴리스 기간 main 변경을 동결하고, 추후 main 동기화는 별도 승인·검토한다. 자동배포를 임의로 해제하거나 서비스 Git 연결을 변경하지 않는다.

## 승인 후 명령 — 지금 실행하지 않음

아래는 PowerShell, 저장소 루트 기준이다. 각 단계 승인은 독립이다. 실제 commit SHA는 아직 없으므로 승인 후 생성한 값을 사용한다. 환경/서비스 ID는 기존 운영 대상으로 고정한다.

### A. 로컬 stage/commit 승인

```powershell
git diff --cached --name-only
git add --pathspec-from-file=docs/release-candidate-paths-2026-11-19.txt
git diff --cached --check
git diff --cached --name-status
git commit -m "feat: prepare Friends Table web release"
$releaseSha = (git rev-parse HEAD).Trim()
```

첫 명령에서 기존 staged 파일이 있으면 덮어쓰거나 reset하지 말고 포함 여부를 검토한다. commit 전 cached 목록이 확정 path 목록과 일치하는지 확인한다. `git add .`, `git commit -a`는 사용하지 않는다. 의도적으로 제외한 미추적 문서는 남아 있어도 된다.

### B. candidate 게시 승인 (preview 트리거 확인 후)

```powershell
git push origin HEAD:refs/heads/codex/tempo-hand-history
```

현재 브랜치/HEAD가 승인한 releaseSha인지 확인한 뒤 실행한다. 원격에 같은 브랜치가 새로 생겼거나 divergence가 생기면 중단한다. force push 금지. GitHub CI 성공을 확인한다. Docker 가능 환경에서는 이 정확한 SHA의 깨끗한 checkout에서 `docker build -t friends-table-server:release-check .`를 먼저 검증한다. 현재 dirty 작업 폴더의 배포는 금지한다.

### C. 백업/유지보수 승인

대상 Volume `514aeca2-dba6-4089-bf41-65ea8f63eb11`, `/data`, 서비스 @boardgame/server. 아래 행위 전체는 별도 운영 승인 대상이다.

1. 게임 종료 시간을 공지하고 방/연결이 비었는지 확인한다. 신규 접속을 막는 수단과 종료/자동재시작 제어 절차를 Railway UI에서 확인한 후 실행한다. 앱에는 유지보수 admission switch가 없으므로 공지만으로 쓰기 중지라 판단하지 않는다. 서비스/volume 삭제를 중단 수단으로 사용하지 않는다.
2. 정상 종료로 두 SQLite writer가 닫히고 새 인스턴스가 쓰지 않는 것을 확인한다. 중단 제어가 확정되지 않으면 백업과 배포를 중단한다.
3. 기존 서비스 Backups에서 manual Volume backup 생성, 성공 상태·backup ID·시각·volume ID 기록. 비용/기능 가용성을 사전 확인한다. 이번 설치 CLI에는 backup 하위 명령이 없어 임의 CLI 명령을 만들지 않는다.
4. 같은 시점의 boardgame.sqlite와 stats.sqlite 및 필요한 journal을 함께 보존한다. 실행 중 단순 파일 복사는 하지 않는다. state DB는 EXCLUSIVE lock을 유지하므로 별도 프로세스의 online backup이 가능하다고 가정하지 않는다.
5. 승인된 비공개 로컬 복사본에서 두 DB integrity_check와 형식 확인. 운영 원본이나 실제 계정으로 게임을 실행하지 않는다. Node 24 복사본 검사 예시는 아래와 같다. 경로는 백업을 승인 후 안전하게 받은 위치로 지정한다.

```powershell
node -e 'const {DatabaseSync}=require("node:sqlite"); for(const p of process.argv.slice(1)){const db=new DatabaseSync(p,{readOnly:true}); const rows=db.prepare("PRAGMA integrity_check").all(); if(rows.some(r=>r.integrity_check!=="ok"))throw Error("Backup integrity failed"); db.close();} console.log("Both backup databases passed integrity_check");' <PRIVATE_BACKUP_STATE_PATH> <PRIVATE_BACKUP_STATS_PATH>
```

위 무결성 검사는 논리적 두 DB 시점 일치나 실제 복구까지 보장하지 않는다. 격리된 복사본에서 복구도 확인하고, 유효한 backup ID 없이는 배포하지 않는다. checkpoint의 개인 패·방 토큰을 화면/로그에 출력하지 않는다. 새 staging 서비스는 만들지 않는다.

### D. Railway 설정·업데이트 승인

```powershell
railway variable set --project 0aeab21d-455b-434a-b733-82b66251ab4b --environment production --service 7d4a6ad9-47a8-4dd7-8282-2bf53f0cac9b --skip-deploys "WEB_ALLOWED_ORIGINS=https://friends-table-staging.pages.dev"
railway redeploy --project 0aeab21d-455b-434a-b733-82b66251ab4b --environment production --service 7d4a6ad9-47a8-4dd7-8282-2bf53f0cac9b --commit $releaseSha
```

실행 직전 기존 Origin 값이 새로 생겼다면 위 명령으로 덮어쓰지 말고 기존 승인 Origin을 보존한 합집합을 재검토한다. `/data` 경로, Supabase URL/공개 키, replica 1, 종료 유예 15초는 유지한다. `redeploy --from-source`나 bare `redeploy`로 대체하지 않는다. 전자는 main의 구버전을 가져올 수 있고 후자는 현재 이미지 재실행일 수 있다. 설치 CLI help에서 --commit과 --skip-deploys 지원을 확인했다. [Railway 변수](https://docs.railway.com/cli/variable).

배포 성공 SHA/health, allowed Origin OPTIONS=204·정확한 Allow-Origin, denied Origin HTTP/WS=403, allowed/native WS의 JWT 요구를 검사한다. 인증된 smoke test는 세션 RPC가 쓰기를 할 수 있으므로 운영 테스트 승인에 포함한다. 실패하면 Pages 브랜치를 push하지 않는다.

### E. 기존 Pages 설정·배포 승인 (서버 정상 후)

프로젝트 friends-table-staging만 사용한다. production branch deploy/web-staging 유지. 설정이 이미 아래와 같으면 재저장하지 않는다.

| 설정 | 값 |
| --- | --- |
| Root / framework | 저장소 루트 / None |
| Build / output | npm ci --include=dev && npm run build:pages / apps/mobile/dist-web |
| NODE_VERSION / SKIP_DEPENDENCY_INSTALL | 24.19.0 / 1 |
| EXPO_PUBLIC_WEB_GAME_SERVER_URL | wss://boardgameserver-production.up.railway.app/lobby |
| EXPO_PUBLIC_WEB_APP_URL | https://friends-table-staging.pages.dev |
| EXPO_PUBLIC_SUPABASE_URL | https://znnmzowesjrrshimukwv.supabase.co |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 기존 공개 키; 값은 문서/로그에 기록하지 않음 |
| APP_ENV | 없음 |

```powershell
git fetch origin deploy/web-staging
git merge-base --is-ancestor origin/deploy/web-staging $releaseSha
if ($LASTEXITCODE -ne 0) { throw 'Pages branch diverged; stop without force push' }
git push origin "${releaseSha}:refs/heads/deploy/web-staging"
```

fetch는 해당 시점 읽기/로컬 ref 갱신이며 병합은 하지 않는다. push는 **Pages production 배포 승인 자체**로 취급한다. 현재 원격 Pages branch는 HEAD 89229f5라 이번 후보 commit의 조상이지만 실행 직전 확인한다. production 자동배포가 켜졌다면 별도 수동 deploy로 중복 배포하지 않는다. 꺼졌다면 existing project UI의 정확한 releaseSha 수동 배포를 별도 승인한다.

HTTPS/manifest·asset MIME/없는 자산 404/초대 경로/CORS/WSS와 실제 로그인→친구→두 친구 전적→게임→새로고침/잠금/재접속·네이티브 혼합을 승인된 테스트 계정으로 확인한다. 새 익명 계정/게임 기록이 생길 수 있음을 운영 테스트 승인에 포함한다.

## 롤백 대상과 실행

| 대상 | 기록 |
| --- | --- |
| Railway 이전 성공 배포 | 0b7f9148-3b9c-4783-a310-a7fa9d60627e |
| Railway 이전 SHA | 9e741b27c305b6ec11eb463b6d8677e6690c555f |
| Railway 이전 Origin | 미설정. 구버전은 이 변수를 읽지 않음 |
| Pages 프로젝트 | friends-table-staging |
| Pages 이전 성공 production deployment ID | f43122dd-ab19-4067-9541-955dcf8afc39 (사용자 제공, 이전 MCP 조회 결과) |
| Pages 이전 성공 production SHA / 시각 | 89229f58c73578583425a002f1ced3a1e9c66c0c / 2026-11-16 20:56:55 KST |
| Pages 원격 branch 현재 SHA | 89229f58c73578583425a002f1ced3a1e9c66c0c; 성공 배포 SHA의 증거는 아님 |
| 운영 backup ID | 아직 생성 금지 상태, 미생성 |

웹만 실패하면 위에 고정할 Pages 성공 production 배포에 대해 `Rollback to this deployment`를 실행한다. 프로젝트가 같아도 preview는 rollback target이 아니다. Git branch를 강제 되돌리지 않으며 후속 push가 rollback을 덮어쓸 수 있어 릴리스 기간 push를 중지한다.

서버 실패 시 기존 이미지 배포를 UI에서 되돌리는 방법을 우선한다. 특정 SHA 재빌드가 필요한 대안은 아래이며 별도 재배포 승인 대상이다.

```powershell
railway redeploy --project 0aeab21d-455b-434a-b733-82b66251ab4b --environment production --service 7d4a6ad9-47a8-4dd7-8282-2bf53f0cac9b --commit 9e741b27c305b6ec11eb463b6d8677e6690c555f
```

기존 이미지 재사용과 특정 SHA 재빌드는 동일하지 않다. Docker base tag가 바뀔 수 있어 가능한 한 기존 검증 이미지를 우선한다. /data는 유지한다. Origin 변수는 구버전에서 무시되므로 긴급 롤백 때 굳이 삭제해 추가 재배포를 유발하지 않는다. 정확한 이전 설정 복원은 별도 검토한다. 구버전은 최신 웹 CORS/두 친구 API가 없어 웹도 호환 버전으로 롤백하거나 이용을 중단한다.

DB 손상 시에만 별도 승인으로 같은 시점의 전체 volume backup을 복원한다. 복원 전 최신 상태도 비공개 보존하며, backup 이후 전적/게임 기록 유실 범위를 확인한다. 한 SQLite만 복원하지 않는다. Railway backup Restore/Deploy는 운영 재배포를 동반하므로 코드 롤백 승인과 구분한다.

예상 중단은 수초로 단정할 수 없다. Volume 서비스 교체와 백업/검증 시간 동안 WS가 끊긴다. 장기 중단·5분 좌석 만료·24시간 checkpoint 만료·nextHandAt 미저장 때문에 진행 중 게임의 정확한 재개를 보장하지 않는다. 빈 방 유지보수 시간에 시행한다.

## 승인 단위

1. A의 정확한 path 목록 stage 및 로컬 commit.
2. 필요할 때만 기존 Pages preview 자동배포 제한, B의 candidate push/CI.
3. 유지보수·신규접속/프로세스 중단 제어, 비공개 백업 생성·로컬 복사본 검사·복구 검증. 구체적 중단 수단과 backup ID 확인 전 실행 금지.
4. D의 정확한 Origin 설정(--skip-deploys) 및 특정 후보 SHA Railway 배포.
5. E의 기존 Pages 설정 차이만 수정하고 deploy/web-staging push(또는 자동배포가 꺼진 경우 해당 SHA 수동 배포).
6. 실제 운영 인증·친구·게임 테스트 데이터 생성.
7. 실패 시 기존 Pages/Railway 배포 롤백. DB 복원은 별도 추가 승인.

새 프로젝트/인프라, Supabase 데이터/설정 변경, main push/merge는 이 계획의 실행 항목이 아니다. 현재는 모두 대기한다.
