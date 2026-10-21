# Test Plan: agent-readiness

## Created
2026-10-21, issus-1-agent/s3. ASK 6309535584, DECISION 6309746634 (2).

## Goal
EventBrokerOptions.ready를 /ready에 연결한다. queue.check·checkDatabase·앱 hook을 모두 await하고, hook 생략은 기존 동작을 유지한다. brief 요구5·6, design §1.2·§9·§14의 P2 운영 경계만 검증한다.

## Environment
Windows native PowerShell·UTF-8, 기존 npm workspace agent 의존성. HTTP 시험은 실제 loopback TCP와 가짜 queue/database를 사용한다. 실DB·Docker 배포 증거와 구별한다.

## Preconditions
g1=6308181113. 읽기 장벽·ACK 후 packages/agent/**와 docs/vendoring.md P2 절만 변경한다. 설치·커밋·push 없음.

## Steps
1. /ready에 hook 없음·성공이면 200, Promise 거부·동기 throw면 503 및 일반 오류 body를 확인한다.
2. hook 성공에도 queue 또는 database 실패는 503인지 대조한다. 기존 /health 200을 확인한다.
3. 지연 hook이 완료되기 전 응답하지 않고, 다음 요청에서도 hook을 다시 호출하는지 확인한다.
4. npm test/lint/build -w agent를 실행한다. 표준 runner가 spawn EPERM이면 로그에 남기고 build 산출물 전체를 node --test --test-isolation=none으로 실행한다. worker fixture는 동일 상대 경로로 복사한다.
5. vendoring manifest의 목적 hash와 P2 표를 갱신하고 문서 링크·UTF-8(no BOM)/LF·소유 범위를 검사한다. 제출 전 읽기 장벽을 다시 수행한다.

## Expected Results
readiness HTTP 회귀 7건과 기존 HTTP 시험 통과. 타입·build exit0, 전체 시험 fail0/skip0. 표준 runner 실패는 기능 PASS와 분리해 보고한다.

## Logs To Capture
.cache/p2-s3/{agent-test,agent-lint,agent-build,http-test-emitted,agent-test-emitted,validation}.log 및 필요 시 orch-validation/.

## Locator Contract
DOM 없음(N/A). HTTP status·JSON body·검사 호출·지연 Promise 완료 순서로 검증한다.
