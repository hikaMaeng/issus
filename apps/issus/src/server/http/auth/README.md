P4 HTTP 인증·실DB 수용 시험 하네스.

| 목적 | 경로 |
| --- | --- |
| HTTP 공개 API | index.ts, context.ts |
| 시험 하네스 | testing.ts |
| 실행·제약 | [testing](../../../../docs/testing.md) |

`core.test.ts`의 fingerprint는 `waitForIdle()`로 앞선 intake worker의 실행·PGMQ delete 완료를 기다린 후 전체 domain/control/broker/queue 행을 비교한다. 큐를 제외하거나 비우지 않는다. design.md §3.2/I-P1의 성공·실패 preflight 쓰기 0 계약을 그대로 검사한다. HTTP201은 영속 게시 완료이며 worker의 큐 삭제 완료와 다를 수 있다.

I-P1은 `beforeQueueDelete` gate로 201 뒤 intake 행 1개를 유지하고 idle barrier가 삭제까지 기다리는지 확인한다. 이 hook은 시험 전용이다. preflight·HTTP 응답의 제품 동작은 바꾸지 않는다.

browser-session 만료는 `intake.uow.options.clock`에서 24시간 뒤인 명시적 Expires다. Express의 maxAge 기반 응답 시각 계산을 사용하지 않는다. 시험은 하네스 Clock을 고정하고 1초 이상 실제 간격 뒤 재시도하여 JSON·cookie token과 Path=/·HttpOnly·SameSite=Strict·Expires=Clock+24h를 검사한다(DECISION6310243238). HTTPS는 Secure도 설정한다.

good32 HTTP 수용은 `fixtures.test.ts`의 댓글28 POST201·준비된 이슈 본문4 PATCH200이다. COMPACT/REPLY-IN/BOARD 참조를 먼저 생성하고 역사 기한은 주입 Clock으로 검사한다. bad5는 `core.test.ts`에서 HTTP422와 golden 사유 전체를 대조한다. COMPACT 예시의 정확 footer 추가 여부는 ASK6310536645 판정을 따른다.

`core.test.ts`는 등록/개명 fact의 model을 ROSTER 프로필로 재구축하고, close 차단 및 close fact append 실패에도 별도 제어 tx의 before-close due가 남는지 실제 DB로 확인한다. `setFailAppendAction`은 지정 action을 포함한 append만 실패시키는 시험 hook이다.
