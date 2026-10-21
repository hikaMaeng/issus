import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { EventStore } from "./store.js";
import { CursorStore, CursorError } from "./cursor/index.js";
import { createEventDraft } from "../../common/index.js";

const scope = { principalId: "principal-a", owner: "owner-a", sessionId: "session-a" };

test("appendManyOn reserves sequence and notifies on the external client without transaction control", async () => {
  const sqls: string[] = [];
  const draft = createEventDraft({ action: "issus.test", channel: "issue:r:1", transactionKey: "tx", payload: {} });
  const client = { query: async (sql: string, values?: unknown[]) => {
    sqls.push(sql);
    if (sql.includes("RETURNING last_sequence")) return { rowCount: 1, rows: [{ sequence: "17" }] };
    if (sql.includes("INSERT INTO event_store")) return { rowCount: 1, rows: [{ event_id: values![0], stream_id: values![1], sequence: "17", action: values![3], transaction_key: values![4], kind: values![6], channel: values![7], reply_channel: null, session_id: null, run_id: null, turn_id: null, causation_event_id: null, correlation_id: values![13], source: values![14], audience: values![15], payload: {}, created_at: values![17] }] };
    return { rowCount: 0, rows: [] };
  } } as unknown as PoolClient;
  const store = new EventStore({ connect: () => { throw new Error("must not acquire another client"); } } as never);
  const persisted = await store.appendManyOn(client, [draft]);
  assert.equal(persisted[0]!.sequence, "17");
  assert.ok(sqls.some((sql) => sql.includes("pg_notify")));
  assert.ok(sqls.every((sql) => !/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)));
});

test("cursor advance creates a new scoped UUID and leaves an earlier snapshot replayable", async () => {
  const rows = new Map<string, { scope: typeof scope; channels: string[]; positions: Record<string, string>; expired: boolean }>();
  const pool = { query: async (sql: string, values: unknown[]) => {
    if (sql.startsWith("INSERT")) rows.set(values[0] as string, { scope: JSON.parse(values[1] as string), channels: JSON.parse(values[2] as string), positions: JSON.parse(values[3] as string), expired: false });
    if (sql.startsWith("SELECT")) return { rows: rows.has(values[0] as string) ? [rows.get(values[0] as string)] : [] };
    assert.ok(!sql.startsWith("UPDATE")); return { rows: [], rowCount: 1 };
  } };
  const store = new EventStore(pool as never);
  const first = await store.openChannelCursorAtStart(["b", "a", "a"], scope);
  const second = await store.advanceChannelCursor(first.token, { "channel:a": "9" }, ["a", "b"], scope);
  assert.notEqual(first.token, second.token);
  assert.deepEqual((await store.openChannelCursor(["b", "a"], first.token, scope)).positions, {});
  assert.deepEqual((await store.openChannelCursor(["a", "b"], second.token, scope)).positions, { "channel:a": "9" });
  await assert.rejects(store.openChannelCursor(["a"], first.token, scope), (error) => error instanceof CursorError && error.code === "CURSOR_SCOPE_MISMATCH");
  await assert.rejects(store.openChannelCursor(["a", "b"], first.token, { ...scope, sessionId: "other" }), (error) => error instanceof CursorError && error.status === 409);
  rows.get(first.token)!.expired = true;
  await assert.rejects(new CursorStore(pool as never).load(first.token, ["a", "b"], scope), (error) => error instanceof CursorError && error.status === 410);
});

test("null retention does not delete history, execution rows or sequence watermarks", async () => {
  const store = new EventStore({ query: () => { throw new Error("no SQL expected"); } } as never, undefined, { retentionDays: null });
  assert.equal(await store.prune(), 0);
  assert.equal(await store.prune(null), 0);
  assert.equal(await store.pruneStreamWatermarks(null), 0);
});

test("readerPosition distinguishes a saved empty cursor from a missing cursor", async () => {
  let rows: unknown[] = [];
  const store = new EventStore({ query: async () => ({ rows }) } as never);
  assert.deepEqual(await store.readerPosition("reactions"), { exists: false, positions: {} });
  rows = [{ positions: {} }];
  assert.deepEqual(await store.readerPosition("reactions"), { exists: true, positions: {} });
});
