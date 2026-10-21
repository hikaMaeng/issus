import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createWorkerServer, type WorkerServerOptions } from "./index.js";
import { EventStore } from "../event-store/store.js";
import { ExecutionStore } from "../idempotency/store.js";
import { PgmqClient } from "../pgmq/client.js";
import { readEnv } from "../env.js";

async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let n = 0; n < 300; n++) { if (await predicate()) return; await delay(5); }
  assert.fail("worker state timeout");
}

/** Real HTTP service with only the database/queue boundary replaced. */
async function fixture(t: TestContext, hooks: Pick<WorkerServerOptions, "initialize" | "ready"> = {}) {
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const state = { databaseDown: false, queueDown: false, pollDown: "", pollGate: true, polls: new Set<string>(), readyCalls: 0 };
  t.mock.method(EventStore.prototype, "ensureSchema", async () => undefined);
  t.mock.method(ExecutionStore.prototype, "ensureSchema", async () => undefined);
  t.mock.method(PgmqClient.prototype, "ensure", async () => undefined);
  t.mock.method(Pool.prototype, "query", async () => { if (state.databaseDown) throw new Error("database unavailable"); return { rows: [] }; });
  t.mock.method(PgmqClient.prototype, "check", async () => { if (state.queueDown) throw new Error("queue unavailable"); });
  t.mock.method(PgmqClient.prototype, "read", async (queue: string) => {
    while (state.pollGate) await delay(5);
    await delay(10);
    state.polls.add(queue);
    if (state.pollDown === queue) throw new Error("queue poll failed");
    return [];
  });
  const service = createWorkerServer({ execute: async () => undefined, queues: ["one", "two"],
    env: { ...readEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus", AGENT_ROLE: "worker" }), port },
    ...hooks,
  });
  t.after(async () => { state.pollGate = false; await service.stop(); });
  const status = async (path = "/ready") => (await fetch(`http://127.0.0.1:${port}${path}`)).status;
  return { service, state, status };
}

test("worker remains unready through initialization and first poll of every queue", { timeout: 10000 }, async (t) => {
  let entered = false; let release!: () => void; let initialized = 0; let checks = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = await fixture(t, { initialize: async (database) => { assert.ok(database instanceof Pool); initialized++; entered = true; await gate; },
    ready: async (database) => { assert.ok(database instanceof Pool); checks++; } });
  const starting = h.service.start(); await until(() => entered);
  assert.equal(await h.status("/health"), 200); assert.equal(await h.status(), 503);
  assert.equal(h.state.polls.size, 0, "consumer cannot start before initialization");
  release(); await starting;
  assert.equal(await h.status(), 503, "poll has not succeeded yet");
  h.state.pollGate = false; await until(async () => await h.status() === 200);
  assert.deepEqual([...h.state.polls].sort(), ["one", "two"]);
  const before = checks; assert.equal(await h.status(), 200); assert.equal(await h.status(), 200);
  assert.equal(checks, before + 2); assert.equal(initialized, 1);
  assert.equal(await h.status("/missing"), 404);
});

test("worker DB, queue check, each poll and app schema failures return 503 then recover", { timeout: 10000 }, async (t) => {
  let schemaReady = true; let rejectReady = false;
  const h = await fixture(t, { ready: () => {
    if (!schemaReady) throw new Error("migration missing");
    return rejectReady ? Promise.reject(new Error("loop unavailable")) : Promise.resolve();
  } });
  h.state.pollGate = false; await h.service.start(); await until(async () => await h.status() === 200);
  h.state.databaseDown = true; assert.equal(await h.status(), 503); h.state.databaseDown = false;
  h.state.queueDown = true; assert.equal(await h.status(), 503); h.state.queueDown = false;
  schemaReady = false; assert.equal(await h.status(), 503); assert.equal(await h.status("/health"), 200); schemaReady = true;
  rejectReady = true; assert.equal(await h.status(), 503); rejectReady = false;
  for (const queue of ["one", "two"]) {
    h.state.polls.delete(queue); h.state.pollDown = queue;
    await until(() => h.state.polls.has(queue)); assert.equal(await h.status(), 503);
    h.state.pollDown = ""; await until(async () => await h.status() === 200);
  }
  assert.equal(await h.status(), 200);
});

test("worker initialize rejection is observable as live200 and ready503 without consumer polling", { timeout: 10000 }, async (t) => {
  const h = await fixture(t, { initialize: async () => { throw new Error("migration missing"); } });
  await assert.rejects(h.service.start(), /migration missing/);
  assert.equal(await h.status("/health"), 200); assert.equal(await h.status(), 503);
  assert.equal(h.state.polls.size, 0);
});

test("worker awaits ready rejection and returns 503 if shutdown starts during a probe", { timeout: 10000 }, async (t) => {
  let gate: Promise<void> | undefined; let entered = false; let release!: () => void;
  const h = await fixture(t, { ready: async () => { entered = true; await gate; } });
  h.state.pollGate = false; await h.service.start(); await until(async () => await h.status() === 200);
  gate = new Promise<void>((resolve) => { release = resolve; }); entered = false;
  let replied = false; const probe = h.status().then((status) => { replied = true; return status; });
  await until(() => entered); await delay(20); assert.equal(replied, false);
  // Hold the consumer in its next poll while draining; /ready stays available as 503.
  h.state.pollGate = true; await delay(30);
  const stopping = h.service.stop(); release();
  assert.equal(await probe, 503); assert.equal(await h.status(), 503);
  h.state.pollGate = false; await stopping;
  // The fixture cleanup need not stop a second time.
  t.mock.method(h.service, "stop", async () => undefined);
});
