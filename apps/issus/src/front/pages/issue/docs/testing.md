# testing

계획: apps/issus/tests/plans/p9-u2-20261021.md. 브라우저: apps/issus/tests/browser/p9-u2.test.mjs. 실행기록: apps/issus/tests/reports/p9-u2 및 .cache/p9-u2/commands.jsonl.

단위/SSR는 composer·issue-form·reference·comment·closing·handoff·issue 모델을 node:test로 검증한다. jsdom을 사용하지 않는다. 의미 있는 경계: 원문 round-trip·codepoint/bytes·TYPE13/필수 키·불명 결과 동일 key·final422 새 key·412 초안/base·정수 id·frozen pagination·OTHER lazy·HOLD/DECISION 공개·권한 단계다.

P1-3 회귀는 정본 checkComment로 TO 목록·ACK-BY 형식·STATE enum을 각각 재현해 field≠null·정확 필드·SSR aria-invalid/describedby 원문을 확인한다. 다중 사유 순서/중복·escaped 내용·유사 문구/alias 미추측도 시험한다. P9-04/05 배포 시험은 세 사례를 검사/게시 양쪽에서 거부하고 해당 입력의 실제 description·첫 오류 focus·댓글 증가0을 확인한다. 읽기 전용 실제 HTTP 증거는 .cache/p9-u2-s2/live-probes.json, 실행 기록은 같은 폴더 commands.jsonl이다.

Playwright는 role/label/testid만 사용한다. CSS class/XPath·성공 API 응답 mock은 사용하지 않는다. P8 ui.test.mjs 12건은 U3 소유이며 U2가 수정하지 않는다. U2 파일은 P9-04/05/06/09/10/11/12/14/15/16·23을 담당한다.

호스트: 최신 U2/U3 경로 조립 후 npm run lint -w issus, npm test -w issus, npm run deploy. 배포 dist 전용 전체 runner는 ISSUS_TEST_SERVER_URL=http://127.0.0.1:18141 및 ISSUS_TEST_DATABASE_URL을 설정하고 node apps/issus/tests/browser/p9-host.mjs. runner가 만든 전용 schema/queue만 정리하며 production schema를 사용하지 않는다.

SSR/source/실DB/배포DOM/사람 확인은 별도 판정한다. test 수·skip·exit는 실행 로그에서 복사한다. token/쿠키/Authorization/packetToken을 관측 로그에 남기지 않는다.
