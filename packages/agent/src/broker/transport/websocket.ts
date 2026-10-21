import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { createIngressEvent, parseChannelClientFrame, parseChannelServerFrame, type ChannelEventFrame, type ChannelReceiptFrame, type ChannelSubscribeFrame, type ChannelServerFrame, type IngressCommand, type EventEnvelope } from "../../common/index.js";
import type { Principal } from "../auth/index.js";
import type { AgentEnv } from "../env.js";
import type { EventQueueTransport } from "../queue/transport.js";
import type { EventStreamHub } from "../stream/hub.js";
import type { EventStore } from "../event-store/store.js";
import { CursorError, cursorScope } from "../event-store/cursor/index.js";
import { ConnectionMailbox } from "../stream/mailbox/index.js";
import { ReplayBuffer } from "../stream/replay-buffer/index.js";
import type { MetricsRegistry } from "../metrics/registry.js";

export interface GatewaySocketContext { principal: Principal; token?: string }
/** App-authorized canonical history. A supplied cursor is replaced by a scoped snapshot. */
export type GatewayBootstrapFrame = Omit<ChannelEventFrame, "cursor"> & { cursor?: string };
/** No return preserves existing subscription callbacks and the five existing wire types. */
export type GatewaySubscribeResult = void | readonly GatewayBootstrapFrame[];
/** App lifecycle hooks. A successful write is transport evidence, never TYPE:ACK. */
export interface GatewaySocketHooks {
  /** Builds a per-principal wire payload; canonical coordinates and stored facts stay unchanged. */
  projectEvent?(event: EventEnvelope, principal: Principal): Promise<EventEnvelope>;
  /** Validates the subscription and optionally returns authorized history before replay. */
  onSubscribe?(frame: ChannelSubscribeFrame, principal: Principal): GatewaySubscribeResult | Promise<GatewaySubscribeResult>;
  /** Handles authenticated client receipts independently of send-success. */
  onReceipt?(frame: ChannelReceiptFrame, principal: Principal): void | Promise<void>;
  /** Persists an accepted subscription's close; shutdown awaits completion. */
  onDisconnect?(subscriptionId: string, principal: Principal, reason: string): void | Promise<void>;
  /** Observes successful event writes; the app validates delivery identities. */
  onSendSuccess?(subscriptionId: string, principal: Principal, frame: ChannelServerFrame): void | Promise<void>;
  /** Watches app-local session revocation; transport invokes the returned cleanup once. */
  watchRevocation?(principal: Principal, revoke: () => void): () => void;
  /** Selects an offered public protocol. Missing policy never reflects an offered credential. */
  selectProtocol?(protocols: ReadonlySet<string>, request: IncomingMessage): string | false;
  /** Supplies an app-authorized initial subscribe frame for receive-only clients. */
  initialSubscribe?(request: IncomingMessage, principal: Principal): ChannelSubscribeFrame | undefined | Promise<ChannelSubscribeFrame | undefined>;
}
/** App-owned session, subscription and receipt policy. Missing ingress policy denies writes. */
export interface GatewaySocketPolicy extends GatewaySocketHooks {
  verifyUpgrade(request: IncomingMessage): Promise<GatewaySocketContext | null>;
  authorizeChannel(channel: string, principal: Principal): boolean | Promise<boolean>;
  revalidate?(context: GatewaySocketContext): Promise<boolean>;
  guardIngress?(frame: IngressCommand, context: GatewaySocketContext): IngressCommand | null;
  readyChannels?(principal: Principal): readonly string[];
}
export interface GatewayWebSocketTransport { closeClientsAndRemoveSubscriptions(): Promise<void> }

/** Authenticated replay-buffer-live handoff; each outgoing event gets a new snapshot. */
export function attachWebSocketTransport(server: Server, env: AgentEnv, queue: EventQueueTransport, hub: EventStreamHub, eventStore: EventStore, metrics: MetricsRegistry, policy: GatewaySocketPolicy, ingressQueueFor?: (action: string) => string): GatewayWebSocketTransport {
  const contexts = new WeakMap<IncomingMessage, GatewaySocketContext>();
  const disconnects = new Set<Promise<void>>();
  const websocket = new WebSocketServer({ server, path: "/ws", maxPayload: 65_536,
    handleProtocols: (protocols, request) => {
      try {
        const selected = policy.selectProtocol?.(new Set(protocols), request);
        return typeof selected === "string" && protocols.has(selected) ? selected : false;
      } catch { metrics.increment("websocketHookFailures"); return false; }
    },
    verifyClient: (info: { req: IncomingMessage }, done: (ok: boolean, code?: number, message?: string) => void) => {
      policy.verifyUpgrade(info.req).then((context) => {
        if (!context) { done(false, 401, "unauthorized"); return; }
        contexts.set(info.req, context); done(true);
      }).catch(() => done(false, 401, "unauthorized"));
    },
  });
  websocket.on("connection", (socket, request: IncomingMessage) => {
    const context = contexts.get(request)!;
    const scope = cursorScope(context.principal);
    let positions: Record<string, string> = {};
    let cursorToken: string | undefined;
    let channels: string[] = [];
    let subscriptionId: string | undefined;
    let closed = false;
    let closing = false;
    let unsubscribe: () => void = () => undefined;
    let mailboxDepth = 0;
    let pendingSend: Promise<void> = Promise.resolve();
    let stopRevocation: () => void = () => undefined;
    const removeRevocation = (): void => {
      const stop = stopRevocation; stopRevocation = () => undefined;
      try { stop(); } catch { metrics.increment("websocketHookFailures"); }
    };
    const disconnect = async (id: string | undefined, reason: string): Promise<void> => {
      if (id) await policy.onDisconnect?.(id, context.principal, reason);
    };
    metrics.increment("websocketConnections");
    const sendFrame = (frame: ChannelServerFrame, callback?: (error?: Error) => void): void => {
      if (socket.readyState !== WebSocket.OPEN) { callback?.(new Error("socket closed")); return; }
      socket.send(JSON.stringify(frame), callback);
    };
    const fail = (code: string, message: string, closeCode = 1008, retryable = false): void => {
      if (closed || closing) return;
      closing = true; unsubscribe();
      sendFrame({ type: "error", code, message, retryable }, () => socket.close(closeCode, code));
    };
    const slow = (replay = false): void => {
      if (closed || closing) return;
      closing = true; unsubscribe();
      metrics.increment("websocketSlowConsumerClosed");
      if (replay) metrics.increment("websocketReplayOverflow");
      socket.close(1013, "slow consumer");
    };
    const recordSendSuccess = async (id: string, packet: ChannelServerFrame): Promise<void> => {
      try { await policy.onSendSuccess?.(id, context.principal, packet); }
      catch { metrics.increment("websocketHookFailures"); fail("SEND_SUCCESS_HOOK_FAILED", "송신 결과를 기록하지 못했습니다", 1011, true); }
    };
    const authorized = async (selected: readonly string[]): Promise<boolean> => {
      const decisions = await Promise.all(selected.map((channel) => policy.authorizeChannel(channel, context.principal)));
      return decisions.every(Boolean);
    };
    const validSession = async (): Promise<boolean> => !policy.revalidate || await policy.revalidate(context);
    const project = async (event: EventEnvelope): Promise<EventEnvelope | undefined> => {
      if (!policy.projectEvent) return event;
      try {
        const projected = await policy.projectEvent(structuredClone(event), context.principal);
        if (!projected || Object.entries(event).some(([key, value]) => key !== "payload" && projected[key as keyof EventEnvelope] !== value)
          || Object.keys(projected).some((key) => !(key in event))
          || !projected.payload || typeof projected.payload !== "object" || Array.isArray(projected.payload)) throw new Error("invalid event projection");
        return { ...event, payload: structuredClone(projected.payload) };
      } catch {
        metrics.increment("websocketHookFailures");
        fail("EVENT_PROJECTION_FAILED", "전달 프레임을 구성하지 못했습니다", 1011, true);
        return undefined;
      }
    };
    const mailbox = new ConnectionMailbox(env.websocketMailboxMax, (event, done) => {
      if (closed || closing || socket.readyState !== WebSocket.OPEN) { done(); return; }
      if (socket.bufferedAmount >= env.websocketBufferedBytes) { slow(); done(); return; }
      if (!cursorToken || BigInt(event.sequence) <= BigInt(positions[event.streamId] ?? "0")) { done(); return; }
      const nextPositions = { ...positions, [event.streamId]: event.sequence };
      void eventStore.snapshotChannelCursor(channels, nextPositions, scope).then(async (snapshot) => {
        if (closed || closing) { done(); return; }
        const projected = await project(event);
        if (!projected || closed || closing) { done(); return; }
        // This only changes connection memory. A previous UUID is never updated.
        positions = nextPositions; cursorToken = snapshot.token;
        const packet = { type: "event", event: projected, cursor: snapshot.token } as const;
        const recipient = subscriptionId!;
        sendFrame(packet, (error) => {
          if (error) { metrics.increment("websocketSendFailures"); socket.close(1011, "websocket send failed"); }
          else {
            metrics.increment("websocketDelivered");
            pendingSend = recordSendSuccess(recipient, packet).finally(done);
            return;
          }
          done();
        });
      }).catch(() => { fail("CURSOR_PERSISTENCE_FAILED", "커서를 저장하지 못했습니다", 1011, true); done(); });
    }, () => slow(), (depth) => {
      metrics.increment("websocketMailboxQueued", depth - mailboxDepth); mailboxDepth = depth;
    });

    let chain = (async () => {
      const ready = [...new Set(policy.readyChannels?.(context.principal) ?? [])];
      if (!await authorized(ready)) { fail("CHANNEL_FORBIDDEN", "채널을 구독할 권한이 없습니다"); return; }
      if (closed || closing) return;
      await new Promise<void>((resolve, reject) => sendFrame({ type: "ready", channels: ready }, (error) => error ? reject(error) : resolve()));
    })().catch(() => fail("UNAUTHENTICATED", "인증이 필요합니다"));

    const handle = async (raw: unknown): Promise<void> => {
      if (closed || closing) return;
      if (!await validSession()) { fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다"); return; }
      let frame;
      try { frame = parseChannelClientFrame(JSON.parse(String(raw))); } catch { /* handled below */ }
      if (!frame) { fail("INVALID_FRAME", "프레임 형식이 올바르지 않습니다"); return; }
      if (frame.type === "subscribe") {
        if (!mailbox.isIdle()) { fail("SUBSCRIPTION_BUSY", "전달 중에는 구독을 변경할 수 없습니다"); return; }
        // Quiesce the previous subscription before asynchronous app validation.
        unsubscribe(); unsubscribe = () => undefined;
        const selected = [...new Set(frame.channels)].sort();
        if (!await authorized(selected)) { fail("CHANNEL_FORBIDDEN", "채널을 구독할 권한이 없습니다"); return; }
        const bootstrap = await policy.onSubscribe?.(frame, context.principal);
        if (subscriptionId && subscriptionId !== frame.subscriptionId) {
          const previous = subscriptionId; subscriptionId = frame.subscriptionId;
          try { await disconnect(previous, "subscription replaced"); }
          catch { metrics.increment("websocketHookFailures"); throw new Error("disconnect hook failed"); }
        }
        channels = selected; subscriptionId = frame.subscriptionId;
        if (closed || closing) return;
        const live = new ReplayBuffer(env.websocketMailboxMax);
        let replaying = true;
        // Install the buffer before either the tail seed or replay high-water query.
        const stopLive = hub.subscribe(channels, (event) => {
          if (closed || closing) return;
          if (!replaying) { mailbox.enqueue(event); return; }
          const outcome = live.push(event);
          if (outcome === "dropped") metrics.increment("websocketProgressDropped");
          if (outcome === "overflow") slow(true);
        });
        unsubscribe = stopLive;
        await hub.prepareChannels();
        const cursor = await eventStore.openChannelCursor(channels, frame.cursor, scope);
        if (closed || closing) return;
        cursorToken = cursor.token; positions = cursor.positions;
        const highWater = await eventStore.channelHighWater(channels);
        const replay = await eventStore.replayChannels(channels, positions, highWater, env.websocketReplayMax);
        if (closed || closing) return;
        if (!replay.complete) { stopLive(); unsubscribe = () => undefined; }
        const write = (packet: ChannelServerFrame): Promise<void> => new Promise((resolve, reject) => {
          sendFrame(packet, (error) => {
            if (!error) { resolve(); return; }
            metrics.increment("websocketSendFailures"); closing = true; unsubscribe();
            socket.close(1011, "websocket send failed"); reject(error);
          });
        });
        await write({ type: "subscribed", subscriptionId, channels, cursor: cursorToken, replayComplete: replay.complete });
        if (closed || closing) return;
        if (bootstrap !== undefined && !Array.isArray(bootstrap)) throw new Error("invalid bootstrap frames");
        for (const proposed of bootstrap ?? []) {
          if (closed || closing) return;
          if (socket.bufferedAmount >= env.websocketBufferedBytes) { slow(); return; }
          let snapshot;
          try { snapshot = await eventStore.snapshotChannelCursor(channels, positions, scope); }
          catch { fail("CURSOR_PERSISTENCE_FAILED", "커서를 저장하지 못했습니다", 1011, true); return; }
          if (closed || closing) return;
          const parsed = parseChannelServerFrame({ ...proposed, cursor: snapshot.token });
          if (!parsed || parsed.type !== "event" || parsed.event.audience === "worker") throw new Error("invalid bootstrap event");
          const projected = await project(parsed.event);
          if (!projected || closed || closing) return;
          const packet = { ...parsed, event: projected };
          cursorToken = snapshot.token;
          await write(packet);
          metrics.increment("websocketDelivered");
          await recordSendSuccess(subscriptionId, packet);
          if (closed || closing) return;
        }
        replay.events.forEach((event) => mailbox.enqueue(event));
        await new Promise<void>((resolve) => {
          const finish = (): void => { socket.off("close", finish); resolve(); };
          socket.once("close", finish); mailbox.onIdle(finish);
        });
        if (closed || closing) return;
        await write({ type: "replay", cursor: cursorToken, replayComplete: replay.complete });
        if (closed || closing) return;
        if (replay.complete) {
          live.drain().filter((event) => BigInt(event.sequence) > BigInt(highWater[event.streamId] ?? "0"))
            .sort((a, b) => a.streamId.localeCompare(b.streamId) || (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0))
            .forEach((event) => mailbox.enqueue(event));
          replaying = false;
        }
        return;
      }
      if (frame.type === "receipt") {
        if (frame.subscriptionId !== subscriptionId || !policy.onReceipt || !await authorized(channels)) { fail("RECEIPT_FORBIDDEN", "수신 확인 권한이 없습니다"); return; }
        await eventStore.openChannelCursor(channels, frame.cursor, scope);
        await policy.onReceipt(frame, context.principal);
        return;
      }
      const { type: _type, ...proposed } = frame;
      const allowed = policy.guardIngress?.(proposed, context);
      if (!allowed) { fail("INGRESS_FORBIDDEN", "이 연결에서는 게시할 수 없습니다"); return; }
      const event = createIngressEvent(allowed);
      await queue.send(ingressQueueFor?.(event.action) ?? env.queue, event);
    };
    const rejectFrame = (error: unknown): void => {
      if (error instanceof CursorError) fail(error.code, error.message);
      else fail("FRAME_REJECTED", "프레임을 처리하지 못했습니다");
    };
    chain = chain.then(async () => {
      if (closed || closing) return;
      const initial = await policy.initialSubscribe?.(request, context.principal);
      if (initial === undefined || closed || closing) return;
      if (!initial || initial.type !== "subscribe") throw new Error("invalid initial subscription");
      await handle(JSON.stringify(initial));
    }).catch(rejectFrame);
    socket.on("message", (raw) => {
      chain = chain.then(() => handle(raw)).catch(rejectFrame);
    });
    const revalidation = setInterval(() => {
      void (async () => {
        if (!await validSession() || !await authorized(channels)) fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다");
      })().catch(() => fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다"));
    }, 15_000);
    socket.on("close", (code, reason) => {
      if (closed) return;
      closed = true; closing = true; clearInterval(revalidation); unsubscribe(); mailbox.dispose();
      removeRevocation();
      metrics.increment("websocketConnections", -1);
      const pending = chain.then(() => pendingSend).then(() => disconnect(subscriptionId, reason.toString() || `websocket close ${code}`))
        .catch(() => { metrics.increment("websocketHookFailures"); });
      disconnects.add(pending);
      void pending.finally(() => disconnects.delete(pending));
    });
    socket.on("error", () => socket.close(1011, "websocket error"));
    try {
      const stop = policy.watchRevocation?.(context.principal, () => fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다"));
      if (stop) { stopRevocation = stop; if (closed || closing) removeRevocation(); }
    } catch { metrics.increment("websocketHookFailures"); fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다"); }
  });
  return {
    async closeClientsAndRemoveSubscriptions(): Promise<void> {
      const serverClosed = new Promise<void>((resolve) => websocket.close(() => resolve()));
      await Promise.all([...websocket.clients].map((client) => new Promise<void>((resolve) => {
        if (client.readyState === WebSocket.CLOSED) { resolve(); return; }
        client.once("close", () => resolve()); client.close(1001, "gateway shutdown");
      })));
      await serverClosed;
      await Promise.all([...disconnects]);
    },
  };
}
