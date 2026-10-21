import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { EventDraft, EventEnvelope, IngressEvent } from "../../../common/index.js";
import { startWorkerConsumer } from "./index.js";
import { createInlinePool } from "../../worker/inline.js";
import { DomainError } from "../../worker/errors/index.js";
import type { WorkerExecute } from "../../worker/entry.js";
import { MetricsRegistry } from "../../metrics/registry.js";
import { createReactionWork } from "../reaction-enqueue/index.js";

const command: IngressEvent = { eventId: "c1", transactionKey: "tx1", action: "issus.test", channel: "issue:r:1", audience: "worker", createdAt: new Date().toISOString(), payload: {} };

async function exercise(execute: WorkerExecute, attempts = 20, supplied: IngressEvent = command, reactionQueues: string[] = []) {
  const drafts: EventDraft[] = []; let deleted = 0; let released = 0; let completed = 0; let runs = 0; let read = false;
  const pool = createInlinePool(async (...args) => { runs++; return execute(...args); }, 1);
  let finish!: () => void; const finished = new Promise<void>((resolve) => { finish = resolve; });
  const stored: EventEnvelope = { ...supplied, eventVersion: 1, kind: "command", streamId: "channel:issue:r:1", sequence: "1", correlationId: "tx1", source: "worker" };
  const loop = startWorkerConsumer({ commandQueues: ["reaction"], reactionQueues, eventStore: { append: async (draft: EventDraft) => { drafts.push(draft); return { ...draft, sequence: "1" }; } } as never,
    queue: { read: async () => { await delay(2); if (read) return []; read = true; return [{ id: "1", event: supplied, readCount: 50 }]; }, delete: async () => { deleted++; finish(); }, extendVisibility: async () => undefined } as never,
    executions: { claim: async () => ({ kind: "claimed", attemptId: "a", attempts }), renew: async () => true, complete: async () => { completed++; return true; }, release: async () => { released++; finish(); return true; }, recipients: async () => [stored] } as never,
    pool, metrics: new MetricsRegistry(), visibilitySeconds: 60, pollSeconds: 1, batchSize: 1, maxInFlight: 1, maxExecutionAttempts: 1,
  });
  try {
    if (reactionQueues.length) await delay(30); else await finished;
  } finally { loop.stop(); await loop.done; await pool.destroy(); }
  return { drafts, deleted, released, completed, runs };
}

test("transient DB/connection errors release the lease and retain the source even past max attempts", { timeout: 5000 }, async () => {
  for (const code of ["08006", "40001", "40P01", "57P01", "ECONNRESET", "ETIMEDOUT"]) {
    const result = await exercise(async () => { throw Object.assign(new Error("connection interrupted"), { code }); });
    assert.equal(result.released, 1, code); assert.equal(result.completed, 0); assert.equal(result.deleted, 0);
    assert.equal(result.drafts.filter((draft) => draft.kind !== "command").length, 0);
  }
});

test("only explicit domain errors become durable ok:false terminal results", { timeout: 5000 }, async () => {
  const result = await exercise(async () => { throw new DomainError("ISSUE_CLOSED", "이미 닫힌 이슈입니다"); });
  assert.equal(result.completed, 1); assert.equal(result.deleted, 1); assert.equal(result.released, 0);
  assert.deepEqual(result.drafts.at(-1)!.payload, { ok: false, error: { code: "ISSUE_CLOSED", message: "이미 닫힌 이슈입니다" } });
});

test("fact/control events cannot enter the best-effort progress emit path", { timeout: 5000 }, async () => {
  for (const kind of ["fact", "control"]) {
    const result = await exercise(async (_event, _signal, emit) => { emit({ kind, action: "issus.hold", key: "important" }); return "done"; });
    assert.equal(result.completed, 0); assert.equal(result.released, 1); assert.equal(result.deleted, 0);
    assert.equal(result.drafts.length, 1);
  }
});

test("malformed reactions preserve their queue record and never fall back to their own coordinates", { timeout: 5000 }, async () => {
  const fact: EventEnvelope = { ...command, eventId: "source", kind: "fact", eventVersion: 1, streamId: "channel:canonical", sequence: "8", correlationId: "correlation", source: "server" };
  const { sourceStreamId: _sourceStream, ...malformed } = createReactionWork(fact, "reaction");
  const result = await exercise(async () => "must not run", 1, malformed, ["reaction"]);
  assert.equal(result.runs, 0); assert.equal(result.drafts.length, 0); assert.equal(result.deleted, 0);
});
