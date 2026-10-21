P4 HTTP 인증·실DB 수용 시험 하네스.

| 목적 | 경로 |
| --- | --- |
| HTTP 공개 API | index.ts, context.ts |
| 시험 하네스 | testing.ts |
| 실행·제약 | [testing](../../../../docs/testing.md) |
| s6 회귀 수용 | [계획](tests/plans/core-regression-20261021.md) |

별칭 등록·개명은 `IntakeService.execute`의 기존 command_result·projection·fact 트랜잭션이 끝난 뒤 각각 201/200을 돌려준다. `Prefer`와 intake worker 가용성에 의존하지 않는다. 댓글 등 §7에서 202를 허용한 명령은 기존 큐 제출·5초 대기·operation 조회 계약을 유지한다. 같은 key의 최종 결과 재생과 payload 변경409는 두 경로 모두 동일하다.

예상하지 못한 `auth.verify` 의존 오류는 서버 stderr의 `auth.verify.failed`, 라우트 의존 오류는 `core.http.failed`에 name/code/message만 기록하고 클라이언트에는 기존503을 반환한다. 현재 bearer/token·접속URL·긴 비밀 형태 문자열을 제거하고 SQL query/detail/stack·요청본문은 기록하지 않는다. 정상 인증 거절은401이다. `deployed-browser-host.mjs --fixture-only`는 dist migration/실제 broker·worker·scheduler를 사용해 첫 인증200·0004 migration/index4·전체 browser fixture·마지막 reader 인증200을 확인하며 브라우저 화면 수용과 구별한다.

acceptance는 §7에서202를 허용한 POST만 원 operation을15초까지 조회해 최종201/200/거부를 검사한다. 별칭202는 즉시 실패하며, 큐 수락 자체를 게시 성공으로 세지 않는다. CLI child 실행이 금지된 환경의 기존 `ISSUS_TEST_CLI_RUN_MODULE` source 실행은 호스트 표준 명령의 성공과 별도로 기록한다.

broker entry의 `BrokerUnitOfWork.snapshot()`은 RR inbox 읽기·receipt 갱신과 worker 후속 append의40001/40P01 경합에서 기존4회 묶음을 최대2번 더 실행한다(총≤12attempt, 8초 이후 새 묶음 시작 안 함). 각 실패 묶음은 기존 UoW의 전체rollback을 거치며 고정 snapshot·opaque cursor·fact 원자성을 보존한다. 지속 충돌은503, 다른 오류는즉시 기존 처리, 일반 command run·read-only preflight·25P04 정책은 그대로다. 실DB `entry/broker/snapshot.test.ts`는 충돌4회 후회복·효과1, 지속충돌의상한/효과0을 검사한다.

`core.test.ts`의 fingerprint는 `waitForIdle()`로 앞선 intake worker의 실행·PGMQ delete 완료를 기다린 후 전체 domain/control/broker/queue 행을 비교한다. 큐를 제외하거나 비우지 않는다. design.md §3.2/I-P1의 성공·실패 preflight 쓰기 0 계약을 그대로 검사한다. HTTP201은 영속 게시 완료이며 worker의 큐 삭제 완료와 다를 수 있다.

I-P1은 `beforeQueueDelete` gate로 201 뒤 intake 행 1개를 유지하고 idle barrier가 삭제까지 기다리는지 확인한다. 이 hook은 시험 전용이다. preflight·HTTP 응답의 제품 동작은 바꾸지 않는다.

browser-session 만료는 `intake.uow.options.clock`에서 24시간 뒤인 명시적 Expires다. Express의 maxAge 기반 응답 시각 계산을 사용하지 않는다. 시험은 하네스 Clock을 고정하고 1초 이상 실제 간격 뒤 재시도하여 JSON·cookie token과 Path=/·HttpOnly·SameSite=Strict·Expires=Clock+24h를 검사한다(DECISION6310243238). HTTPS는 Secure도 설정한다.

good32 HTTP 수용은 `fixtures.test.ts`의 댓글28 POST201·준비된 이슈 본문4 PATCH200이다. COMPACT/REPLY-IN/BOARD 참조를 먼저 생성하고 역사 기한은 주입 Clock으로 검사한다. 요청 body는 fixture Buffer를 UTF-8로 읽은 원문 그대로이며, DB `convert_to(body,'UTF8')` Buffer 및 canonical posted/edited fact body와 원본 bytes를 대조한다. COMPACT trimEnd·footer 추가는 금지한다(DECISION6312691996). bad5는 `core.test.ts`에서 HTTP422와 golden 사유 전체를 대조한다.

`transaction-timeout.test.ts`는 실제 PG18/PGMQ·broker worker consumer·ExecutionStore·inline worker·runtime Pool·도메인 UoW를 연결한다. 25P04 4회 소진 후 lease 해제·원 큐 보존·실패 terminal0, 재전달 뒤 projection1·result1·반응 큐1을 확인한다. 배포된 worker entry 시험과는 구별한다. 계획은 [wave3 core](tests/plans/core-wave3-20261021.md), 실행 로그는 `.cache/core-s4/`다.

`core.test.ts`는 등록/개명 fact의 model을 ROSTER 프로필로 재구축하고, close 차단 및 close fact append 실패에도 별도 제어 tx의 before-close due가 남는지 실제 DB로 확인한다. `setFailAppendAction`은 지정 action을 포함한 append만 실패시키는 시험 hook이다.
