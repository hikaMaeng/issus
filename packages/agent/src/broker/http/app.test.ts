import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createWebBackend } from "./app.js";
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
