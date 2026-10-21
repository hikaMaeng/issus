import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCompactReaction} from 'issus_domain/server';
import {startDeliveryHarness,seedFixtureSessions} from './harness.js';
test('P6 injected compact role routes one native compact-due to OWNER',{timeout:60000},async t=>{
 const h=await startDeliveryHarness({compactReaction:applyCompactReaction});
 try {
  const {A,repoId,number}=await seedFixtureSessions(h);
  for(let i=0;i<25;i++) {
   const result=await h.intake.execute({principal:A.principal,action:'issus.comment.post',payload:{repoId,issueNumber:number,body:`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n구간 댓글 ${i+1}.\nNEXT: OWNER 요약.`},idempotencyKey:randomUUID()});assert.equal(result.httpStatus,201);
  }
  await h.settle();
  const due=(await h.pool.query(`SELECT * FROM event_store WHERE action='issus.compact.due' AND payload->'issue'->>'repoId'=$1 AND payload->'issue'->>'issueNumber'=$2`,[repoId,String(number)])).rows;assert.equal(due.length,1);
  const rows=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE source_event_id=$1`,[due[0].event_id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].recipient_alias_id,A.aliasId);assert.equal(rows[0].ack_required,false);assert.equal(rows[0].classification,'ME');
  t.diagnostic(JSON.stringify({compactDueFacts:due.length,ownerNotifications:rows.length,count:due[0].payload.count,generation:due[0].payload.generation}));
 }finally{await h.cleanup();}
});
