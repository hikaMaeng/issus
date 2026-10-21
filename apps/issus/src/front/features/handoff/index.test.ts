import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffPermissions} from './index.js';
test('U2 handoff stages require actual TO for accept and OWNER for complete after server acceptance', () => {
  const alpha = {kind: 'session', alias: 'tt-1-alpha'}, bravo = {kind: 'session', alias: 'tt-1-bravo'};
  assert.equal(handoffPermissions(alpha, alpha.alias, bravo.alias, 'pending').accept, false);
  assert.equal(handoffPermissions(bravo, alpha.alias, bravo.alias, 'pending').accept, true);
  assert.equal(handoffPermissions(alpha, alpha.alias, bravo.alias, 'pending').complete, false);
  assert.equal(handoffPermissions(alpha, alpha.alias, bravo.alias, 'accepted').complete, true);
  assert.equal(handoffPermissions(bravo, alpha.alias, bravo.alias, 'accepted').complete, false);
  assert.equal(handoffPermissions({kind: 'bootstrap'}, alpha.alias, bravo.alias, 'pending').accept, false);
  assert.equal(handoffPermissions(alpha, alpha.alias, bravo.alias, 'completed').complete, false);
});
