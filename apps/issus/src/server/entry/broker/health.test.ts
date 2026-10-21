import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createWebBackend, MetricsRegistry, readEnv } from 'agent/broker';
import type { CoreHttpOptions } from '../../http/auth/index.js';
import { brokerOptions } from './index.js';

async function harness(ready: () => Promise<{ ok: boolean; checks: Record<string, boolean> }>) {
  const core = {
    origin: 'http://127.0.0.1:18140',
    intake: {},
    auth: { verify: async () => ({ kind: 'bootstrap', id: 'bootstrap-test', ownerId: 'owner-test', capabilities: ['bootstrap'] }) },
    health: { live: () => ({ ok: true, service: 'issus' }), ready }
  } as unknown as CoreHttpOptions;
  const env = readEnv({ DATABASE_URL: 'postgresql://unused/test', PORT: '18140' });
  const options = brokerOptions(env, core);
  const app = createWebBackend({
    env, metrics: new MetricsRegistry(), queue: { check: async () => {} } as never,
    verifier: options.verifier, authorizeChannel: options.authorizeChannel, ready: options.ready,
    checkDatabase: async () => {}, extendHttp: app => options.extendHttp!(app, {} as never)
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { options, origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

test('broker health and ready use the real agent surface and P4 readiness hook', async () => {
  let ok = false;
  const h = await harness(async () => ({ ok, checks: { migrations: ok } }));
  try {
    assert.equal((await fetch(`${h.origin}/health`)).status, 200);
    assert.equal((await fetch(`${h.origin}/ready`)).status, 503);
    ok = true;
    assert.deepEqual(await (await fetch(`${h.origin}/ready`)).json(), { status: 'ready' });
    assert.deepEqual(h.options.allowedActions, []);
    assert.deepEqual(h.options.ingressQueues, []);
    assert.equal(h.options.reactions, undefined);
    assert.equal(await h.options.authorizeChannel('issue:any:1', {} as never), false);
  } finally { await h.close(); }
});

test('P4 HTTP authentication is installed by extendHttp', async () => {
  const h = await harness(async () => ({ ok: true, checks: {} }));
  try {
    assert.equal((await fetch(`${h.origin}/v1/auth/me`)).status, 401);
    assert.equal((await fetch(`${h.origin}/v1/repos/tester/core/issues/1/compact/status`)).status, 401);
    const response = await fetch(`${h.origin}/v1/auth/me`, { headers: { authorization: 'Bearer test-only' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { id: string }).id, 'bootstrap-test');
  } finally { await h.close(); }
});

test('the error middleware converts JSON errors raised before extendHttp', async () => {
  const h = await harness(async () => ({ ok: true, checks: {} }));
  try {
    const response = await fetch(`${h.origin}/v1/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: { code: string }; posted: boolean };
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.equal(body.posted, false);
  } finally { await h.close(); }
});
