# 시험

[P8 계획](../../../tests/plans/p8-acceptance-20261021.md)과 [보고서](../../../tests/reports/p8-acceptance/20261021_190000.md)를 따른다. `npm run lint -w issus`, `npm test -w issus`가 표준이다. comment/index.test.tsx는 SSR inert HTML·강한 마커 h2·봉투dl·422사유 보존·history 보강·pagination을 검사한다. SSR은 브라우저 수용을 대신하지 않는다.

배포 서버에 `ISSUS_TEST_SERVER_URL`을 지정해 `node --test --test-isolation=none apps/issus/tests/browser/ui.test.mjs`를 실행한다. selector는 role/label/testid, fixture는 별도 issus_test_p8_* schema다. [루트 실행 조건](../../../../../docs/testing.md)을 따른다.
