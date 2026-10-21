import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePool } from "./database.js";

test("the broker pool is limited to public search_path and the configured connection budget", async () => {
  const pool = createDatabasePool("postgresql://issus@127.0.0.1:15440/issus", 4);
  try {
    const config = (pool as unknown as { options: { options: string; max: number } }).options;
    assert.equal(config.options, "-c search_path=public"); assert.equal(config.max, 4);
  } finally { await pool.end(); }
});
