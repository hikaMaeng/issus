import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Principal } from "../../auth/index.js";

/** Session identity and sorted channel set are part of the cursor capability. */
export type CursorScope = { principalId: string; owner: string; sessionId: string };
export function cursorScope(principal: Principal): CursorScope {
  return { principalId: principal.id, owner: principal.owner, sessionId: principal.sessionId };
}

/** Stable transport/HTTP error contract; no storage details escape. */
export class CursorError extends Error {
  constructor(public readonly code: "CURSOR_EXPIRED" | "CURSOR_SCOPE_MISMATCH", public readonly status: 410 | 409) {
    super(code === "CURSOR_SCOPE_MISMATCH" ? "커서의 세션·채널 범위가 다릅니다" : "커서가 만료되었습니다");
  }
}

/** Append-only UUID snapshots. Reads and socket sends never update old tokens. */
export class CursorStore {
  constructor(private readonly pool: Pick<Pool, "query">, private readonly ttlDays = 30) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS event_subscription_cursor (
      token uuid PRIMARY KEY, scope jsonb NOT NULL, channels jsonb NOT NULL, positions jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`);
    await this.pool.query("CREATE INDEX IF NOT EXISTS event_subscription_cursor_expiry_idx ON event_subscription_cursor (expires_at)");
  }

  async snapshot(channels: readonly string[], positions: Record<string, string>, scope: CursorScope): Promise<{ token: string; positions: Record<string, string> }> {
    if (!scope.principalId || !scope.owner || !scope.sessionId) throw new CursorError("CURSOR_SCOPE_MISMATCH", 409);
    if (Object.values(positions).some((position) => !/^[0-9]+$/.test(position))) throw new Error("invalid cursor position");
    const token = randomUUID();
    await this.pool.query(`INSERT INTO event_subscription_cursor (token, scope, channels, positions, expires_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, now() + make_interval(days => $5))`,
    [token, JSON.stringify(scope), JSON.stringify([...new Set(channels)].sort()), JSON.stringify(positions), this.ttlDays]);
    return { token, positions: { ...positions } };
  }

  async load(token: string, channels: readonly string[], scope: CursorScope): Promise<{ token: string; positions: Record<string, string> }> {
    const result = await this.pool.query<{ scope: CursorScope; channels: string[]; positions: Record<string, string>; expired: boolean }>(
      "SELECT scope, channels, positions, expires_at <= now() AS expired FROM event_subscription_cursor WHERE token = $1", [token]);
    const row = result.rows[0];
    if (!row || row.expired) throw new CursorError("CURSOR_EXPIRED", 410);
    if (row.scope.principalId !== scope.principalId || row.scope.owner !== scope.owner || row.scope.sessionId !== scope.sessionId || JSON.stringify(row.channels) !== JSON.stringify([...new Set(channels)].sort())) throw new CursorError("CURSOR_SCOPE_MISMATCH", 409);
    return { token, positions: { ...row.positions } };
  }

  async prune(retentionDays = this.ttlDays): Promise<number> {
    const result = await this.pool.query("DELETE FROM event_subscription_cursor WHERE expires_at <= now() OR created_at < now() - make_interval(days => $1)", [retentionDays]);
    return result.rowCount ?? 0;
  }
}
