import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sha256} from 'issus_domain/server';
import {startDeliveryHarness,seedFixtureSessions} from './harness.js';

test('P5 snapshots retain COMPACT and changes crossing page boundaries',{timeout:120000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const {A,B,I,number,repoId}=await seedFixtureSessions(h);
  const post=async(text:string)=>{const r=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n${text}\nNEXT: snapshot.`},A.token);assert.equal(r.status,201,JSON.stringify(r));await h.settle();return r.body.commentId as string;};
  const pull=(cursor?:string,limit=500)=>h.http(`/v1/inbox?repo=tester/delivery&issues=${number}&limit=${limit}${cursor?`&cursor=${cursor}`:''}`,undefined,B.token);
  async function compact() {
   const issue=(await h.pool.query(`SELECT * FROM "${h.schema}".issue WHERE repo_id=$1 AND number=$2`,[repoId,number])).rows[0];
   const tail=(await h.pool.query(`SELECT id FROM "${h.schema}".comment WHERE repo_id=$1 AND issue_number=$2 AND id>COALESCE($3::bigint,0) ORDER BY id`,[repoId,number,issue.compact_comment_id])).rows.map(r=>r.id as string),through=tail.at(-1)!;
   const token=randomUUID();await h.pool.query(`INSERT INTO "${h.schema}".compact_packet(id,owner_id,repo_id,issue_number,previous_compact_id,through_id,snapshot_revision,packet_hash,token_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}',$10)`,[randomUUID(),A.principal.ownerId,repoId,number,issue.compact_comment_id,through,issue.revision,sha256(token),sha256(token),new Date(h.clock.now().getTime()+600000)]);
   const response=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:ALL TYPE:COMPACT${issue.compact_comment_id?` RE:${issue.compact_comment_id}`:''} SEEN:${through}\n## ===== COMPACT #${number} through ${through} =====\n스냅샷 경계. 미확인: 없음.\nNEXT: 다음 구간.\n---\ncompacted-by:${A.alias}`,compactPacketToken:token,sampledIds:tail.slice(-3),compactedBy:A.alias},A.token);assert.equal(response.status,201,JSON.stringify(response));await h.settle();return response.body.commentId as string;
  }
  await t.test('canonical history includes own full bodies while inbox still omits own FROM',async()=>{
   const id=await post('작성자 자신의 원문 전체.');
   const canonical=await h.http(`${I}/comments?limit=500`,undefined,A.token);assert.equal(canonical.status,200,JSON.stringify(canonical));
   assert.match(canonical.body.items.find((i:any)=>i.id===id).body,/작성자 자신의 원문 전체/);
   const ownInbox=await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}&limit=500`,undefined,A.token);assert.equal(ownInbox.status,200);
   assert.ok(!ownInbox.body.items.some((i:any)=>i.commentId===id));
   assert.equal((await h.http(`${I}/comments?cursor=${ownInbox.body.refreshCursor}`,undefined,A.token)).status,409);
  });
  await t.test('I-15 state updates during incremental pagination wait for the next refresh',async()=>{
   let start=await pull();start=await pull(start.body.refreshCursor);const previous=start.body.refreshCursor;
   const ids=[await post('증분 페이지 첫 항목.'),await post('증분 페이지 두번째 항목.')];
   const first=await pull(previous,1);assert.equal(first.status,200);assert.ok(first.body.nextCursor);assert.equal(first.body.items[0].delivery.state,'posted');
   const secondId=ids.find(id=>id!==first.body.items[0].commentId)!;
   const d=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[secondId,B.aliasId])).rows[0];
   assert.equal((await h.http('/v1/deliveries/receipts',{deliveryIds:[d.id],attempts:[0]},B.token)).status,200);
   const last=await pull(first.body.nextCursor,500);assert.equal(last.status,200);assert.equal(last.body.nextCursor,null);
   assert.equal(last.body.items.find((i:any)=>i.commentId===secondId).delivery.state,'posted');assert.equal(last.body.bootstrap.inboxThroughEventSequence,first.body.bootstrap.inboxThroughEventSequence);
   const refreshed=await pull(last.body.refreshCursor);for(const id of ids) assert.equal(refreshed.body.items.find((i:any)=>i.commentId===id).delivery.state,'delivered');
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed`)).rows[0].count,'0');
  });
  await t.test('I-13 a new COMPACT cannot cut an existing page snapshot',async()=>{
   await post('첫 COMPACT 전.');const C1=await compact();await post('첫 경계 뒤 항목.');
   const first=await pull(undefined,1);assert.ok(first.body.nextCursor);assert.equal(first.body.compact.find((c:any)=>c.issueNumber===number).comment.id,C1);
   await post('페이지 도중 원문.');const C2=await compact();const after=await post('새 COMPACT 뒤 항목.');
   const last=await pull(first.body.nextCursor,500);assert.equal(last.body.compact.find((c:any)=>c.issueNumber===number).comment.id,C1);assert.deepEqual(last.body.bootstrap.issues,first.body.bootstrap.issues);assert.ok(!last.body.items.some((i:any)=>i.commentId===after));
   const refreshed=await pull(last.body.refreshCursor);assert.equal(refreshed.body.bootstrap.mode,'snapshot');assert.equal(refreshed.body.compact.find((c:any)=>c.issueNumber===number).comment.id,C2);assert.ok(refreshed.body.items.some((i:any)=>i.commentId===after));
  });
 }finally{await h.cleanup();}
});
