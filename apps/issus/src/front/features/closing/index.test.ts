import test from 'node:test';
import assert from 'node:assert/strict';
import {blockerReferences} from './index.js';
test('U2 close links authoritative blocker arrays and scalar final ids without treating STATE as an id', () => {
  assert.deepEqual(blockerReferences({waitingDirectives: ['1000001'], claims: ['1000002'], handoffs: ['1000003'], compact: '1000004', finalReport: '1000005', state: 'done', unknown: true}), [
    {kind: 'waitingDirectives', id: '1000001'}, {kind: 'claims', id: '1000002'}, {kind: 'handoffs', id: '1000003'}, {kind: 'compact', id: '1000004'}, {kind: 'finalReport', id: '1000005'},
  ]);
});
