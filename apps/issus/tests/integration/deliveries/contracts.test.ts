import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {QUEUES} from 'issus_domain/common';
import {tickSlot} from 'issus_runtime/server';
import {startDeliveryHarness,seedSessions} from './harness.js';

test('P5 compatibility, authorization, transaction and cursor contracts',{timeout:180000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const s=await seedSessions(h),{A,B,I,repoId,number}=s,D=await s.alias('p5-1-auditor');await h.settle();
  const deadline=()=>new Date(h.clock.now().getTime()+300000).toISOString().replace('.000Z','+00:00');
  const post=(who:typeof A,body:string,path=I)=>h.http(`${path}/comments`,{body},who.token);
  const pull=(token=B.token,cursor?:string)=>h.http(`/v1/inbox?repo=tester/delivery&issues=${number}${cursor?`&cursor=${cursor}`:''}`,undefined,token);
  let askId:string,deliveryId:string;
  await t.test('P5 router preserves public syntax validation before core authentication',async()=>{
   const syntax=await h.http('/v1/validate',{mode:'comment',body:`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n공개 문법 검사.`},'');assert.equal(syntax.status,200,JSON.stringify(syntax));
  });
  await t.test('I-14 ACK of board NOTE and another alias CLAIM remains a normal comment',async()=>{
   const note=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n게시판 정보.\nNEXT: 참고.`,'/v1/repos/tester/delivery/issues/1');assert.equal(note.status,201,JSON.stringify(note));
   assert.equal((await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${note.body.commentId}\n수용 — 게시판 메모 확인.`,'/v1/repos/tester/delivery/issues/1')).status,201);
   const claim=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:CLAIM DUE:${deadline()} SEEN:0\n점유: 시험 이슈.\nNEXT: 완료 후 RELEASE.`);assert.equal(claim.status,201,JSON.stringify(claim));
   assert.equal((await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${claim.body.commentId}\n수용 — 점유를 양보.`)).status,201);await h.settle();
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".directive WHERE comment_id=ANY($1::bigint[])`,[[note.body.commentId,claim.body.commentId]])).rows[0].count,'0');
  });
  await t.test('I-14 mention outranks CC but only actual TO has ackRequired',async()=>{
   const ask=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()} CC:${D.alias}\nASK @${B.alias}: 시험 결과 확인.\n참고 @${D.alias}. @unknown-1-reader는 미등록 본문.\nNEXT: ACK.`);assert.equal(ask.status,201,JSON.stringify(ask));askId=ask.body.commentId;await h.settle();
   const rows=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 ORDER BY recipient_alias_id`,[askId])).rows;
   const actual=rows.find(r=>r.recipient_alias_id===B.aliasId),mention=rows.find(r=>r.recipient_alias_id===D.aliasId);deliveryId=actual.id;
   assert.equal(actual.classification,'ME');assert.equal(actual.ack_required,true);assert.equal(mention.classification,'ME');assert.equal(mention.ack_required,false);assert.equal(rows.length,2);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[askId,A.aliasId])).rows[0].count,'0');
  });
  await t.test('I-14 third-party ACK has no TO effect, REPORT RE stops retry but ACK state waits',async()=>{
   assert.equal((await post(D,`FROM:${D.alias}/s1 TO:${A.alias} TYPE:ACK RE:${askId}\n수용 — 참조 독자 확인.`)).status,201);await h.settle();
   assert.equal((await h.pool.query(`SELECT acked_by_comment_id FROM "${h.schema}".directive WHERE comment_id=$1`,[askId])).rows[0].acked_by_comment_id,null);
   const report=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:REPORT STATE:running RE:${askId}\nACK와 별개인 호환 답변.\nNEXT: 직접 ACK는 후속.`);assert.equal(report.status,201,JSON.stringify(report));await h.settle();
   const inbox=await pull();assert.ok(!inbox.body.globalPendingAck.includes(askId));assert.equal(inbox.body.ackState.find((a:any)=>a.directiveId===askId).state,'waiting');
   h.advance(400000);await h.tick.tick(tickSlot(h.clock.now()));await h.settle();
   assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action=ANY($1::text[]) AND payload->>'deliveryId'=$2`,[['issus.delivery.overdue','issus.delivery.redelivered','issus.delivery.escalated'],deliveryId])).rows[0].count,'0');
   const final=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:REPORT STATE:done\n닫기 gate 시험.\nNEXT: 검증.`);assert.equal(final.status,201);
   const close=await h.http(`${I}/close`,{reason:'gate test',finalReportId:final.body.commentId},A.token,{headers:{'if-match':'1'}});assert.equal(close.status,409);assert.ok(close.body.error.details.waitingDirectives.includes(askId));
   const ack=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${askId}\n수용 — 실제 TO 직접 ACK.`);assert.equal(ack.status,201,JSON.stringify(ack));await h.settle();
   assert.equal((await h.pool.query(`SELECT state FROM "${h.schema}".delivery WHERE id=$1`,[deliveryId])).rows[0].state,'acked');
  });
  await t.test('I-D1 ACK before route produces explicit ack-evidence and never regresses',async()=>{
   h.paused.add(QUEUES.route);
   const ask=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()}\nASK @${B.alias}: 역순 반응 확인.\nNEXT: ACK.`);assert.equal(ask.status,201,JSON.stringify(ask));
   const ack=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${ask.body.commentId}\n수용 — 라우팅 전에 ACK.`);assert.equal(ack.status,201,JSON.stringify(ack));
   h.paused.delete(QUEUES.route);await h.settle();
   const d=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[ask.body.commentId,B.aliasId])).rows[0];assert.equal(d.state,'acked');
   assert.equal((await h.pool.query(`SELECT transport FROM "${h.schema}".delivery_receipt WHERE delivery_id=$1`,[d.id])).rows[0].transport,'ack-evidence');
   assert.equal((await h.http('/v1/deliveries/receipts',{deliveryIds:[d.id],attempts:[0]},B.token)).status,200);assert.equal((await h.pool.query(`SELECT state FROM "${h.schema}".delivery WHERE id=$1`,[d.id])).rows[0].state,'acked');
  });
  await t.test('I-09 route rows, facts and queue sends roll back together',async()=>{
   h.paused.add(QUEUES.route);
   const posted=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()}\nASK @${B.alias}: 원자성 확인.\nNEXT: ACK.`);assert.equal(posted.status,201);await h.settle();
   const e=(await h.pool.query(`SELECT event_id,stream_id,sequence FROM event_store WHERE action='issus.comment.posted' AND payload->>'commentId'=$1`,[posted.body.commentId])).rows[0];
   const input={sourceEventId:e.event_id,sourceStreamId:e.stream_id,sourceSequence:String(e.sequence),action:'issus.comment.posted',payload:{ownerId:A.principal.ownerId}};
   h.failAppend(true);await assert.rejects(()=>h.routing.react(input),/injected append/);h.failAppend(false);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE source_event_id=$1`,[e.event_id])).rows[0].count,'0');
   h.failSend(true);await assert.rejects(()=>h.routing.react(input),/injected send/);h.failSend(false);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE source_event_id=$1`,[e.event_id])).rows[0].count,'0');
   assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.delivery.queued' AND payload->>'sourceEventId'=$1`,[e.event_id])).rows[0].count,'0');
   assert.equal(await h.routing.react(input),true);h.paused.delete(QUEUES.route);await h.settle();
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE source_event_id=$1`,[e.event_id])).rows[0].count,'1');
  });
  await t.test('I-10 HTTP cursor scope, expiry and forbidden channel set',async()=>{
   const inbox=await pull(),cursor=inbox.body.refreshCursor;assert.equal((await pull(A.token,cursor)).status,409);
   assert.equal((await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}&sinceCompact=false&cursor=${cursor}`,undefined,B.token)).status,409);
   await h.pool.query(`UPDATE "${h.schema}".history_snapshot SET expires_at=$2 WHERE id=$1`,[cursor,new Date(h.clock.now().getTime()-1)]);assert.equal((await pull(B.token,cursor)).status,410);
   for(const channels of [['internal:intake'],[`alias:${A.principal.ownerId}:${A.aliasId}`],[`session:${A.sessionId}`],['unknown:channel']]) {
    const sub=await h.http('/v1/subscriptions',{channels,from:'now',repo:'tester/delivery',issues:[number]},B.token);assert.equal(sub.status,403,JSON.stringify(sub));
   }
   assert.equal((await h.http('/v1/deliveries/receipts',{deliveryIds:Array(101).fill(deliveryId),attempts:Array(101).fill(0)},B.token)).status,422);
  });
  await t.test('I-10 WS foreign alias and ingress mutations close with 1008',async()=>{
   const sub=await h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},B.token);assert.equal(sub.status,201);
   const ws=await h.ws(B.token),closed=new Promise<number>(resolve=>ws.socket.once('close',code=>resolve(code)));
   ws.socket.send(JSON.stringify({type:'subscribe',subscriptionId:sub.body.subscriptionId,channels:[`alias:${A.principal.ownerId}:${A.aliasId}`],cursor:sub.body.cursor}));
   await ws.until(f=>f.type==='error');assert.equal(await closed,1008);
   const mut=await h.ws(B.token),mutationClosed=new Promise<number>(resolve=>mut.socket.once('close',code=>resolve(code)));
   mut.socket.send(JSON.stringify({type:'event',action:'issus.comment.post',transactionKey:randomUUID(),channel:'internal:intake',sessionId:B.sessionId,payload:{body:'forbidden'}}));
   await mut.until(f=>f.type==='error');assert.equal(await mutationClosed,1008);
  });
  await t.test('I-11 immutable small pages exclude later commits until refresh',async()=>{
   const first=await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}&limit=1`,undefined,B.token);assert.equal(first.status,200);assert.ok(first.body.nextCursor);
   const posted=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n페이지 도중 새 댓글.\nNEXT: refresh.`);assert.equal(posted.status,201);await h.settle();
   const items=[...first.body.items],boundary=first.body.bootstrap;let page=first;
   while(page.body.nextCursor){page=await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}&limit=1&cursor=${page.body.nextCursor}`,undefined,B.token);assert.deepEqual(page.body.bootstrap.issues,boundary.issues);items.push(...page.body.items);}
   assert.ok(!items.some((i:any)=>i.commentId===posted.body.commentId));assert.equal(new Set(items.map((i:any)=>i.viewKey)).size,items.length);
   const refreshed=await pull(B.token,page.body.refreshCursor);assert.ok(refreshed.body.items.some((i:any)=>i.commentId===posted.body.commentId));
  });
  await t.test('shared history builder keeps single-issue scope, compact content, stats and immutable metadata',async()=>{
   const first=await h.http(`${I}/comments?limit=1`,undefined,B.token);assert.equal(first.status,200,JSON.stringify(first));assert.ok(first.body.nextCursor);assert.ok(first.body.stats);assert.ok(first.body.snapshot.highWater);
   const cursor=first.body.nextCursor;
   const note=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\nhistory snapshot 이후.\nNEXT: refresh.`);assert.equal(note.status,201);await h.settle();
   const next=await h.http(`${I}/comments?limit=1&cursor=${cursor}`,undefined,B.token);assert.equal(next.status,200);assert.deepEqual(next.body.snapshot,first.body.snapshot);assert.deepEqual(next.body.stats,first.body.stats);assert.equal(next.body.bootstrap.issues.length,1);assert.equal(next.body.bootstrap.issues[0].issueNumber,number);
  });
 }finally{await h.cleanup();}
});
