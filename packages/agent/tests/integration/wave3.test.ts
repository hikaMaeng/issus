import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Pool } from "pg";
import { WebSocket } from "ws";
import { createEventDraft, createIngressEvent, type ChannelServerFrame } from "../../src/common/index.js";
import { deterministicEventId } from "../../src/server/index.js";
import { attachWebSocketTransport, createSocketPolicy, createWorkerServer, readEnv, EventStore, ExecutionStore, PgmqClient, EventStreamHub, MetricsRegistry, createInlinePool, startWorkerConsumer } from "../../src/broker/index.js";

const databaseUrl = process.env.ISSUS_TEST_DATABASE_URL;
async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let n = 0; n < 1000; n++) { if (await predicate()) return; await delay(10); }
  assert.fail("wave3 integration state timeout");
}
async function freePort(): Promise<number> {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve())); return port;
}

test("wave3 real PostgreSQL/PGMQ queue-to-WS v8 receipt and worker readiness", {
  skip: databaseUrl ? false : "미검증: ISSUS_TEST_DATABASE_URL 미지정", timeout: 45000,
}, async (t) => {
  const suffix = randomUUID().replaceAll("-", ""); const schema = `p2_w3_${suffix}`;
  assert.match(schema, /^p2_w3_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const database = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000, options: `-c search_path=${schema}` });
  const queues: string[] = [];
  t.after(async () => {
    await database.end();
    for (const queue of queues) { assert.match(queue, /^p2_w3_[a-f0-9]{32}_[a-z]+$/); await admin.query("SELECT pgmq.drop_queue($1::text)", [queue]); }
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
  });
  // A configured but unavailable DB is a failure, never a silently skipped acceptance test.
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const store = new EventStore(database, undefined, { retentionDays: null }); await store.ensureSchema();
  const executions = new ExecutionStore(database, 10); await executions.ensureSchema();
  const queue = new PgmqClient(database);
  const env = readEnv({ DATABASE_URL: databaseUrl!, AGENT_ROLE: "worker", AGENT_DATABASE_POOL_MAX: "2", QUEUE_POLL_SECONDS: "1" });

  await t.test("PGMQ work persists a queued delivery with v8 ID; WS replay receipt reaches durable callback twice", async () => {
    const queueName = `p2_w3_${suffix}_receipt`; queues.push(queueName); await queue.ensure(queueName);
    const channel = `inbox:${suffix}`; const subscriptionId = randomUUID();
    const principal = { id: "p", owner: "owner", alias: "issus-1-agent", sid: "s5", sessionId: "session", capabilities: [] };
    const deliveryId = deterministicEventId(`delivery:${suffix}`); assert.equal(deliveryId[14], "8");
    await database.query("CREATE TABLE receipt_evidence (delivery_id uuid, attempt integer, cursor uuid, PRIMARY KEY(delivery_id,attempt))");
    let calls = 0;
    const worker = createInlinePool(async () => {
      await store.append({ ...createEventDraft({ action: "issus.delivery.queued", transactionKey: deliveryId, channel, audience: "client", payload: { deliveryId, attempt: 0, state: "posted" } }),
        eventId: deterministicEventId(`delivery.queued:${deliveryId}`), kind: "fact", source: "worker" });
      return { deliveryId };
    }, 1);
    const loop = startWorkerConsumer({ queue, commandQueues: [queueName], eventStore: store, executions, pool: worker, metrics: new MetricsRegistry(), visibilitySeconds: 1, pollSeconds: 1, batchSize: 1, maxInFlight: 1, maxExecutionAttempts: 1 });
    const server = createServer(); const hub = new EventStreamHub(); const frames: ChannelServerFrame[] = [];
    const policy = createSocketPolicy({ verifier: { verify: async () => principal, forget: () => undefined }, allowedActions: [], authorizeChannel: (selected) => selected === channel,
      onReceipt: async (frame, identity) => {
        assert.deepEqual(identity, principal); assert.equal(frame.subscriptionId, subscriptionId);
        assert.deepEqual(frame.deliveryIds, [deliveryId]); assert.deepEqual(frame.attempts, [0]);
        await database.query("INSERT INTO receipt_evidence VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [frame.deliveryIds[0], frame.attempts[0], frame.cursor]); calls++;
      } });
    const transport = attachWebSocketTransport(server, env, queue, hub, store, new MetricsRegistry(), policy);
    let socket: WebSocket | undefined;
    try {
      await queue.send(queueName, createIngressEvent({ action: "issus.delivery.enqueue", channel: `worker:${suffix}`, audience: "worker", payload: {} }));
      await until(async () => (await database.query("SELECT count(*)::int AS n FROM event_store WHERE action='issus.delivery.queued'")).rows[0].n === 1);
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      socket = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/ws`, { headers: { authorization: "Bearer fixture" } });
      socket.on("message", (raw) => frames.push(JSON.parse(String(raw)))); await once(socket, "open");
      const cursor = await store.openChannelCursorAtStart([channel], { principalId: principal.id, owner: principal.owner, sessionId: principal.sessionId });
      socket.send(JSON.stringify({ type: "subscribe", subscriptionId, channels: [channel], cursor: cursor.token }));
      await until(() => frames.some((frame) => frame.type === "event" && frame.event.action === "issus.delivery.queued"));
      const delivered = frames.find((frame) => frame.type === "event" && frame.event.action === "issus.delivery.queued");
      assert.ok(delivered?.type === "event"); assert.equal(delivered.event.payload.deliveryId, deliveryId);
      const receipt = { type: "receipt", subscriptionId, deliveryIds: [delivered.event.payload.deliveryId], attempts: [delivered.event.payload.attempt], cursor: delivered.cursor };
      socket.send(JSON.stringify(receipt)); await until(() => calls === 1);
      socket.send(JSON.stringify(receipt)); await until(() => calls === 2);
      assert.deepEqual((await database.query("SELECT delivery_id,attempt,cursor::text FROM receipt_evidence")).rows, [{ delivery_id: deliveryId, attempt: 0, cursor: delivered.cursor }]);
      assert.equal(frames.some((frame) => frame.type === "error"), false);
      assert.equal((await database.query("SELECT count(*)::int AS n FROM event_store WHERE action='issus.delivery.acked'")).rows[0].n, 0);
      await until(async () => (await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${queueName}"`)).rows[0].n === 0);
      console.log(JSON.stringify({ evidence: "agent.wave3.ws-receipt", deliveryId, receiptCalls: calls, durableReceipts: 1, automaticAck: 0 }));
    } finally {
      socket?.terminate(); await transport.closeClientsAndRemoveSubscriptions();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      loop.stop(); await loop.done; await worker.destroy();
    }
  });

  await t.test("real worker readiness detects removed application schema and failed consumer queue then recovers", async () => {
    const queueName = `p2_w3_${suffix}_ready`; queues.push(queueName);
    const port = await freePort(); let initialized = 0; let checked = 0;
    const service = createWorkerServer({ env: { ...env, port, pollSeconds: 1 }, queues: [queueName], execute: async () => undefined,
      initialize: async (pool) => { await pool.query(`CREATE TABLE "${schema}".required_schema (version integer)`); initialized++; },
      ready: async (pool) => { await pool.query(`SELECT version FROM "${schema}".required_schema`); checked++; },
    });
    const status = async (path = "/ready") => (await fetch(`http://127.0.0.1:${port}${path}`)).status;
    try {
      await service.start(); await until(async () => await status() === 200); assert.equal(initialized, 1);
      await admin.query(`DROP TABLE "${schema}".required_schema`);
      assert.equal(await status(), 503); assert.equal(await status("/health"), 200);
      await admin.query(`CREATE TABLE "${schema}".required_schema (version integer)`);
      assert.equal(await status(), 200);
      await admin.query("SELECT pgmq.drop_queue($1::text)", [queueName]);
      await until(async () => await status() === 503);
      assert.equal(await status("/health"), 200);
      await queue.ensure(queueName); await until(async () => await status() === 200);
      assert.ok(checked >= 3);
      console.log(JSON.stringify({ evidence: "agent.wave3.worker-ready", initialized, checked, missingSchema: 503, missingQueue: 503, recovered: 200 }));
    } finally { await service.stop(); }
  });
});
