# Test Plan: P8 headless UI and actual-entry acceptance

## Created
2026-10-21, issus-1-web/s1. s2 후속 기준: DECISION6313571462·brief1–6·design v2.3 §7.3/§10/§14, DUE20:51+09:00. base/s4 조립 하네스를 정식 시험으로 승격한다. 최초 작성일은 유지한다.

## Goal
P7 client/model을 재사용한 React UI, 실제2세션 전체 흐름, CLI dry-run, deployed browser semantic 계약, 운영 문서·수용 대조를 검증한다. 단위/SSR·네트워크·배포 DOM·실제 세션 깨우기 증거를 구분한다.

## Environment
Windows native PowerShell UTF-8·Node26 호스트/target node24, npm workspace. Postgres18+PGMQ는 `postgresql://issus@127.0.0.1:15440/issus`. 제품 schema/public queue를 사용하지 않고 issus_test_p8_<suffix>·issus_test_p8_b_<suffix>·p8_<suffix>_를 할당한다. 댓글/이벤트는 자동삭제하지 않는다.

## Preconditions
- 앱/라이브러리 build된 dist와 DB 접근. DB 없으면 fail, skip 금지. 서버·CLI·packages·deliveries 전용 시험 수정 금지.
- `npm run deploy` 산출물의 별도 disposable 배포 instance, 환경 ISSUS_TEST_SERVER_URL·ISSUS_TEST_DATABASE_URL·ISSUS_TEST_SCHEMA·ISSUS_TEST_BROKER_SCHEMA·ISSUS_TEST_BOOTSTRAP_TOKEN·ISSUS_TEST_OWNER. schema regex는 issus_test_p8_*만 허용하며 API repo와 DB schema 연결을 대조한다. bootstrap은 메모리/환경으로만 제공하고 파일을 읽지 않는다.
- Playwright1.59.1·Chromium은 오케스트레이터 호스트에 준비됨(DECISION6313571462). 외부 설치 위치는 HEADLESS_BROWSER_PLAYWRIGHT_ROOT 프로젝트에서 resolve한다. 브라우저는 Vite/local mock으로 대체하지 않는다.
- 루트 Turbo가 위 fixture 환경4개와 HEADLESS_BROWSER_PLAYWRIGHT_ROOT를 test:browser에 전달한다(ASK6313783055→orch ACK6313880663, 171d50c). 테스트 코드는 누락을 추론하거나 제품 schema로 대체하지 않는다. 전달 설정만으로 격리 인스턴스/환경값이 자동 생성되지는 않는다.

## Steps
| ID | 재현 명령·입력 | 기대 |
| --- | --- | --- |
| T-01 | `npm run lint -w issus` |tsc noEmit exit0 |
| T-02 | `$env:ISSUS_TEST_DATABASE_URL='postgresql://issus@127.0.0.1:15440/issus'; npm test -w issus` | 앱의 node:test 전체, 실패/skip 수 기록 |
| T-03 | `node --test --test-isolation=none apps/issus/tests/integration/acceptance.test.mjs` | 실제 createBroker/createIssusWorker/createIssusScheduler, I-01~07 전체 흐름, 최소83검사·completed=true·limitations=[]·finally schema/queue 잔류0. WS 영수 오류/HTTP 대체0, websocket 영속 영수1행·delivered; 세 앱 migration 누락503·복구200 필수 |
| T-04 | T-03 안 실제 CLI post --dry-run, token 환경·별도 config dir |exit0·dry-run not posted·댓글수 불변 |
| T-05 | P4 src/server/http/auth/fixtures.test.ts + core.test.ts 재사용 | good댓글28=201·body4 PATCH200·raw bytes 유지, bad5=422·golden reason 순서·게시0 |
| T-06 | 최종 deploy 뒤 호스트 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18140 npm run test:browser` |B-01-1~4/B-02-1~3/B-03-1~5 **12/12 PASS, fail0·skip0·cancelled0, pageerror0**. WS 오류시도5·연결오류alert1, 정상재연결≥2세대·구독id교체·단절중게시누락0·중복행0 |
| T-07 | O-01: 배포·반복deploy·포트/타project 충돌·실제 SIGTERM·복구 |호스트 logs/health/WS1001/30초/pool 종료, 외부자원 변경0. T-03 service.stop은 부분집합 |
| T-08 | `git diff --check`, UTF-8(no BOM)/LF·문서 link·selector 정적 검사 |소유 파일 오류0·커밋/push0 |

sandbox EPERM이면 T-02를 표준 통과로 표시하지 않는다. `python apps/issus/tests/integration/tools/validate.py checks`→`... emit`→`... integration`으로 명령·exit·시각·실제 stdout을 .cache/p8에 저장한다. emit은 CLI/app의 임시 JS와 test loader만 만든다. 실제 CLI child process spawn이 막히면 ISSUS_TEST_CLI_RUN_MODULE로 같은 CLI parser/run()·실제 서버 HTTP를 교차하고 독립 프로세스 미검증을 적는다.

소스와 병행 dist가 다르면 `... source`→`... source-integration`으로 공개 workspace export를 하나의 .cache/p8/emit snapshot에 연결한다. 서버 factory·PG/PGMQ·HTTP·WS는 그대로이며 mock·수동 queue drain은 없다. 이를 배포 dist PASS로 표시하지 않는다.

호스트의 별도 배포 시험 instance는 `npm run deploy` 뒤 `$env:ISSUS_TEST_SERVER_URL='http://127.0.0.1:18141'`·DB URL을 지정해 `node apps/issus/tests/integration/deployed-browser-host.mjs`로 기동할 수 있다. 기존 production assets/hash를 확인하고 schema/queue·메모리 bootstrap을 만들어 별도 browser test 프로세스에 전달하며 finally에서 자체 인스턴스·schema·queue를 정리한다.18141/18142/18143 충돌 시 실패하고 다른 포트로 몰래 대체하지 않는다.

최종 수용 명령은 오케스트레이터가 준비한 **18140 격리 배포 대상**에서 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18140 npm run test:browser`다. PowerShell에서는 `$env:ISSUS_TEST_SERVER_URL='http://127.0.0.1:18140'; npm run test:browser`와 같다. root npm 명령의 build 의존성은 호스트가 처리한다. 전체 integration 기대값은 issus54/54(전달53+P8 1), limitations0; browser는 위12개 전건이며 Monitor 실기는 별도 호스트 증거다.

| B-03 추가 ID | 조작 | 필수 판정 |
| --- | --- | --- |
| B-03-3 | 실제 목록 GET을 gate로 지연 후 continue | status 불러오는 중1·aria-busy=true, 대기중 table0 → 응답후 table1·loading0 |
| B-03-4 | 독립 browser context에서 WS 연결을1013으로 계속 끊음 | 최초+4재접속=5시도, 실시간 연결 오류 alert1·거짓 connected status0, inbox snapshot은 표시 |
| B-03-5 | 실제 WS proxy 연결→1013단절, 새 구독 POST gate중 서버에 NOTE 게시→gate해제; 실제 event 프레임1회 중복 전달 | 재연결 대기 status→연결됨, 새 subscriptionId, 단절중 delivery 재생/영수·delivered 표시, 전체 inbox row identity 중복0·기존ASK1행·새delivery1행 |

gate/1013/실제 프레임 중복은 브라우저 전송 경계의 장애 주입이다. API 성공 응답·프레임 payload는 배포 서버가 생성하며 대체 서버/합성 성공 payload를 사용하지 않는다.

실DB 순서: A/B등록→양쪽WS구독→ASK 동일id/receipt→B ACK→REPORT apply→B단절/HOLD/test Clock+61초→attempt1·즉시escalation·원id재생→ACK만으로HOLD유지→DECISION해제/ACK→OWNER compact-due→packet/COMPACT→close409·before-close due보존→terminal body/최종 REPORT·COMPACT→close200·새댓글409→revoke1008·WS1001 종료→잔류0. 제품 HOLD≤10분 규칙은 바꾸지 않는다.

## Expected Results
UI landmark·dl·강한 마커·NOENV·since-compact·ACK preview·422원문·close blocker·loading·WS 오류/재연결/중복행0이 정확해야 한다. 실패 후 판정선을 낮추지 않는다. WS receipt 오류나 readiness503 실패는 즉시 FAIL이며 HTTP 영수 fallback/limitations 진단만으로 PASS할 수 없다. 반환 completed=true·limitations=[]도 별도로 assert한다. source/local PASS와 배포 호스트 PASS는 분리한다.

## Logs To Capture
.cache/p8/{commands.json,lint.log,npm-test.log,emit.log,emitted-app.log,integration.log,integration-results.json,cli-dry-run.log,static-check.json}. browser/*.png·observed.json(recovery의 연결수/구독id/누락id/중복행수)은 배포된 대상에서만 생성한다. 호스트는 실행 명령·12/12·환경·대상hash와 로그 경로를 tests/reports에 남긴다. 토큰·Authorization·실제 secret 파일·인증 trace는 기록하지 않는다. 실패 로그도 previous-stamp로 보존한다.

## Locator Contract
role(main/navigation/region/table/row/article/form/dialog/status/alert/heading/term/button)·label·testid만. testids: issue-row/comment/compact-marker/delivery. nav 주 탐색, table 이슈 목록, region 이슈 현재 상태/받은편지함, ol 댓글, form 댓글 작성, textarea 댓글 본문, button 검사/게시, dialog 수신 확인 미리보기/이슈 닫기 확인. 중복 control은 row/article/form/dialog로 scope하며 CSS/XPath/nth/first/last 금지다. dl·h2 tag 검사는 role/testid로 찾은 요소의 DOM assertion으로만 한다.
