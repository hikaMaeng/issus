import test from 'node:test';
import assert from 'node:assert/strict';
import {runAcceptance} from './acceptance-harness.mjs';

test('P8 brief6 actual broker/worker/scheduler + PostgreSQL/PGMQ', {timeout: 180000}, async t => {
  const result = await runAcceptance();
  assert.ok(result.checks >= 60);
  for (const limitation of result.limitations) t.diagnostic('별도 수정 중: ' + limitation);
});
