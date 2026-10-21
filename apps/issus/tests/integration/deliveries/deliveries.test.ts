import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startDeliveryHarness,seedSessions} from './harness.js';
import {QUEUES} from 'issus_domain/common';
import {RoutingService,sha256} from 'issus_domain/server';
import {produceTick,tickSlot} from 'issus_runtime/server';

test('P5 real DB delivery flow', {timeout:120000}, async t=>{
 const h=await startDeliveryHarness();
 try {
  const s=await seedSessions(h),{A,B,I,repoId,number}=s;
  let askId:string,deliveryId:string,ackId:string,reportId:string,holdId:string,holdDelivery:string,refresh:string;
  let authorWs:Awaited<ReturnType<typeof h.ws>>;
  const deadline=(seconds=300)=>new Date(h.clock.now().getTime()+seconds*1000).toISOString().replace('.000Z','+00:00');
  const post=(who:typeof A,body:string,metadata:Record<string,unknown>={})=>h.http(`${I}/comments`,{body,...metadata},who.token);
  const pull=(who= B,cursor?:string,limit=500)=>h.http(`/v1/inbox?repo=tester/delivery&issues=${number}&limit=${limit}${cursor?`&cursor=${cursor}`:''}`,undefined,who.token);
  await t.test('I-01 native alias subscription and ready/subscribed',async()=>{
   const sub=await h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},B.token);
   assert.equal(sub.status,201,JSON.stringify(sub));
   const ws=await h.ws(B.token);await ws.until(f=>f.type==='ready');
   ws.socket.send(JSON.stringify({type:'subscribe',subscriptionId:sub.body.subscriptionId,channels:sub.body.channels,cursor:sub.body.cursor}));
   await ws.until(f=>f.type==='subscribed');ws.socket.close();
   const aSub=await h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},A.token);assert.equal(aSub.status,201);
   authorWs=await h.ws(A.token);authorWs.socket.send(JSON.stringify({type:'subscribe',subscriptionId:aSub.body.subscriptionId,channels:aSub.body.channels,cursor:aSub.body.cursor}));await authorWs.until(f=>f.type==='subscribed');
  });
  await t.test('I-02 ASK route and pull receipt',async()=>{
   const body=`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()}\nASK @${B.alias}: 전달 확인.\nNEXT: ACK.\n---\n근거: integration`,key=randomUUID();
   const posted=await h.http(`${I}/comments`,{body},A.token,{key});assert.equal(posted.status,201,JSON.stringify(posted));askId=posted.body.commentId;await h.settle();
   assert.deepEqual(await h.http(`${I}/comments`,{body},A.token,{key}),posted);
   assert.equal((await h.http(`${I}/comments`,{body},A.token)).status,409);
   const pull=await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}`,undefined,B.token);assert.equal(pull.status,200,JSON.stringify(pull));
   const item=pull.body.items.find((i:any)=>i.commentId===posted.body.commentId);assert.equal(item.priority,'ME');assert.ok(item.delivery);
   deliveryId=item.delivery.id;assert.ok(pull.body.globalPendingAck.includes(askId));
   const d=(await h.pool.query(`SELECT state FROM "${h.schema}".delivery WHERE id=$1`,[item.delivery.id])).rows[0];assert.equal(d.state,'delivered');
   assert.equal(Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[askId,B.aliasId])).rows[0].count),1);
  });
  await t.test('I-D1 authentication, ownership, duplicate receipt and no implicit ACK',async()=>{
   assert.equal((await h.http('/v1/deliveries/receipts',{deliveryIds:[deliveryId],attempts:[0]},'')).status,401);
   assert.equal((await h.http('/v1/deliveries/receipts',{deliveryIds:[deliveryId],attempts:[0]},A.token)).status,403);
   const key=randomUUID(),input={deliveryIds:[deliveryId],attempts:[0]};
   const one=await h.http('/v1/deliveries/receipts',input,B.token,{key});assert.equal(one.status,200);assert.deepEqual(await h.http('/v1/deliveries/receipts',input,B.token,{key}),one);
   assert.equal((await h.http('/v1/deliveries/receipts',input,B.token)).status,200);
   assert.equal(Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery_receipt WHERE delivery_id=$1 AND attempt=0`,[deliveryId])).rows[0].count),1);
   assert.equal((await h.http(`/v1/deliveries/${deliveryId}/application`,{evidenceCommentId:askId,outcome:'applied'},B.token)).status,409);
   const row=(await h.pool.query(`SELECT state FROM "${h.schema}".delivery WHERE id=$1`,[deliveryId])).rows[0];assert.equal(row.state,'delivered');
  });
  await t.test('I-03 direct ACK, REPORT application and late receipt are monotone',async()=>{
   const ack=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${askId}\n수용 — 전달을 확인했다.\nNEXT: 반영 보고.`);assert.equal(ack.status,201,JSON.stringify(ack));ackId=ack.body.commentId;await h.settle();
   assert.equal((await h.pool.query(`SELECT state FROM "${h.schema}".delivery WHERE id=$1`,[deliveryId])).rows[0].state,'acked');
   assert.equal((await h.http(`/v1/deliveries/${deliveryId}/application`,{evidenceCommentId:askId,outcome:'applied'},B.token)).status,422);
   const report=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:REPORT STATE:done RE:${askId}\n반영 완료.\nNEXT: 검증.\n---\n근거: integration`);assert.equal(report.status,201,JSON.stringify(report));reportId=report.body.commentId;
   const apply=await h.http(`/v1/deliveries/${deliveryId}/application`,{evidenceCommentId:reportId,outcome:'applied'},B.token);assert.equal(apply.status,200,JSON.stringify(apply));
   assert.equal((await h.http('/v1/deliveries/receipts',{deliveryIds:[deliveryId],attempts:[0]},B.token)).status,200);
   const row=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE id=$1`,[deliveryId])).rows[0];assert.equal(row.state,'applied');assert.ok(BigInt(row.alias_event_sequence)>0n);
   const inbox=await pull();assert.ok(!inbox.body.globalPendingAck.includes(askId));assert.equal(inbox.body.ackState.find((a:any)=>a.directiveId===askId).state,'applied');
  });
  await t.test('I-04 HOLD attempt1/2 and OWNER escalation, no additional comments',async()=>{
   const hold=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:HOLD ACK-BY:${deadline(5)} SEEN:${reportId}\n시험 작업 중단.\nASK @${B.alias}: 중단 상태를 ACK로 보고.\nNEXT: 해제 전 보류.`);assert.equal(hold.status,201,JSON.stringify(hold));holdId=hold.body.commentId;await h.settle();
   let inbox=await pull();holdDelivery=inbox.body.items.find((i:any)=>i.commentId===holdId).delivery.id;
   // Complete a refresh that includes the initial pull receipt before measuring H/A/E.
   inbox=await pull(B,inbox.body.refreshCursor);refresh=inbox.body.refreshCursor;
   const before=inbox.body.bootstrap,count=(await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment`)).rows[0].count;
   h.advance(6000);const tick=await h.tick.tick(tickSlot(h.clock.now()));assert.ok(tick.overdue>=1);await h.settle();
   h.advance(30000);await h.tick.tick(tickSlot(h.clock.now()));await h.settle();
   const d=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE id=$1`,[holdDelivery])).rows[0];assert.equal(d.attempt,2);assert.equal(d.state,'delivered');
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment`)).rows[0].count,count);
   const escalated=(await h.pool.query(`SELECT * FROM event_store WHERE action='issus.delivery.escalated' AND channel='internal:delivery' AND payload->>'deliveryId'=$1`,[holdDelivery])).rows;assert.equal(escalated.length,1);
   const ownerNotification=(await h.pool.query(`SELECT d.* FROM "${h.schema}".delivery d JOIN event_store e ON e.event_id=d.source_event_id::text WHERE e.action='issus.delivery.escalated' AND d.recipient_alias_id=$1 AND e.payload->>'deliveryId'=$2`,[A.aliasId,holdDelivery])).rows;assert.equal(ownerNotification.length,1);
   await authorWs.until(f=>f.type==='event'&&f.event.payload.deliveryId===ownerNotification[0].id);
   assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE channel=$1 AND action='issus.delivery.escalated' AND payload->>'deliveryId'=$2`,[`supervisor:${A.principal.ownerId}`,holdDelivery])).rows[0].count,'1');
   const refreshed=await pull(B,refresh);assert.equal(refreshed.status,200,JSON.stringify(refreshed));
   const item=refreshed.body.items.find((i:any)=>i.delivery?.id===holdDelivery);assert.equal(item.delivery.attempt,2);assert.equal(refreshed.body.bootstrap.mode,'incremental');
   assert.deepEqual(refreshed.body.bootstrap.issues,before.issues);assert.equal(refreshed.body.bootstrap.inboxThroughOrdinal,before.inboxThroughOrdinal);assert.ok(BigInt(refreshed.body.bootstrap.inboxThroughEventSequence)>BigInt(before.inboxThroughEventSequence));
   refresh=refreshed.body.refreshCursor;
   t.diagnostic(JSON.stringify({core:'HOLD refresh',commentCountBefore:count,commentCountAfter:(await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment`)).rows[0].count,holdAttempt:d.attempt,ownerEscalations:ownerNotification.length,internalEscalations:escalated.length,refreshRows:refreshed.body.items.filter((i:any)=>i.delivery?.id===holdDelivery).length,H:refreshed.body.bootstrap.issues,A:refreshed.body.bootstrap.inboxThroughOrdinal,E_before:before.inboxThroughEventSequence,E_after:refreshed.body.bootstrap.inboxThroughEventSequence}));
  });
  await t.test('I-15 same-attempt receipt/state refresh, immutable repeated cursor',async()=>{
   const posted=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n동일 attempt 상태 갱신.\nNEXT: 확인.`);assert.equal(posted.status,201);await h.settle();
   const before=await pull(),item=before.body.items.find((i:any)=>i.commentId===posted.body.commentId),stateCursor=before.body.refreshCursor;
   assert.equal(item.delivery.state,'posted');
   const first=await pull(B,stateCursor),again=await pull(B,stateCursor);assert.equal(first.status,200);assert.deepEqual(first.body.items,again.body.items);
   const changed=first.body.items.find((i:any)=>i.delivery?.id===item.delivery.id);assert.equal(changed.delivery.state,'delivered');assert.equal(changed.delivery.attempt,item.delivery.attempt);assert.equal(changed.delivery.ordinal,item.delivery.ordinal);assert.ok(BigInt(changed.delivery.aliasEventSequence)>BigInt(item.delivery.aliasEventSequence));
   assert.deepEqual(first.body.bootstrap.issues,before.body.bootstrap.issues);assert.equal(first.body.bootstrap.inboxThroughOrdinal,before.body.bootstrap.inboxThroughOrdinal);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery_receipt WHERE delivery_id=$1 AND attempt=0`,[item.delivery.id])).rows[0].count,'1');
  });
  await t.test('I-05 ACK does not release HOLD; DECISION SUPERSEDES does',async()=>{
   const ack=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${holdId} STATE:hold\n수용 — 시험 프로세스 없음, 중단 유지.\nNEXT: 해제 대기.`);assert.equal(ack.status,201,JSON.stringify(ack));await h.settle();
   const blocked=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:CLAIM DUE:${deadline()} SEEN:${ack.body.commentId}\n점유: 시험 작업.\nNEXT: 시작.`);assert.equal(blocked.status,409);assert.equal(blocked.body.error.code,'ACTIVE_HOLD');
   assert.ok((await pull()).body.activeHolds.includes(holdId));
   const decision=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:DECISION ACK-BY:${deadline()} SUPERSEDES:${holdId}\nDECISION: 시험 HOLD 해제.\nNEXT: ACK 후 진행.`,{compactDeferredReason:'실DB 전달 시험의 긴급 해제'});assert.equal(decision.status,201,JSON.stringify(decision));await h.settle();
   assert.ok(!(await pull()).body.activeHolds.includes(holdId));
   assert.equal((await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${decision.body.commentId}\n수용 — 해제 확인.\nNEXT: 시험 계속.`)).status,201);await h.settle();
  });
  await t.test('I-09 restart/rebuild source dedupe and forged provenance rejection',async()=>{
   const e=(await h.pool.query(`SELECT event_id,stream_id,sequence FROM event_store WHERE action='issus.comment.posted' AND payload->>'commentId'=$1`,[askId])).rows[0];
   const input={sourceEventId:e.event_id,sourceStreamId:e.stream_id,sourceSequence:String(e.sequence),action:'issus.comment.posted',payload:{ownerId:A.principal.ownerId}};
   const before=(await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery`)).rows[0].count;
   const restarted=new RoutingService(h.uow);assert.equal(await restarted.react(input),false);
   await h.pool.query(`DELETE FROM "${h.schema}".projection_applied WHERE projection_name='p5-routing' AND source_event_id=$1`,[e.event_id]);assert.equal(await restarted.react(input),true);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery`)).rows[0].count,before);
   await assert.rejects(()=>restarted.react({...input,sourceSequence:'999999'}),/REACTION_SOURCE_INVALID/);
  });
  await t.test('I-11 late route of a small comment id is recovered by new ordinal',async()=>{
   h.paused.add(QUEUES.route);
   const note=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n늦은 라우팅.\nNEXT: 확인.`);assert.equal(note.status,201);
   let inbox=await pull();const old=inbox.body.items.find((i:any)=>i.commentId===note.body.commentId);assert.ok(old);assert.equal(old.delivery,undefined);
   const cursor=inbox.body.refreshCursor;h.paused.delete(QUEUES.route);await h.settle();inbox=await pull(B,cursor);
   const late=inbox.body.items.find((i:any)=>i.commentId===note.body.commentId);assert.ok(late.delivery);assert.equal(late.sourceEventId,old.sourceEventId);
  });
  await t.test('I-11 read leaves processing empty, high ordinal cannot skip an unprocessed prefix',async()=>{
   const before=(await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed`)).rows[0].count;await pull();await pull();assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed`)).rows[0].count,before);
   const firstGap=(await h.pool.query(`SELECT min(ordinal)::text AS ordinal FROM "${h.schema}".delivery WHERE recipient_alias_id=$1`,[B.aliasId])).rows[0].ordinal;
   const processed=await h.http('/v1/inbox/process',{deliveryIds:[deliveryId],disposition:'acked',evidenceCommentId:ackId},B.token);assert.equal(processed.status,200,JSON.stringify(processed));assert.ok(BigInt(processed.body.ordinal)<BigInt(firstGap));
  });
  await t.test('I-13 new alias bootstrap includes existing COMPACT and ALL without retro-delivery',async()=>{
   const history=(await h.pool.query(`SELECT id FROM "${h.schema}".comment WHERE repo_id=$1 AND issue_number=$2 ORDER BY id`,[repoId,number])).rows.map(r=>r.id as string),through=history.at(-1)!;
   const issue=(await h.pool.query(`SELECT revision FROM "${h.schema}".issue WHERE repo_id=$1 AND number=$2`,[repoId,number])).rows[0],token=randomUUID(),hash=sha256('p5-fixture');
   // Fixture packet only. P6's packet builder is deliberately outside this P5 target.
   await h.pool.query(`INSERT INTO "${h.schema}".compact_packet(id,owner_id,repo_id,issue_number,through_id,snapshot_revision,packet_hash,token_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}',$9)`,[randomUUID(),A.principal.ownerId,repoId,number,through,issue.revision,hash,sha256(token),deadline()]);
   const compact=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:COMPACT SEEN:${through}\n## ===== COMPACT #${number} through ${through} =====\n전달 시험 구간. 미확인: 없음.\nNEXT: bootstrap.\n---\ncompacted-by:${A.alias}`,{compactPacketToken:token,sampledIds:history.slice(-3),compactedBy:A.alias});assert.equal(compact.status,201,JSON.stringify(compact));
   const all=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n가입 전 ALL.\nNEXT: 신규 별칭 확인.`);assert.equal(all.status,201);await h.settle();
   const C=await s.alias('p5-1-newcomer');await h.settle();const inbox=await pull(C);assert.equal(inbox.status,200,JSON.stringify(inbox));
   assert.equal(inbox.body.bootstrap.mode,'snapshot');assert.ok(inbox.body.compact.some((c:any)=>c.comment?.id===compact.body.commentId));
   const item=inbox.body.items.find((i:any)=>i.commentId===all.body.commentId);assert.ok(item);assert.equal(item.priority,'ALL');assert.equal(item.delivery,undefined);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE recipient_alias_id=$1 AND comment_id=$2`,[C.aliasId,all.body.commentId])).rows[0].count,'0');
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed WHERE alias_id=$1`,[C.aliasId])).rows[0].count,'0');
   t.diagnostic(JSON.stringify({core:'new alias bootstrap',bootstrapMode:inbox.body.bootstrap.mode,compactCount:inbox.body.compact.filter((c:any)=>c.comment).length,allRows:inbox.body.items.filter((i:any)=>i.commentId===all.body.commentId).length,retroDeliveries:0,processed:0}));
  });
  await t.test('scheduler producer has durable UTC-slot dedupe with competing producers',async()=>{
   const opts={pool:h.pool,schema:h.schema,queueName:h.queueName,clock:h.clock};
   const result=await Promise.all([produceTick(opts),produceTick(opts)]);assert.equal(result.filter(Boolean).length,1);assert.equal(await produceTick(opts),false);await h.settle();
   assert.equal((await h.pool.query(`SELECT source FROM event_store WHERE action='issus.clock.tick' AND kind='command' ORDER BY created_at DESC LIMIT 1`)).rows[0].source,'scheduler');
  });
 } finally {await h.cleanup();}
});
