import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {ClientError, StreamClosed} from 'issus_domain/front';
import {browserSocket} from './index.js';

/** Real loopback sockets exercise the browser adapter; cookie/UI assertions stay in deployed B-03. */
async function harness() {
  const server = createServer(), sockets = new WebSocketServer({server});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const host = `127.0.0.1:${address.port}`, previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {value: {host, protocol: 'http:'}, configurable: true});
  return {sockets, url: `ws://${host}/ws`, async close() {
    if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location');
    for (const socket of sockets.clients) socket.terminate();
    await new Promise<void>(resolve => sockets.close(() => resolve()));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }};
}

test('browser WS adapter: actual version negotiation, queued frame and bidirectional text', {timeout: 10000}, async () => {
  const h = await harness();
  h.sockets.on('connection', socket => {socket.send('ready'); socket.on('message', text => socket.send('echo:' + String(text)));});
  try {
    const connection = await browserSocket(h.url, {}), iterator = connection[Symbol.asyncIterator]();
    assert.equal([...h.sockets.clients][0]!.protocol, 'issus.v1');
    assert.deepEqual(await iterator.next(), {value: 'ready', done: false});
    await connection.send('request'); assert.deepEqual(await iterator.next(), {value: 'echo:request', done: false});
    connection.close(); assert.equal((await iterator.next()).done, true);
  } finally {await h.close();}
});

test('browser WS adapter: server disconnect preserves close code for P7 reconnect policy', {timeout: 10000}, async () => {
  const h = await harness();
  try {
    const connection = await browserSocket(h.url, {}), next = connection[Symbol.asyncIterator]().next();
    [...h.sockets.clients][0]!.close(1013, 'transient');
    await assert.rejects(() => next, error => error instanceof StreamClosed && error.code === 1013);
    connection.close();
  } finally {await h.close();}
});

test('browser WS adapter: abort releases a waiting iterator and pre-aborted call opens no socket', {timeout: 10000}, async () => {
  const h = await harness(), abort = new AbortController();
  try {
    const connection = await browserSocket(h.url, {}, abort.signal), next = connection[Symbol.asyncIterator]().next();
    abort.abort(); assert.equal((await next).done, true);
    const before = h.sockets.clients.size;
    await assert.rejects(() => browserSocket(h.url, {}, abort.signal), error => error === abort.signal.reason);
    assert.equal(h.sockets.clients.size, before);
  } finally {await h.close();}
});

test('browser WS adapter: cross-origin and insecure downgrade are rejected before connecting', {timeout: 10000}, async () => {
  const h = await harness();
  try {
    await assert.rejects(() => browserSocket(h.url.replace('127.0.0.1', 'localhost'), {}), error => error instanceof ClientError && error.status === 403);
    Object.defineProperty(globalThis, 'location', {value: {host: new URL(h.url).host, protocol: 'https:'}, configurable: true});
    await assert.rejects(() => browserSocket(h.url, {}), error => error instanceof ClientError && error.status === 403);
    assert.equal(h.sockets.clients.size, 0);
  } finally {await h.close();}
});
