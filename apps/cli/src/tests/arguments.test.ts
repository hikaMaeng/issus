import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseArguments,parseIssue} from '../entry/arguments/index.js';
import {harness} from './helpers/index.js';

const invalid=[
 ['post','--repo','a/b','--repo','a/c'],['post','--dry-run','--dry-run'],['watch','--full','--full','1'],
 ['watch','--state','x','--state','y','1'],['watch','--since-compact','--all-history','1'],['watch','--wat','x','1'],
 ['subscribe','--me','a','--me','b'],['alias','check','aa-client','bb-client'],['compact','prepare','extra'],['post','--repo']
];
for(const argv of invalid) test(`usage rejects invalid/repeated input: ${argv.join(' ')}`,async()=>{
  const h=await harness(async()=>{throw new Error('must not fetch');});assert.equal(await h.run(argv),2);
});

test('append semantics preserve all me/mine/board arguments',()=>{
  const a=parseArguments(['watch','--me','A','--me','B','--mine','작성: old / s2 | role','--board','2','--board','o/r#2','1']);
  assert.deepEqual(a.values.me,['A','B']);assert.deepEqual(a.values.mine,['작성: old / s2 | role']);assert.deepEqual(a.values.board,['2','o/r#2']);
});

test('repo numeric/ref/service URL parser rejects GitHub and foreign service URL',()=>{
  assert.deepEqual(parseIssue('2','owner/repo'),{repo:'owner/repo',number:2});assert.deepEqual(parseIssue('owner/repo#2'),{repo:'owner/repo',number:2});
  assert.deepEqual(parseIssue('https://issus.example/v1/repos/owner/repo/issues/2',undefined,'https://issus.example'),{repo:'owner/repo',number:2});
  assert.throws(()=>parseIssue('https://github.com/owner/repo/issues/2',undefined,'https://issus.example'),/unsupported source: GitHub/u);
  assert.throws(()=>parseIssue('https://foreign.example/repos/owner/repo/issues/2',undefined,'https://issus.example'),/unsupported source/u);
  assert.throws(()=>parseIssue('0','owner/repo'));assert.throws(()=>parseIssue('9999999999999999999999','owner/repo'));
});

test('legacy shorthand commands resolve to explicit actions',()=>{
  assert.equal(parseArguments(['compact','--repo','o/r']).action,'prepare');
  assert.equal(parseArguments(['alias','--owner','o','aa-client']).action,'check');
  assert.equal(parseArguments(['board','--repo','o/r']).action,'find');
});
