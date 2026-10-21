import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MetricsRegistry,startReactionEnqueue} from 'agent/broker';
import {QUEUES} from 'issus_domain/common';
import {tickSlot} from 'issus_runtime/server';
import {startDeliveryHarness,seedSessions} from './harness.js';

test('P5 deadline recovery, retry cap and mention digest',{timeout:120000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const {A,B,I,number,alias}=await seedSessions(h),D=await alias('p5-1-observer');await h.settle();
  const deadline=(seconds=5)=>new Date(h.clock.now().getTime()+seconds*1000).toISOString().replace('.000Z','+00:00');
  const post=(body:string,token=A.token)=>h.http(`${I}/comments`,{body},token);
  await t.test('three retries maximum, immediate attempt3 escalation and 15-minute digest',async()=>{
   const ask=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()}\nASK @${B.alias}: 재전달 상한 확인.\nNEXT: ACK 대기.`);assert.equal(ask.status,201,JSON.stringify(ask));await h.settle();
   const d=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[ask.body.commentId,B.aliasId])).rows[0];
   for(const elapsed of [6000,30000,120000]) {h.advance(elapsed);await h.tick.tick(tickSlot(h.clock.now()));await h.settle();}
   assert.equal((await h.pool.query(`SELECT attempt FROM "${h.schema}".delivery WHERE id=$1`,[d.id])).rows[0].attempt,3);
   let escalations=(await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.delivery.escalated' AND channel='internal:delivery' AND payload->>'deliveryId'=$1`,[d.id])).rows[0].count;assert.equal(escalations,'1');
   h.advance(900000);await h.tick.tick(tickSlot(h.clock.now()));await h.settle();
   assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.delivery.redelivered' AND payload->>'deliveryId'=$1`,[d.id])).rows[0].count,'3');
   assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.delivery.escalated' AND channel='internal:delivery' AND payload->>'deliveryId'=$1`,[d.id])).rows[0].count,'2');
   assert.equal((await h.pool.query(`SELECT state FROM "${h.schema}".delivery WHERE id=$1`,[d.id])).rows[0].state,'posted');
   const report=await post(`FROM:${B.alias}/s1 TO:${A.alias} TYPE:REPORT STATE:blocked RE:${ask.body.commentId}\n호환 RE 해소.\nNEXT: 실제 ACK는 별도.`,B.token);assert.equal(report.status,201);await h.settle();
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".schedule WHERE entity_id=$1 AND state='pending'`,[d.id])).rows[0].count,'0');
  });
  await t.test('mention-only pending gets an informational digest and never a TO ACK obligation',async()=>{
   const ask=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()} CC:${D.alias}\nASK @${B.alias}: 직접 실행.\n참고 @${D.alias}.\nNEXT: 직접 TO와 참고 독자 구분.`);assert.equal(ask.status,201,JSON.stringify(ask));await h.settle();
   const d=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[ask.body.commentId,D.aliasId])).rows[0];assert.equal(d.ack_required,false);
   h.advance(6000);await h.tick.tick(tickSlot(h.clock.now()));await h.settle();
   const events=(await h.pool.query(`SELECT * FROM event_store WHERE action='issus.delivery.escalated' AND channel='internal:delivery' AND payload->>'deliveryId'=$1`,[d.id])).rows;assert.equal(events.length,1);assert.match(events[0].payload.reason,/mention-pending/);
   assert.equal((await h.pool.query(`SELECT state,attempt FROM "${h.schema}".delivery WHERE id=$1`,[d.id])).rows[0].attempt,0);
   assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE source_event_id=$1 AND recipient_alias_id=$2 AND ack_required=false`,[events[0].event_id,D.aliasId])).rows[0].count,'1');
  });
  await t.test('I-09 absent reaction cursor replays >24h old native facts with two broker leases',async()=>{
   const current=h.clock.now();h.setClock(new Date(current.getTime()-2*86400000));
   const old=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n48시간 전 미소비 fact.\nNEXT: 시작 커서 복구.`);assert.equal(old.status,201);h.setClock(current);await h.settle();
   const recovery=h.prefix+'recovery',name=h.prefix+'recovery-reader';await h.queue.ensure(recovery);
   const clients=await Promise.all([h.pool.connect(),h.pool.connect()]),key=Math.floor(Math.random()*1000000000);
   const held=[false,false];
   const leases=clients.map((client,index)=>({async held(){if(held[index]) return true;held[index]=(await client.query('SELECT pg_try_advisory_lock($1) AS ok',[key])).rows[0].ok;return held[index];},async release(){if(held[index]) await client.query('SELECT pg_advisory_unlock($1)',[key]);held[index]=false;}}));
   const loops=leases.map(lease=>startReactionEnqueue({name,eventStore:h.store,queue:h.queue,table:{'issus.comment.posted':[recovery]},metrics:new MetricsRegistry(),pollMs:10,batchSize:2,reconcileMs:0,lease}));
   try {
    const expected=Number((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.comment.posted' AND kind='fact'`)).rows[0].count);
    for(let i=0;i<300;i++){const n=Number((await h.pool.query(`SELECT count(*) FROM pgmq.q_${recovery}`)).rows[0].count);if(n===expected) break;await new Promise(r=>setTimeout(r,10));}
    const rows=(await h.pool.query(`SELECT message FROM pgmq.q_${recovery} ORDER BY msg_id`)).rows;
    assert.equal(rows.length,expected);assert.equal(new Set(rows.map(r=>r.message.sourceEventId)).size,expected);assert.ok(rows.some(r=>r.message.payload.commentId===old.body.commentId));
    assert.equal(held.filter(Boolean).length,1);
    const leader=held.findIndex(Boolean);loops[leader].stop();await loops[leader].done;await leases[leader].release();
    const fresh=await post(`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\nleader 승계 뒤 fact.\nNEXT: 복구.`);assert.equal(fresh.status,201);await h.settle();loops[1-leader].wake();
    for(let i=0;i<200;i++){if(Number((await h.pool.query(`SELECT count(*) FROM pgmq.q_${recovery}`)).rows[0].count)===expected+1) break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(Number((await h.pool.query(`SELECT count(*) FROM pgmq.q_${recovery}`)).rows[0].count),expected+1);
   }finally{for(const loop of loops) loop.stop();await Promise.all(loops.map(l=>l.done));for(const lease of leases) await lease.release();for(const client of clients) client.release();}
  });
 }finally{await h.cleanup();}
});
