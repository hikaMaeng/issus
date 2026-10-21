issus의 인증·도메인 명령 HTTP·읽기 전용 preflight·이슈 조회 서비스.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

[구조](docs/architecture.md) · [사용](docs/usage.md) · [내부](docs/internals.md)

production 조립은 `src/server/entry/broker/index.ts`의 `createBroker`다. 동일 UoW/auth에 core·delivery·subscriptions·compact 라우트, canonical+inbox history reader, WS/SSE와 세션 revoke를 연결한다. `allowedActions=[]`로 WS 명령을 금지한다. [core HTTP 계약](src/server/http/auth/README.md)은 주입 UoW Clock의 cookie Expires24h·preflight 전체 큐 fingerprint·32/5 fixture를 설명한다.

P6는 `src/server/http/compact/index.ts`의 `installCompactRoutes`를 공통 인증 뒤에 연결한다. status/prepare/packet과 기존 comments 게시의 metadata 왕복은 [API](docs/api.md#compact-p6), 검증은 [domain COMPACT 계획](../../packages/issus_domain/tests/plans/compact-20261021.md)을 따른다.

WS는 Authorization bearer 또는 `issus.v1`+`issus.bearer.<token>` 쌍을 받으며 응답 protocol은 `issus.v1`이다. query token은 거부한다. Monitor는 기존 subscription과 opaque cursor로 alias 채널을 자동 구독한다. SSE는 같은 bootstrap/권한/receipt 계약을 사용하며 종료 시 subscription.closed 저장 후 tail과 broker를 멈춘다.

사람용 UI는 [front 계약](src/front/README.md)의 다크 프레임·세션·이슈 개입·inbox·COMPACT 도우미를 사용한다. [P9 전체36 ID 계획](tests/plans/p9-ui-20261021.md)의 호스트 배포/Playwright와 사람 확인은 소스 시험과 별도 수용이다.
