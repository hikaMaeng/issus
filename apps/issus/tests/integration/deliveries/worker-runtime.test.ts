import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {createWorkerServer,readEnv} from 'agent/broker';
import {createWorkerBindings,reactionCoordinates,tickSlot,produceTick} from 'issus_runtime/server';
import {QUEUES} from 'issus_domain/common';
import {reactions} from '../../../src/server/reactions/table/index.js';
import {startDeliveryHarness,seedFixtureSessions} from './harness.js';

test('actual agent worker consumer executes isolated intake→route→receipt→ACK',{timeout:90000},async()=>{
 const h=await startDeliveryHarness();let worker:ReturnType<typeof createWorkerServer>|undefined;
 try {
  const {A,B,I,number}=await seedFixtureSessions(h);for(const q of Object.values(QUEUES)) h.paused.add(q);await h.settle();
  const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const a=server.address();if(!a||typeof a==='string') return reject(new Error('no port'));server.close(()=>resolve(a.port));});});
  const url=new URL(process.env.ISSUS_TEST_DATABASE_URL!);url.searchParams.set('options',`-c search_path=${h.brokerSchema},public`);
  const env={...readEnv({DATABASE_URL:url.toString(),PORT:'18140',AGENT_ROLE:'worker',QUEUE_POLL_SECONDS:'1',AGENT_DATABASE_POOL_MAX:'4'}),port};
  worker=createWorkerServer({env,queues:Object.values(QUEUES).map(h.queueName),reactionQueues:[QUEUES.route,QUEUES.compact].map(h.queueName),maxConcurrent:8,executeWith:pool=>{
   const b=createWorkerBindings(pool,{schema:h.schema,clock:h.clock,queueName:h.queueName,reactions});
   return async(e,_signal,_emit,ctx)=>{
    if(ctx.queue===h.queueName(QUEUES.intake)) return b.intake.executeIngress(e,async()=>{if(!await ctx.fence()) throw new Error('fence lost');});
    if(ctx.queue===h.queueName(QUEUES.route)) return b.routing.react(reactionCoordinates(e));
    if(ctx.queue===h.queueName(QUEUES.compact)) return b.compact(reactionCoordinates(e));
    if(ctx.queue===h.queueName(QUEUES.schedule)) return e.action==='issus.clock.tick'?b.tick.tick(String(e.payload.slot)):b.deadline.react(reactionCoordinates(e));
    if(e.action==='issus.comment.posted') return b.references.react(reactionCoordinates(e));
    if(e.action==='issus.delivery.overdue') return b.retry.react(reactionCoordinates(e));
    return b.deliveries.executeIngress(e);
   };
  }});await worker.start();
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);
  const deadline=new Date(h.clock.now().getTime()+300000).toISOString().replace('.000Z','+00:00');
  const ask=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline}\nASK @${B.alias}: 실제 consumer 수신.\nNEXT: ACK.`},A.token);assert.equal(ask.status,201,JSON.stringify(ask));
  let delivery:any;
  for(let i=0;i<500;i++){delivery=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[ask.body.commentId,B.aliasId])).rows[0];if(delivery) break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(delivery,'real reaction consumer must accept prefixed queue identity');
  const received=await h.http('/v1/deliveries/receipts',{deliveryIds:[delivery.id],attempts:[0]},B.token);assert.equal(received.status,200,JSON.stringify(received));
  const ack=await h.http(`${I}/comments`,{body:`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${ask.body.commentId}\n수용 — 실제 consumer 경로.`},B.token);assert.equal(ack.status,201,JSON.stringify(ack));
  for(let i=0;i<500;i++){delivery=(await h.pool.query(`SELECT * FROM "${h.schema}".delivery WHERE id=$1`,[delivery.id])).rows[0];if(delivery.state==='acked') break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(delivery.state,'acked');
  assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE comment_id=$1 AND recipient_alias_id=$2`,[ask.body.commentId,B.aliasId])).rows[0].count,'1');
  const command=(await h.pool.query(`SELECT * FROM event_store WHERE kind='command' AND action='issus.comment.posted' AND source_event_id=$1 ORDER BY sequence LIMIT 1`,[delivery.source_event_id])).rows[0];assert.equal(command.source_stream_id,delivery.source_stream_id);assert.equal(String(command.source_sequence),String(delivery.source_sequence));
  await produceTick({pool:h.pool,schema:h.schema,queueName:h.queueName,clock:h.clock});
  for(let i=0;i<500;i++){if((await h.pool.query(`SELECT 1 FROM event_store WHERE action='issus.clock.tick.result' AND kind='result'`)).rowCount) break;await new Promise(r=>setTimeout(r,10));}
  assert.ok((await h.pool.query(`SELECT 1 FROM event_store WHERE action='issus.clock.tick.result' AND kind='result'`)).rowCount);
  assert.equal((await h.pool.query(`SELECT source FROM event_store WHERE action='issus.clock.tick' AND kind='command'`)).rows[0].source,'scheduler');
 }finally{await worker?.stop();await h.cleanup();}
});
