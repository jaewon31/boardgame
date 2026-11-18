# npm 보안 감사

2026-11-18 KST, `codex/consolidate-friends-table`의 `353723e`에서 Node 24.19.0 및 npm 12.2.1로 확인했다. 감사 결과의 패키지 경로는 루트 [잠금 파일](../../package-lock.json)의 버전과 대조했다.

| 명령 (저장소 루트) | 결과 |
| --- | --- |
| `npm audit --json` | 43개 항목: 높음 37, 보통 6, 심각 0, 낮음 0 |
| `npm audit --omit=dev --json` | 같은 집계 |
| `npm audit --omit=dev --workspace=@boardgame/server --json` | 0개 |

[과거 서버 배포 문서](../private-beta-deployment.md)의 서버 범위 0건이 이번에도 재현됐다. 당시 모노레포 기록에는 정확한 집계나 원본 npm JSON이 없어 증감은 미확인이다. 기존 이름에 audit가 포함된 오디오 JSON은 npm 검사 결과와 범위가 다르다.

| 자체 권고가 반환된 패키지 | 감사가 표시한 잠금 버전 | 권고 ID |
| --- | --- | --- |
| `glob` | 13.0.6 | GHSA-3g3m-2fjr-6pw4 |
| `minimatch` | 10.2.6 | GHSA-g3hv-75wg-m249 |
| `node-forge` | 1.4.2 | GHSA-6889-vf6x-f3g5, GHSA-w4xr-hqv8-ch44, GHSA-6cv4-p8m7-4r25, GHSA-j8rw-jp99-435v |
| `picomatch` | 4.0.7, 2.3.2 | GHSA-fc5q-39xc-vjpf |

43개는 의존 관계를 통해 영향받는 상위 패키지 항목도 포함한 집계다. Expo 및 React Native 체인은 이 집계에 포함된다. 추정: 일부 경로는 모바일 빌드 도구에서만 사용될 수 있다. 릴리스 번들 및 서버 이미지에서의 도달 가능성은 미검증이다. 서버 범위 0건은 해당 감사 입력과 시점에 한정한다.

1. 별도 작업에서 `npm explain`과 잠금 파일로 의존 경로를 확인하고, 높은 심각도부터 SDK와 호환되는 수정 버전을 검토한다.
2. 강제 자동 수정이나 SDK 다운그레이드 없이 호환 가능한 업데이트를 검토한다. 변경 시 manifest와 lockfile을 함께 리뷰한다.
3. 새 감사 집계, TypeScript, 서버·모바일 테스트, Web·Android·iOS 번들 및 영향받는 브라우저 검증을 기록한다. 남는 권고에는 적용을 미룬 이유와 재검토 조건을 남긴다.


## 2026-11-18 안정성 점검 재감사

HEAD 1b09bd1, Node 24.19.0 / npm 12.2.1. npm audit --omit=dev --json은 exit 1, 총 43(high 37/moderate 6/critical 0)으로 기존 집계와 동일. 서버 workspace는 exit 0, 0개. 근거는 ignored .qa-web/stability/npm-audit.json, npm-audit-server.json, npm-explain.txt. manifest/lockfile/설치 패키지 변경 없음.

### 직접·간접 및 배포 범위

- 자체 권고 대상 glob/minimatch/node-forge/picomatch는 모두 간접 의존성이다. expo/react-native 및 일부 native 모듈은 직접 의존성이지만 audit의 high 표시는 하위 의존성에서 전파된 항목을 포함한다. 43개 독립 취약점으로 해석하지 않는다.
- picomatch 2.3.2: Expo → Metro → jest-worker → jest-util, 또는 metro-file-map → micromatch. 4.0.7: @expo/cli, @expo/metro-config, React Native/codegen → tinyglobby. 주로 파일 검색·변환/개발 도구 경로다.
- glob 13.0.6: @expo/cli/config/config-plugins/fingerprint/metro-config. minimatch 10.2.6: glob 및 @expo/fingerprint.
- node-forge 1.4.2: @expo/cli 및 @expo/code-signing-certificates의 ^1.4.0 요구. Expo CLI 인증서/서명 관련 빌드 도구 경로다.
- Expo가 모바일 dependencies에 선언되어 CLI/Metro가 prod tree에 들어오므로 --omit=dev로 사라지지 않는다. npm 분류와 최종 앱 실행 코드 포함 여부는 다르다.
- Dockerfile은 server/shared만 npm ci --omit=dev --ignore-scripts로 설치하고 해당 src만 복사한다. 이 구조 및 서버 범위 audit에서는 위 Expo 체인이 제외된다. 실제 원격 이미지 재빌드/SBOM 대조는 미실행.
- Pages는 dist-web 정적 22파일만 게시하고 node_modules/CLI는 업로드하지 않는다. 브라우저/Hermes 번들의 모듈별 도달 가능성을 source map으로 완전히 분석한 것은 아니므로 native 및 웹 위험 0을 단정하지 않는다. 개발 서버를 공개 배포 서버로 사용하지 않는다.

### 수정 우선순위와 별도 브랜치 계획

| 우선순위 | 대상 / 조치 | 호환성 판단 |
| --- | --- | --- |
| 1 | high picomatch ReDoS: 신뢰되지 않은 glob 입력 경로 확인, upstream 수정 추적 | [공식 권고](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)는 확인 시 patched version 없음. audit 제안 RN 0.83.10/Expo 50.0.2 다운그레이드 금지 |
| 2 | node-forge 1.4.3 후보를 별도 브랜치에서 우선 검증 | CLI 요구 ^1.4.0 안의 patch 후보. [TLS 권고](https://github.com/advisories/GHSA-w4xr-hqv8-ch44)에 1.4.3 수정 명시. 나머지 3개 권고 해소 여부도 재audit로 확인해야 함 |
| 3 | glob 14.0.2 / minimatch 11.0.1 채택 가능한 Expo SDK 58 도구 패치 조사 | [glob 권고](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch 권고](https://github.com/advisories/GHSA-g3hv-75wg-m249). 현재 ^13/^10 요구 밖 major이므로 일괄 override 금지; upstream 호환 릴리스 우선 |

실행 계획: 현재 기능 수정과 분리해 codex/security-dependencies 같은 브랜치에서 기준 lockfile을 유지한 채 후보별 변경 → npm explain/전체 및 서버 audit → Expo 58/RN 0.88.1/Metro 0.87.1 peer·버전 확인 → TypeScript/서버/모바일/P1·P2/Web·Android·iOS 번들 재검증. major override 필요 시 별도 검토하고 잔여 위험과 rollback용 manifest/lock diff를 남긴다. 이번에는 npm audit fix 또는 fix --force, npm update, SDK 변경을 실행하지 않았다.
