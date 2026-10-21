# API

| export | 계약 |
| --- | --- |
| `IssusClient({server,token,fetch?,timeoutMs?})` | headers·same-origin URL·request·write |
| `request<T>(path,{method,body,key,revision,signal})` | status/data/headers; 204 data 없음 |
| `write<T>(path,{key,...},timeoutMs)` | 동일 key 재시도·202 poll·onAccepted 보존 callback |
| `ClientError / OperationTimeout` | HTTP status/code/reasons/details 또는 operationId/key |
| `subscribe(client,options)` | WS/SSE, onFrame·onSubscription·save·key identity factory·signal |
| `InboxModel(cursors,versions)` | viewKey upsert·aliasEventSequence 단조성·complete 뒤 refresh |
| `scopeKey(scope)` | URL/owner/alias/sid/repos/issues/boards/me/mode 정렬 identity |
| `decodeFrame / SseFrameParser / StreamModel` | P3 strict parser·UTF-8 SSE chunk·eventId/stream sequence |

`StreamCheckpoint`는 subscriptionId/channels/transportCursor/generation/closed를 담는다. pull `ClientCursors`의 pagination/refresh/processed와 transport는 서로 교환하지 않는다.
