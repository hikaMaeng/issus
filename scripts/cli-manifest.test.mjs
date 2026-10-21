import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('CLI workspace and executable match design section 8', () => {
  const manifest = JSON.parse(readFileSync(new URL('../apps/cli/package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, '@issus/cli');
  assert.deepEqual(manifest.bin, { issus: 'dist/index.js' });
  const entry = readFileSync(new URL('../apps/cli/src/entry/index.ts', import.meta.url), 'utf8');
  assert.ok(entry.startsWith('#!/usr/bin/env node\n'));
});
