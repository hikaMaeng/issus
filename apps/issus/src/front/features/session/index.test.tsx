import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {safeReturnPath, ConnectionForm, SessionBanner, SessionIssueForm} from './index.js';

test('session return path accepts only same-origin paths without authentication query values', () => {
  for (const value of ['https://evil.invalid/path','//evil.invalid/path','/\\evil.invalid','/login','/repos?token=secret','/repos?access_token=secret']) assert.equal(safeReturnPath(value, 'http://localhost:18140'), '/repos');
  assert.equal(safeReturnPath('/repos/a/b/issues/1?q=test#comment-1', 'http://localhost:18140'), '/repos/a/b/issues/1?q=test#comment-1');
});
test('session connection keeps original form/password/button contract and no token default', () => {
  const html = renderToStaticMarkup(<ConnectionForm onConnected={() => {}}/>);
  assert.ok(html.includes('aria-label="세션 연결"')); assert.ok(html.includes('type="password"')); assert.ok(html.includes('>연결</button>')); assert.ok(html.includes('value=""'));
});
test('session banner displays server identity and expiry without exposing bearer fields', () => {
  const html = renderToStaticMarkup(<SessionBanner principal={{kind: 'session', alias: 'tt-1-alpha', sid: 's2', sessionId: 'id', expiresAt: '2026-10-22T00:00:00Z'}}/>);
  assert.ok(html.includes('tt-1-alpha')); assert.ok(html.includes('s2')); assert.ok(html.includes('2026-10-22')); assert.ok(!html.includes('token'));
});
test('session issuance begins with a masked explicit management credential and no issued token', () => {
  const html = renderToStaticMarkup(<SessionIssueForm onConnected={() => {}}/>);
  assert.ok(html.includes('aria-label="세션 발급"')); assert.ok(html.includes('type="password"')); assert.ok(!html.includes('id="issued-token"')); assert.ok(html.includes('s1'));
});
