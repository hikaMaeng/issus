import test from 'node:test';
import assert from 'node:assert/strict';
import {runAcceptance} from './acceptance-harness.mjs';

test('P8 brief6 actual broker/worker/scheduler + PostgreSQL/PGMQ', {timeout: 180000}, async () => {
  const result = await runAcceptance();
  assert.ok(result.checks >= 83, 'all required flow/readiness/cleanup checks must run');
  assert.equal(result.completed, true, 'required acceptance flow must complete');
  assert.deepEqual(result.limitations, [], 'required failures cannot be reported as limitations');
});
