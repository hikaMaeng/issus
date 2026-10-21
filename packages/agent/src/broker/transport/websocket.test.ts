import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WebSocket } from "ws";
import type { ChannelServerFrame, EventEnvelope } from "../../common/index.js";
import { attachWebSocketTransport } from "./websocket.js";
import { createSocketPolicy } from "../policy/index.js";
import { readEnv } from "../env.js";
import { EventStreamHub } from "../stream/hub.js";
import { CursorError } from "../event-store/cursor/index.js";
import { MetricsRegistry } from "../metrics/registry.js";

const principal = { id: "p", owner: "o", alias: "issus-1-agent", sid: "s1", sessionId: "s", capabilities: [] };
const event = (sequence: number): EventEnvelope => ({ eventId: randomUUID(), eventVersion: 1, kind: "fact", streamId: "channel:allowed", sequence: String(sequence), action: "issus.test", transactionKey: randomUUID(), channel: "allowed", audience: "client", source: "server", correlationId: randomUUID(), createdAt: new Date().toISOString(), payload: {} });

async function harness(initial: EventEnvelope[] = []) {
  const hub = new EventStreamHub(); const rows = [...initial];
  const snapshots = new Map<string, { positions: Record<string, string>; scope: unknown; channels: string[] }>();
  const env = readEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus" });
  let boundary: (() => void) | undefined; let cursorReads = 0; let revoked = false; let receipts = 0;
  const snapshot = async (channels: string[], positions: Record<string, string>, scope: unknown) => {
    const token = randomUUID(); snapshots.set(token, { positions: { ...positions }, scope, channels: [...channels].sort() });
    return { token, positions: { ...positions } };
  };
  const scope = { principalId: "p", owner: "o", sessionId: "s" };
  const first = await snapshot(["allowed"], {}, scope);
  const store = {
    snapshotChannelCursor: snapshot,
    openChannelCursor: async (channels: string[], token: string | undefined, requested: unknown) => {
      cursorReads++;
      if (!token) return snapshot(channels, Object.fromEntries(rows.map((row) => [row.streamId, row.sequence])), requested);
      const old = snapshots.get(token);
      if (!old) throw new CursorError("CURSOR_EXPIRED", 410);
      if (JSON.stringify(old.scope) !== JSON.stringify(requested) || JSON.stringify(old.channels) !== JSON.stringify(channels)) throw new CursorError("CURSOR_SCOPE_MISMATCH", 409);
      return { token, positions: { ...old.positions } };
    },
    channelHighWater: async () => {
      assert.ok(hub.activeChannels().includes("allowed"), "buffer must be installed first");
      const high = Object.fromEntries(rows.map((row) => [row.streamId, row.sequence]));
      const next = boundary; boundary = undefined; next?.(); return high;
    },
    replayChannels: async (_channels: string[], positions: Record<string, string>, high: Record<string, string>, limit: number) => {
      const unread = rows.filter((row) => BigInt(row.sequence) > BigInt(positions[row.streamId] ?? "0") && BigInt(row.sequence) <= BigInt(high[row.streamId] ?? "0"));
      return { events: unread.slice(0, limit), complete: unread.length <= limit };
    },
  };
  const policy = createSocketPolicy({ verifier: { verify: async (token) => { if (revoked || token !== "fixture") throw new Error("invalid"); return principal; }, forget: () => undefined }, allowedActions: [], authorizeChannel: (channel) => channel === "allowed", onReceipt: () => { receipts++; } });
  const server = createServer(); const transport = attachWebSocketTransport(server, env, { send: async () => { throw new Error("WS mutation must not be queued"); } } as never, hub, store as never, new MetricsRegistry(), policy);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const clients: WebSocket[] = [];
  const connect = async (token = "fixture") => {
    const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/ws`, { headers: { authorization: `Bearer ${token}` } }); clients.push(socket);
    const frames: ChannelServerFrame[] = []; const closes: number[] = [];
    socket.on("message", (raw) => frames.push(JSON.parse(String(raw)))); socket.on("close", (code) => closes.push(code));
    await once(socket, "open");
    const until = async (predicate: () => boolean) => {
      for (let i = 0; i < 1000; i++) { if (predicate()) return; await delay(2); }
      assert.fail(`timed out: ${JSON.stringify({ frames, closes })}`);
    };
    const subscribe = (cursor: string = first.token, channels: string[] = ["allowed"], subscriptionId: string = randomUUID()) => { socket.send(JSON.stringify({ type: "subscribe", subscriptionId, channels, cursor })); return subscriptionId; };
    return { socket, frames, closes, until, subscribe };
  };
  return { env, hub, rows, snapshots, first, connect, setBoundary: (value: () => void) => { boundary = value; }, revoke: () => { revoked = true; }, reads: () => cursorReads, receipts: () => receipts,
    close: async () => { for (const socket of clients) socket.terminate(); await transport.closeClientsAndRemoveSubscriptions(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

test("unauthenticated WS upgrade returns HTTP 401 before any subscription", { timeout: 5000 }, async () => {
  const h = await harness();
  try { await assert.rejects(h.connect("invalid"), /401/); assert.equal(h.reads(), 0); assert.deepEqual(h.hub.activeChannels(), []); }
  finally { await h.close(); }
});

test("WS authorizes every subscription before opening a cursor and has no hardcoded ready channels", { timeout: 5000 }, async () => {
  const h = await harness();
  try {
    const c = await h.connect(); await c.until(() => c.frames.some((f) => f.type === "ready"));
    assert.deepEqual(c.frames[0], { type: "ready", channels: [] });
    c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    assert.equal(h.reads(), 1);
    c.subscribe(h.first.token, ["forbidden"]); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1008); assert.equal(h.reads(), 1);
    assert.ok(c.frames.some((f) => f.type === "error" && f.code === "CHANNEL_FORBIDDEN" && f.retryable === false));
    assert.deepEqual(h.hub.activeChannels(), []);
  } finally { await h.close(); }
});

test("replay/live boundary captures an intervening fact and keeps every old cursor immutable", { timeout: 5000 }, async () => {
  const h = await harness([event(1)]);
  try {
    h.setBoundary(() => { const next = event(2); h.rows.push(next); h.hub.publish(next); });
    const c = await h.connect(); c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    const received = c.frames.filter((f) => f.type === "event");
    assert.deepEqual(received.map((f) => f.event.sequence), ["1", "2"]);
    assert.notEqual(received[0]!.cursor, received[1]!.cursor);
    assert.deepEqual(h.snapshots.get(h.first.token)!.positions, {});
    assert.deepEqual(h.snapshots.get(received[0]!.cursor)!.positions, { "channel:allowed": "1" });
    const resumed = await h.connect(); resumed.subscribe(received[0]!.cursor); await resumed.until(() => resumed.frames.some((f) => f.type === "replay"));
    assert.deepEqual(resumed.frames.filter((f) => f.type === "event").map((f) => f.event.sequence), ["2"]);
  } finally { await h.close(); }
});

test("257 events cross the 256 replay page boundary without omissions", { timeout: 10000 }, async () => {
  const h = await harness(Array.from({ length: 257 }, (_, index) => event(index + 1)));
  try {
    const c = await h.connect(); c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    const replay = c.frames.find((f) => f.type === "replay")!;
    assert.equal(replay.type, "replay"); if (replay.type !== "replay") return;
    assert.equal(replay.replayComplete, false);
    c.subscribe(replay.cursor); await c.until(() => c.frames.filter((f) => f.type === "replay").length === 2);
    const received = c.frames.filter((f) => f.type === "event");
    assert.equal(received.length, 257); assert.equal(new Set(received.map((f) => f.event.eventId)).size, 257);
    assert.equal(received.at(-1)!.event.sequence, "257");
  } finally { await h.close(); }
});

test("scoped cursor mismatch sends the design error frame then closes 1008", { timeout: 5000 }, async () => {
  const h = await harness();
  try {
    h.snapshots.get(h.first.token)!.scope = { principalId: "other", owner: "o", sessionId: "s" };
    const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0);
    assert.ok(c.frames.some((f) => f.type === "error" && f.code === "CURSOR_SCOPE_MISMATCH" && f.message === "커서의 세션·채널 범위가 다릅니다" && f.retryable === false));
    assert.equal(c.closes[0], 1008);
  } finally { await h.close(); }
});

test("receipt callbacks require an authenticated matching subscription; WS mutations are refused", { timeout: 5000 }, async () => {
  const h = await harness();
  try {
    const c = await h.connect(); const subscriptionId = c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    c.socket.send(JSON.stringify({ type: "receipt", subscriptionId, deliveryIds: [randomUUID()], attempts: [0], cursor: h.first.token }));
    await c.until(() => h.receipts() === 1);
    c.socket.send(JSON.stringify({ type: "event", action: "issus.post", channel: "allowed", transactionKey: randomUUID(), payload: {} }));
    await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1008);
    assert.ok(c.frames.some((f) => f.type === "error" && f.code === "INGRESS_FORBIDDEN"));
  } finally { await h.close(); }
});

test("a revoked session cannot resubscribe or submit a receipt", { timeout: 5000 }, async () => {
  const h = await harness();
  try { const c = await h.connect(); h.revoke(); c.subscribe(); await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1008); assert.equal(h.reads(), 0); }
  finally { await h.close(); }
});

test("replay buffer overflow closes only the slow socket with 1013 and retains facts for replay", { timeout: 5000 }, async () => {
  const h = await harness(); h.env.websocketMailboxMax = 1;
  try {
    h.setBoundary(() => { for (let i = 1; i <= 2; i++) { const next = event(i); h.rows.push(next); h.hub.publish(next); } });
    const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1013); assert.equal(h.rows.length, 2); assert.deepEqual(h.snapshots.get(h.first.token)!.positions, {});
    h.env.websocketMailboxMax = 256;
    const healthy = await h.connect(); healthy.subscribe(); await healthy.until(() => healthy.frames.some((f) => f.type === "replay"));
    assert.equal(healthy.frames.filter((f) => f.type === "event").length, 2);
  } finally { await h.close(); }
});
