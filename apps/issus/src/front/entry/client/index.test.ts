import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserClient, FrontClientError, ClientError, errorLines, errorReasons, reasonField, createBrowserClient, connectBrowser, allPages} from './index.js';

const reasons = [{code: 'PROTOCOL', path: 'body', message: '지시성 TYPE ASK: ACK-BY 필수'}, {code: 'RECIPIENT_UNKNOWN', path: 'alias', message: '등록 별칭 없음'}];
test('front error adapter preserves all raw 422 fields and order', async () => {
  const client = new BrowserClient({server: 'http://test.invalid', fetch: async () => Response.json({error: {code: 'VALIDATION_FAILED', reasons}}, {status: 422})});
  await assert.rejects(client.request('/v1/preflight'), error => {
    assert.ok(error instanceof FrontClientError); assert.ok(error instanceof ClientError);
    assert.deepEqual(errorReasons(error), reasons); assert.deepEqual(errorLines(error), reasons.map(reason => reason.message));
    assert.equal(reasonField(error.validationReasons[0]), 'ACK-BY'); assert.equal(reasonField(error.validationReasons[1]), undefined); return true;
  });
});
test('operation final 422 retains structured reasons rather than flattening messages', async () => {
  const client = new BrowserClient({server: 'http://test.invalid', fetch: async input => new URL(input).pathname.startsWith('/v1/operations/') ? Response.json({status: 'failed', httpStatus: 422, response: {error: {code: 'VALIDATION_FAILED', reasons}}}) : Response.json({operationId: 'operation-1', statusUrl: '/v1/operations/operation-1'}, {status: 202})});
  await assert.rejects(client.write('/v1/post', {key: 'stable', method: 'POST', body: {}}), error => {assert.deepEqual(errorReasons(error), reasons); return true;});
});
test('field association only accepts exact paths and exact canonical required-key diagnostics', () => {
  assert.equal(reasonField({code: 'X', path: 'envelope.TO', message: 'original'}), 'TO');
  assert.equal(reasonField({code: 'X', path: 'alias', message: 'TO'}), undefined);
  assert.equal(reasonField({code: 'X', path: 'body', message: 'ACK-BY 비슷한 오류'}), undefined);
  assert.equal(reasonField({code: 'X', path: 'sampledIds', message: 'original'}), 'sampledIds');
});
test('browser exchange persists only CSRF and a new tab cannot send cookie writes without proof', async () => {
  const saved = new Map(['window','sessionStorage','fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map<string,string>(), calls: {headers: Headers; method: string}[] = [];
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {location: {origin: 'http://test.invalid'}, dispatchEvent: () => {}}});
  Object.defineProperty(globalThis, 'sessionStorage', {configurable: true, value: {getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value)}});
  Object.defineProperty(globalThis, 'fetch', {configurable: true, value: async (_url: unknown, init: RequestInit) => {calls.push({headers: new Headers(init.headers), method: init.method!}); return Response.json({csrfToken: 'proof'});}});
  try {
    await assert.rejects(createBrowserClient().request('/v1/write', {method: 'POST', body: {}}), error => error instanceof ClientError && error.code === 'CSRF_MISSING');
    assert.equal(calls.length, 0);
    await connectBrowser('ephemeral-bearer'); assert.deepEqual([...storage], [['issus.csrf','proof']]);
    assert.equal(calls[0].headers.get('authorization'), 'Bearer ephemeral-bearer');
    await createBrowserClient().request('/v1/write', {method: 'POST', body: {}});
    assert.equal(calls[1].headers.get('authorization'), null); assert.equal(calls[1].headers.get('x-csrf-token'), 'proof');
  } finally {for (const [key,descriptor] of saved) {if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);}}
});
test('page collection reports progress without returning an incomplete filtered result', async () => {
  const counts: number[] = [];
  const client = new BrowserClient({server: 'http://test.invalid', fetch: async input => Response.json(new URL(input).searchParams.has('cursor') ? {items: [2,3], nextCursor: null} : {items: [1], nextCursor: 'next'})});
  assert.deepEqual(await allPages<number>(client, '/v1/repos', new AbortController().signal, count => counts.push(count)), [1,2,3]);
  assert.deepEqual(counts, [1,3]);
});
