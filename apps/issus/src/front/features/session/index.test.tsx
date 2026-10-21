import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {safeReturnPath, ConnectionForm, SessionBanner, SessionIssueForm, DraftRecovery, SessionDraftProvider, SessionDraftMemory, useSessionDraft} from './index.js';

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

test('draft recovery exposes explicit restore/discard buttons without rendering the saved content', () => {
  const html = renderToStaticMarkup(<DraftRecovery pending onRestore={() => {}} onDiscard={() => {}}/>);
  assert.ok(html.includes('보관한 초안 복원')); assert.ok(html.includes('보관한 초안 버리기'));
  assert.ok(html.includes('role="status"')); assert.ok(!html.includes('<form'));
  assert.equal(renderToStaticMarkup(<DraftRecovery pending={false} onRestore={() => {}} onDiscard={() => {}}/>), '');
});

test('draft hook works without a provider and reads only explicitly restored working slots', () => {
  function Probe() {const [body] = useSessionDraft('composer.body', 'fresh'); return <textarea value={body} readOnly/>;}
  assert.ok(renderToStaticMarkup(<Probe/>).includes('fresh'));
  const memory = new SessionDraftMemory(); memory.begin('principal/page'); memory.write('principal/page', 'composer.body', 'saved'); memory.suspend('principal/page'); memory.begin('principal/page');
  const view = () => renderToStaticMarkup(<SessionDraftProvider memory={memory} scope="principal/page"><Probe/></SessionDraftProvider>);
  assert.ok(view().includes('fresh')); memory.restore('principal/page'); assert.ok(view().includes('saved'));
});
