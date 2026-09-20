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

```powershell
git switch main
git pull --ff-only
git switch -c codex/private-rooms
# 코드 수정 후
npm run typecheck
git status
git add apps/mobile/src/screens/HomeScreen.tsx
# 실제 변경한 파일만 추가하거나 VS Code 소스 제어에서 스테이징
git commit -m "feat: add private room screen"
git push -u origin codex/private-rooms
```

GitHub에서 Pull Request를 만들고 변경 내용과 자동 검사 결과를 확인합니다.
완성되면 Squash and merge로 main에 합칩니다.
다음 작업 전에는 다시 main으로 이동해 `git pull --ff-only`를 실행합니다.

## 저장소에 포함할 것

소스 코드, assets, package.json, package-lock.json, 설정 및 문서.
package-lock.json은 같은 의존성 버전을 재현하기 위해 함께 커밋합니다.

## 제외할 것

node_modules, .expo, 로그, 실제 .env 파일, 인증서 및 비밀 키.
필요한 환경 변수 이름만 .env.example에 예시로 남깁니다.

## 현재 앱 상태

첫 화면과 게임 선택만 구현되었습니다. 로그인, 초대 방, 서버 및 실제 게임은 후속 작업입니다.