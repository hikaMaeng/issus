# Test Plan: agent-vendoring

## Created
2026-10-21, issus-1-agent/s1. 설계 정본 docs/design.md v2.1 §1.1·§4.1·§5.4.

## Goal
원본 56개 시험을 보존하고 P2 각 패치의 회귀를 검증한다. 실제 DB는 mock/실제 WS 증거와 구분한다.

## Environment
Windows native PowerShell, UTF-8. npm workspace agent, PostgreSQL+PGMQ는 사용자 지정 loopback URL을 ISSUS_TEST_DATABASE_URL로 주입. 비밀번호/토큰 파일은 읽지 않는다.

## Preconditions
P1 슬롯 인계·g1=6308181113. exact dependencies 호스트 설치. Docker는 root compose의 issus-db만 사용한다. schema/queue는 p2 접두사와 UUID로 격리한다.

## Steps
1. 원본 manifest 69파일 byte/hash/HEAD/dirty·라이선스 확인. 제외 파일은 열거나 복사하지 않는다.
2. npm test/lint/build -w agent. spawn EPERM은 원문 로그로 남기고 허용된 tsc emit 후 node --test --test-isolation=none으로 동일 시험을 실행한다.
3. 인증 주입/HTTP 확장 순서/필수 DATABASE_URL·retention null/appendManyOn·sendOn/reader exists/source3개/명시 domain 오류·transient retry/fact emit 금지/중요 알림 overflow 단위 시험.
4. 실제 WS로 401/1008 인가·scope error, replay/live barrier, 기존 token 불변, 256+1 pagination, receipt/revoke, 1013 재생을 확인한다.
5. 실DB로 외부 tx rollback/commit·pg_notify 시점·sequence 재사용·PGMQ 원자성·source3개 두 큐 왕복·커서 scope/TTL·null retention·transient query 후 queue redelivery를 대조한다. 접속 불가면 skip 사유를 보고하고 미검증으로 분류한다.
6. 원본 agent bytes 재검사, export/runtime import·esbuild bundle·문서 링크·UTF-8 LF·소유 범위 검사.

## Expected Results
코드/타입 오류0. 회귀 시험 누락0. 오래된 cursor 재사용 시 중복 허용·누락0. 중요 fact 드롭0, transient terminal 실패0. 원본 수정0. 접근 실패를 PASS로 확대하지 않는다.

## Logs To Capture
.cache/p2/{original-tests,emitted-unit,lint-final,build-final,integration,registry,docker-start}.log 및 .cache/p2/orch-validation/*, source/destination SHA-256, 실제 시험 counts/duration, DB/schema/queue 대조. 비밀 원문은 기록하지 않는다.

## Locator Contract
DOM 없음(N/A). WS는 frame.type/code/cursor/eventId/streamId/sequence를 사용한다. deployed browser는 앱 담당 범위다.
