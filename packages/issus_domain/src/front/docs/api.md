# API

| export | 계약 |
| --- | --- |
| `IssusClient({server,token,fetch?,timeoutMs?})` | headers·same-origin URL·request·write |
| `request<T>(path,{method,body,key,revision,signal})` | status/data/headers; 204 data 없음 |
| `write<T>(path,{key,...},timeoutMs)` | 동일 key 재시도·202 poll·onAccepted 보존 callback |
| `ClientError / OperationTimeout` | HTTP status/code/reasons/details 또는 operationId/key |
| `subscribe(client,options)` | WS/SSE, onFrame·onSubscription·save·key identity factory·signal·once·untilMs |
| `StreamTimeout` | untilMs 대기 상한 만료, code 대신 message=`STREAM_WAIT_TIMEOUT` |
| `InboxModel(cursors,versions)` | viewKey upsert·aliasEventSequence 단조성·complete 뒤 refresh |
| `scopeKey(scope)` | URL/owner/alias/sid/repos/issues/boards/me/mode 정렬 identity |
| `decodeFrame / SseFrameParser / StreamModel` | P3 strict parser·UTF-8 SSE chunk·eventId/stream sequence |

`StreamCheckpoint`는 subscriptionId/channels/transportCursor/generation/closed를 담는다. pull `ClientCursors`의 pagination/refresh/processed와 transport는 서로 교환하지 않는다.

`once`는 첫 queued/redelivered/escalated delivery의 출력·HTTP 영수·save 뒤 반환한다. ready/subscribed/replay 또는 delivered/acked/applied 상태 알림은 완료 조건이 아니다. `untilMs`는 1–2147483647 정수이며 생략시 상한 없음, once와 독립적으로 연결/영수/재접속 전체에 적용한다. 외부 signal 취소는 정상 반환, 상한 만료는 StreamTimeout이다. 정리 DELETE는 별도5초 상한이다.
