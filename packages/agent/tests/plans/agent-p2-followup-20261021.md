# Test Plan: agent-p2-followup

## Created
2026-10-21, issus-1-agent/s2. DECISION 6309173472 (1), VERIFY 6309173060.

## Goal
설계 §4.3 반응 result=W 및 §9.1 PORT·lease 제약을 회귀로 고정한다. brief 요구2·5·6, §14의 저장·전송·운영 검증 중 P2 범위만 다룬다.

## Environment
Windows native PowerShell, Node, npm workspace agent. 실제 PostgreSQL+PGMQ는 ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus. 전용 p2_agent_UUID schema·p2_UUID_lane queue만 사용하고 정리한다.

## Preconditions
g1=6308181113, s2 ACK와 CLAIM. 기존 의존성 설치 완료. packages/agent/**·vendoring P2 절만 수정. 실제 비밀 파일을 읽지 않는다.

## Steps
1. 수정 전 env·draft 회귀를 JS emit으로 실행해 실패를 기록한다. 실DB에서 댓글 fact(replyChannel 없음)를 반응 큐에 넣고 실제 worker가 저장한 terminal audience를 확인한다.
2. result audience 상속 및 기동 검증을 수정한다. PORT=65536·9999·60000·소수·NaN·0 거부, 10000·59999 허용. visibility60일 때 lease1·59·60 거부, 61 허용 및 생략 기본값 대조.
3. 실DB 소비 입력의 command/worker/source, 성공 result의 worker audience, 원 큐 삭제를 대조한다. client high-water와 채널별 high-water에는 원 fact만 남는다. terminal까지 넓힌 replay에도 worker command/result가 없고 뒤의 정상 client fact는 보인다.
4. npm test/lint/build -w agent 및 npm run test:integration -w agent. spawn EPERM은 별도 로그로 남기고 허용된 tsc emit+node --test --test-isolation=none으로 전체 시험을 실행한다. 호스트 정규 runner 검증은 별도 요청한다.
5. destination SHA-256·문서 링크·UTF-8(no BOM)/LF·소유 범위를 검사한다. 커밋·push하지 않는다.

## Expected Results
수정 전 회귀 실패, 수정 후 env·draft·실DB 회귀 통과. client 조회 worker result0, 정상 client fact 누락0. lint/build exit0, 전체 emit 시험 fail0/skip0. 표준 runner 차단과 기능 검증을 구별한다.

## Logs To Capture
.cache/p2-s2/{red-unit,red-integration,agent-lint,agent-build,agent-test,agent-test-emitted,agent-integration,agent-integration-emitted}.log, orch-validation/, 실제 schema/queue 정리·destination hash 검사 로그.

## Locator Contract
DOM 없음(N/A). DB audience/channel/sequence, worker event/sourceEventId, eventId 배열을 대조한다.
