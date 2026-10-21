import assert from "node:assert/strict";
import test from "node:test";
import { createSocketPolicy } from "./index.js";
import { readBearer, type Principal } from "../auth/index.js";
import { readEnv } from "../env.js";

const principal: Principal = { id: "principal", owner: "owner", alias: "issus-1-agent", sid: "s1", sessionId: "session", capabilities: ["read"] };
test("session verifier is injected and WS credentials never come from query parameters", async () => {
  const policy = createSocketPolicy({ verifier: { verify: async () => principal, forget: () => undefined }, allowedActions: [], authorizeChannel: () => false });
  assert.equal(await policy.verifyUpgrade({ headers: {}, url: "/ws?session=fixture" } as never), null);
  assert.equal((await policy.verifyUpgrade({ headers: { authorization: "Bearer fixture" } } as never))?.principal, principal);
  assert.equal(policy.guardIngress!({ action: "issus.post", transactionKey: "tx", channel: "c", payload: {}, sessionId: principal.sessionId }, { principal }), null);
  assert.equal(readBearer({ header: (name: string) => name === "x-broker-session" ? "fixture" : undefined } as never), undefined);
});
test("DATABASE_URL is required and history null retention is independent from cursor TTL", () => {
  assert.throws(() => readEnv({}), /DATABASE_URL/);
  const env = readEnv({ DATABASE_URL: "postgresql://issus@127.0.0.1:15440/issus", ISSUS_EVENT_RETENTION_DAYS: "null" });
  assert.equal(env.retentionDays, null); assert.equal(env.cursorTtlDays, 30); assert.equal(env.databasePoolMax, 4);
});
