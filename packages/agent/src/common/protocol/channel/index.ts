import { eventProvenance, type EventEnvelope, type IngressCommand } from "../event/index.js";

export interface ChannelSubscribeFrame {
  type: "subscribe";
  subscriptionId: string;
  channels: string[];
  cursor?: string;
}
export interface ChannelReceiptFrame {
  type: "receipt";
  subscriptionId: string;
  deliveryIds: string[];
  attempts: number[];
  cursor: string;
}
export type ChannelClientFrame = ChannelSubscribeFrame | ChannelReceiptFrame | ({ type: "event" } & IngressCommand);
/** Existing event wire frame; bootstrap and replay share the same envelope shape. */
export interface ChannelEventFrame { type: "event"; event: EventEnvelope; cursor: string }
export type ChannelServerFrame =
  | { type: "ready"; channels: string[] }
  | { type: "subscribed"; subscriptionId: string; channels: string[]; cursor: string; replayComplete: boolean }
  | { type: "replay"; cursor: string; replayComplete: boolean }
  | ChannelEventFrame
  | { type: "error"; code: string; message: string; retryable: boolean };

/** Cursor and subscription identifiers are opaque UUID references. */
export function parseChannelCursor(token: string | undefined): string | undefined {
  return token && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : undefined;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function channels(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 32 && value.every((c) => typeof c === "string" && c.length > 0 && c.length <= 128); }
function uuid(value: unknown): value is string { return typeof value === "string" && !!parseChannelCursor(value); }
function only(frame: Record<string, unknown>, keys: string[]): boolean { return Object.keys(frame).every((key) => keys.includes(key)); }

/** Rejects server-only provenance before an app callback or queue is reached. */
export function parseChannelClientFrame(value: unknown): ChannelClientFrame | undefined {
  if (!record(value)) return undefined;
  const frame = value;
  if (frame.type === "subscribe") {
    if (!only(frame, ["type", "subscriptionId", "channels", "cursor"]) || !uuid(frame.subscriptionId) || !channels(frame.channels) || !frame.channels.length || (frame.cursor !== undefined && !uuid(frame.cursor))) return undefined;
    return { type: "subscribe", subscriptionId: frame.subscriptionId, channels: frame.channels, ...(frame.cursor === undefined ? {} : { cursor: frame.cursor as string }) };
  }
  if (frame.type === "receipt") {
    if (!only(frame, ["type", "subscriptionId", "deliveryIds", "attempts", "cursor"]) || !uuid(frame.subscriptionId) || !uuid(frame.cursor) || !Array.isArray(frame.deliveryIds) || !frame.deliveryIds.length || frame.deliveryIds.length > 100 || !frame.deliveryIds.every(uuid) || !Array.isArray(frame.attempts) || frame.attempts.length !== frame.deliveryIds.length || !frame.attempts.every((n) => Number.isSafeInteger(n) && n >= 0)) return undefined;
    return { type: "receipt", subscriptionId: frame.subscriptionId, deliveryIds: frame.deliveryIds, attempts: frame.attempts, cursor: frame.cursor };
  }
  if (!only(frame, ["type", "action", "transactionKey", "channel", "audience", "replyChannel", "sessionId", "runId", "turnId", "correlationId", "payload"])) return undefined;
  if (frame.type !== "event" || typeof frame.action !== "string" || !frame.action || !record(frame.payload) || typeof frame.channel !== "string" || !frame.channel || typeof frame.transactionKey !== "string" || !frame.transactionKey) return undefined;
  if (frame.audience !== undefined && frame.audience !== "client" && frame.audience !== "worker") return undefined;
  for (const key of ["replyChannel", "sessionId", "runId", "turnId", "correlationId"]) if (frame[key] !== undefined && typeof frame[key] !== "string") return undefined;
  return { type: "event", action: frame.action, payload: { ...frame.payload }, transactionKey: frame.transactionKey, channel: frame.channel,
    ...(frame.audience === undefined ? {} : { audience: frame.audience as "client" | "worker" }),
    ...(typeof frame.replyChannel === "string" ? { replyChannel: frame.replyChannel } : {}),
    ...(typeof frame.sessionId === "string" ? { sessionId: frame.sessionId } : {}),
    ...(typeof frame.runId === "string" ? { runId: frame.runId } : {}),
    ...(typeof frame.turnId === "string" ? { turnId: frame.turnId } : {}),
    ...(typeof frame.correlationId === "string" ? { correlationId: frame.correlationId } : {}),
  };
}

/** Parses all transport frames while preserving envelope audience/provenance. */
export function parseChannelServerFrame(value: unknown): ChannelServerFrame | undefined {
  if (!record(value)) return undefined;
  const frame = value;
  if (frame.type === "ready" && channels(frame.channels)) return { type: "ready", channels: frame.channels };
  if (frame.type === "error" && typeof frame.code === "string" && typeof frame.message === "string" && typeof frame.retryable === "boolean") return { type: "error", code: frame.code, message: frame.message, retryable: frame.retryable };
  if (frame.type === "subscribed" && uuid(frame.subscriptionId) && channels(frame.channels) && uuid(frame.cursor) && typeof frame.replayComplete === "boolean") return { type: "subscribed", subscriptionId: frame.subscriptionId, channels: frame.channels, cursor: frame.cursor, replayComplete: frame.replayComplete };
  if (frame.type === "replay" && uuid(frame.cursor) && typeof frame.replayComplete === "boolean") return { type: "replay", cursor: frame.cursor, replayComplete: frame.replayComplete };
  if (frame.type !== "event" || !uuid(frame.cursor) || !record(frame.event)) return undefined;
  const event = frame.event;
  if (typeof event.eventId !== "string" || typeof event.streamId !== "string" || typeof event.sequence !== "string" || !/^[1-9][0-9]*$/.test(event.sequence) || typeof event.channel !== "string" || typeof event.transactionKey !== "string" || typeof event.action !== "string" || typeof event.correlationId !== "string" || typeof event.createdAt !== "string" || event.eventVersion !== 1 || !record(event.payload)) return undefined;
  if (event.kind !== "command" && event.kind !== "fact" && event.kind !== "result" && event.kind !== "progress" && event.kind !== "failure" && event.kind !== "control") return undefined;
  if (event.source !== "client" && event.source !== "server" && event.source !== "worker" && event.source !== "scheduler") return undefined;
  if (event.audience !== undefined && event.audience !== "client" && event.audience !== "worker") return undefined;
  for (const key of ["replyChannel", "sessionId", "runId", "turnId", "causationEventId"]) if (event[key] !== undefined && typeof event[key] !== "string") return undefined;
  let provenance;
  try { provenance = eventProvenance(event); } catch { return undefined; }
  return { type: "event", cursor: frame.cursor, event: {
    eventId: event.eventId, streamId: event.streamId, sequence: event.sequence, action: event.action,
    transactionKey: event.transactionKey, eventVersion: 1, kind: event.kind,
    channel: event.channel, correlationId: event.correlationId, source: event.source,
    createdAt: event.createdAt, payload: { ...event.payload }, ...provenance,
    ...(event.audience === undefined ? {} : { audience: event.audience }),
    ...(typeof event.replyChannel === "string" ? { replyChannel: event.replyChannel } : {}),
    ...(typeof event.sessionId === "string" ? { sessionId: event.sessionId } : {}),
    ...(typeof event.runId === "string" ? { runId: event.runId } : {}),
    ...(typeof event.turnId === "string" ? { turnId: event.turnId } : {}),
    ...(typeof event.causationEventId === "string" ? { causationEventId: event.causationEventId } : {}),
  } };
}
