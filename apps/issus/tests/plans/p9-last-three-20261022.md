# Test Plan: P9 마지막3건

## Created
2026-10-22, issus-1-ui/s7(s6 승계), ASK6320125702, 기준41d07c6. 착수00:46+09:00·상한02:16+09:00. docs/ui.md §5·§11 판정 유지.

## Goal
final8의 P9-16 FAIL·P9-20 FAIL·P9-21 cancelled를 로그·실행 자산·소스로 대조한다. front/browser 소유 결함만 수정하고 서버/P7 결함은 알려진 실패로 남긴다. 전체47개 이름·순서, P8 12개, skip0 유지.

## Environment
Windows PowerShell UTF-8·Node, Postgres15440. source emit·esbuild는 .cache/p9-ui-s7만 사용한다. 샌드박스 Vite/Playwright·deploy는 실행하지 않는다. HTTP/SSE probe는 final8과 해시가 같은 dist·전용 schema/queue·임의 loopback 포트이며 브라우저 증거가 아니다.

## Preconditions
읽기 장벽 since-compact와 full peek를 함께 확인하고 PENDING-ACK 처리. 편집 CLAIM6320176277·시험 CLAIM6320362844. 다른 schema/queue·서버/P7/dist/root 변경 금지. 판정 결과로 시험을 skip하거나 timeout을 늘리지 않는다.

## Steps
1. final8/orch-validation/p9-host.log:149–179의 단언/locator를 고정한다. build.log·host results.json의 자산5개 해시·git41d07c6와 대조한다. p9-fail-summary.txt의 반복 문맥은 단언 근거로 쓰지 않는다.
2. P9-16: CLAIM DUE/SEEN 정상·누락422, DUE 경과 미해제, 본인 RELEASE·타인422를 유지한다. close409 blocker 링크 뒤 status GET·compact_segment·due fact를 각각 기록한다. 최종 REPORT/terminal body/COMPACT→close200·closed댓글409를 끝까지 실행한 뒤 원래 GET before-close 단언도 실행한다.
3. P9-20: 실제 WS 상세·본문/STATE·새 COMPACT·초안/포커스 보존과 각 target WS 프레임을 확인한다. 같은 시험 cookie만 복사한 별도 context에서 CSRF 없는 연결 오류→동일 principal 명시 교환200→WS 재개·inbox 1행/실제 frame을 검사한다. 원 상세의 cookie/CSRF 쌍을 바꾸지 않으며 초안/포커스를 다시 검사한다. 목록의 새 이슈5.5초 이내 발견을 유지한다.
4. P9-21: 별도 context·별칭으로 실제 SSE를 연다. 첫 target은 실제 pull을 보류한 동안 frame/event/id와 HTTP receipt transport=sse를 확인한다. 초기 replay 및 프레임별 영수 응답/DB 완료 뒤 실제 streaming fetch만 abort한다. P7의 새 subscription·실제 프레임에서 받은 cursor·두 번째 target frame/id/영수·WS0·ACKwaiting·중복0을 검사한다. payload/성공 응답 대체0. t.diagnostic와 sse-case.json을 정리 전에 저장한다.
5. 별도 HTTP/SSE probe에서 영수 처리 중 단절과 처리 완료 뒤 단절을 구분한다. 처리 중 단절403을 지우거나 위의 안정 시점 시험 성공으로 해소했다고 판정하지 않는다.
6. npm test/lint, 임시 emit source 앱 전수/SSR, front esbuild, browser mjs node--check·P8 bytes/47개 이름·UTF8 LF·소유 경계·DB 전후 잔류를 확인한다.

## Expected Results
lint/source/esbuild/정적 검사 PASS. 표준 npm test의 spawn EPERM은 별도 실행 제약이다. 배포 DOM은 호스트 전건 재실행 전까지 미검증이다. 알려진 실패가 남으면 전체 수용 PASS/47/47을 주장하지 않는다.

## 알려진 실패
| 대상 | 확정 사실·남은 판정 |
| --- | --- |
| P9-16 상태 조회 | close409 뒤 DB due_reasons/fact의 before-close는 보존되나 GET compact/status는 due:false/reasons:[]다. 서버 readCompactStatus가 routine 통계만 계산한다. 원 GET 단언은 유지하므로 현 서버에서는 FAIL 예상. CLAIM/RELEASE 저장 실패로 부르지 않는다. |
| SSE 영수 처리 중 단절 | 실제 frame/id·첫 sse 영수 후, 아직 처리할 frame이 있을 때 연결을 끊으면 receipts403 SUBSCRIPTION_FORBIDDEN→P7의4xx fatal→새 구독0을2회 관측했다. 서버는 닫힌 subscription의 영수를 거부하고 P7은 재연결 전에 종료한다. 서버/P7 수정 금지 범위라 알려진 실패로 보존한다. |
| P9-21 원 cancelled | final8은120초 test timeout만 남겼고 개별 await/locator는 없다. 위의 HTTP 재현이 원 cancelled와 동일 원인이라는 것은 미확정이다. 초기 replay 처리 완료 후 단절 시험과 처리 중 단절 실패를 구분하며 후자의 수용을 면제하지 않는다. |

## Logs To Capture
.cache/p9-ui-s7/{commands.jsonl,failure-evidence.json,source-app.log,front-tests.log,protocol-probe-debug.log,sse-inflight-failure.json,protocol-probe-drained.log,protocol-db-drain.json,static-check.json,db-after.json}. 호스트는 claim-close-case.json·sse-case.json/PNG·observed.json·p9-ui/host-*/results.json을 보존한다. bearer/cookie/CSRF/packetToken은 기록하지 않는다.

## Locator Contract
role/aria-label/data-testid는 docs/ui.md §5 그대로. status/alert `실시간 연결`·form `세션 연결`·입력 `세션 토큰`·dialog `이슈 닫기 확인`·region `서버 닫기 차단 항목`·link `참조 댓글 <id>`·article `전달 <id>`. CSS/XPath/nth 추가0. 새 탭 오류를 먼저 기다리는 것은 실제 구독 실패가 난 조건에서 복구를 검증하기 위한 사전 조건이다.

## Host
```powershell
$env:ISSUS_TEST_DATABASE_URL='postgresql://issus@127.0.0.1:15440/issus'
npm run lint -w issus
npm test -w issus
npm run deploy
$env:ISSUS_TEST_SERVER_URL='http://127.0.0.1:18145'
node apps/issus/tests/browser/p9-host.mjs --standard
```
18145–18147 빈3포트 전제. 47건·skip0/cancelled0을 확인하되 P9-16 GET은 현 서버에서 알려진 FAIL 예상이다. 다른 실패를 이 실패에 합치지 않는다. 서버/P7 계약 수정·수용 판정은 오케스트레이터 담당이다.
