import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actorOf} from 'issus_domain/server';
import {charCount} from 'issus_domain/common';
import {startDeliveryHarness,seedFixtureSessions} from './harness.js';
test('P5 routing candidates, watcher scopes and non-executable legacy input',{timeout:90000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const {A,B,I,repoId,number,alias}=await seedFixtureSessions(h),D=await alias('p5-1-auditor');await h.settle();
  const post=async(body:string)=>{const r=await h.http(`${I}/comments`,{body},A.token);assert.equal(r.status,201,JSON.stringify(r));await h.settle();return r.body.commentId as string;};
  const rows=(id:string)=>h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 ORDER BY recipient_alias_id`,[id]);
  const deadline=new Date(h.clock.now().getTime()+300000).toISOString().replace('.000Z','+00:00');
  await t.test('explicit TO and CC persist without recipient repo membership or a live connection',async()=>{
   await h.pool.query(`DELETE FROM "${h.schema}".alias_repo WHERE alias_id=$1 AND repo_id=$2`,[D.aliasId,repoId]);
   const direct=await post(`FROM:${A.alias}/s1 TO:${D.alias} TYPE:ASK ACK-BY:${deadline}\nASK @${D.alias}: 오프라인 직접 전달.\nNEXT: ACK.`);const actual=(await rows(direct)).rows;assert.equal(actual.length,1);assert.equal(actual[0].recipient_alias_id,D.aliasId);assert.equal(actual[0].ack_required,true);assert.equal(actual[0].state,'posted');
   const cc=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE CC:${D.alias}\n명시 CC 전달.\nNEXT: 참고.`);const copied=(await rows(cc)).rows.find(r=>r.recipient_alias_id===D.aliasId);assert.equal(copied.classification,'CC');assert.equal(copied.ack_required,false);
  });
  await t.test('ALL is one row per active repo member and never sends the author their own comment',async()=>{
   const id=await post(`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n전체 공지.\nNEXT: 참고.`);
   const expected=(await h.pool.query(`SELECT a.id FROM "${h.schema}".alias a JOIN "${h.schema}".alias_repo ar ON ar.alias_id=a.id WHERE ar.repo_id=$1 AND a.status='active' AND a.id<>$2`,[repoId,A.aliasId])).rows.map(r=>r.id);
   assert.deepEqual(new Set((await rows(id)).rows.map(r=>r.recipient_alias_id)),new Set(expected));assert.ok((await rows(id)).rows.every(r=>r.classification==='ALL'));
  });
  await t.test('exact mention boundaries and explicit watcher OTHER preserve the common classifier',async()=>{
   await h.pool.query(`INSERT INTO "${h.schema}".alias_repo(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[D.principal.ownerId,D.aliasId,repoId]);
   const sub=await h.http('/v1/subscriptions',{channels:[`issue:${repoId}:${number}`],from:'now',repo:'tester/delivery',issues:[number]},D.token);assert.equal(sub.status,201);
   const other=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n@${D.alias}-extra @${D.alias}한 @unknown-1-role\nNEXT: 참고.`),otherRow=(await rows(other)).rows.find(r=>r.recipient_alias_id===D.aliasId);assert.equal(otherRow.classification,'OTHER');assert.equal(otherRow.content.body.split('\n').length,1);
   const mentioned=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE CC:${D.alias}\n참고 @${D.alias}.\nNEXT: 확인.`);assert.equal((await rows(mentioned)).rows.find(r=>r.recipient_alias_id===D.aliasId).classification,'ME');
   await h.pool.query(`DELETE FROM "${h.schema}".alias_repo WHERE alias_id=$1 AND repo_id=$2`,[D.aliasId,repoId]);
   const revoked=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n관찰 권한 철회 뒤.\nNEXT: 참고.`);assert.ok(!(await rows(revoked)).rows.some(r=>r.recipient_alias_id===D.aliasId));
  });
  await t.test('HOLD and DECISION broadcast to repo members while ACK duty stays with TO',async()=>{
   const seen=(await h.pool.query(`SELECT max(id)::text AS id FROM "${h.schema}".comment WHERE repo_id=$1 AND issue_number=$2`,[repoId,number])).rows[0].id;
   const hold=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:HOLD ACK-BY:${deadline} SEEN:${seen}\n시험 중단.\nASK @${B.alias}: 중단 상태 ACK.\nNEXT: 해제 대기.`);
   const held=(await rows(hold)).rows;assert.equal(held.filter(r=>r.ack_required).length,1);assert.equal(held.find(r=>r.ack_required).recipient_alias_id,B.aliasId);assert.ok(held.filter(r=>r.recipient_alias_id!==B.aliasId).every(r=>r.classification==='ALL'));
   const decision=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:DECISION ACK-BY:${deadline} SUPERSEDES:${hold}\nDECISION: 중단 해제.\nNEXT: ACK.`,compactDeferredReason:'routing fixture 긴급 해제'},A.token);assert.equal(decision.status,201);await h.settle();assert.equal((await rows(decision.body.commentId)).rows.filter(r=>r.ack_required).length,1);
  });
  await t.test('NOENV can appear in compatibility pending but creates no executable delivery',async()=>{
   const legacy=await h.uow.run(async tx=>{
    const id=(await tx.client.query(`UPDATE ${tx.table('comment_counter')} SET last_id=last_id+1 WHERE id=1 RETURNING last_id`)).rows[0].last_id,body=`FROM: ${A.alias}\nTO: ${B.alias}\nTYPE: HOLD\n레거시 중단 표시.`;
    await tx.client.query(`INSERT INTO ${tx.table('comment')}(id,owner_id,repo_id,issue_number,body,envelope,author_alias_id,author_session_id,posted_by_alias_id,char_count,validity) VALUES($1,$2,$3,$4,$5,'{}',$6,$7,$6,$8,'noenv')`,[id,A.principal.ownerId,repoId,number,body,A.aliasId,A.sessionId,charCount(body)]);
    tx.fact('issus.comment.posted',`issue:${repoId}:${number}`,{ownerId:A.principal.ownerId,repoId,issueNumber:number,revision:1,commentId:id,body,envelope:{FROM:A.alias,TO:B.alias,TYPE:'HOLD'},metadata:{},charCount:charCount(body),author:actorOf(A.principal),validity:'noenv'},`legacy:${id}`);return id as string;
   },randomUUID(),'p5-legacy-fixture');await h.settle();assert.equal((await rows(legacy)).rowCount,0);
   const inbox=await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}`,undefined,B.token);assert.ok(inbox.body.globalPendingAck.includes(legacy));
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".directive WHERE comment_id=$1`,[legacy])).rows[0].count,'0');
  });
 }finally{await h.cleanup();}
});
