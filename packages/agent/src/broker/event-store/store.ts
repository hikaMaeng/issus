import type { Pool, PoolClient } from "pg";
import { CursorStore, type CursorScope } from "./cursor/index.js";
import type { EventDraft, EventEnvelope } from "../../common/index.js";
import { eventProvenance } from "../../common/index.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import { EVENT_LOG_NOTIFY_CHANNEL } from "./notify.js";

const COLUMNS = "event_id,stream_id,sequence,action,transaction_key,event_version,kind,channel,reply_channel,session_id,run_id,turn_id,causation_event_id,correlation_id,source,audience,payload,created_at,source_event_id,source_stream_id,source_sequence";
/** Client-facing reads never see worker-to-worker traffic. Applied in SQL, not after the fact. */
const CLIENT_ONLY = "audience <> 'worker'";
/**
 * The enqueue loop reacts to what happened, never to the record of a reaction
 * being handed out.
 *
 * A consumer writes a `command` row for every message it picks up, including
 * the ones it just sent itself. Those rows carry the same action as the
 * fact that caused them, so a loop that read them would answer its own
 * dispatch and do it again, for ever. Facts are what reactors record; commands
 * are bookkeeping.
 */
const FACTS_ONLY = "kind <> 'command'";
const QUALIFIED_COLUMNS = COLUMNS.split(",").map((column) => `event_store.${column}`).join(",");

type StoredEventRow = {
  event_id: string; stream_id: string; sequence: string | number; action: string; transaction_key: string;
  kind: EventEnvelope["kind"]; channel: string; reply_channel: string | null; correlation_id: string;
  causation_event_id: string | null; source: EventEnvelope["source"]; audience: "client" | "worker" | null; event_version: 1;
  session_id: string | null; run_id: string | null; turn_id: string | null;
  payload: Record<string, unknown>; created_at: string | Date;
  source_event_id?: string | null; source_stream_id?: string | null; source_sequence?: string | null;
};

function fromRow(row: StoredEventRow): EventEnvelope {
  return {
    eventId: row.event_id, streamId: row.stream_id, sequence: String(row.sequence), action: row.action,
    transactionKey: row.transaction_key, kind: row.kind, channel: row.channel,
    ...(row.reply_channel === null ? {} : { replyChannel: row.reply_channel }),
    ...(row.session_id === null ? {} : { sessionId: row.session_id }),
    ...(row.run_id === null ? {} : { runId: row.run_id }),
    ...(row.turn_id === null ? {} : { turnId: row.turn_id }),
    ...(row.causation_event_id === null ? {} : { causationEventId: row.causation_event_id }),
    ...(row.source_event_id == null ? {} : { sourceEventId: row.source_event_id, sourceStreamId: row.source_stream_id!, sourceSequence: row.source_sequence! }),
    correlationId: row.correlation_id, source: row.source, eventVersion: 1,
    audience: row.audience ?? "client",
    createdAt: new Date(row.created_at).toISOString(), payload: row.payload,
  };
}

export class EventStore {
  private readonly cursors: CursorStore;
  constructor(private readonly pool: Pool, private readonly metrics?: MetricsRegistry, private readonly options: { retentionDays?: number | null; cursorTtlDays?: number } = {}) {
    this.cursors = new CursorStore(pool, options.cursorTtlDays ?? 30);
  }

  async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('agent_event_schema:' || current_schema(), 0))");
    await client.query(`CREATE TABLE IF NOT EXISTS event_store (
      event_id text PRIMARY KEY, stream_id text NOT NULL, sequence bigint NOT NULL,
      action text NOT NULL, transaction_key text NOT NULL, event_version integer NOT NULL DEFAULT 1, kind text NOT NULL,
      channel text NOT NULL, reply_channel text, correlation_id text NOT NULL,
      session_id text, run_id text, turn_id text, causation_event_id text,
      source_event_id text, source_stream_id text, source_sequence text,
      source text NOT NULL, audience text NOT NULL DEFAULT 'client', payload jsonb NOT NULL, created_at timestamptz NOT NULL,
      stored_at timestamptz NOT NULL DEFAULT now(), UNIQUE (stream_id, sequence))`);
    await client.query("CREATE INDEX IF NOT EXISTS event_store_stream_sequence_idx ON event_store (stream_id, sequence)");
    await client.query("CREATE INDEX IF NOT EXISTS event_store_channel_stream_sequence_idx ON event_store (channel, stream_id, sequence)");
    await client.query("CREATE INDEX IF NOT EXISTS event_store_correlation_idx ON event_store (correlation_id, stored_at)");
    await client.query("CREATE INDEX IF NOT EXISTS event_store_stored_at_idx ON event_store (stored_at)");
    await client.query(`CREATE TABLE IF NOT EXISTS event_stream_sequence (
      stream_id text PRIMARY KEY, last_sequence bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    await new CursorStore(client, this.options.cursorTtlDays ?? 30).ensureSchema();
    // A named, durable tail position. A broker restarting must not replay
    // the whole log, and must not skip what it had not reached.
    await client.query(`CREATE TABLE IF NOT EXISTS event_reader_cursor (
      name text PRIMARY KEY, positions jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  /** See docs/internals.md#decisions: callback work commits with the immutable event or not at all. */
  async append(event: EventDraft, afterAppend?: (client: PoolClient, persisted: EventEnvelope) => Promise<void>): Promise<EventEnvelope> {
    const persisted = await this.appendMany([event], afterAppend ? async (client, events) => afterAppend(client, events[0]!) : undefined);
    return persisted[0]!;
  }

  /** Appends related terminal events and their durable side effects in one database transaction. */
  async appendMany(events: readonly EventDraft[], afterAppend?: (client: PoolClient, persisted: readonly EventEnvelope[]) => Promise<void>): Promise<EventEnvelope[]> {
    if (events.length === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const persisted = await this.appendManyOn(client, events, afterAppend);
      await client.query("COMMIT");
      return persisted;
    } catch (error) { await client.query("ROLLBACK"); this.metrics?.increment("appendFailures"); throw error; }
    finally { client.release(); }
  }

  /** Joins an external transaction. The caller owns BEGIN, COMMIT and rollback. */
  async appendManyOn(client: PoolClient, events: readonly EventDraft[], afterAppend?: (client: PoolClient, persisted: readonly EventEnvelope[]) => Promise<void>): Promise<EventEnvelope[]> {
    if (!events.length) return [];
    const startedAt = Date.now();
    const persisted: EventEnvelope[] = [];
    // Sequence rows, rather than event ids, are the shared lock. This order keeps future multi-stream batches deadlock-free.
    for (const event of [...events].sort((left, right) => left.streamId.localeCompare(right.streamId) || left.eventId.localeCompare(right.eventId))) {
      eventProvenance(event);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [event.eventId]);
      const existing = await client.query<StoredEventRow>(`SELECT ${COLUMNS} FROM event_store WHERE event_id = $1`, [event.eventId]);
      if (existing.rowCount) {
        persisted.push(fromRow(existing.rows[0]));
        this.metrics?.increment("appendDuplicates");
        continue;
      }
      const next = await client.query<{ sequence: string | number }>(`INSERT INTO event_stream_sequence (stream_id,last_sequence) VALUES ($1,1)
        ON CONFLICT (stream_id) DO UPDATE SET last_sequence = event_stream_sequence.last_sequence + 1, updated_at = now() RETURNING last_sequence AS sequence`, [event.streamId]);
      const sequence = String(next.rows[0].sequence);
      const inserted = await client.query<StoredEventRow>(`INSERT INTO event_store (${COLUMNS})
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING ${COLUMNS}`, [event.eventId, event.streamId, sequence, event.action, event.transactionKey, event.eventVersion, event.kind, event.channel, event.replyChannel ?? null, event.sessionId ?? null, event.runId ?? null, event.turnId ?? null, event.causationEventId ?? null, event.correlationId, event.source, event.audience ?? "client", JSON.stringify(event.payload), event.createdAt, event.sourceEventId ?? null, event.sourceStreamId ?? null, event.sourceSequence ?? null]);
      if (!inserted.rowCount) throw new Error(`event store insert returned no row for ${event.eventId}`);
      persisted.push(fromRow(inserted.rows[0]));
    }
    const byId = new Map(persisted.map((event) => [event.eventId, event]));
    const ordered = events.map((event) => byId.get(event.eventId)!);
    if (afterAppend) await afterAppend(client, ordered);
    // Appending is publishing: there is no queue to hand the event to, so the
    // only thing left is to tell the tails a row exists. pg_notify fires on
    // commit, never before, so a woken tail always finds it.
    for (const channel of new Set(persisted.map((event) => event.channel))) {
      await client.query("SELECT pg_notify($1, $2)", [EVENT_LOG_NOTIFY_CHANNEL, channel]);
    }
    for (const _event of events) this.record(startedAt);
    return ordered;
  }

  async channelHighWater(channels: string[]): Promise<Record<string, string>> {
    const result = await this.pool.query<{ stream_id: string; sequence: string | number }>(`SELECT stream_id, max(sequence)::text AS sequence
      FROM event_store WHERE channel = ANY($1::text[]) AND ${CLIENT_ONLY} GROUP BY stream_id`, [channels]);
    return Object.fromEntries(result.rows.map((row) => [row.stream_id, String(row.sequence)]));
  }

  /** High-water per stream, grouped by channel, so a tail can seed one channel without disturbing others. */
  async channelHighWaterByChannel(channels: string[]): Promise<Record<string, Record<string, string>>> {
    const result = await this.pool.query<{ channel: string; stream_id: string; sequence: string | number }>(`SELECT channel, stream_id, max(sequence)::text AS sequence
      FROM event_store WHERE channel = ANY($1::text[]) AND ${CLIENT_ONLY} GROUP BY channel, stream_id`, [channels]);
    const grouped: Record<string, Record<string, string>> = {};
    for (const row of result.rows) (grouped[row.channel] ??= {})[row.stream_id] = String(row.sequence);
    return grouped;
  }

  /**
   * The tail of the log for a set of actions, rather than a set of channels.
   *
   * The enqueue loop watches what *happened*, not who is listening, so it reads by
   * action. The position key is still `(stream_id, sequence)` for the same
   * reason the channel tail uses it: sequences are issued under the stream's
   * row lock, so within a stream commit order is sequence order and a reader
   * cannot step over a row that is about to appear.
   */
  async actionHighWater(actions: readonly string[]): Promise<Record<string, string>> {
    const result = await this.pool.query<{ stream_id: string; sequence: string | number }>(`SELECT stream_id, max(sequence)::text AS sequence
      FROM event_store WHERE action = ANY($1::text[]) AND ${FACTS_ONLY} GROUP BY stream_id`, [actions]);
    return Object.fromEntries(result.rows.map((row) => [row.stream_id, String(row.sequence)]));
  }

  /**
   * Facts old enough that whatever should have reacted to them has had its
   * chance, newest first.
   *
   * The enqueue cursor only ever moves forward, so a fact recorded while
   * it was down is behind the cursor for ever. This is how those are found
   * again — not by position, which is exactly the thing that failed, but by age.
   */
  async settledCandidates(actions: readonly string[], graceSeconds: number, lookbackSeconds: number, limit: number): Promise<EventEnvelope[]> {
    const result = await this.pool.query<StoredEventRow>(`SELECT ${COLUMNS} FROM event_store
      WHERE action = ANY($1::text[]) AND ${FACTS_ONLY}
        AND created_at < now() - make_interval(secs => $2)
        AND created_at > now() - make_interval(secs => $3)
      ORDER BY created_at DESC LIMIT $4`, [actions, graceSeconds, lookbackSeconds, limit]);
    return result.rows.map(fromRow);
  }

  async readActions(actions: readonly string[], positions: Record<string, string>, highWater: Record<string, string>, limit: number): Promise<{ events: EventEnvelope[]; complete: boolean }> {
    const result = await this.pool.query<StoredEventRow>(`WITH bounds AS (
        SELECT high_water.key AS stream_id,
          COALESCE(($2::jsonb ->> high_water.key)::bigint, 0) AS position,
          high_water.value::bigint AS high_water
        FROM jsonb_each_text($3::jsonb) AS high_water
      )
      SELECT ${QUALIFIED_COLUMNS} FROM bounds JOIN event_store ON event_store.stream_id = bounds.stream_id
      WHERE action = ANY($1::text[]) AND ${FACTS_ONLY} AND sequence > bounds.position AND sequence <= bounds.high_water
      ORDER BY event_store.stream_id, event_store.sequence LIMIT $4`, [actions, JSON.stringify(positions), JSON.stringify(highWater), limit + 1]);
    return { events: result.rows.slice(0, limit).map(fromRow), complete: result.rows.length <= limit };
  }

  /** Where a named reader got to. Durable, so a restart does not replay the whole log. */
  async readerPosition(name: string): Promise<{ exists: boolean; positions: Record<string, string> }> {
    const result = await this.pool.query<{ positions: Record<string, string> }>("SELECT positions FROM event_reader_cursor WHERE name = $1", [name]);
    return { exists: Boolean(result.rows[0]), positions: result.rows[0]?.positions ?? {} };
  }

  async saveReaderPosition(name: string, positions: Record<string, string>): Promise<void> {
    await this.pool.query(`INSERT INTO event_reader_cursor (name, positions) VALUES ($1, $2::jsonb)
      ON CONFLICT (name) DO UPDATE SET positions = EXCLUDED.positions, updated_at = now()`, [name, JSON.stringify(positions)]);
  }
  async replayChannels(channels: string[], positions: Record<string, string>, highWater: Record<string, string>, limit: number): Promise<{ events: EventEnvelope[]; complete: boolean }> {
    const result = await this.pool.query<StoredEventRow>(`WITH bounds AS (
        SELECT high_water.key AS stream_id,
          COALESCE(($2::jsonb ->> high_water.key)::bigint, 0) AS position,
          high_water.value::bigint AS high_water
        FROM jsonb_each_text($3::jsonb) AS high_water
      )
      SELECT ${QUALIFIED_COLUMNS} FROM bounds JOIN event_store ON event_store.stream_id = bounds.stream_id
      WHERE channel = ANY($1::text[]) AND ${CLIENT_ONLY} AND sequence > bounds.position AND sequence <= bounds.high_water
      ORDER BY event_store.stream_id, event_store.sequence LIMIT $4`, [channels, JSON.stringify(positions), JSON.stringify(highWater), limit + 1]);
    return { events: result.rows.slice(0, limit).map(fromRow), complete: result.rows.length <= limit };
  }

  /** Loads or creates an immutable snapshot bound to the authenticated scope. */
  openChannelCursor(channels: string[], token: string | undefined, scope: CursorScope): Promise<{ token: string; positions: Record<string, string> }> {
    return token ? this.cursors.load(token, channels, scope) : this.channelHighWater(channels).then((positions) => this.cursors.snapshot(channels, positions, scope));
  }

  openChannelCursorAtStart(channels: string[], scope: CursorScope): Promise<{ token: string; positions: Record<string, string> }> {
    return this.cursors.snapshot(channels, {}, scope);
  }

  snapshotChannelCursor(channels: string[], positions: Record<string, string>, scope: CursorScope): Promise<{ token: string; positions: Record<string, string> }> {
    return this.cursors.snapshot(channels, positions, scope);
  }

  /** Returns a fresh token; the referenced token is never modified. */
  async advanceChannelCursor(token: string, positions: Record<string, string>, channels: string[], scope: CursorScope): Promise<{ token: string; positions: Record<string, string> }> {
    await this.cursors.load(token, channels, scope);
    return this.cursors.snapshot(channels, positions, scope);
  }

  pruneChannelCursors(retentionDays = this.options.cursorTtlDays ?? 30): Promise<number> { return this.cursors.prune(retentionDays); }

  async prune(retentionDays: number | null = this.options.retentionDays ?? null): Promise<number> {
    if (retentionDays === null) return 0;
    const pruned = await this.pool.query("DELETE FROM event_store WHERE stored_at < now() - make_interval(days => $1)", [retentionDays]);
    return pruned.rowCount ?? 0;
  }

  /** A watermark is retained while a retained event or an unexpired cursor can still require it. */
  async pruneStreamWatermarks(retentionDays: number | null = this.options.retentionDays ?? null): Promise<number> {
    if (retentionDays === null) return 0;
    const pruned = await this.pool.query(`DELETE FROM event_stream_sequence AS watermark
      WHERE watermark.updated_at < now() - make_interval(days => $1)
        AND NOT EXISTS (SELECT 1 FROM event_store WHERE stream_id = watermark.stream_id)
        AND NOT EXISTS (SELECT 1 FROM event_subscription_cursor WHERE positions ? watermark.stream_id)`, [retentionDays]);
    return pruned.rowCount ?? 0;
  }

  private record(startedAt: number): void {
    this.metrics?.increment("appendTotal");
    this.metrics?.increment("appendLatencyMsTotal", Date.now() - startedAt);
  }
}
