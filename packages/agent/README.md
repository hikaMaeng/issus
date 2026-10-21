issus의 PGMQ 명령 큐·불변 이벤트 로그·커서 재생·워커 실행을 제공하는 `agent@0.1.0-issus.1`.

| 목적 | 문서 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| 구조 | [architecture](docs/architecture.md) |
| 공개 API | [api](docs/api.md) |
| 사용 | [usage](docs/usage.md) |
| 제약 | [constraints](docs/constraints.md) |
| 내부 계약 | [internals](docs/internals.md) |
| 시험 | [testing](docs/testing.md) |

공개 경계: `agent/common`, `agent/server`, `agent/front`, `agent/broker`, `agent/broker/worker`. 배포 산출물은 `dist/`다. 인증·도메인 UoW·구독 등록·receipt 해석은 앱이 주입한다. 출처와 패치 증거는 [vendoring](../../docs/vendoring.md)의 P2 절 및 [파일 manifest](docs/vendoring-files.json).

반응 terminal result는 `worker` audience를 유지한다. 기동 시 `PORT` 정수 범위 10000–59999와 execution lease > queue visibility를 검사한다. [후속 시험 계획](tests/plans/agent-p2-followup-20261021.md).

`createEventBroker({ready})`의 선택 hook은 `/ready`에서 queue·DB와 함께 await한다. throw/거부는 503, 전부 성공은 200이다. [readiness 계약](docs/api.md)·[시험 계획](tests/plans/agent-readiness-20261021.md).

`createWorkerServer({initialize,ready})`는 초기화 및 모든 소비 큐 poll 성공 전503, 앱 schema·DB·큐 실패/종료 중503이다. WS 영수는 서버 UUID v8을 수용하며 `projectEvent`로 저장 fact를 바꾸지 않고 payload를 투영한다. [wave 3 계획](tests/plans/agent-wave3-20261021.md)·[API](docs/api.md).

WS 앱 lifecycle은 `agent/broker`의 `GatewaySocketHooks`로 주입한다. 송신 성공·client receipt·TYPE:ACK를 분리하며, 종료/구독 교체를 앱의 영속 fact로 기록할 수 있다. [API](docs/api.md)·[훅 시험 계획](tests/plans/agent-socket-hooks-20261021.md).
