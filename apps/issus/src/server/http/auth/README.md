P4 HTTP 인증·실DB 수용 시험 하네스.

| 목적 | 경로 |
| --- | --- |
| HTTP 공개 API | index.ts, context.ts |
| 시험 하네스 | testing.ts |
| 실행·제약 | [testing](../../../../docs/testing.md) |

`core.test.ts`의 fingerprint는 `waitForIdle()`로 앞선 intake worker의 실행·PGMQ delete 완료를 기다린 후 전체 domain/control/broker/queue 행을 비교한다. 큐를 제외하거나 비우지 않는다. design.md §3.2/I-P1의 성공·실패 preflight 쓰기 0 계약을 그대로 검사한다. HTTP201은 영속 게시 완료이며 worker의 큐 삭제 완료와 다를 수 있다.

I-P1은 `beforeQueueDelete` gate로 201 뒤 intake 행 1개를 유지하고 idle barrier가 삭제까지 기다리는지 확인한다. 이 hook은 시험 전용이다. preflight·HTTP 응답의 제품 동작은 바꾸지 않는다.

browser-session 재시도는 Node test의 Date Clock을 고정하고 1초 이상 실제 간격을 두어 JSON·cookie token·Max-Age·Path·HttpOnly·SameSite 동일성을 확인한다. Express가 생성하는 Expires도 고정 Clock에서 정확히 24시간 뒤인지 검사한다. 시험 뒤 Clock을 복원한다(DECISION6310243238).
