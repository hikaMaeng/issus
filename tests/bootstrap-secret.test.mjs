import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, rmdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBootstrap } from '../scripts/prepare-bootstrap.mjs';

test('an existing operator fixture is preserved and an empty file is rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'issus-bootstrap-test-'));
  try {
    const path = join(directory, 'fixture');
    await writeFile(path, 'public-test-fixture\n', 'utf8');
    assert.equal((await prepareBootstrap(path)).created, false);
    assert.equal(await readFile(path, 'utf8'), 'public-test-fixture\n');
    await writeFile(path, '', 'utf8');
    await assert.rejects(prepareBootstrap(path), /nonempty regular file/);
  } finally { await rm(join(directory, 'fixture'), { force: true }); await rmdir(directory); }
});

test('a new secret requires owner-only permissions before any credential is stored', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'issus-bootstrap-test-'));
  const path = join(directory, 'new-fixture');
  try {
    try {
      assert.equal((await prepareBootstrap(path)).created, true);
      assert.match(await readFile(path, 'utf8'), /^[A-Za-z0-9_-]{43}\n$/);
      if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
      t.diagnostic('credential generation and owner-only permission setup succeeded');
    } catch (error) {
      if (process.platform !== 'win32' || error.message !== 'bootstrap secret owner-only ACL failed') throw error;
      await assert.rejects(stat(path), { code: 'ENOENT' });
      t.diagnostic('Windows ACL unavailable: fail-closed cleanup verified; successful generation still requires host validation');
    }
  } finally { await rm(path, { force: true }); await rmdir(directory); }
});
