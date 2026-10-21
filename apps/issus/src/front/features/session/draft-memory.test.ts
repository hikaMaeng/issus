import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionDraftMemory, sessionDraftScope} from './draft-memory.js';

const principal = {kind: 'session', ownerId: 'owner-one', alias: 'tt-1-alpha', sid: 's1', sessionId: 'token-generation-one'};
const path = '/repos/owner/one/issues/2/edit';
const scope = sessionDraftScope(principal, path)!;

test('draft recovery is isolated by owner, alias, sid and exact page, but survives a token rotation', () => {
  assert.equal(sessionDraftScope({...principal, sessionId: 'replacement-token-id'}, path), scope);
  for (const changed of [{ownerId: 'owner-two'}, {alias: 'tt-1-beta'}, {sid: 's2'}]) assert.notEqual(sessionDraftScope({...principal, ...changed}, path), scope);
  assert.notEqual(sessionDraftScope(principal, '/repos/owner/one/issues/3/edit'), scope);
  assert.notEqual(sessionDraftScope(principal, path + '?repo=elsewhere'), scope);
  for (const candidate of [null, {kind: 'bootstrap'}, {kind: 'session', alias: principal.alias}]) assert.equal(sessionDraftScope(candidate, path), null);
});

test('expiry/401 suspension hides draft until matching authenticated user explicitly restores', () => {
  const memory = new SessionDraftMemory(); memory.begin(scope);
  memory.write(scope, 'composer.body', 'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\n정확한 초안\n');
  memory.suspend(scope); memory.suspend(scope);
  assert.ok(memory.hasPending(scope)); assert.equal(memory.hasPending(null), false);
  memory.begin(scope);
  assert.equal(memory.initial(scope, 'composer.body', () => ''), '');
  assert.equal(memory.restore(sessionDraftScope({...principal, alias: 'tt-1-beta'}, path)), false);
  assert.equal(memory.restore(scope), true);
  assert.equal(memory.initial(scope, 'composer.body', () => ''), 'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\n정확한 초안\n');
  assert.equal(memory.hasPending(scope), false);
});

test('an edit restores its raw text and original revision together after the server changes', () => {
  const memory = new SessionDraftMemory(); memory.begin(scope);
  const base = {body: 'STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T00:00+00:00\nold', revision: 7, etag: '"7"'};
  memory.write(scope, 'issue-form.base', base); memory.write(scope, 'issue-form.body', base.body + '\nmy pending edit');
  memory.suspend(scope); memory.begin(scope);
  memory.write(scope, 'issue-form.base', {...base, revision: 9, etag: '"9"'});
  memory.restore(scope);
  assert.deepEqual(memory.initial(scope, 'issue-form.base', () => null), base);
  assert.equal(memory.initial(scope, 'issue-form.body', () => ''), base.body + '\nmy pending edit');
});

test('repeated expiry before recovery cannot replace the saved draft with fresh defaults', () => {
  const memory = new SessionDraftMemory(); memory.begin(scope); memory.write(scope, 'composer.body', 'pending'); memory.suspend(scope);
  memory.begin(scope); memory.write(scope, 'composer.body', ''); memory.suspend(scope);
  memory.begin(scope); memory.restore(scope);
  assert.equal(memory.initial(scope, 'composer.body', () => ''), 'pending');
});

test('explicit discard is local to a principal/page and later suspension captures new work', () => {
  const memory = new SessionDraftMemory(), other = sessionDraftScope(principal, '/repos/owner/one/issues/new')!;
  for (const key of [scope, other]) {memory.begin(key); memory.write(key, 'issue-form.body', key); memory.suspend(key);}
  memory.discard(scope); assert.equal(memory.hasPending(scope), false); assert.equal(memory.hasPending(other), true);
  memory.begin(scope); memory.write(scope, 'issue-form.body', 'new'); memory.suspend(scope); memory.begin(scope); memory.restore(scope);
  assert.equal(memory.initial(scope, 'issue-form.body', () => ''), 'new');
});

test('new memory contains no prior drafts and late writes from an unmounted view are ignored', () => {
  const memory = new SessionDraftMemory(); memory.begin(scope); memory.write(scope, 'compact.body', 'summary'); memory.suspend(scope);
  memory.write(scope, 'compact.body', 'late response'); memory.begin(scope); memory.restore(scope);
  assert.equal(memory.initial(scope, 'compact.body', () => ''), 'summary');
  assert.equal(new SessionDraftMemory().hasPending(scope), false);
});

test('a late setter from before authentication cannot overwrite the explicitly restored generation', () => {
  const memory = new SessionDraftMemory(); memory.begin(scope); const oldLease = memory.lease(scope)!;
  memory.write(scope, 'composer.body', 'saved', oldLease); memory.suspend(scope); memory.begin(scope); memory.restore(scope);
  memory.write(scope, 'composer.body', 'late completed POST cleared old form', oldLease);
  assert.equal(memory.initial(scope, 'composer.body', () => ''), 'saved');
  memory.write(scope, 'composer.body', 'new user edit', memory.lease(scope));
  assert.equal(memory.initial(scope, 'composer.body', () => ''), 'new user edit');
});
