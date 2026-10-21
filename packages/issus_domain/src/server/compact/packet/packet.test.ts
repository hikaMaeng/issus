import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mask,charCount,compactDue,sinceCompactStats,checkComment} from '../../../common/index.js';
import {renderCompactPacket,maskPacketValue} from './render.js';
import {compactPacketHash,compactPacketFilename} from './index.js';
import type {CommentRow,IssueRow} from '../../backend/index.js';

const fixture=JSON.parse(readFileSync(new URL('../../../../tests/fixtures/issue-board-v2/differential.json',import.meta.url),'utf8'));
const rot13=(v:string)=>v.replace(/[a-zA-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+(c.toLowerCase()<='m'?13:-13)));
for(const [i,c] of fixture.masks.entries()) test(`U-M1 pinned ROT13 MASKS ${i}`,()=>assert.deepEqual(mask(rot13(c.inputRot13)),{text:rot13(c.textRot13),maskedCount:c.maskedCount}));

test('U-C1 codepoint statistics and exact ordinary/board thresholds',()=>{
  assert.equal(charCount('😀'),1);
  for(const [count,chars,board,due] of [[24,39999,false,false],[25,0,false,true],[0,40000,false,true],[29,39999,true,false],[30,0,true,true]] as const) assert.equal(compactDue({count,chars},board).due,due);
  assert.deepEqual(sinceCompactStats([{id:'1000000',body:'😀\n'},{id:'1000001',body:'한글'}],'1000000'),{count:1,chars:2});
});

test('U-M1 full packet duplicates are masked; original stats and appendix structure survive',()=>{
  const email='person'+'@example.com',secret='gh'+'p_'+'A'.repeat(24),body=`STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T04:00+00:00 BOARD:${email}\n${secret}`;
  const issue={number:1,body} as IssueRow;
  const tail=[{id:'1000000',created_at:new Date('2026-10-21T04:00:00Z'),body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE CC:${email}\n${secret}`,envelope:{FROM:'tt-1-alpha/s1'}} as unknown as CommentRow];
  const appendix={pendingLegacy:{window:['1000000'],global:['999999']},ackState:[{directiveId:'999999',state:'waiting' as const}],activeHolds:['999999'],claims:[],handoffs:[]};
  const rendered=renderCompactPacket({repo:'tester/compact',issue,previous:null,tail,now:new Date('2026-10-21T04:00:00Z'),pendingAppendix:appendix,controlFactsSinceCompact:[]});
  assert.ok(!rendered.markdown.includes(email));assert.ok(!rendered.markdown.includes(secret));assert.ok(rendered.maskedCount>=5);assert.match(rendered.markdown,/PENDING APPENDIX/);
  assert.deepEqual(maskPacketValue({body:email,deep:[secret]}),{body:'[MASKED:email]',deep:['[MASKED:github-token]']});
});

test('packet hash is JSONB-order independent and filename matches Python',()=>{
  const a={ownerAliasId:'a',repoId:'b',issueNumber:1,packet:{x:'y',z:1}};
  assert.equal(compactPacketHash(a as any),compactPacketHash({packet:{z:1,x:'y'},issueNumber:1,repoId:'b',ownerAliasId:'a'} as any));
  assert.equal(compactPacketFilename('tester/compact',1,'1000000'),'compact_packet_tester_compact_1_1000000.md');
});

const parity=JSON.parse(readFileSync(new URL('../../../../tests/fixtures/compact/packet-parity.json',import.meta.url),'utf8'));
for(const [i,c] of parity.cases.entries()) test(`U-M1 compact_prepare identical input -> byte-identical packet ${i}`,()=>{
  const convert=(v:any)=>v?{...v,body:v.body??rot13(v.bodyRot13),id:String(v.id),created_at:new Date(v.created_at)} as CommentRow:null;
  const got=renderCompactPacket({repo:'tester/compact',issue:{number:1,body:c.body??rot13(c.bodyRot13)} as IssueRow,previous:convert(c.previous),tail:c.tail.map(convert),now:new Date(parity.generatedAt),pendingAppendix:{pendingLegacy:{window:[],global:[]},ackState:[],activeHolds:[],claims:[],handoffs:[]},controlFactsSinceCompact:[]});
  assert.equal(got.markdown,c.markdown??rot13(c.markdownRot13));assert.equal(got.maskedCount,c.maskedCount);
});

for(const [i,c] of parity.validation.entries()) test(`U-C2 issue_post exact COMPACT rejection reasons ${i}`,()=>assert.deepEqual(checkComment(c.body),c.reasons));
