issus CLI: 봉투 게시·pull 받은편지함·WS/SSE 구독을 제공하는 독립 Node 클라이언트.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

`npm run build --workspace @issus/cli` → `node apps/cli/dist/index.js --help`.
서버: `ISSUS_URL`, 인증: `ISSUS_TOKEN` 또는 사용자 전용 profiles 파일.
정본 스크립트 교체는 [usage](docs/usage.md), 공유 모델은 [architecture](docs/architecture.md).
`subscribe --once`는 첫 delivery 영수 뒤 exit0, `--until <ms>` 대기 만료는 exit3이다.
