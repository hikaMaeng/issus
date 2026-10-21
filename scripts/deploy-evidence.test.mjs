import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { dirtyDiffSha256, repositoryDirtyHash } from './deploy-evidence.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = new Map([['a.txt', Buffer.from([0, 255, 10])], ['한글 space\nfile.txt', Buffer.from('new')]]);
const read = path => bytes.get(path);

test('untracked content, filename, addition and deletion each change dirty hash', () => {
  const baseline = dirtyDiffSha256(Buffer.from('tracked'), ['a.txt'], read);
  assert.notEqual(baseline, dirtyDiffSha256(Buffer.from('tracked'), ['a.txt'], () => Buffer.from([0, 254, 10])));
  assert.notEqual(baseline, dirtyDiffSha256(Buffer.from('tracked'), ['renamed.txt'], () => read('a.txt')));
  assert.notEqual(baseline, dirtyDiffSha256(Buffer.from('tracked'), [...bytes.keys()], read));
  assert.notEqual(baseline, dirtyDiffSha256(Buffer.from('tracked'), [], read));
});

test('tracked bytes include trailing whitespace and binary differences', () => {
  assert.notEqual(dirtyDiffSha256(Buffer.from('diff\n'), [], read), dirtyDiffSha256(Buffer.from('diff'), [], read));
  assert.notEqual(dirtyDiffSha256(Buffer.from([255]), [], read), dirtyDiffSha256(Buffer.from([254]), [], read));
});

test('untracked order is stable and the canonical representation hashes raw bytes', () => {
  const paths = [...bytes.keys()];
  const expected = hash(JSON.stringify({ trackedDiffSha256: hash('diff'), untracked: paths.sort().map(path => ({ path, sha256: hash(read(path)) })) }));
  assert.equal(dirtyDiffSha256(Buffer.from('diff'), paths.toReversed(), read), expected);
});

test('git collection includes HEAD diff and NUL-separated untracked names without trimming', () => {
  const calls = [];
  const result = repositoryDirtyHash(args => {
    calls.push(args);
    return args[0] === 'diff' ? Buffer.from('diff\n') : Buffer.from('한글 space\nfile.txt\0a.txt\0');
  }, read);
  assert.deepEqual(calls, [['diff', '--binary', 'HEAD'], ['ls-files', '--others', '--exclude-standard', '-z']]);
  assert.equal(result, dirtyDiffSha256(Buffer.from('diff\n'), [...bytes.keys()], read));
});

test('unreadable or disappearing untracked files fail instead of producing incomplete evidence', () => {
  assert.throws(() => dirtyDiffSha256('', ['missing'], () => { throw new Error('ENOENT'); }), /ENOENT/);
});
