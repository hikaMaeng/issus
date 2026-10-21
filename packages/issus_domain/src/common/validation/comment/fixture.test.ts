import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkComment} from './index.js';
import {checkIssueBody} from '../issue-body/index.js';
const fixtures=pathToFileURL(resolve('tests/fixtures/issue-board-v2')+'/');
const manifest=JSON.parse(readFileSync(new URL('manifest.json',fixtures),'utf8')) as {canonical37Sha256:string;files:{path:string;mode:string;sha256:string;sourceRelativePath:string;kind:string}[]};
const python=JSON.parse(readFileSync(new URL('python-results.json',fixtures),'utf8')) as {path:string;mode:string;exitCode:number;reasons:string[]}[];
const golden=JSON.parse(readFileSync(new URL('golden-errors.json',fixtures),'utf8')) as Record<string,string[]>;
test('all 46 original fixtures preserve bytes and design 37-file digest',()=>{
  assert.equal(manifest.files.length,46);
  for (const f of manifest.files) assert.equal(createHash('sha256').update(readFileSync(new URL(f.path,fixtures))).digest('hex'),f.sha256,f.path);
  const canonical=manifest.files.filter(f=>f.kind!=='flows').sort((a,b)=>a.sourceRelativePath<b.sourceRelativePath ? -1 : 1).map(f=>`${f.sourceRelativePath}\t${f.sha256}\n`).join('');
  assert.equal(createHash('sha256').update(canonical).digest('hex'),'a2387942ff0739cea867846f69b74e34b0dac42f58117d81f2353af38f520404');
});
for (const f of python) test(`Python dry-run exact reasons: ${f.path}`,()=>{
  const body=readFileSync(new URL(f.path,fixtures),'utf8');
  const reasons=f.mode==='issue-body' ? checkIssueBody(body) : checkComment(body);
  assert.deepEqual(reasons,f.reasons);
  assert.equal(reasons.length===0,f.exitCode===0);
  if (f.path.startsWith('bad/')) assert.deepEqual(reasons,golden[f.path.slice(4)]);
});
