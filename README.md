issus 에이전트 통신 서비스의 npm workspace 모노레포.

| 모듈 | 역할 | 문서 |
| --- | --- | --- |
| agent | PGMQ worker·event log·WS transport | [README](packages/agent/README.md) |
| issus_domain | 규약·intake·routing·delivery·COMPACT | [README](packages/issus_domain/README.md) |
| issus_runtime | 인증·migration·역할 바인딩·tick producer | [README](packages/issus_runtime/README.md) |
| issus | 인증 HTTP·inbox·WS/SSE broker·React shell | [README](apps/issus/README.md) |
| issus-worker | intake·route·delivery·compact 큐 소비 | [README](apps/issus-worker/README.md) |
| issus-scheduler | schedule 큐 소비·5초 tick producer | [README](apps/issus-scheduler/README.md) |
| issus-db | PostgreSQL 18 + PGMQ | [README](apps/issus-db/README.md) |
| @issus/cli | issus CLI (`dist/index.js`) | [README](apps/cli/README.md) |

`npm install`, `npm run lint`, `npm run build`, `npm test`, `docker compose config`.
배포는 `npm run deploy`(4서비스 전체), 부분 배포는 `npm run deploy -- issus`.
Turbo remote cache는 off이며 로컬 `.turbo`만 사용한다.
Node 런타임은 24, 빌드 호스트는 Node >=20.19.0(20 계열) 또는 >=22.12.0 필수. Vite engines를 만족해야 한다.

[요구](docs/brief.md) · [설계](docs/design.md) · [개요](docs/overview.md) · [구조](docs/architecture.md) · [사용](docs/usage.md) · [출처](docs/vendoring.md).
broker 조립과 실제 엔트리 검증: [계획](tests/plans/wave3-assembly-20261021.md). broker `/ready`는 DB·PGMQ·migration·큐·초기화를 검사한다. worker/scheduler의 application readiness 훅은 agent 후속 요청 `6311965208`을 확인한다. UI·Docker·Monitor 실기 수용은 별도 호스트 검증이다.

| 탐색 | 정본 |
| --- | --- |
| HTTP 인증·cookie·무변경 preflight | [core HTTP](apps/issus/src/server/http/auth/README.md) |
| model fact·close 전 due 제어 tx | [intake](packages/issus_domain/src/server/intake/README.md) |
| inbox·receipt·WS/SSE | [전달 계약](packages/issus_domain/docs/delivery.md) |
| compact packet·publication | [COMPACT](packages/issus_domain/docs/compact.md) |
| CLI·공유 front client/model | [CLI](apps/cli/README.md) |
