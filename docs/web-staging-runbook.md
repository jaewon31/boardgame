# 별도 Staging 계획 철회

> **2026-11-22 대체**: 사용자 결정으로 별도 Railway 프로젝트·별도 Supabase 프로젝트·별도 SQLite 볼륨과 기존 Pages Preview 별칭으로 구성한 **재사용 테스트 환경(Preview/Staging)**을 유지한다. 아래 11/18 철회 중 "별도 Railway 서버·별도 Supabase" 부분은 대체되고, "Staging 전용 배포 브랜치를 만들지 않는다"는 유지된다. 현재 절차는 [반복 배포 절차](deployment-workflow.md), 원칙은 [AGENTS.md](../AGENTS.md) 6절. 아래는 당시 기록이다.

2026-11-18 사용자 최종 결정으로 별도 Railway 서버, 별도 Supabase 프로젝트 및 Staging 전용 배포 브랜치 계획을 철회했다.

현재 절차는 [기존 Railway·Supabase 재사용 배포 계획](web-existing-server-runbook.md)을 따른다. 이 파일은 기존 링크를 보존하기 위한 안내이며 실행 명령은 제공하지 않는다. 이전 초안은 Git 커밋 50ea5cd에서 확인할 수 있다.

Pages production 빌드 검사, 일반 CI·보안 검사와 Docker QA/번들 제외는 유지한다. 원격 배포는 기존 상태·백업·롤백·CI 확인과 사용자 최종 승인 후에만 수행한다.
