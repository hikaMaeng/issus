# 시험

계획: [P2 계획](../tests/plans/agent-vendoring-20261021.md). 결과는 `tests/reports/agent-vendoring/`의 timestamp 기록을 정본으로 삼으며 이 문서에 과거 원본 통과 수를 재사용하지 않는다.

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
