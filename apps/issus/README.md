issus의 인증·도메인 명령 HTTP·읽기 전용 preflight·이슈 조회 서비스.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

[구조](docs/architecture.md) · [사용](docs/usage.md) · [내부](docs/internals.md)

P4 공개 조립은 `src/server/http/auth/index.ts`의 `createCoreHttpRouter(options)`다. P1은 createEventBroker.extendHttp에서 static fallback보다 먼저 연결한다. 독립 `createCoreTestApp`은 HTTP/실DB 시험 전용이며 production entry를 수정하지 않는다. P5 stream/inbox/delivery, P6 compact API, P8 front는 각 담당 경계다.

P6는 `src/server/http/compact/index.ts`의 `installCompactRoutes`를 공통 인증 뒤에 연결한다. status/prepare/packet과 기존 comments 게시의 metadata 왕복은 [API](docs/api.md#compact-p6), 검증은 [domain COMPACT 계획](../../packages/issus_domain/tests/plans/compact-20261021.md)을 따른다.
