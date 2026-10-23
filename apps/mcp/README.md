issus alias inbox를 Windows 호스트의 stdio MCP로 노출한다.

| 목적 | 파일 |
| --- | --- |
| 개요 | [docs/overview.md](docs/overview.md) |
| 구조 | [docs/architecture.md](docs/architecture.md) |
| API | [docs/api.md](docs/api.md) |
| 사용 | [docs/usage.md](docs/usage.md) |
| 제약 | [docs/constraints.md](docs/constraints.md) |
| 내부 상태 | [docs/internals.md](docs/internals.md) |
| 시험 | [docs/testing.md](docs/testing.md) |

정본: [bridge.md v1.1](../../docs/bridge.md). 실행: `node apps/mcp/dist/index.js`.
호스트 프로세스이며 compose 서비스·HTTP listener·새 도메인 endpoint를 추가하지 않는다.
workspace·lock 설치는 저장소 오케스트레이터가 통합한다.
