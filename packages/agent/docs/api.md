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

`EventBrokerOptions.ready?: () => Promise<void>`는 `createWebBackend`의 같은 옵션으로 전달된다. `/ready` 요청마다 `queue.check()`·`checkDatabase()`·선택 hook을 함께 await한다. 전부 성공하면 HTTP200 `{status:"ready"}`, 하나라도 throw/거부하면 HTTP503 `{status:"unavailable"}`이며 내부 오류는 노출하지 않는다. hook을 생략하면 기존 queue·DB 검사만 수행한다. `/health`는 별도 liveness 응답이다.

`WorkerServerOptions.initialize?(database:Pool):Promise<void>`는 agent schema·소비 큐 생성 후, consumer 시작 전 1회 실행한다. `ready?(database:Pool):Promise<void>`는 매 `/ready` 요청에서 기본 DB/queue 연결 검사와 함께 await한다. 초기화 중/실패, 모든 소비 큐의 최초 poll 성공 전, 어느 큐든 poll 실패 후 재성공 전, 앱 검사 throw/거부, consumer 종료·shutdown 중은503이다. `/health`는200이다. 시작 실패 후에도 관측용 listener를 유지하며 소유 앱은 `stop()`으로 정리한다. schema 준비 판단은 앱이 주입하고 `ready` 생략은 도메인 migration 준비를 보증하지 않는다. `startWorkerConsumer({onPoll?})`는 각 큐 read 성공/실패를 `(queueName,healthy)`로 알린다.

`ChannelClientFrame`: `subscribe{subscriptionId,channels,cursor?}`, `receipt{subscriptionId,deliveryIds,attempts,cursor}`, `event+IngressCommand`. subscriptionId/cursor/deliveryId는 UUID v1–8 및 표준 variant를 허용한다(서버 `deterministicEventId`는 v8). receipt는 동일 길이의 deliveryIds/attempts와 최대100건을 요구한다. 외부 event의 서버 발급 필드·source3개는 거부한다. server frame은 기존 `ready`, `subscribed`, `event`, `replay`, `error{code,message,retryable}` 5종이다. `ChannelEventFrame`은 기존 event wire의 이름 있는 타입이며 새 frame type을 추가하지 않는다. scope 오류의 message는 설계 §5.4와 동일하다.

`agent/broker`는 `GatewaySocketHooks`를 공개한다. `SocketPolicyInput`·`GatewaySocketPolicy`가 같은 계약을 상속하며 `EventBrokerOptions`의 동명 옵션도 socket policy로 전달한다. 별도 `socketPolicy`를 주입하면 그 객체에 있는 hook을 우선하고 누락된 hook은 `EventBrokerOptions`에서 보완한다.

```ts
interface GatewaySocketHooks {
  projectEvent?(event: EventEnvelope, principal: Principal): Promise<EventEnvelope>;
  onSubscribe?(frame: ChannelSubscribeFrame, principal: Principal): GatewaySubscribeResult | Promise<GatewaySubscribeResult>;
  onReceipt?(frame: ChannelReceiptFrame, principal: Principal): void | Promise<void>;
  onDisconnect?(subscriptionId: string, principal: Principal, reason: string): void | Promise<void>;
  onSendSuccess?(subscriptionId: string, principal: Principal, frame: ChannelServerFrame): void | Promise<void>;
  watchRevocation?(principal: Principal, revoke: () => void): () => void;
  selectProtocol?(protocols: ReadonlySet<string>, request: IncomingMessage): string | false;
  initialSubscribe?(request: IncomingMessage, principal: Principal): ChannelSubscribeFrame | undefined | Promise<ChannelSubscribeFrame | undefined>;
}
type GatewayBootstrapFrame = Omit<ChannelEventFrame, "cursor"> & {cursor?: string};
type GatewaySubscribeResult = void | readonly GatewayBootstrapFrame[];
```

`projectEvent`는 bootstrap/replay/live의 event 송신 전에 await한다. 복제한 envelope와 현재 principal을 넘기고 반환 payload만 사용한다. 좌표·action·audience·provenance 등 payload 이외 필드의 변경/추가, object가 아닌 payload, hook throw/거부는 `EVENT_PROJECTION_FAILED` retryable error 뒤1011로 닫고 해당 event를 송신하지 않는다. cursor positions 및 저장 canonical fact는 바꾸지 않는다. `onSendSuccess`는 실제 투영된 wire frame을 받는다. hook 생략은 기존 payload를 그대로 전송한다.

`GatewayBootstrapFrame`·`GatewaySubscribeResult`도 `agent/broker`에서 공개한다. `onSubscribe`는 기존처럼 void를 반환하거나 권한 검사한 canonical event frame 배열을 반환한다. 순서는 subscribed → 반환 bootstrap event들 → replay event들 → replay 완료 → live다. 구독 채널 밖 history는 앱이 repo/scope 권한을 검사하며 canonical envelope를 그대로 반환한다. worker audience·잘못된 event·control frame은 bootstrap으로 보낼 수 없다. 각 bootstrap event는 **현재 구독 positions 그대로** 새 scoped cursor를 발급한다. 앱이 준 cursor는 사용하지 않고 history stream의 sequence로 구독 위치를 전진시키지 않는다. §5.5 metadata/items는 앱의 기존 subscription HTTP 응답/builder가 제공한다. 새 type:bootstrap은 미승인 제안이며 제공하지 않는다.

`onSendSuccess`는 bootstrap/replay/live event 프레임의 실제 `socket.send` callback 성공 뒤 await한다. 해당 연결의 다음 event는 hook 완료 뒤 보낸다. 실패한 write·control frame·client receipt는 호출하지 않는다. 앱이 deliveryId/attempt를 해석하고 자신의 tx에 전송 증거만 기록한다. deliveryId 없는 순수 history로 receipt를 만들지 않는다. hook 실패는 `SEND_SUCCESS_HOOK_FAILED`/1011, 기존 cursor는 불변이다.

`onDisconnect`는 `onSubscribe`가 수용한 현재 구독에 한 번 호출한다. peer 종료 reason(없으면 `websocket close <code>`), policy 오류, 1013, shutdown1001을 포함한다. 새 id로 구독을 바꾸면 이전 id에 `subscription replaced`를 전달하고 같은 id의 재생 페이지는 닫지 않는다. 진행 중 subscribe·send-success가 완료된 뒤 종료 hook을 실행하고 transport shutdown도 이를 기다린다. hook 거부는 `websocketHookFailures`로 관측하며 전송기가 자동 재시도하지 않는다. 앱은 종료 기록을 멱등 처리한다.

`watchRevocation`은 연결마다 동기적으로 로컬 세션 철회 신호를 등록한다. 앱이 `revoke()`를 부르면 즉시 UNAUTHENTICATED error 뒤1008로 종료한다. 반환한 unsubscribe는 종료/shutdown에서 한 번 실행하고 등록 중 동기 revoke도 정리한다. 등록·해제 오류는 `websocketHookFailures`에 기록하며 종료 fact callback을 생략하지 않는다. 다른 broker의 철회는 기존15초 revalidate가 확인한다. RuntimeAuth/onRevoked의 세션 필터·구독은 앱 소유다.

`selectProtocol`은 offered protocol의 복사본과 HTTP request를 받아 그 offered 집합 안의 공개 protocol만 선택한다. 생략/false/예외/미제공 값은 protocol을 응답하지 않는다. 이전의 첫 protocol 자동 반사를 사용하지 않아 credential이 응답에 섞이지 않게 한다. 앱은 승인된 `issus.v1`만 선택하고 bearer protocol 추출·검증과 query token 금지를 맡는다. transport는 protocol/token을 로그나 fact에 기록하지 않는다.

`initialSubscribe`는 인증·ready 송신 완료 뒤 한 번 호출한다. 반환된 subscribe는 client frame과 같은 parser·세션/채널 인가·cursor scope·onSubscribe 경로를 통과하며 event mutation은 반환할 수 없다. undefined는 수동 subscribe를 기다린다. request의 subscription/cursor query와 별칭 채널 선택·소유권 검사는 앱 소유다. 초기 구독과 이후 수동 frame은 같은 연결 chain에 직렬화된다.
