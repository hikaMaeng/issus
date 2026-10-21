# 시험

고정 판정은 [design §10](design.md#10-시험-계획과-증거), [brief 요구6](brief.md), [수용 대조](acceptance.md)다. P8 [계획](../apps/issus/tests/plans/p8-acceptance-20261021.md)·[보고서](../apps/issus/tests/reports/p8-acceptance/20261021_190000.md)에 명령·시각·수치·미실행을 기록한다.

```powershell
$env:ISSUS_TEST_DATABASE_URL='postgresql://issus@127.0.0.1:15440/issus'
npm run lint -w issus
npm test -w issus
node --test --test-isolation=none apps/issus/tests/integration/acceptance.test.mjs
```

P8 acceptance는 base/s4 48개 조립 검사를 승격한 실제 broker/worker/scheduler entry+Postgres/PGMQ 시험이다. issus_test_p8_* domain/broker schema·p8_* queue를 생성하고 finally에서 지운다. 실제2세션 WS→ASK→receipt→ACK→REPORT/apply→HOLD 단절/시계전진/재전달/에스컬레이션/재생→DECISION 해제→compact-due/게시→close 차단·최종 close를 통과해야 한다. 실제 CLI post --dry-run은 게시0을 교차 검사한다. DB가 없으면 fail이며 skip으로 통과시키지 않는다.

good32 HTTP는 P4 [fixtures.test](../apps/issus/src/server/http/auth/fixtures.test.ts), bad5 원문 reason은 P4 [core.test](../apps/issus/src/server/http/auth/core.test.ts)를 재사용한다. 댓글28 완료201·본문4 PATCH200이며 원문 바이트를 바꾸지 않는다. P5 deliveries 전용 시험은 [전달 계획](../apps/issus/tests/plans/deliveries-20261021.md)의 소유다.

브라우저는 **배포된 서버**만 대상으로 한다. Vite/dev/mock server를 대체 증거로 쓰지 않는다. 별도 disposable 배포 instance가 ISSUS_TEST_SCHEMA=issus_test_p8_<run>·ISSUS_TEST_BROKER_SCHEMA=issus_test_p8_b_<run>와 전용 queue를 사용해야 한다. ephemeral bootstrap은 ISSUS_TEST_BOOTSTRAP_TOKEN, owner는 ISSUS_TEST_OWNER로만 제공한다. 시험은 API 생성 repo가 그 DB schema에 있는지 확인한 뒤 NOENV read fixture를 넣는다. 토큰 파일을 읽거나 bearer를 결과 파일에 저장하지 않는다.

```powershell
# 먼저 호스트에서 npm run deploy. URL은 같은 배포 산출물의 격리 시험 인스턴스다.
$env:ISSUS_TEST_SERVER_URL='http://127.0.0.1:18140'
# ISSUS_TEST_SCHEMA / ISSUS_TEST_BROKER_SCHEMA / ISSUS_TEST_BOOTSTRAP_TOKEN / ISSUS_TEST_OWNER는 인스턴스 제공자가 설정한다.
npx playwright install chromium
node --test --test-isolation=none apps/issus/tests/browser/ui.test.mjs
```

9개 시나리오는 목록·봉투dl·NOENV·COMPACT 경계/토글·ASK→ACK→applied·422원문/게시0·유효ASK 게시/reload·빈목록·닫기 blocker다. role/label/testid strict locator만 사용하며 screenshot과 HTTP path/status·pageerror를 .cache/p8/browser/에 기록한다. 인증 데이터는 trace/로그에 남기지 않는다. 종료 후 세션 revoke, 인스턴스 운영자가 정지 뒤 테스트 schema/queue를 제거한다. 제품 기본 issus schema는 fixture 대상이 아니다.

격리 instance를 수동 조립하지 않으려면 배포 후 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18141`과 DB URL만 지정해 `node apps/issus/tests/integration/deployed-browser-host.mjs`를 실행한다. 이 호스트 전용 도구는 기존 production dist·front assets를 그대로 사용하고 임시 schema/queue·메모리 bootstrap을 준비한다. 지정 포트와 다음2포트가 비어 있어야 하며 충돌 시 실패한다. 브라우저는 별도 프로세스에서 지정 URL만 호출한다. finally에서 자체 서비스 정지·schema/queue 잔류0을 검사하고 .cache/p8/browser-host-results.json에 배포 산출물 hash·종료 결과를 기록한다. 소스/Vite mock 서버를 만들지 않는다.

sandbox EPERM 대체 검증은 `python apps/issus/tests/integration/tools/validate.py checks`, `... emit`, `... integration`이다. 병행 build로 dist 선언/소스가 다르면 `... source`→`... source-integration`으로 공개 workspace export를 동일 임시 emit에 연결해 검사한다. 모든 산출물은 .cache/p8에만 쓰고 node --test --test-isolation=none으로 같은 본문을 실행한다. source-emit-manifest.json이 임시 JS hash를 기록한다. CLI child spawn이 막힌 경우에만 ISSUS_TEST_CLI_RUN_MODULE로 임시 emit된 실제 CLI run()을 실행한다. 이를 표준 npm test·배포 산출물·독립 CLI 프로세스 PASS로 부풀리지 않는다.

O-01 전체 배포·반복deploy·포트/타프로젝트 충돌·실제 SIGTERM·pool30초 종료, I-12 restore·재기동은 호스트 운영 시험이다. acceptance의 readiness 음성·service.stop WS1001은 부분집합이다. 알려진 readiness/25P04/WS 영수 문제는 별도 수정 중이며 최신 build 후 재실행한다. CLI ACL2건의 호스트 통과와 sandbox 실패는 [base/s4 보고](../tests/reports/wave3-assembly/20261021_181500.md)를 구분해 참조한다.
