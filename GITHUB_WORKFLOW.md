# GitHub에서 형상관리하기

저장소: https://github.com/jaewon31/boardgame (비공개)

## 기본 원칙

- `main`: 실행이 확인된 기준 버전
- `codex/기능명`: 기능별 작업 브랜치 (예: `codex/private-rooms`)
- 커밋: 의미 있는 변경을 하나씩 기록
- Pull Request(PR): 변경 내용을 확인하고 main에 합치는 요청
- GitHub Issues: 할 일과 버그 기록

## 처음 설치하거나 복사한 후

```powershell
npm ci
npm run typecheck
```

## 기능 개발 순서

현재 브랜치와 미커밋 파일부터 확인하고 [공통 규칙](AGENTS.md)을 따른다. 진행 중 작업에서 임의로 main으로 전환하거나 변경을 초기화하지 않는다.

```powershell
git status --short
git branch --show-current
git log -5 --oneline
```

관련 코드·테스트·문서를 함께 수정하고 검증 결과와 diff를 검토한다. 커밋과 원격 push는 사용자 별도 승인 후 실제 작업 파일만 선택한다. main 병합/push는 기본 금지이며 별도 명시적 승인 대상이다. Railway 자동 배포를 유발할 수 있으므로 PR 검사 통과만으로 병합하지 않는다.

## 저장소에 포함할 것

소스 코드, assets, package.json, package-lock.json, 설정 및 문서.
package-lock.json은 같은 의존성 버전을 재현하기 위해 함께 커밋합니다.

## 제외할 것

node_modules, .expo, 로그, 실제 .env 파일, 인증서 및 비밀 키.
필요한 환경 변수 이름만 .env.example에 예시로 남깁니다.

## 현재 앱 상태

변동 정보는 [현재 상태](docs/project-status.md)에서 관리한다. 로그인·게임·SQLite·친구 전적은 구현되어 있으며 배포 여부는 별도로 확인한다.
