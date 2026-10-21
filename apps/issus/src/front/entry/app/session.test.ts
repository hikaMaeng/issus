import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionDraftMemory} from '../../features/session/index.js';
import {activateSessionDraft} from './session.js';

const a = {kind: 'session', ownerId: 'owner', alias: 'tt-1-alpha', sid: 's1', sessionId: 'a'};
const path = '/repos/owner/repo/issues/1';
const slots = ['composer.body', 'issue-form.body', 'issue-form.base', 'compact.body', 'handoff:owner/repo:1:to', 'quick-ack:/v1/repos/owner/repo/issues/1:10:body', 'inbox-ack:owner/repo:1:10:body'];

test('cookie recovery then explicit same-session login preserves the first real401 draft across all seven workflows', () => {
  const memory = new SessionDraftMemory();
  const first = activateSessionDraft(memory, {principal: null, scope: null}, a, path);
  for (const slot of slots) memory.write(first.scope!, slot, '');
  const lease = memory.lease(first.scope!);
  const confirmed = activateSessionDraft(memory, {principal: a, scope: first.scope}, {...a}, path);
  assert.equal(confirmed.changed, false);
  assert.equal(memory.lease(first.scope!), lease);
  assert.equal(memory.hasPending(first.scope), false);
  for (const slot of slots) memory.write(first.scope!, slot, `edited ${slot}\ntrailing space  \n`);
  memory.suspend(first.scope);
  const returned = activateSessionDraft(memory, {principal: null, scope: null}, a, path);
  for (const slot of slots) assert.equal(memory.initial(returned.scope!, slot, () => ''), '');
  assert.equal(memory.restore(returned.scope), true);
  for (const slot of slots) assert.equal(memory.initial(returned.scope!, slot, () => ''), `edited ${slot}\ntrailing space  \n`);
});

test('switching alias, session id or route still suspends the original scope and requires explicit restoration', () => {
  for (const [next, nextPath] of [[{...a, alias: 'tt-1-beta', sessionId: 'b'}, path], [{...a, sessionId: 'rotated'}, path], [a, path + '/edit']] as const) {
    const memory = new SessionDraftMemory();
    const first = activateSessionDraft(memory, {principal: null, scope: null}, a, path);
    memory.write(first.scope!, 'composer.body', 'pending');
    const changed = activateSessionDraft(memory, {principal: a, scope: first.scope}, next, nextPath);
    assert.equal(changed.changed, true);
    assert.equal(memory.hasPending(first.scope), true);
    assert.equal(memory.initial(changed.scope!, 'composer.body', () => ''), '');
    const returned = activateSessionDraft(memory, {principal: next, scope: changed.scope}, a, path);
    assert.equal(memory.initial(returned.scope!, 'composer.body', () => ''), '');
    assert.equal(memory.restore(returned.scope), true);
    assert.equal(memory.initial(returned.scope!, 'composer.body', () => ''), 'pending');
  }
});
