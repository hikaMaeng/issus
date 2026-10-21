import assert from "node:assert/strict";
import test from "node:test";
import { readEnv as parseEnv } from "./env.js";
const readEnv = (source: NodeJS.ProcessEnv) => parseEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus", ...source });

test("PORT is an integer within the design's 10000–59999 range", () => {
  for (const port of ["9999", "60000", "65536", "10000.5", "NaN", "0"]) {
    assert.throws(() => readEnv({ PORT: port }), /PORT/, port);
  }
  for (const port of ["10000", "59999"]) assert.equal(readEnv({ PORT: port }).port, Number(port));
  assert.equal(readEnv({}).port, 18081);
});

test("the execution lease must strictly outlive queue visibility", () => {
  for (const lease of ["1", "59", "60"]) {
    assert.throws(() => readEnv({ QUEUE_VISIBILITY_TIMEOUT_SECONDS: "60", AGENT_EXECUTION_LEASE_SECONDS: lease }),
      /AGENT_EXECUTION_LEASE_SECONDS must exceed QUEUE_VISIBILITY_TIMEOUT_SECONDS/, lease);
  }
  assert.equal(readEnv({ QUEUE_VISIBILITY_TIMEOUT_SECONDS: "60", AGENT_EXECUTION_LEASE_SECONDS: "61" }).executionLeaseSeconds, 61);
  assert.equal(readEnv({}).executionLeaseSeconds, 120);
  assert.equal(readEnv({ QUEUE_VISIBILITY_TIMEOUT_SECONDS: "90" }).executionLeaseSeconds, 180);
});

test("the default worker pool reserves the configured CPU concurrency at startup", () => {
  const env = readEnv({ PORT: "18081", AGENT_MAX_THREADS: "6" });
  assert.equal(env.maxWorkerThreads, 6);
  assert.equal(env.minWorkerThreads, 6);
});

test("a resident worker pool cannot be configured with zero workers", () => {
  assert.throws(() => readEnv({ AGENT_MIN_THREADS: "0" }), /AGENT_MIN_THREADS must be positive/);
});

test("terminal persistence alert threshold is explicit and positive", () => {
  assert.equal(readEnv({ AGENT_TERMINAL_PERSISTENCE_ALERT_ATTEMPTS: "7" }).terminalPersistenceAlertAttempts, 7);
  assert.throws(() => readEnv({ AGENT_TERMINAL_PERSISTENCE_ALERT_ATTEMPTS: "0" }), /AGENT_TERMINAL_PERSISTENCE_ALERT_ATTEMPTS must be positive/);
});

test("terminal persistence retry backoff has an explicit positive ceiling", () => {
  assert.equal(readEnv({ AGENT_TERMINAL_PERSISTENCE_BACKOFF_MAX_SECONDS: "90" }).terminalPersistenceBackoffMaxSeconds, 90);
  assert.throws(() => readEnv({ AGENT_TERMINAL_PERSISTENCE_BACKOFF_MAX_SECONDS: "0" }), /AGENT_TERMINAL_PERSISTENCE_BACKOFF_MAX_SECONDS must be positive/);
});

test("the log tail has an explicit fallback interval and batch size", () => {
  assert.equal(readEnv({ AGENT_LOG_TAIL_POLL_MS: "250" }).logTailPollMs, 250);
  assert.equal(readEnv({ AGENT_LOG_TAIL_BATCH: "64" }).logTailBatch, 64);
  assert.throws(() => readEnv({ AGENT_LOG_TAIL_POLL_MS: "0" }), /AGENT_LOG_TAIL_POLL_MS must be positive/);
});

/**
 * There are two kinds of server, and the ones that are gone stay gone.
 *
 * `router` was removed once. `dispatcher` was the same shape returning under
 * another name two days later — a third kind of server for something that is
 * half of the broker's job. This is the test that noticed, so it now guards
 * both names.
 */
test("broker and worker are the only roles", () => {
  assert.equal(readEnv({}).role, "broker");
  assert.equal(readEnv({ AGENT_ROLE: "worker" }).role, "worker");
  for (const gone of ["router", "dispatcher"]) {
    assert.throws(() => readEnv({ AGENT_ROLE: gone }), /AGENT_ROLE must be broker or worker/, gone + " must not be a role");
  }
});

test("gateway still starts, because that is what deployed containers say", () => {
  assert.equal(readEnv({ AGENT_ROLE: "gateway" }).role, "broker");
});

test("a worker server is given a list of queues to watch, not one name", () => {
  assert.deepEqual(readEnv({ AGENT_QUEUES: "a, b ,c" }).queues, ["a", "b", "c"]);
  assert.deepEqual(readEnv({ AGENT_QUEUE: "solo" }).queues, ["solo"]);
  assert.deepEqual(readEnv({}).queues, ["agent_requests"]);
});
