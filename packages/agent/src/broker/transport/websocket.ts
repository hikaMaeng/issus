import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { createIngressEvent, parseChannelClientFrame, type ChannelReceiptFrame, type ChannelSubscribeFrame, type ChannelServerFrame, type IngressCommand, type EventEnvelope } from "../../common/index.js";
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
/** App-owned session, subscription and receipt policy. Missing ingress policy denies writes. */
export interface GatewaySocketPolicy {
  verifyUpgrade(request: IncomingMessage): Promise<GatewaySocketContext | null>;
  authorizeChannel(channel: string, principal: Principal): boolean | Promise<boolean>;
  revalidate?(context: GatewaySocketContext): Promise<boolean>;
  guardIngress?(frame: IngressCommand, context: GatewaySocketContext): IngressCommand | null;
  readyChannels?(principal: Principal): readonly string[];
  onSubscribe?(frame: ChannelSubscribeFrame, principal: Principal): void | Promise<void>;
  onReceipt?(frame: ChannelReceiptFrame, principal: Principal): void | Promise<void>;
}
export interface GatewayWebSocketTransport { closeClientsAndRemoveSubscriptions(): Promise<void> }

/** Authenticated replay-buffer-live handoff; each outgoing event gets a new snapshot. */
export function attachWebSocketTransport(server: Server, env: AgentEnv, queue: EventQueueTransport, hub: EventStreamHub, eventStore: EventStore, metrics: MetricsRegistry, policy: GatewaySocketPolicy, ingressQueueFor?: (action: string) => string): GatewayWebSocketTransport {
  const contexts = new WeakMap<IncomingMessage, GatewaySocketContext>();
  const websocket = new WebSocketServer({ server, path: "/ws", maxPayload: 65_536,
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
    const authorized = async (selected: readonly string[]): Promise<boolean> => {
      const decisions = await Promise.all(selected.map((channel) => policy.authorizeChannel(channel, context.principal)));
      return decisions.every(Boolean);
    };
    const validSession = async (): Promise<boolean> => !policy.revalidate || await policy.revalidate(context);
    const mailbox = new ConnectionMailbox(env.websocketMailboxMax, (event, done) => {
      if (closed || closing || socket.readyState !== WebSocket.OPEN) { done(); return; }
      if (socket.bufferedAmount >= env.websocketBufferedBytes) { slow(); done(); return; }
      if (!cursorToken || BigInt(event.sequence) <= BigInt(positions[event.streamId] ?? "0")) { done(); return; }
      const nextPositions = { ...positions, [event.streamId]: event.sequence };
      void eventStore.snapshotChannelCursor(channels, nextPositions, scope).then((snapshot) => {
        if (closed || closing) { done(); return; }
        // This only changes connection memory. A previous UUID is never updated.
        positions = nextPositions; cursorToken = snapshot.token;
        sendFrame({ type: "event", event, cursor: snapshot.token }, (error) => {
          if (error) { metrics.increment("websocketSendFailures"); socket.close(1011, "websocket send failed"); }
          else metrics.increment("websocketDelivered");
          done();
        });
      }).catch(() => { fail("CURSOR_PERSISTENCE_FAILED", "커서를 저장하지 못했습니다", 1011, true); done(); });
    }, () => slow(), (depth) => {
      metrics.increment("websocketMailboxQueued", depth - mailboxDepth); mailboxDepth = depth;
    });

    let chain = (async () => {
      const ready = [...new Set(policy.readyChannels?.(context.principal) ?? [])];
      if (!await authorized(ready)) { fail("CHANNEL_FORBIDDEN", "채널을 구독할 권한이 없습니다"); return; }
      sendFrame({ type: "ready", channels: ready });
    })().catch(() => fail("UNAUTHENTICATED", "인증이 필요합니다"));

    const handle = async (raw: unknown): Promise<void> => {
      if (closed || closing) return;
      if (!await validSession()) { fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다"); return; }
      let frame;
      try { frame = parseChannelClientFrame(JSON.parse(String(raw))); } catch { /* handled below */ }
      if (!frame) { fail("INVALID_FRAME", "프레임 형식이 올바르지 않습니다"); return; }
      if (frame.type === "subscribe") {
        if (!mailbox.isIdle()) { fail("SUBSCRIPTION_BUSY", "전달 중에는 구독을 변경할 수 없습니다"); return; }
        const selected = [...new Set(frame.channels)].sort();
        if (!await authorized(selected)) { fail("CHANNEL_FORBIDDEN", "채널을 구독할 권한이 없습니다"); return; }
        await policy.onSubscribe?.(frame, context.principal);
        unsubscribe(); unsubscribe = () => undefined;
        channels = selected; subscriptionId = frame.subscriptionId;
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
        sendFrame({ type: "subscribed", subscriptionId, channels, cursor: cursorToken, replayComplete: replay.complete }, (error) => {
          if (error || closed || closing) { stopLive(); return; }
          replay.events.forEach((event) => mailbox.enqueue(event));
          if (replay.complete) {
            live.drain().filter((event) => BigInt(event.sequence) > BigInt(highWater[event.streamId] ?? "0"))
              .sort((a, b) => a.streamId.localeCompare(b.streamId) || (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0))
              .forEach((event) => mailbox.enqueue(event));
            replaying = false;
          }
          mailbox.onIdle(() => {
            if (!closed && !closing && cursorToken) sendFrame({ type: "replay", cursor: cursorToken, replayComplete: replay.complete });
          });
        });
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
    socket.on("message", (raw) => {
      chain = chain.then(() => handle(raw)).catch((error) => {
        if (error instanceof CursorError) fail(error.code, error.message);
        else fail("FRAME_REJECTED", "프레임을 처리하지 못했습니다");
      });
    });
    const revalidation = setInterval(() => {
      void (async () => {
        if (!await validSession() || !await authorized(channels)) fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다");
      })().catch(() => fail("UNAUTHENTICATED", "세션이 만료되었거나 철회되었습니다"));
    }, 15_000);
    socket.on("close", () => {
      if (closed) return;
      closed = true; closing = true; clearInterval(revalidation); unsubscribe(); mailbox.dispose();
      metrics.increment("websocketConnections", -1);
    });
    socket.on("error", () => socket.close(1011, "websocket error"));
  });
  return {
    async closeClientsAndRemoveSubscriptions(): Promise<void> {
      const serverClosed = new Promise<void>((resolve) => websocket.close(() => resolve()));
      await Promise.all([...websocket.clients].map((client) => new Promise<void>((resolve) => {
        if (client.readyState === WebSocket.CLOSED) { resolve(); return; }
        client.once("close", () => resolve()); client.close(1001, "gateway shutdown");
      })));
      await serverClosed;
    },
  };
}
