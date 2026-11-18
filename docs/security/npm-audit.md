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
