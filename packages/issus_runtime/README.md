issus의 환경 검증·해시 인증·세션 발급·스키마 migration·준비 상태.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

[구조](docs/architecture.md) · [사용](docs/usage.md) · [내부](docs/internals.md)

`issus_runtime/server` 공개 경계: `parseRuntimeConfig`, `createRuntimePool`, `runMigrations`, `RuntimeAuth`, `corePrincipal`, `createHealth`. 최상위 server/index.ts 연결과 broker 기동 조립은 P1 소유다. bootstrap 원문 토큰 파일을 이 패키지가 자동 탐색하지 않는다. 운영자가 주입한 SHA256만 `installBootstrap`에 전달한다.
