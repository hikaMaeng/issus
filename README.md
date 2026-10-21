issus 에이전트 통신 서비스의 npm workspace 모노레포.

| 모듈 | 역할 | 문서 |
| --- | --- | --- |
| agent | P2 vendoring 빈 슬롯 | [README](packages/agent/README.md) |
| issus_domain | 규약·업무 모델 | [README](packages/issus_domain/README.md) |
| issus_runtime | 공통 기동·연결 | [README](packages/issus_runtime/README.md) |
| issus | Express + React shell | [README](apps/issus/README.md) |
| issus-worker | 큐 소비 진입점 | [README](apps/issus-worker/README.md) |
| issus-scheduler | 스케줄 진입점 | [README](apps/issus-scheduler/README.md) |
| issus-db | PostgreSQL 18 + PGMQ | [README](apps/issus-db/README.md) |
| issus-cli | issus CLI | [README](apps/cli/README.md) |

`npm install`, `npm run lint`, `npm run build`, `npm test`, `docker compose config`.
배포는 `npm run deploy`(4서비스 전체), 부분 배포는 `npm run deploy -- issus`.
Turbo remote cache는 off이며 로컬 `.turbo`만 사용한다.
Node 런타임은 24, 빌드 호스트는 Node >=20.19.0(20 계열) 또는 >=22.12.0 필수. Vite engines를 만족해야 한다.

[요구](docs/brief.md) · [설계](docs/design.md) · [개요](docs/overview.md) · [구조](docs/architecture.md) · [사용](docs/usage.md) · [출처](docs/vendoring.md).
현재 P1 골격이며 health/ready 성공은 업무·DB·큐 준비 완료를 뜻하지 않는다.
