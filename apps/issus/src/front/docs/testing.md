# 시험

[P8 계획](../../../tests/plans/p8-acceptance-20261021.md)과 [보고서](../../../tests/reports/p8-acceptance/20261021_190000.md)를 따른다. `npm run lint -w issus`, `npm test -w issus`가 표준이다. comment/index.test.tsx는 SSR inert HTML·강한 마커 h2·봉투dl·422사유 보존·history 보강·pagination을 검사한다. SSR은 브라우저 수용을 대신하지 않는다.

B-03 후속의 실행 근거·소스/호스트 구분은 [s2 보고서](../../../tests/reports/p8-acceptance/20261021_193700.md)다.

entry/socket/index.test.ts는 실제 loopback WS로 버전협상·양방향text·1013 close code·AbortSignal 해제·타origin/보안downgrade 거부를4개 시험한다. Node socket 증거는 브라우저 cookie/DOM 증거와 구분한다.

ASK6313920772 후속은 summary의 explicit button role(B-01-2)과 canonical/inbox union에 남은 과거delivery의 이슈 화면 접기(B-01-4)다. readHistory 회귀는 접힌 창과 전체 창을 비교하며 서버/inbox 의무를 변경하지 않는다.

최종 deploy 뒤 호스트에서 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18140 npm run test:browser`를 실행한다. 전체12/12·fail/skip/cancelled0·pageerror0이 기대다. B-03-3은 실제 GET 지연 동안 status+aria-busy, B-03-4는5회 WS 실패 뒤 이름 있는 alert, B-03-5는 실제 WS단절/재연결·구독id교체·단절중delivery재생·실제프레임중복주입 뒤 전체중복행0을 검사한다. selector는 role/label/testid, fixture는 별도 issus_test_p8_* schema다. [루트 실행 조건](../../../../../docs/testing.md)을 따른다.
