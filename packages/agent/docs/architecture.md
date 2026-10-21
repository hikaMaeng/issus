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

`createWorkerServer`는 HTTP listener를 먼저 열고 agent schema/큐→앱 initialize→consumer를 시작한다. 큐별 실제 poll 상태와 DB/앱 ready hook을 결합해 `/ready`를 판정하며 shutdown drain 동안503을 유지한다. WS `projectEvent`는 저장 fact와 독립인 payload 투영이고 bootstrap/replay/live 모두 같은 경로를 거친다.

WS는 이전 hub 구독 해제 → 채널/앱 인가·bootstrap 배열 생성 → hub buffer 설치 → tail seed 완료 → 고정 high-water → subscribed → bootstrap event들 → bounded replay → replay 완료 frame → high-water 초과 buffer drain → live 순서다. 새 채널 seed와 replay 경계를 `hub.prepareChannels()`로 조정한다. 각 연결의 send-success를 await하고, 종료 hook은 해당 연결의 진행 작업 뒤 실행한다. 앱 저장소로의 lifecycle 연결은 `GatewaySocketHooks` 하나를 policy/service가 공유한다.
