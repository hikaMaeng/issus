import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Pool, Client } from "pg";
import { EventStore, PgmqClient, ExecutionStore, createReactionWork, toEventDraft, createInlinePool, startWorkerConsumer, MetricsRegistry, CursorError, EVENT_LOG_NOTIFY_CHANNEL } from "../../src/broker/index.js";
import { createEventDraft, parseChannelServerFrame, type EventEnvelope } from "../../src/common/index.js";

const databaseUrl = process.env.ISSUS_TEST_DATABASE_URL;
test("P2 actual PostgreSQL + PGMQ contracts", { skip: databaseUrl ? false : "미검증: ISSUS_TEST_DATABASE_URL 미지정", timeout: 30000 }, async (t) => {
  const suffix = randomUUID().replaceAll("-", ""); const schema = `p2_agent_${suffix}`;
  assert.match(schema, /^p2_agent_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000, options: `-c search_path=${schema}` });
  const queues: string[] = [];
  try { await admin.query("SELECT 1"); }
  catch (error) {
    await pool.end(); await admin.end();
    const code = (error as { code?: string }).code;
    if (["ECONNREFUSED", "ETIMEDOUT", "EACCES", "EPERM"].includes(code ?? "")) { t.skip(`미검증: 지정 DB 접근 불가 ${code}`); return; }
    throw error;
  }
  await admin.query(`CREATE SCHEMA "${schema}"`);
  t.after(async () => {
    for (const queue of queues) { assert.match(queue, /^p2_[a-f0-9]+_[a-z]+$/); await admin.query("SELECT pgmq.drop_queue($1::text)", [queue]); }
    await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
  });
  const version = await admin.query<{ version: string; pgmq: string }>("SELECT version() AS version, (SELECT extversion FROM pg_extension WHERE extname='pgmq') AS pgmq");
  console.log(JSON.stringify({ evidence: "p2.database", schema, postgres: version.rows[0]!.version, pgmq: version.rows[0]!.pgmq }));
  const store = new EventStore(pool, undefined, { retentionDays: null, cursorTtlDays: 30 }); await store.ensureSchema();
  const executions = new ExecutionStore(pool, 10); await executions.ensureSchema();
  const queue = new PgmqClient(pool);
  const createQueue = async (name: string) => { const q = `p2_${suffix}_${name}`; queues.push(q); await queue.ensure(q); return q; };
  const draft = (action: string, channel = "issue:repo:1") => ({ ...createEventDraft({ action, transactionKey: randomUUID(), channel, audience: "client", payload: { ownerId: "owner" } }), kind: "fact" as const, source: "server" as const });

  await t.test("appendManyOn and sendOn rollback together; notify and sequence publish only on commit", async () => {
    const q = await createQueue("tx"); const listener = new Client({ connectionString: databaseUrl }); await listener.connect();
    const notifications: string[] = []; listener.on("notification", (message) => notifications.push(message.payload ?? ""));
    await listener.query(`LISTEN ${EVENT_LOG_NOTIFY_CHANNEL}`);
    const client = await pool.connect();
    try {
      const event = draft("issus.tx.rollback", "tx-test");
      await client.query("BEGIN"); const rolled = await store.appendManyOn(client, [event]); await queue.sendOn(client, q, rolled[0]!);
      assert.equal(rolled[0]!.sequence, "1");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM event_store WHERE event_id=$1", [event.eventId])).rows[0].n, 0);
      await delay(20); assert.equal(notifications.length, 0); await client.query("ROLLBACK");
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${q}"`)).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM event_stream_sequence WHERE stream_id=$1", [event.streamId])).rows[0].n, 0);
      await client.query("BEGIN"); const committed = await store.appendManyOn(client, [event]); await queue.sendOn(client, q, committed[0]!); await client.query("COMMIT");
      assert.equal(committed[0]!.sequence, "1");
      for (let i = 0; i < 100 && !notifications.length; i++) await delay(5);
      assert.deepEqual(notifications, ["tx-test"]);
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${q}"`)).rows[0].n, 1);
    } finally { client.release(); await listener.end(); }
  });

  await t.test("U-E1 source coordinates survive two queues, JSON, append, reload and worker inputs", async () => {
    const original = await store.append(draft("issus.comment.posted"));
    const identities: string[] = [];
    for (const lane of ["route", "compact"]) {
      const q = await createQueue(lane); const work = createReactionWork(original, q); identities.push(work.eventId);
      await queue.send(q, work);
      const [message] = await queue.read(q, { visibilityTimeoutSeconds: 5, quantity: 1, pollSeconds: 1 }); assert.ok(message);
      const saved = await store.append(toEventDraft(message.event));
      const reloaded = await pool.query("SELECT source_event_id,source_stream_id,source_sequence,payload FROM event_store WHERE event_id=$1", [saved.eventId]);
      assert.deepEqual(reloaded.rows[0], { source_event_id: original.eventId, source_stream_id: original.streamId, source_sequence: original.sequence, payload: original.payload });
      const framed = parseChannelServerFrame({ type: "event", cursor: randomUUID(), event: saved });
      assert.equal(framed?.type, "event"); if (framed?.type === "event") assert.equal(framed.event.sourceSequence, original.sequence);
      assert.notEqual(saved.eventId, original.eventId); assert.equal(saved.sourceEventId, original.eventId);
      await queue.delete(q, message.id);
    }
    assert.notEqual(identities[0], identities[1]);
  });

  await t.test("a comment reaction without replyChannel stores a worker-only terminal result excluded from client reads", async () => {
    const channel = "issue:r:1";
    const original = await store.append(draft("issus.comment.posted", channel));
    assert.equal(original.replyChannel, undefined);
    const q = await createQueue("audience");
    const work = createReactionWork(original, q);
    await queue.send(q, work);
    const received: EventEnvelope[] = [];
    const worker = createInlinePool(async (event) => { received.push(event); return "routed"; }, 1);
    const loop = startWorkerConsumer({ queue, commandQueues: [q], reactionQueues: [q], eventStore: store, executions,
      pool: worker, metrics: new MetricsRegistry(), visibilitySeconds: 1, pollSeconds: 1, batchSize: 1, maxInFlight: 1, maxExecutionAttempts: 1 });
    try {
      let rows: { audience: string; channel: string; payload: unknown; sequence: string }[] = [];
      for (let i = 0; i < 500; i++) {
        rows = (await pool.query("SELECT audience,channel,payload,sequence::text FROM event_store WHERE transaction_key=$1 AND kind='result'", [work.transactionKey])).rows;
        if (rows.length) break;
        await delay(10);
      }
      assert.equal(received.length, 1);
      assert.equal(received[0]!.kind, "command");
      assert.equal(received[0]!.audience, "worker");
      assert.equal(received[0]!.replyChannel, undefined);
      assert.equal(received[0]!.sourceEventId, original.eventId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.audience, "worker");
      assert.equal(rows[0]!.channel, channel);
      assert.deepEqual(rows[0]!.payload, { ok: true, value: "routed" });
      for (let i = 0; i < 100 && (await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${q}"`)).rows[0].n; i++) await delay(5);
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${q}"`)).rows[0].n, 0);
      assert.deepEqual(await store.channelHighWater([channel]), { [original.streamId]: original.sequence });
      assert.deepEqual(await store.channelHighWaterByChannel([channel]), { [channel]: { [original.streamId]: original.sequence } });
      // Include the terminal row in the bounds so replay's own audience predicate is exercised.
      const replay = await store.replayChannels([channel], {}, { [original.streamId]: rows[0]!.sequence }, 256);
      assert.deepEqual(replay.events.map((event) => event.eventId), [original.eventId]);
      const visible = await store.append(draft("issus.visible.after.reaction", channel));
      const after = await store.replayChannels([channel], {}, await store.channelHighWater([channel]), 256);
      assert.deepEqual(after.events.map((event) => event.eventId), [original.eventId, visible.eventId]);
    } finally { loop.stop(); await loop.done; await worker.destroy(); }
  });

  await t.test("immutable UUIDs replay the same old range and enforce principal/channel/TTL scope", async () => {
    const scope = { principalId: "p", owner: "owner", sessionId: "s1" }; const channels = ["issue:repo:1"];
    const initial = await store.openChannelCursorAtStart(channels, scope);
    const first = await store.append(draft("issus.cursor"));
    const advanced = await store.advanceChannelCursor(initial.token, { [first.streamId]: first.sequence }, channels, scope);
    assert.notEqual(initial.token, advanced.token);
    assert.deepEqual((await store.openChannelCursor(channels, initial.token, scope)).positions, {});
    await assert.rejects(store.openChannelCursor(channels, initial.token, { ...scope, sessionId: "s2" }), (error) => error instanceof CursorError && error.status === 409);
    await assert.rejects(store.openChannelCursor(["other"], initial.token, scope), (error) => error instanceof CursorError && error.code === "CURSOR_SCOPE_MISMATCH");
    const high = await store.channelHighWater(channels);
    const before = await store.replayChannels(channels, {}, high, 256); const again = await store.replayChannels(channels, (await store.openChannelCursor(channels, initial.token, scope)).positions, high, 256);
    assert.deepEqual(before.events.map((event) => event.eventId), again.events.map((event) => event.eventId));
    await pool.query("UPDATE event_subscription_cursor SET expires_at=now()-interval '1 second' WHERE token=$1", [initial.token]);
    await assert.rejects(store.openChannelCursor(channels, initial.token, scope), (error) => error instanceof CursorError && error.status === 410);
  });

  await t.test("retention null keeps old facts and execution results, cursor expiry stays separate", async () => {
    const event = await store.append({ ...draft("issus.old"), createdAt: "2020-01-01T00:00:00.000Z" });
    // Test-only age adjustment; production event append never updates a stored fact.
    await pool.query("UPDATE event_store SET stored_at='2020-01-01' WHERE event_id=$1", [event.eventId]);
    assert.equal(await store.prune(null), 0); assert.equal(await store.pruneStreamWatermarks(null), 0); assert.equal(await executions.prune(null), 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM event_store WHERE event_id=$1", [event.eventId])).rows[0].n, 1);
    assert.ok(await store.pruneChannelCursors() >= 1);
  });

  await t.test("a real transient query failure releases the execution and PGMQ redelivery succeeds", async () => {
    const q = await createQueue("retry"); const work = { ...draft("issus.retry"), eventId: randomUUID() }; await queue.send(q, work);
    let attempts = 0;
    const worker = createInlinePool(async () => {
      attempts++;
      if (attempts === 1) await pool.query("DO $$ BEGIN RAISE EXCEPTION 'transient test' USING ERRCODE='40001'; END $$");
      return "recovered";
    }, 1);
    const loop = startWorkerConsumer({ queue, commandQueues: [q], eventStore: store, executions, pool: worker, metrics: new MetricsRegistry(), visibilitySeconds: 1, pollSeconds: 1, batchSize: 1, maxInFlight: 1, maxExecutionAttempts: 1 });
    try {
      let result: { status: string; attempts: number; result: { ok: boolean } } | undefined;
      for (let i = 0; i < 500; i++) {
        result = (await pool.query("SELECT status,attempts,result FROM agent_execution WHERE transaction_key=$1", [work.transactionKey])).rows[0];
        if (result?.status === "completed" && result.attempts >= 2) break;
        await delay(10);
      }
      assert.equal(result?.status, "completed"); assert.equal(result?.attempts, 2); assert.equal(result?.result.ok, true); assert.equal(attempts, 2);
      for (let i = 0; i < 100 && (await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${q}"`)).rows[0].n; i++) await delay(5);
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM pgmq."q_${q}"`)).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM event_store WHERE action=$1", ["issus.retry.result"])).rows[0].n, 1);
    } finally { loop.stop(); await loop.done; await worker.destroy(); }
  });
});
