import assert from "node:assert/strict";
import test from "node:test";
import { ReplayBuffer } from "./index.js";

const event = (kind: "result" | "progress" | "fact" | "control", eventId: string) => ({ eventId, eventVersion: 1 as const, streamId: "session:one", sequence: eventId, transactionKey: eventId, correlationId: eventId, kind, channel: "orders", action: "test", source: "server" as const, createdAt: "2026-08-21T00:00:00.000Z", payload: {} });

test("replay handoff never silently drops facts, HOLD or DECISION control events", () => {
  for (const kind of ["fact", "control"] as const) {
    const buffer = new ReplayBuffer(1);
    buffer.push(event("result", "1"));
    assert.equal(buffer.push({ ...event(kind, "2"), action: "HOLD" }), "overflow");
  }
});

test("replay buffer bounds live handoff without discarding terminal events", () => {
  const buffer = new ReplayBuffer(1);
  assert.equal(buffer.push(event("result", "1")), "queued");
  assert.equal(buffer.push(event("progress", "2")), "dropped");
  assert.equal(buffer.push(event("result", "3")), "overflow");
  assert.equal(buffer.push(event("result", "4")), "overflow");
  assert.deepEqual(buffer.drain().map((value) => value.eventId), ["1"]);
});
