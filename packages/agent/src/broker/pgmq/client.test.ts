import assert from "node:assert/strict";
import test from "node:test";
import { PgmqClient } from "./client.js";
import { createIngressEvent } from "../../common/index.js";

test("sendOn writes immediately on the external client without using the pool or send batch", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const client = { query: async (sql: string, values: unknown[]) => { queries.push({ sql, values }); return { rows: [{ id: "9007199254740993" }] }; } };
  const queue = new PgmqClient({ query: () => { throw new Error("external transaction must be used"); } } as never);
  const event = createIngressEvent({ action: "issus.test", channel: "issue:r:1", payload: {} });
  assert.equal(await queue.sendOn(client as never, "test_queue", event), "9007199254740993");
  assert.equal(queries.length, 1); assert.match(queries[0]!.sql, /pgmq\.send\(/);
  assert.deepEqual(queries[0]!.values, ["test_queue", JSON.stringify(event)]);
});
