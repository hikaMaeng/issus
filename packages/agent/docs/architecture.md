# 구조

| 폴더 | 소유 계약 |
| --- | --- |
| `src/common/protocol` | 이벤트·채널·결과·metrics wire 타입/파서 |
| `src/server/id` | 결정적 이벤트 UUID |
| `src/front/client` | HttpOnly cookie WS 연결·마지막 수신 커서 재접속 |
| `src/broker/auth`, `policy` | 주입된 principal/세션 검증과 채널 인가 |
| `src/broker/http`, `transport` | HTTP 확장 우선 등록, WS 프레임/인가/재생 |
| `src/broker/event-store` | append-only 로그·stream sequence·UUID snapshot cursor |
| `src/broker/pgmq`, `idempotency` | tx 참여 send·실행 claim/fence/result |
| `src/broker/loops` | log tail·페이지별 reaction enqueue·worker consumer |
| `src/broker/stream` | 로컬 hub·mailbox·replay/live buffer |
| `src/broker/service`, `worker` | 실행 배선·inline/thread handler |

`appendManyOn`과 `sendOn`은 앱이 소유한 동일 `PoolClient` tx에 참여한다. `appendMany`는 자체 tx wrapper다. 이벤트의 stream sequence와 pg_notify는 append tx에 들어간다. broker는 수신자의 처리 cursor를 소유하지 않는다.

`createEventBroker`는 `options.ready`를 HTTP backend에 전달한다. 기본 `/ready`는 `extendHttp`보다 먼저 등록되며 queue·DB·앱 hook 성공을 모두 요구한다. 도메인 migration/초기화 판정은 앱의 hook이 소유한다.

WS는 hub buffer 설치 → tail seed 완료 → 고정 high-water → bounded replay → high-water 초과 buffer drain → live 순서다. 새 채널 seed와 replay 경계를 `hub.prepareChannels()`로 조정한다.
