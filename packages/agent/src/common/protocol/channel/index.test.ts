import assert from "node:assert/strict";
import test from "node:test";
import { parseChannelCursor, parseChannelClientFrame, parseChannelServerFrame } from "./index.js";

test("channel cursor only accepts an opaque UUID reference", () => {
  assert.equal(parseChannelCursor("716c013a-bb36-4b1e-a99f-d59af19e27f3"), "716c013a-bb36-4b1e-a99f-d59af19e27f3");
  assert.equal(parseChannelCursor("not-a-cursor"), undefined);
});

test("channel ingress frames reject server-issued envelope fields", () => {
  assert.equal(parseChannelClientFrame({ type: "event", action: "hash.sha256", payload: {}, eventId: "client-id", sequence: "1" }), undefined);
  assert.equal(parseChannelClientFrame({ type: "subscribe", channels: ["orders"], cursor: 1 }), undefined);
});

test("channel egress frames require every canonical envelope field", () => {
  const event = { eventId: "event-1", streamId: "session:one", sequence: "9007199254740993", action: "hash.sha256.result", transactionKey: "tx-1", eventVersion: 1, kind: "result", channel: "agent.results", correlationId: "tx-1", source: "worker", createdAt: "2026-08-21T00:00:00.000Z", payload: {} };
  assert.equal(parseChannelServerFrame({ type: "event", cursor: "716c013a-bb36-4b1e-a99f-d59af19e27f3", event })?.type, "event");
  assert.equal(parseChannelServerFrame({ type: "event", cursor: "716c013a-bb36-4b1e-a99f-d59af19e27f3", event: { ...event, source: "other" } }), undefined);
  assert.equal(parseChannelServerFrame({ type: "event", cursor: "716c013a-bb36-4b1e-a99f-d59af19e27f3", event: { ...event, correlationId: undefined } }), undefined);
});

test("subscription acknowledgement declares whether replay has more pages", () => {
  assert.equal(parseChannelServerFrame({ type: "subscribed", subscriptionId: "bc697dbd-a203-48cc-9961-f88331e01ee2", channels: ["orders"], cursor: "716c013a-bb36-4b1e-a99f-d59af19e27f3", replayComplete: false })?.type, "subscribed");
  assert.equal(parseChannelServerFrame({ type: "subscribed", channels: ["orders"], replayComplete: "false" }), undefined);
  assert.equal(parseChannelServerFrame({ type: "replay", cursor: "716c013a-bb36-4b1e-a99f-d59af19e27f3", replayComplete: true })?.type, "replay");
});

test("receipt shape is bounded before an app callback and server provenance cannot enter ingress", () => {
  const id = "716c013a-bb36-4b1e-a99f-d59af19e27f3";
  const receipt = { type: "receipt", subscriptionId: id, cursor: id, deliveryIds: [id], attempts: [0] };
  assert.deepEqual(parseChannelClientFrame(receipt), receipt);
  assert.equal(parseChannelClientFrame({ ...receipt, attempts: [] }), undefined);
  assert.equal(parseChannelClientFrame({ ...receipt, attempts: [-1] }), undefined);
  assert.equal(parseChannelClientFrame({ ...receipt, deliveryIds: Array(101).fill(id), attempts: Array(101).fill(0) }), undefined);
  for (const field of ["sourceEventId", "sourceStreamId", "sourceSequence"]) {
    assert.equal(parseChannelClientFrame({ type: "event", action: "issus.post", transactionKey: id, channel: "c", payload: {}, [field]: "forged" }), undefined);
  }
});
