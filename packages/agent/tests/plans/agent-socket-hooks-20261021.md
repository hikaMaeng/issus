# Test Plan: agent-socket-hooks

## Created
2026-10-21, issus-1-agent/s4, ASK 6309915639. 소유 packages/agent/** + docs/vendoring.md P2 절. 커밋·push 없음.

## Goal
기존93개 회귀 유지. 앱의 WS lifecycle 주입·종료 기록·실제 send-success/receipt 분리와 subscribed → bootstrap event들 → replay → live 순서를 확인한다. 기존 event wire만 사용한다.

## Environment
Windows PowerShell·UTF-8, 기존 workspace exact 의존성. 실제 loopback WS와 가짜 event store. 실DB 회귀는 ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus, 기존 시험의 UUID 전용 schema/queue 사용·종료 후 정리.

## Preconditions
읽기 장벽·ASK ACK 완료. 신규 bootstrap wire 변경은 orch ASK6310276428 DECISION 이후에만 적용하며 현재 미적용이다. 원 ASK의 generic 기존 event frame[] 반환 경로를 구현한다. 원본 ndx_business·타 담당 경계는 편집하지 않는다.

## Steps
1. npm test -w agent, npm run lint -w agent, npm run build -w agent. sandbox spawn EPERM은 표준 성공으로 처리하지 않는다.
2. 표준 차단 시 tsc emit 뒤 node --test --test-isolation=none으로 전체 시험을 실행한다. worker fixture .mjs3개를 dist 같은 위치로 복사한다.
3. 실제 WS 인증·인가·bootstrap event·replay/live 경계에서 frame 순서와 immutable cursor를 대조한다. canonical 권한은 앱 callback에서 검사한다. bootstrap의 구독 밖 stream sequence는 구독 positions에 합치지 않는다.
4. 실제 send callback 성공만 hook 호출, 실패 write·client receipt·ACK 분리, 지연 hook의 순서·실패1011을 검사한다.
5. 정상/비정상 종료·구독 교체·동일 id 페이지·진행 중 subscribe 종료·shutdown에서 종료 callback 1회와 principal/reason 및 async 완료 대기를 검사한다.
   추가 ASK6310847713의 로컬 revoke 즉시1008·타 연결 격리·unsubscribe1회·동기 초기 revoke/ready 억제·등록/정리 오류 처리를 검사한다. 새 bootstrap wire 요청은 P5 철회에 따라 NOTE6310909946으로 해소했다.
6. 기존 실DB 통합7건과 lint/build/node24 broker bundle, byte manifest·소유 경계·UTF-8 LF·git diff --check를 확인한다.
7. ASK6310979640·DECISION6310757267의 protocol 선택·자동 초기 subscribe를 실제 TCP에서 검사한다. header 없는 앱 protocol 인증·credential 비반사·기존 frame/세션/채널/cursor 인가·mutation 차단을 검증하며 실제 Monitor 깨우기는 orch 배포 수용으로 구분한다.

## Expected Results
기존93개 유지+신규 hook 시험 전부 PASS, 실DB7/7. bootstrap canonical envelope는 app 결과를 보존하며 transport positions를 이동하지 않는다(새 scoped UUID만 발급). metadata/items는 앱의 §5.5 HTTP builder 응답이다. 수신/처리/ACK 상태를 transport가 추측하지 않는다. 앱/P5 조립과 표준 호스트 수용은 별도 보고한다.

## Logs To Capture
.cache/p2-s4/*.log, .cache/requests/issus-1-agent.md, tests/reports/agent-socket-hooks/<timestamp>.md. 명령·stdout/stderr·exit·실제 시험 수와 skip을 보관한다.

## Locator Contract
DOM 없음(N/A). socket frame type·순서·cursor snapshot·hook 인자/호출 집합·종료 code를 사용한다.
