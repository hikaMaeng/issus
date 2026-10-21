# 공개 API

| entry | 주요 export |
| --- | --- |
| `agent/common` | `IngressCommand`, `IngressEvent`, `EventDraft`, `EventEnvelope`, `EventProvenance`, `eventProvenance`, 채널 frame/parser |
| `agent/server` | `deterministicEventId` |
| `agent/front` | `BrokerClient` |
| `agent/broker` | `EventStore`, `PgmqClient`, `ExecutionStore`, `Principal`, `SessionVerifier`, `createSocketPolicy`, 서비스/loop/hub |
| `agent/broker/worker` | `startWorkerEntry`, `WorkerExecute`, `WorkerContext`, `DomainError`, worker pool |

`Principal={id,owner,alias,sid,sessionId,capabilities,kind?}`. `SessionVerifier.verify(token)`은 principal을 반환하고 `forget(token)`은 앱이 구현한다. 토큰 저장/만료/철회·cookie/origin/CSRF 정책은 앱 소유다.

`new EventStore(pool,metrics?,{retentionDays:null,cursorTtlDays:30})`. `appendManyOn(client,drafts,afterAppend?)`는 BEGIN/COMMIT/ROLLBACK·release를 호출하지 않는다. 반환 순서는 입력 순서이고 저장된 이벤트에는 UPDATE하지 않는다. `appendMany(drafts,afterAppend?)`·`append(draft,afterAppend?)`는 자체 tx를 사용한다. `PgmqClient.sendOn(client,queue,event)`는 batch timer를 거치지 않는다.

`cursorScope(principal)`은 `{principalId,owner,sessionId}`. `openChannelCursor(channels,token|undefined,scope)`는 기존 snapshot을 검사하거나 현재 high-water snapshot을 만든다. `openChannelCursorAtStart(channels,scope)`는 `{}`다. `snapshotChannelCursor(channels,positions,scope)`·`advanceChannelCursor(token,positions,channels,scope)`는 새 UUID를 반환한다. 기존 token은 바꾸지 않는다. `CursorError`는 `CURSOR_SCOPE_MISMATCH/409`, `CURSOR_EXPIRED/410`을 제공한다.

`readerPosition(name)`은 `{exists,positions}`를 반환한다. `createReactionWork(fact,queue)`는 큐별 결정적 identity와 원 fact `sourceEventId/sourceStreamId/sourceSequence`를 각인한다. 도메인 payload는 그대로다. `WorkerServerOptions.reactionQueues`에 모든 반응 큐를 등록하면 source 누락/identity 불일치가 worker 진입 전에 거부된다.

`createEventBroker`에는 `verifier`, `authorizeChannel`, `allowedActions`가 필수다. `socketPolicy`, `readHttpToken`, `readSocketToken`, `readyChannels`, `onSubscribe`, `onReceipt`를 주입할 수 있다. `extendHttp(expressApp,database)`는 static middleware와 fallback 전에 실행된다. HTTP command route와 구독/receipt의 도메인 검증은 앱이 등록한다. `allowedActions:[]`로 WS 게시를 차단한다.

`ChannelClientFrame`: `subscribe{subscriptionId,channels,cursor?}`, `receipt{subscriptionId,deliveryIds,attempts,cursor}`, `event+IngressCommand`. subscriptionId/cursor/deliveryId는 UUID, receipt는 동일 길이의 deliveryIds/attempts와 최대100건을 요구한다. 외부 event의 서버 발급 필드·source3개는 거부한다. server frame은 `ready`, `subscribed`, `event`, `replay`, `error{code,message,retryable}`다. scope 오류의 message는 설계 §5.4와 동일하다.
