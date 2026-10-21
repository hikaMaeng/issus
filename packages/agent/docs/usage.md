# 사용

저장소 루트에서 `npm run build -w agent`, `npm test -w agent`, `npm run lint -w agent`를 실행한다. P2 호스트 검증이 설치한 exact 의존과 루트 lock을 함께 사용한다.

앱은 `readEnv(validatedEnvironment)`로 `DATABASE_URL` 필수 환경을 읽고 `env`로 주입한다. production pool의 `search_path`는 `public`이다. 기존 AGENT/QUEUE 설정명은 내부 하위 호환용이다. `ISSUS_EVENT_RETENTION_DAYS=null`, `AGENT_CURSOR_TTL_DAYS=30`을 구분한다.

```ts
import { EventStore, PgmqClient } from "agent/broker";
const events = new EventStore(pool, undefined, { retentionDays: null });
const queues = new PgmqClient(pool);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const stored = await events.appendManyOn(client, drafts);
  await queues.sendOn(client, queueName, stored[0]!);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); }
```

앱의 도메인 side effect·fact·command result는 위 client의 UoW에서 함께 기록한다. 중요한 fact를 `emit()`으로 발행하지 않는다. 도메인 거부는 `DomainError(code,message)` 또는 handler의 `{ok:false,error:{code,message}}`로 명시한다. DB/접속/미분류 예외는 큐 원본 보존·lease release 후 재시도한다.

앱 readiness는 `createEventBroker`의 `ready` 옵션에 주입한다. `createHealth(...).ready()`처럼 `{ok}`를 반환하는 검사는 아래처럼 실패를 throw로 변환한다. 이 hook에서 migration·queue·앱 초기화 상태를 확인하며, `extendHttp`에 같은 `/ready`를 등록해 대체하지 않는다.

worker/scheduler에는 `createWorkerServer({initialize:async database=>{ /* 앱 초기화 */ },ready:async database=>{ /* schema·필수 loop 검사, 실패 throw */ }})`를 주입한다. 기본 consumer의 모든 큐 poll 성공은 agent가 검사한다. `start()` 거부 뒤에도 관측 listener가 열릴 수 있으므로 소유 앱은 `stop()`을 호출한다.

```ts
ready: async () => {
  const result = await health.ready();
  if (!result.ok) throw new Error("application is not ready");
},
```

브라우저는 앱이 교환한 HttpOnly cookie로 WS를 연다. `BrokerClient`에 subscriptionId·channels·initialCursor·onEvent를 주입하며 URL에 bearer를 붙이지 않는다. CLI bearer는 WS Authorization header로 전한다. 처리 ACK는 receipt와 별개의 앱 HTTP API다.

WS lifecycle hook은 `createSocketPolicy` 또는 `createEventBroker`의 동명 옵션에 주입한다. `onDisconnect(subscriptionId,principal,reason)`에서 앱의 `subscription.closed` 기록을 멱등 저장한다. `onSendSuccess(subscriptionId,principal,frame)`에서는 event의 deliveryId/attempt를 검사해 전송 증거를 저장하고, 실제 client receipt는 별도 `onReceipt`로 받는다. custom `socketPolicy`의 hook을 우선하고 누락된 hook은 broker 옵션에서 보완한다.

자족적 delivery 알림은 `projectEvent`에서 권한 확인한 도메인 정보를 payload에 더해 반환한다. envelope의 다른 필드는 그대로 돌려준다. 영수에는 전달받은 v8 deliveryId와 attempt·cursor를 그대로 사용한다.

`onSubscribe`에서 subscriptionId/채널/시작 cursor와 canonical repo 접근을 검사한 뒤 `[{type:"event",event:canonicalFact}]`를 반환할 수 있다. void는 기존 동작을 유지한다. metadata/items·pending/COMPACT 경계는 기존 subscription HTTP 응답의 공통 builder를 사용한다. 반환 frame의 cursor는 broker가 현재 구독 위치의 새 UUID로 발급하므로 직접 만들 필요가 없다.

`watchRevocation(principal,revoke)`에서 앱의 `RuntimeAuth.onRevoked`를 구독하고 세션이 일치하면 `revoke()`를 호출한다. 반환 unsubscribe를 transport가 종료 때 한 번 실행하므로 앱에서 private socket에 접근할 필요가 없다. 다른 인스턴스의 철회는 기존15초 재검증으로 회수한다.

송신 메시지를 보낼 수 없는 Monitor에는 `selectProtocol`로 공개 protocol만 선택하고 `initialSubscribe(request,principal)`로 검증된 alias 채널 subscribe를 반환한다. 앱이 protocol bearer를 `readToken`에서 검증한다. subscription/cursor는 query로 받을 수 있지만 query token은 금지한다. hook 생략 시 기존 수동 subscribe 경로다.
