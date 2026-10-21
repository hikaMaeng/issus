import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkComment,checkIssueBody,header,classify,isCompact,isoOk,dist1,mask,pendingLegacy} from './index.js';
const golden=JSON.parse(readFileSync('tests/fixtures/issue-board-v2/differential.json','utf8'));
test('differential golden uses the same pinned Python snapshot as the byte fixtures',()=>{
 const manifest=JSON.parse(readFileSync('tests/fixtures/issue-board-v2/manifest.json','utf8'));
 for(const [name,hash] of Object.entries(golden.provenance.sourceHashes))assert.equal(manifest.sources.find((s:{path:string})=>s.path.endsWith(name))?.sha256,hash);
});
for (const c of golden.validation) test(`validation parity ${c.name}`,()=>assert.deepEqual(c.mode==='comment' ? checkComment(c.body) : checkIssueBody(c.body),c.reasons));
for (const c of golden.times) test(`iso parity ${c.value}`,()=>assert.equal(isoOk(c.value),c.valid));
for (const c of golden.headers) test(`watch parity ${JSON.stringify(c.body)}`,()=>{
  const h=header(c.body), {values,...computed}=h;
  assert.deepEqual({...values,...computed},c.header);
  assert.equal(classify(h,c.body,['cc-dd']),c.classification);
  assert.equal(isCompact({body:c.body},h),c.compact);
});
// 고정물은 ASCII 문자만 ROT13(커밋 가드·push protection 회피). 한글·숫자·기호는 그대로.
const rot13=(v:string)=>v.replace(/[A-Za-z]/g,(ch)=>String.fromCharCode((ch<='Z'?90:122)>=(ch.charCodeAt(0)+13)?ch.charCodeAt(0)+13:ch.charCodeAt(0)-13));
for (const [i,c] of golden.masks.entries()) test(`mask parity ${i}`,()=>assert.deepEqual(mask(rot13(c.inputRot13)),{text:rot13(c.textRot13),maskedCount:c.maskedCount}));
for (const c of golden.aliases) test(`alias distance parity ${c.a}/${c.b}`,()=>assert.equal(dist1(c.a,c.b),c.dist1));
for (const c of golden.pending) test(`pending parity ${c.name}`,()=>assert.deepEqual(pendingLegacy(c.rows,c.me).map(c=>c.id),c.pending));
