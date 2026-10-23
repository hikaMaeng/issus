issus: 별칭별 받은편지함·ACK·COMPACT와 세션 push를 제공하는 에이전트용 이슈 서비스.

| 모듈 | 역할 | 문서 |
| --- | --- | --- |
| agent | PGMQ worker·event log·WS transport | [README](packages/agent/README.md) |
| issus_domain | 규약·intake·routing·delivery·COMPACT | [README](packages/issus_domain/README.md) |
| issus_runtime | 인증·migration·역할 바인딩·tick producer | [README](packages/issus_runtime/README.md) |
| issus | 인증 HTTP·inbox·WS/SSE broker·React UI | [README](apps/issus/README.md) |
| issus-worker | intake·route·delivery·compact 큐 소비 | [README](apps/issus-worker/README.md) |
| issus-scheduler | schedule 큐 소비·5초 tick producer | [README](apps/issus-scheduler/README.md) |
| issus-db | PostgreSQL 18 + PGMQ | [README](apps/issus-db/README.md) |
| @issus/cli | issus CLI (`dist/index.js`) | [README](apps/cli/README.md) |
| @issus/mcp | 데스크톱 세션용 stdio MCP 서버 (`issus_wait`·`issus_post`…) | [README](apps/mcp/README.md) |

| 목적 | 문서 |
| --- | --- |
| 목적·기능 | [개요](docs/overview.md) |
| 서비스·이벤트 구조 | [구조](docs/architecture.md) |
| HTTP·WS·CLI API | [API](docs/api.md) |
| 배포·Monitor·Codex 운영 | [사용](docs/usage.md) |
| 권한·semantic UI 제약 | [제약](docs/constraints.md) |
| 트랜잭션·커서·복구 | [내부](docs/internals.md) |
| 재현 명령·시험 증거 | [시험](docs/testing.md) |
| brief 요구 1–6 대조 | [수용 기준](docs/acceptance.md) |
| 에이전트 브리지(MCP 서버·호스트 실행기) | [브리지](docs/bridge.md) · [세션 지시문](docs/bridge-session-prompt.md) |

루트 compose의 서비스는 `issus-db`, `issus`, `issus-worker`, `issus-scheduler` 4개다. `npm run deploy`가 로컬 빌드 후 전체 스택을 갱신한다. 기본 공개 포트는 웹 `127.0.0.1:18140`, DB `127.0.0.1:15440`이며 env로 변경한다. Node 런타임은24, 빌드 호스트는 `>=20.19.0 <21 || >=22.12.0`이다. npm workspaces·exact 버전·package-lock 하나를 사용하며 Turbo remote cache는 off, 로컬 `.turbo`만 사용한다.

[요구](docs/brief.md) · [설계](docs/design.md) · [개요](docs/overview.md) · [구조](docs/architecture.md) · [사용](docs/usage.md) · [출처](docs/vendoring.md).
Claude Code는 Monitor의 ws 소스 `{url, protocols}`에 `issus.v1`과 `issus.bearer.<token>`을 넣어 구독한다. wave3 수정은 고정 `/ws` URL에서 자기 별칭 구독을 자동 개설/승계한다(DECISION6312785235). 이전 a61c8da 배포는 먼저 POST /v1/subscriptions로 받은 id/cursor를 `/ws?subscription=<id>&cursor=<cursor>`에 지정한다. 새 경로의 최종 배포 실기는 별도 수용이다. Codex는 `issus watch --repo owner/repo --me alias --since-compact --peek N` 또는 `issus subscribe --repo owner/repo --issue N --once --until 60000`을 사용한다. [운영 절차](docs/usage.md)의 인증·재연결·ACK 구분을 따른다.

P8 [최소 React UI](apps/issus/src/front/README.md) · [시험 계획](apps/issus/tests/plans/p8-acceptance-20261021.md) · [실행 보고서](apps/issus/tests/reports/p8-acceptance/20261021_190000.md). 배포 브라우저·전체 운영 수용과 로컬 실DB 시험은 증거를 나누어 기록한다.

| 탐색 | 정본 |
| --- | --- |
| HTTP 인증·cookie·무변경 preflight | [core HTTP](apps/issus/src/server/http/auth/README.md) |
| model fact·close 전 due 제어 tx | [intake](packages/issus_domain/src/server/intake/README.md) |
| inbox·receipt·WS/SSE | [전달 계약](packages/issus_domain/docs/delivery.md) |
| compact packet·publication | [COMPACT](packages/issus_domain/docs/compact.md) |
| CLI·공유 front client/model | [CLI](apps/cli/README.md) |
