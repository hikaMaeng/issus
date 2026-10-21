import assert from "node:assert/strict";
import test from "node:test";
import type { EventEnvelope, IngressEvent } from "../../../common/index.js";
import { parseChannelClientFrame, parseChannelServerFrame } from "../../../common/index.js";
import { createReactionWork, startReactionEnqueue } from "./index.js";
import { toEventDraft } from "../../ingress/event-draft.js";
import { MetricsRegistry } from "../../metrics/registry.js";

const fact: EventEnvelope = { eventId: "fact-a", eventVersion: 1, kind: "fact", action: "issus.comment.posted", transactionKey: "tx-a", streamId: "channel:issue:r:1", sequence: "9007199254740993", channel: "issue:r:1", correlationId: "corr-a", source: "server", audience: "worker", createdAt: "2020-01-01T00:00:00.000Z", payload: { body: "원본", sourceSequence: "nested-original" } };

test("U-E1 two reaction queues preserve the source three fields through draft and channel parsing", () => {
  const left = createReactionWork(fact, "route"); const right = createReactionWork(fact, "compact");
  assert.notEqual(left.eventId, right.eventId);
  for (const work of [left, right]) {
    const draft = toEventDraft(JSON.parse(JSON.stringify(work)));
    assert.equal(draft.sourceEventId, fact.eventId);
    assert.equal(draft.sourceStreamId, fact.streamId);
    assert.equal(draft.sourceSequence, fact.sequence);
    assert.deepEqual(draft.payload, fact.payload);
    const frame = parseChannelServerFrame({ type: "event", cursor: "716c013a-bb36-4b1e-a99f-d59af19e27f3", event: { ...draft, sequence: "1" } });
    assert.equal(frame?.type, "event");
    if (frame?.type === "event") { assert.equal(frame.event.sourceSequence, fact.sequence); assert.equal(frame.event.audience, "worker"); }
  }
  const { sourceSequence: _sequence, ...malformed } = left;
  assert.throws(() => toEventDraft(malformed), /invalid reaction source metadata/);
  assert.equal(parseChannelClientFrame({ type: "event", action: fact.action, channel: fact.channel, transactionKey: "tx", payload: {}, sourceEventId: fact.eventId }), undefined);
});

test("a new reaction reader starts at empty and saves each page, including facts older than lookback", async () => {
  const saved: Record<string, string>[] = []; const sent: IngressEvent[] = [];
  let resolveDone!: () => void; const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const second = { ...fact, eventId: "fact-b", sequence: "9007199254740994" };
  const loop = startReactionEnqueue({ name: "test", table: { [fact.action]: ["route"] }, metrics: new MetricsRegistry(), batchSize: 1, pollMs: 10, reconcileMs: 0,
    eventStore: {
      readerPosition: async () => ({ exists: false, positions: {} }),
      saveReaderPosition: async (_name: string, positions: Record<string, string>) => { saved.push({ ...positions }); if (positions[fact.streamId] === second.sequence) resolveDone(); },
      actionHighWater: async () => ({ [fact.streamId]: second.sequence }),
      readActions: async (_actions: string[], positions: Record<string, string>) => positions[fact.streamId] === second.sequence ? { events: [], complete: true } : positions[fact.streamId] === fact.sequence ? { events: [second], complete: true } : { events: [fact], complete: false },
    } as never,
    queue: { send: async (_queue: string, event: IngressEvent) => { sent.push(event); return "1"; } } as never,
  });
  await done; loop.stop(); await loop.done;
  assert.deepEqual(saved, [{}, { [fact.streamId]: fact.sequence }, { [fact.streamId]: second.sequence }]);
  assert.equal(sent.length, 2);
});
