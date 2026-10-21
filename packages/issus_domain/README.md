issus의 봉투 v2·wire 계약·순수 검증/집계·도메인 SQL baseline.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

[구조](docs/architecture.md) · [사용](docs/usage.md) · [내부](docs/internals.md) · [baseline](src/server/backend/schema/README.md)

설계 정본은 [design v2.1](../../docs/design.md). P3 공개 집계는 `src/common/domain/index.ts`이며 최상위 `common/index.ts` 연결은 P1/오케스트레이터 소유다. 패키지 root/`common` 공개 경계로 소비한다. 실행기·HTTP·PGMQ·실제 게시·전달·COMPACT worker는 후속 담당 소유다.
