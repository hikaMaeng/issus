# 시험

wave 3 DECISION 6312691996 및 P5 ASK 6312754765: [계획](../tests/plans/agent-wave3-20261021.md), `tests/reports/agent-wave3/`. parser의 UUID v8 수용/오류 거부, 실제 HTTP worker 초기화·poll·DB·앱 hook·종료, 실제 PGMQ→consumer→event_store→WS 영수와 실제 schema/queue 제거·복구를 검증한다. WS 투영은 bootstrap/replay/live·원본 불변·좌표 보존·실패1011을 확인한다. 앱 도메인 delivery_receipt/worker·scheduler 조립은 P5 소유 시험과 구별한다.

계획: [P2 계획](../tests/plans/agent-vendoring-20261021.md). 결과는 `tests/reports/agent-vendoring/`의 timestamp 기록을 정본으로 삼으며 이 문서에 과거 원본 통과 수를 재사용하지 않는다.

DECISION 6309173472 후속은 [계획](../tests/plans/agent-p2-followup-20261021.md)과 `tests/reports/agent-p2-followup/`을 따른다. env 회귀는 PORT=65536·경계·소수 및 lease≤visibility 거부를 확인한다. 실DB 회귀는 replyChannel 없는 comment fact→reaction queue→worker→result를 실행하고 저장 audience=worker·큐 삭제·client high-water/replay 제외를 확인한다. result까지 bounds를 강제로 넓힌 replay와 뒤의 client fact 재생도 대조한다.

DECISION 6309746634 (2)의 readiness는 [계획](../tests/plans/agent-readiness-20261021.md)과 `tests/reports/agent-readiness/`를 따른다. `http/app.test.ts`는 실제 loopback HTTP로 hook 생략·성공200, 동기 throw·Promise 거부503, queue/DB 실패503, 지연 완료 전 무응답·요청마다 재실행을 확인한다. queue/database는 가짜이며 실제 앱 조립·migration 준비 검증은 P1/P4 통합 증거가 필요하다.

ASK 6309915639 lifecycle은 [계획](../tests/plans/agent-socket-hooks-20261021.md)과 `tests/reports/agent-socket-hooks/`를 따른다. 실제 loopback WS에서 기존 event wire의 구독 밖 canonical bootstrap → replay → live·bootstrap cursor 불변·인가 거부·worker/malformed 거부·snapshot/send 실패, send callback 성공/실패·client receipt 분리·비동기 hook 순서·종료/구독 교체/동일 id 페이지·진행 중 구독 종료·shutdown 기록 대기·callback 예외를 확인한다. replay 완료 frame이 buffered live보다 앞선다. 앱 canonical 권한·metadata/items builder·영속 fact/receipt 의미는 P5 통합 시험에서 검사한다.

추가 ASK6310847713은 로컬 revoke 신호 즉시1008·타 연결 격리·unsubscribe 1회·등록 중 동기 revoke/ready 억제·등록/정리 예외에도 종료 callback 보존을 확인한다. RuntimeAuth 다중 broker 실기 결합은 P5 조립 증거다.

ASK6310979640·DECISION6310757267의 Monitor 훅은 실제 TCP에서 header 없는 앱 protocol 인증→공개 protocol 선택→ready→자동 subscribe→replay, 기본/false/예외/미제공 선택의 credential 비반사, 초기 frame·채널·cursor scope 거부·인증 실패 시 callback0·mutation 차단을 확인한다. 실제 Claude Code Monitor 깨우기는 배포 뒤 오케스트레이터 수용 대상이다.

| 검증 | 명령/조건 |
| --- | --- |
| 표준 단위·실제 TCP WS | `npm test -w agent` |
| 타입 | `npm run lint -w agent` |
| dist | `npm run build -w agent` |
| PostgreSQL/PGMQ | `ISSUS_TEST_DATABASE_URL` 지정 후 `npm run test:integration -w agent` |
| 샌드박스 JS emit | build 후 `node --test --test-isolation=none`으로 dist의 전체 test 파일 실행; worker fixture .mjs도 같은 상대 위치에 복사 |

실DB URL은 사용자가 지정한 loopback 주소를 환경으로 전달한다. `p2_agent_UUID` schema와 `p2_UUID_lane` queue만 사용하고 해당 자원을 정리한다. 외부 tx rollback/commit/notify/sequence, sendOn, source3개 두 큐 왕복, immutable/범위/TTL, retention null, 실제 transient query 재시도를 대조한다. DB 접근 실패는 이유를 표시한 skip이며 **미검증**이다.

WS 시험은 실제 loopback socket과 가짜 event store를 사용하므로 DB/배포 증거와 구별한다. 구독 인가 거부·scope error/1008·257건 페이지·replay/live barrier·receipt·revoke·1013 회복을 검증한다. 원본 시험 중 fresh schema·무한 transient 재시도·subscriptionId 추가의 세 기대값만 새 설계에 맞춘다.

패키지는 DOM을 만들지 않으므로 browser locator는 N/A다. 앱의 semantic DOM/헤드리스 시험을 이 패키지 시험으로 대체하지 않는다.
