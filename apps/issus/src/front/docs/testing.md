# 시험

[P8 계획](../../../tests/plans/p8-acceptance-20261021.md)과 [보고서](../../../tests/reports/p8-acceptance/20261021_190000.md)를 따른다. `npm run lint -w issus`, `npm test -w issus`가 표준이다. comment/index.test.tsx는 SSR inert HTML·강한 마커 h2·봉투dl·422사유 보존·history 보강·pagination을 검사한다. SSR은 브라우저 수용을 대신하지 않는다.

B-03 후속의 실행 근거·소스/호스트 구분은 [s2 보고서](../../../tests/reports/p8-acceptance/20261021_193700.md)다.

entry/socket/index.test.ts는 실제 loopback WS로 버전협상·양방향text·1013 close code·AbortSignal 해제·타origin/보안downgrade 거부를4개 시험한다. Node socket 증거는 브라우저 cookie/DOM 증거와 구분한다.

ASK6313920772 후속은 summary의 explicit button role(B-01-2)과 canonical/inbox union에 남은 과거delivery의 이슈 화면 접기(B-01-4)다. readHistory 회귀는 접힌 창과 전체 창을 비교하며 서버/inbox 의무를 변경하지 않는다.

최종 deploy 뒤 호스트에서 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18140 npm run test:browser`를 실행한다. 전체12/12·fail/skip/cancelled0·pageerror0이 기대다. B-03-3은 실제 GET 지연 동안 status+aria-busy, B-03-4는5회 WS 실패 뒤 이름 있는 alert, B-03-5는 실제 WS단절/재연결·구독id교체·단절중delivery재생·실제프레임중복주입 뒤 전체중복행0을 검사한다. selector는 role/label/testid, fixture는 별도 issus_test_p8_* schema다. [루트 실행 조건](../../../../../docs/testing.md)을 따른다.

U1 계획은 [p9-u1](../../../tests/plans/p9-u1-20261021.md), 브라우저 소스는 tests/browser/p9-u1.test.mjs의 P9-01/02/03/13/23-U1/24-U1 6건이다. 기존 ui.test.mjs12건은 수정하지 않는다. Q1/Q2는 연결됐으므로 완전 기능을 BLOCKED/skip으로 숨기지 않고 실제 결과와 대조한다. P9-23 댓글/참조·P9-24 최종 배포·전체24 시나리오는 U2/U3 통합 책임이다.

node:test는 client 오류/CSRF·session 안전복귀/SSR·필터 모델/URL·ROSTER 출처·프레임 semantic을 jsdom 없이 검사한다. 샌드박스 표준test의 spawn EPERM, 임시 JS emit source 실행, 호스트 build/deploy/Playwright를 별도 판정한다. 임시 emit 전체 앱 실행에는 SQL/정본 fixture 자산 복사와 P4_TEST_LOADER가 필요하다. source 통과를 배포 DOM 통과로 쓰지 않는다.

U3 모델/SSR은 pending/HOLD 우선·bigint 순서·canonical/E/attempt 병합·허용4키 metadata·원문/footer 보존·마스킹 다운로드·미확정 요청 동결을 검사한다. 실제 loopback socket은 cookie용 협상 외에 고정 URL bearer subprotocol과 SSE transport proxy를 검사한다.

[P9 전체 계획](../../../tests/plans/p9-ui-20261021.md)은 기존12+신규24의36개 ID를 모두 고정한다. U3 browser는 p9-u3.test.mjs 10개(P9-07/08/17~24)이며 P9-23/24는 U1/U2의 부분 검증과 합쳐 판정한다. `p9-host.mjs`는 deploy 산출물을 쓰는 격리 instance와 별도 Clock을 만든다. Clock은 실제24h packet 만료와 admission 뒤 worker DUE 재검사에만 사용하고 TTL·API 성공 응답을 바꾸지 않는다.

호스트 runner 직접 명령과 표준 npm runner 조립 조건은 전체 계획에 있다. 실제200% 브라우저 확대와 사람 다크테마 확인은 별도 기록한다. viewport450 CSS px의 확대 대응 시험만으로 실제 브라우저200%를 PASS로 쓰지 않는다. source PASS·browser 미실행·다른 담당/호스트 증거를 합산하지 않는다.
