import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createWebBackend, type WebBackendInput } from "./app.js";
import { readEnv } from "../env.js";
import { MetricsRegistry } from "../metrics/registry.js";

test("app HTTP routes run before static fallback and cursor opening requires channel authorization", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "issus-agent-http-"));
  await writeFile(path.join(dir, "index.html"), "static fallback", "utf8");
  let opened = 0;
  const app = createWebBackend({ env: readEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus" }), metrics: new MetricsRegistry(), queue: { check: async () => undefined } as never, checkDatabase: async () => undefined,
    verifier: { verify: async () => ({ id: "p", owner: "o", alias: "a", sid: "s1", sessionId: "s", capabilities: [] }), forget: () => undefined },
    authorizeChannel: () => false, openCursor: async () => { opened++; return { token: "never" }; }, clientDir: dir,
    extendHttp: (backend) => { backend.get("/v1/test", (_request, response) => response.json({ app: true })); },
  });
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.deepEqual(await (await fetch(`${url}/v1/test`)).json(), { app: true });
    assert.equal(await (await fetch(`${url}/`)).text(), "static fallback");
    const result = await fetch(`${url}/api/channels/cursor`, { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ channels: ["other"] }) });
    assert.equal(result.status, 403); assert.equal(opened, 0);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: "POST" })).status, 404);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});

const readinessFailure = (): never => { throw new Error("private readiness failure"); };
const readinessSuccess = async (): Promise<void> => undefined;

for (const scenario of [
  { name: "without a hook preserves existing readiness", status: 200 },
  { name: "with a successful hook is ready", ready: readinessSuccess, status: 200 },
  { name: "with a rejected hook is unavailable", ready: async () => readinessFailure(), status: 503 },
  { name: "with a throwing hook is unavailable", ready: readinessFailure, status: 503 },
  { name: "with a failed queue remains unavailable", ready: readinessSuccess, queueCheck: async () => readinessFailure(), status: 503 },
  { name: "with a failed database remains unavailable", ready: readinessSuccess, databaseCheck: async () => readinessFailure(), status: 503 },
]) {
  test(`/ready ${scenario.name}`, async () => {
    const calls: string[] = [];
    const app = createWebBackend(readinessInput({
      ...(scenario.ready ? { ready: () => { calls.push("ready"); return scenario.ready(); } } : {}),
      queue: { check: async () => { calls.push("queue"); await scenario.queueCheck?.(); } } as never,
      checkDatabase: async () => { calls.push("database"); await scenario.databaseCheck?.(); },
    }));
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const response = await fetch(`${url}/ready`);
      assert.equal(response.status, scenario.status);
      assert.deepEqual(await response.json(), { status: scenario.status === 200 ? "ready" : "unavailable" });
      assert.deepEqual(calls.sort(), scenario.ready ? ["database", "queue", "ready"] : ["database", "queue"]);
      assert.equal((await fetch(`${url}/health`)).status, 200);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
}

test("/ready waits for the application hook before responding and runs it on every request", { timeout: 5_000 }, async () => {
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let calls = 0;
  const app = createWebBackend(readinessInput({ ready: async () => { calls++; entered(); await pending; } }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let responded = false;
  const response = fetch(`${url}/ready`).then((result) => { responded = true; return result; });
  try {
    await started;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(responded, false);
    release();
    assert.equal((await response).status, 200);
    assert.equal((await fetch(`${url}/ready`)).status, 200);
    assert.equal(calls, 2);
  } finally { release(); await response; await new Promise<void>((resolve) => server.close(() => resolve())); }
});

function readinessInput(overrides: Partial<WebBackendInput>): WebBackendInput {
  return {
    env: readEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus" }),
    metrics: new MetricsRegistry(),
    queue: { check: readinessSuccess } as never,
    checkDatabase: readinessSuccess,
    verifier: { verify: async () => ({ id: "p", owner: "o", alias: "a", sid: "s1", sessionId: "s", capabilities: [] }), forget: () => undefined },
    authorizeChannel: () => false,
    ...overrides,
  };
}
