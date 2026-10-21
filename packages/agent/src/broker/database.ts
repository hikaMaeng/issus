import { Pool } from "pg";

/** Isolated public schema pool; idle connection loss does not crash the process. */
export function createDatabasePool(databaseUrl: string, max = 16): Pool {
  const pool = new Pool({ connectionString: databaseUrl, max, options: "-c search_path=public" });
  pool.on("error", () => console.warn(JSON.stringify({ event: "database.pool.idle.dropped" })));
  return pool;
}

export type DatabasePoolSnapshot = { total: number; idle: number; waiting: number };

/** Counters do not acquire a connection. */
export function snapshotDatabasePool(pool: Pool): DatabasePoolSnapshot {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}
