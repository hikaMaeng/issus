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

```ts
ready: async () => {
  const result = await health.ready();
  if (!result.ok) throw new Error("application is not ready");
},
```

브라우저는 앱이 교환한 HttpOnly cookie로 WS를 연다. `BrokerClient`에 subscriptionId·channels·initialCursor·onEvent를 주입하며 URL에 bearer를 붙이지 않는다. CLI bearer는 WS Authorization header로 전한다. 처리 ACK는 receipt와 별개의 앱 HTTP API다.
