# Test Plan: wave3 assembly

## Created
2026-10-21, issus-1-base/s4. DECISION6311899437, HEAD b319161.

## Goal
P5/P6/P7/core/agent의 공개 API를 실제 broker·worker·scheduler·CLI 엔트리로 연결한다. 기능 폴더는 편집하지 않는다.

## Environment
Windows native PowerShell/Node, npm workspace, PG/PGMQ `postgresql://issus@127.0.0.1:15440/issus`. 전용 schema·queue prefix와 임시 포트만 사용하고 종료 후 정리한다. bootstrap credential은 메모리에서 생성해 hash만 주입하며 파일·로그에 저장하지 않는다.

## Preconditions
호스트 설치된 exact 의존성. DB는 상시 기동 상태를 사용한다. npm install·Vite·Docker는 호스트 담당이다.

## Steps
1. 모든 workspace lint(`tsc --noEmit`), agent/domain/runtime build 후 4 app의 esbuild bundle과 CLI help를 검사한다.
2. 표준 workspace npm test 실행. spawn EPERM이면 실패 로그를 보존하고 tsc 임시 emit+node test isolation none으로 실행 가능한 시험을 보조 검증한다.
3. 실제 createBroker·createIssusWorker·createIssusScheduler를 기동한다. health/ready200, 인증 없는 inbox401, 공개 validate422, 실제 repo/alias/session/issue 생성·인증 inbox200을 확인한다.
4. subscription을 만들고 bearer WS와 Monitor subprotocol WS의 subscribe/bootstrap/receipt/disconnect 및 SSE 연결·정리를 확인한다. ASK→inbox→receipt→ACK, compact status/prepare·worker 반응·tick을 확인한다.
5. 전용 schema의 migration 기록을 잠시 제거하고 ready503을 검사한 뒤 finally에서 복구한다. worker 훅 미구현이면 실패 근거와 소유자 ASK를 기록한다.
6. 서비스 역순 종료·전용 schema/queue 잔류0·git diff check·변경 파일 UTF-8/no BOM/LF를 확인한다.

## Expected Results
정상 health/ready200, 권한/receipt 구분 유지, WS protocol credential 비반환, 세션 revoke1008, 불완전 migration ready503. 관측 실패는 감추거나 skip하지 않는다. Docker·브라우저·Monitor 실제 세션 깨우기·CLI Windows ACL은 호스트 수용 대상이다.

## Logs To Capture
`.cache/base-s4/` 명령별 stdout/stderr·exit와 summary JSON, integration 로그. test report는 `tests/reports/wave3-assembly/`에 둔다.

## Locator Contract
HTTP/WS/SSE/DB 검증. DOM 조작 없음. P8 deployed headless 검증은 main 랜드마크와 이름 있는 컨트롤을 사용한다.
