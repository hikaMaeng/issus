issus intake·라우팅·전달·COMPACT 큐 worker.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

[구조](docs/architecture.md) · [사용](docs/usage.md) · [내부](docs/internals.md)

준비 상태: agent initialize/ready 훅에 DB·PGMQ·migration0001–0003·필수 큐 검사를 연결한다. 미준비503, 복구200.
