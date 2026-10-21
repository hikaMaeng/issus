import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createApp } from './index.js';

test('scaffold health and ready answer HTTP 200', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const path of ['/health', '/ready']) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { ok: boolean }).ok, true);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
