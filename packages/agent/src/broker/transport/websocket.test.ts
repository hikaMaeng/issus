import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WebSocket } from "ws";
import type { ChannelServerFrame, EventEnvelope } from "../../common/index.js";
import { attachWebSocketTransport, type GatewaySocketHooks } from "./websocket.js";
import { createSocketPolicy, type SocketPolicyInput } from "../policy/index.js";
import { readEnv } from "../env.js";
import { EventStreamHub } from "../stream/hub.js";
import { CursorError } from "../event-store/cursor/index.js";
import { MetricsRegistry } from "../metrics/registry.js";

const principal = { id: "p", owner: "o", alias: "issus-1-agent", sid: "s1", sessionId: "s", capabilities: [] };
const event = (sequence: number): EventEnvelope => ({ eventId: randomUUID(), eventVersion: 1, kind: "fact", streamId: "channel:allowed", sequence: String(sequence), action: "issus.test", transactionKey: randomUUID(), channel: "allowed", audience: "client", source: "server", correlationId: randomUUID(), createdAt: new Date().toISOString(), payload: {} });

async function harness(initial: EventEnvelope[] = [], hooks: GatewaySocketHooks & { readToken?: SocketPolicyInput["readToken"] } = {}) {
  const hub = new EventStreamHub(); const rows = [...initial];
  const snapshots = new Map<string, { positions: Record<string, string>; scope: unknown; channels: string[] }>();
  const env = readEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus" });
  let boundary: (() => void) | undefined; let cursorReads = 0; let revoked = false; let receipts = 0; let failedSnapshots = false;
  const snapshot = async (channels: string[], positions: Record<string, string>, scope: unknown) => {
    if (failedSnapshots) throw new Error("fixture snapshot persistence failure");
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
  const policy = createSocketPolicy({ verifier: { verify: async (token) => { if (revoked || token !== "fixture") throw new Error("invalid"); return principal; }, forget: () => undefined }, allowedActions: [], authorizeChannel: (channel) => channel === "allowed", onReceipt: () => { receipts++; }, ...hooks });
  const metrics = new MetricsRegistry();
  const server = createServer(); const transport = attachWebSocketTransport(server, env, { send: async () => { throw new Error("WS mutation must not be queued"); } } as never, hub, store as never, metrics, policy);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const clients: WebSocket[] = [];
  const connect = async (token = "fixture", options: { protocols?: string[]; query?: string; authorization?: boolean } = {}) => {
    const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/ws${options.query ?? ""}`, options.protocols ?? [], { headers: options.authorization === false ? {} : { authorization: `Bearer ${token}` } }); clients.push(socket);
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
  return { env, hub, rows, snapshots, first, connect, transport, metrics, failSnapshots: () => { failedSnapshots = true; }, setBoundary: (value: () => void) => { boundary = value; }, revoke: () => { revoked = true; }, reads: () => cursorReads, receipts: () => receipts,
    close: async () => { for (const socket of clients) socket.terminate(); await transport.closeClientsAndRemoveSubscriptions(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

test("unauthenticated WS upgrade returns HTTP 401 before any subscription", { timeout: 5000 }, async () => {
  const h = await harness();
  try { await assert.rejects(h.connect("invalid"), /401/); assert.equal(h.reads(), 0); assert.deepEqual(h.hub.activeChannels(), []); }
  finally { await h.close(); }
});

test("send-success observes actual replay/live writes and is separate from client receipts", { timeout: 5000 }, async () => {
  const sent: Array<{ id: string; frame: ChannelServerFrame }> = [];
  const h = await harness([event(1)], { onSendSuccess: async (id, p, frame) => { assert.deepEqual(p, principal); sent.push({ id, frame }); } });
  try {
    const c = await h.connect(); const id = c.subscribe();
    await c.until(() => sent.length === 1);
    const live = event(2); h.rows.push(live); h.hub.publish(live);
    await c.until(() => sent.length === 2);
    assert.deepEqual(sent.map((s) => [s.id, s.frame.type === "event" && s.frame.event.sequence]), [[id, "1"], [id, "2"]]);
    assert.equal(h.receipts(), 0);
    const last = sent[1]!.frame; assert.equal(last.type, "event");
    if (last.type === "event") c.socket.send(JSON.stringify({ type: "receipt", subscriptionId: id, deliveryIds: [randomUUID()], attempts: [0], cursor: last.cursor }));
    await c.until(() => h.receipts() === 1);
    assert.deepEqual(h.snapshots.get(h.first.token)!.positions, {});
  } finally { await h.close(); }
});

test("send-success is not called for a failed socket write", { timeout: 5000 }, async () => {
  let sent = 0; const original = WebSocket.prototype.send;
  const h = await harness([event(1)], { onSendSuccess: () => { sent++; } });
  WebSocket.prototype.send = function (this: WebSocket, data: unknown, ...args: unknown[]) {
    if (typeof data === "string" && JSON.parse(data).type === "event") {
      const callback = args.at(-1) as ((error?: Error) => void) | undefined;
      callback?.(new Error("fixture write failure")); return;
    }
    return Reflect.apply(original, this, [data, ...args]);
  } as typeof original;
  try {
    const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1011); assert.equal(sent, 0);
  } finally { WebSocket.prototype.send = original; await h.close(); }
});

test("disconnect reports one accepted subscription with principal and peer reason", { timeout: 5000 }, async () => {
  const closed: Array<[string, string]> = [];
  const h = await harness([], { onDisconnect: (id, p, reason) => { assert.deepEqual(p, principal); closed.push([id, reason]); } });
  try {
    const c = await h.connect(); const id = c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    c.socket.close(1000, "fixture disconnect"); await c.until(() => closed.length === 1);
    assert.deepEqual(closed, [[id, "fixture disconnect"]]); assert.deepEqual(h.hub.activeChannels(), []);
  } finally { await h.close(); }
  assert.equal(closed.length, 1);
});

test("disconnect waits for in-flight subscribe and graceful shutdown awaits persistence", { timeout: 5000 }, async () => {
  let releaseSubscribe!: () => void; let entered = false; let closed = false;
  const gate = new Promise<void>((resolve) => { releaseSubscribe = resolve; });
  const h = await harness([], { onSubscribe: async () => { entered = true; await gate; }, onDisconnect: async () => { await delay(10); closed = true; } });
  try {
    const c = await h.connect(); c.subscribe(); await c.until(() => entered);
    c.socket.close(1000, "during subscribe"); await c.until(() => c.closes.length > 0);
    assert.equal(closed, false); releaseSubscribe(); await h.transport.closeClientsAndRemoveSubscriptions();
    assert.equal(closed, true); assert.deepEqual(h.hub.activeChannels(), []);
  } finally { releaseSubscribe(); await h.close(); }
});

test("subscription replacement closes the old id once; replay pagination keeps the same id open", { timeout: 5000 }, async () => {
  const closed: string[] = [];
  const h = await harness([], { onDisconnect: (id) => { closed.push(id); } });
  try {
    const c = await h.connect(); const first = c.subscribe(); await c.until(() => c.frames.filter((f) => f.type === "replay").length === 1);
    c.subscribe(h.first.token, ["allowed"], first); await c.until(() => c.frames.filter((f) => f.type === "replay").length === 2);
    assert.deepEqual(closed, []);
    const next = c.subscribe(); await c.until(() => c.frames.filter((f) => f.type === "replay").length === 3);
    assert.deepEqual(closed, [first]); c.socket.close(); await c.until(() => closed.length === 2);
    assert.deepEqual(closed, [first, next]);
  } finally { await h.close(); }
});

test("rejected subscriptions do not produce disconnect facts and hook rejection is contained", { timeout: 5000 }, async () => {
  let disconnected = 0;
  const h = await harness([], { onSubscribe: () => { throw new Error("denied"); }, onDisconnect: () => { disconnected++; } });
  try { const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0); assert.equal(disconnected, 0); }
  finally { await h.close(); }
  const h2 = await harness([], { onDisconnect: async () => { throw new Error("fixture persistence failure"); } });
  try { const c = await h2.connect(); c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay")); }
  finally { await h2.close(); }
  assert.equal(h2.metrics.snapshot().websocketHookFailures, 1);
});

test("disconnect follows async send-success completion; rejected success hooks close with 1011", { timeout: 5000 }, async () => {
  let release!: () => void; let entered = false; const steps: string[] = [];
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = await harness([event(1)], { onSendSuccess: async () => { entered = true; await gate; steps.push("sent"); }, onDisconnect: () => { steps.push("closed"); } });
  try {
    const c = await h.connect(); c.subscribe(); await c.until(() => entered);
    c.socket.close(); await c.until(() => c.closes.length > 0); assert.deepEqual(steps, []);
    release(); await h.transport.closeClientsAndRemoveSubscriptions(); assert.deepEqual(steps, ["sent", "closed"]);
  } finally { release(); await h.close(); }
  const h2 = await harness([event(1)], { onSendSuccess: () => { throw new Error("fixture callback failure"); } });
  try {
    const c = await h2.connect(); c.subscribe(); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1011); assert.equal(h2.metrics.snapshot().websocketHookFailures, 1);
    assert.ok(c.frames.some((f) => f.type === "error" && f.code === "SEND_SUCCESS_HOOK_FAILED"));
    assert.deepEqual(h2.snapshots.get(h2.first.token)!.positions, {});
  } finally { await h2.close(); }
});

test("gateway shutdown sends 1001 and awaits the subscription.closed callback", { timeout: 5000 }, async () => {
  const closed: Array<[string, string]> = [];
  const h = await harness([], { onDisconnect: async (id, p, reason) => { assert.deepEqual(p, principal); await delay(10); closed.push([id, reason]); } });
  try {
    const c = await h.connect(); const id = c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    await h.transport.closeClientsAndRemoveSubscriptions(); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1001); assert.deepEqual(closed, [[id, "gateway shutdown"]]);
  } finally { await h.close(); }
});

test("a pending success hook isolates its own connection and keeps other subscribers flowing", { timeout: 5000 }, async () => {
  let release!: () => void; const blocked = randomUUID(); let entered = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = await harness([event(1)], { onSendSuccess: async (id) => { if (id === blocked) { entered = true; await gate; } } });
  try {
    const first = await h.connect(); first.subscribe(h.first.token, ["allowed"], blocked); await first.until(() => entered);
    const next = await h.connect(); next.subscribe(); await next.until(() => next.frames.some((f) => f.type === "replay"));
    assert.equal(first.frames.some((f) => f.type === "replay"), false);
    release(); await first.until(() => first.frames.some((f) => f.type === "replay"));
  } finally { release(); await h.close(); }
});

test("resubscribe quiesces the old hub before async validation so writes retain their subscription id", { timeout: 5000 }, async () => {
  let subscriptions = 0; let entered = false; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const sent: string[] = [];
  const h = await harness([event(1)], { onSubscribe: async () => { if (++subscriptions === 2) { entered = true; await gate; } }, onSendSuccess: (id) => { sent.push(id); } });
  try {
    const c = await h.connect(); const old = c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    const next = c.subscribe(); await c.until(() => entered);
    const row = event(2); h.rows.push(row); h.hub.publish(row); await delay(10);
    assert.deepEqual(sent, [old]); assert.deepEqual(h.hub.activeChannels(), []);
    release(); await c.until(() => c.frames.filter((f) => f.type === "replay").length === 2);
    assert.deepEqual(sent, [old, next, next]);
  } finally { release(); await h.close(); }
});

test("app-authorized canonical bootstrap uses existing event frames before replay/live without advancing channel positions", { timeout: 5000 }, async () => {
  const history = { ...event(99), channel: "history", streamId: "channel:history", payload: { body: "가입 전 canonical 원문", metadata: { preserved: true } } };
  const sent: ChannelServerFrame[] = [];
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = await harness([event(1)], { onSubscribe: (frame, p) => {
    assert.deepEqual(p, principal); assert.deepEqual(frame.channels, ["allowed"]);
    return [{ type: "event", event: history, cursor: "app-cursor-is-not-trusted" }];
  }, onSendSuccess: async (_id, _p, frame) => { sent.push(frame); if (frame.type === "event" && frame.event.channel === "history") await gate; } });
  try {
    h.setBoundary(() => { const row = event(2); h.rows.push(row); h.hub.publish(row); });
    const c = await h.connect(); c.subscribe(); await c.until(() => c.frames.filter((f) => f.type === "event").length === 1 && sent.length === 1);
    assert.equal(c.frames.some((f) => f.type === "replay"), false); release();
    await c.until(() => c.frames.filter((f) => f.type === "event").length === 3 && sent.length === 3);
    assert.deepEqual(c.frames.filter((f) => f.type !== "ready").map((f) => f.type === "event" ? `${f.event.channel}:${f.event.sequence}` : f.type), ["subscribed", "history:99", "allowed:1", "replay", "allowed:2"]);
    const frames = c.frames.filter((f) => f.type === "event"); assert.deepEqual(frames[0]!.event, history);
    assert.notEqual(frames[0]!.cursor, h.first.token); assert.deepEqual(h.snapshots.get(frames[0]!.cursor)!.positions, {});
    assert.deepEqual(h.snapshots.get(frames[1]!.cursor)!.positions, { "channel:allowed": "1" });
    assert.deepEqual(h.snapshots.get(h.first.token)!.positions, {}); assert.equal(sent.length, 3); assert.equal(h.receipts(), 0);
  } finally { release(); await h.close(); }
});

test("bootstrap authorization rejection and private/malformed frames never reach clients", { timeout: 5000 }, async () => {
  const denied = await harness([], { onSubscribe: () => { throw new Error("canonical repo access denied"); } });
  try { const c = await denied.connect(); c.subscribe(); await c.until(() => c.closes.length > 0); assert.equal(c.frames.some((f) => f.type === "event"), false); }
  finally { await denied.close(); }
  for (const proposed of [{ type: "event", event: { ...event(1), audience: "worker" } }, { type: "event", event: { ...event(1), payload: null } }, { type: "replay", cursor: randomUUID(), replayComplete: true }]) {
    const h = await harness([], { onSubscribe: () => [proposed] as never });
    try { const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1008); assert.equal(c.frames.some((f) => f.type === "event" || f.type === "replay"), false); }
    finally { await h.close(); }
  }
});

test("a failed bootstrap write never emits a success receipt", { timeout: 5000 }, async () => {
  let sent = 0; const original = WebSocket.prototype.send;
  const h = await harness([], { onSubscribe: () => [{ type: "event", event: event(1) }], onSendSuccess: () => { sent++; } });
  WebSocket.prototype.send = function (this: WebSocket, data: unknown, ...args: unknown[]) {
    if (typeof data === "string" && JSON.parse(data).type === "event") { (args.at(-1) as ((error?: Error) => void) | undefined)?.(new Error("bootstrap write failed")); return; }
    return Reflect.apply(original, this, [data, ...args]);
  } as typeof original;
  try { const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1011); assert.equal(sent, 0); assert.equal(h.metrics.snapshot().websocketSendFailures, 1); }
  finally { WebSocket.prototype.send = original; await h.close(); }
});

test("bootstrap snapshot persistence failure closes retryably without sending history or changing the old cursor", { timeout: 5000 }, async () => {
  let sent = 0;
  const h = await harness([], { onSubscribe: () => [{ type: "event", event: event(1) }], onSendSuccess: () => { sent++; } });
  try {
    h.failSnapshots(); const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1011); assert.equal(sent, 0); assert.deepEqual(h.snapshots.get(h.first.token)!.positions, {});
    assert.ok(c.frames.some((f) => f.type === "error" && f.code === "CURSOR_PERSISTENCE_FAILED" && f.retryable));
    assert.equal(c.frames.some((f) => f.type === "event"), false);
  } finally { await h.close(); }
});

test("local revocation closes only the signalled connection with 1008 and unregisters each watch once", { timeout: 5000 }, async () => {
  const signals: Array<() => void> = []; const closed: string[] = []; let removed = 0;
  const h = await harness([], { watchRevocation: (p, revoke) => { assert.deepEqual(p, principal); signals.push(revoke); return () => { removed++; }; }, onDisconnect: (id) => { closed.push(id); } });
  try {
    const first = await h.connect(); const id = first.subscribe(); await first.until(() => first.frames.some((f) => f.type === "replay"));
    const second = await h.connect(); second.subscribe(); await second.until(() => second.frames.some((f) => f.type === "replay"));
    signals[0]!(); await first.until(() => first.closes.length > 0 && closed.length === 1);
    assert.equal(first.closes[0], 1008); assert.deepEqual(closed, [id]); assert.equal(removed, 1); assert.equal(second.closes.length, 0);
    signals[0]!(); assert.deepEqual(closed, [id]);
    await h.transport.closeClientsAndRemoveSubscriptions(); assert.equal(removed, 2); assert.equal(closed.length, 2);
  } finally { await h.close(); }
  assert.equal(removed, 2);
});

test("a synchronous local revoke before subscribe suppresses ready and still releases the watcher", { timeout: 5000 }, async () => {
  let removed = 0; let closed = 0;
  const h = await harness([], { watchRevocation: (_p, revoke) => { revoke(); return () => { removed++; }; }, onDisconnect: () => { closed++; } });
  try {
    const c = await h.connect(); await c.until(() => c.closes.length > 0);
    assert.equal(c.closes[0], 1008); assert.equal(removed, 1); assert.equal(closed, 0); assert.equal(c.frames.some((f) => f.type === "ready"), false);
  } finally { await h.close(); }
});

test("revocation registration and cleanup failures are contained without losing disconnect callbacks", { timeout: 5000 }, async () => {
  const h = await harness([], { watchRevocation: () => { throw new Error("watch registration failed"); } });
  try { const c = await h.connect(); await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1008); assert.equal(h.metrics.snapshot().websocketHookFailures, 1); }
  finally { await h.close(); }
  let closed = 0;
  const h2 = await harness([], { watchRevocation: () => () => { throw new Error("watch cleanup failed"); }, onDisconnect: () => { closed++; } });
  try { const c = await h2.connect(); c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay")); }
  finally { await h2.close(); }
  assert.equal(closed, 1); assert.equal(h2.metrics.snapshot().websocketHookFailures, 1); assert.equal(h2.metrics.snapshot().websocketConnections, 0);
});

test("receive-only clients authenticate through app subprotocol policy and auto-subscribe after ready", { timeout: 5000 }, async () => {
  const id = randomUUID(); let initialCalls = 0; let validated = 0;
  const h = await harness([event(1)], {
    readToken: (request) => request.headers["sec-websocket-protocol"]?.toString().split(",").map((p) => p.trim()).find((p) => p.startsWith("fixture.bearer."))?.slice("fixture.bearer.".length),
    selectProtocol: (protocols, request) => { assert.ok(request.url?.startsWith("/ws?subscription=")); return protocols.has("fixture.v1") ? "fixture.v1" : false; },
    initialSubscribe: async (request, p) => {
      initialCalls++; assert.deepEqual(p, principal);
      const url = new URL(request.url!, "http://fixture");
      return { type: "subscribe", subscriptionId: url.searchParams.get("subscription")!, channels: ["allowed"], cursor: url.searchParams.get("cursor")! };
    }, onSubscribe: () => { validated++; },
  });
  try {
    const c = await h.connect("ignored", { protocols: ["fixture.bearer.fixture", "fixture.v1"], authorization: false, query: `?subscription=${id}&cursor=${h.first.token}` });
    await c.until(() => c.frames.some((f) => f.type === "replay"));
    assert.equal(c.socket.protocol, "fixture.v1"); assert.equal(initialCalls, 1); assert.equal(validated, 1);
    assert.deepEqual(c.frames.map((f) => f.type), ["ready", "subscribed", "event", "replay"]);
    assert.equal(c.frames.some((f) => JSON.stringify(f).includes("fixture.bearer")), false);
  } finally { await h.close(); }
});

test("missing, false, throwing or unoffered protocol selection never reflects a credential", { timeout: 5000 }, async () => {
  const selectors: Array<GatewaySocketHooks["selectProtocol"]> = [undefined, () => false, () => "not-offered", () => { throw new Error("fixture selector failed"); }];
  for (const selectProtocol of selectors) {
    const h = await harness([], { selectProtocol });
    try { await assert.rejects(h.connect("fixture", { protocols: ["fixture.bearer.fixture"] }), /subprotocol/); }
    finally { await h.close(); }
  }
});

test("initial subscription uses the same channel, frame and cursor guards as client subscribe", { timeout: 5000 }, async () => {
  for (const mode of ["channel", "shape", "scope"] as const) {
    const h = await harness([], { initialSubscribe: async () => ({ type: "subscribe", subscriptionId: randomUUID(), channels: mode === "channel" ? ["forbidden"] : mode === "shape" ? [] : ["allowed"], cursor: h.first.token }) });
    if (mode === "scope") h.snapshots.get(h.first.token)!.scope = { principalId: "other", owner: "o", sessionId: "s" };
    try {
      const c = await h.connect(); await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1008);
      assert.ok(c.frames.some((f) => f.type === "error" && f.code === (mode === "channel" ? "CHANNEL_FORBIDDEN" : mode === "shape" ? "INVALID_FRAME" : "CURSOR_SCOPE_MISMATCH")));
      assert.equal(c.frames.some((f) => f.type === "subscribed" || f.type === "event"), false);
    } finally { await h.close(); }
  }
});

test("initial subscription hooks run only after authentication and cannot submit event mutations", { timeout: 5000 }, async () => {
  let calls = 0;
  const h = await harness([], { initialSubscribe: () => { calls++; return undefined; } });
  try { await assert.rejects(h.connect("invalid"), /401/); assert.equal(calls, 0); }
  finally { await h.close(); }
  for (const initialSubscribe of [() => { throw new Error("fixture app denial"); }, () => ({ type: "event", action: "issus.post", channel: "allowed", transactionKey: randomUUID(), payload: {} } as never)]) {
    const fixture = await harness([], { initialSubscribe });
    try { const c = await fixture.connect(); await c.until(() => c.closes.length > 0); assert.equal(c.closes[0], 1008); assert.equal(fixture.reads(), 0); }
    finally { await fixture.close(); }
  }
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
    const c = await h.connect(); c.subscribe(); await c.until(() => c.frames.filter((f) => f.type === "event").length === 2);
    const received = c.frames.filter((f) => f.type === "event");
    assert.deepEqual(c.frames.filter((f) => f.type !== "ready").map((f) => f.type === "event" ? f.event.sequence : f.type), ["subscribed", "1", "replay", "2"]);
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

test("session revocation still records the accepted subscription's disconnect", { timeout: 5000 }, async () => {
  const closed: string[] = [];
  const h = await harness([], { onDisconnect: (id, p, reason) => { assert.deepEqual(p, principal); closed.push(id); assert.equal(reason, "UNAUTHENTICATED"); } });
  try {
    const c = await h.connect(); const id = c.subscribe(); await c.until(() => c.frames.some((f) => f.type === "replay"));
    h.revoke(); c.socket.send(JSON.stringify({ type: "receipt", subscriptionId: id, deliveryIds: [randomUUID()], attempts: [0], cursor: h.first.token }));
    await c.until(() => c.closes.length > 0 && closed.length === 1); assert.equal(c.closes[0], 1008); assert.deepEqual(closed, [id]);
  } finally { await h.close(); }
});

test("replay buffer overflow closes only the slow socket with 1013 and retains facts for replay", { timeout: 5000 }, async () => {
  const closed: string[] = [];
  const h = await harness([], { onDisconnect: (_id, _p, reason) => { closed.push(reason); } }); h.env.websocketMailboxMax = 1;
  try {
    h.setBoundary(() => { for (let i = 1; i <= 2; i++) { const next = event(i); h.rows.push(next); h.hub.publish(next); } });
    const c = await h.connect(); c.subscribe(); await c.until(() => c.closes.length > 0 && closed.length === 1);
    assert.equal(c.closes[0], 1013); assert.equal(h.rows.length, 2); assert.deepEqual(h.snapshots.get(h.first.token)!.positions, {});
    assert.deepEqual(closed, ["slow consumer"]);
    h.env.websocketMailboxMax = 256;
    const healthy = await h.connect(); healthy.subscribe(); await healthy.until(() => healthy.frames.filter((f) => f.type === "event").length === 2);
    assert.equal(healthy.frames.filter((f) => f.type === "event").length, 2);
  } finally { await h.close(); }
});
