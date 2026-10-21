import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cursorScope} from 'agent/broker';
import type {EventDraft} from 'agent/common';
import {startDeliveryHarness,seedSessions} from './harness.js';

test('P5 real WS and SSE immutable transport',{timeout:120000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const {A,B,I,number,repoId}=await seedSessions(h),channel=`alias:${B.principal.ownerId}:${B.aliasId}`;
  const sub=()=>h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},B.token);
  const append=async(count:number,tag:string)=>h.store.appendMany(Array.from({length:count},(_,index):EventDraft=>({eventId:randomUUID(),eventVersion:1,kind:'fact',action:'p5.transport.boundary',streamId:`channel:${channel}`,channel,transactionKey:randomUUID(),correlationId:randomUUID(),source:'worker',audience:'client',payload:{ownerId:B.principal.ownerId,index,tag},createdAt:h.clock.now().toISOString()})));
  await t.test('I-10 >256 replay resumes without loss and original token is immutable',async()=>{
   const opened=await sub();assert.equal(opened.status,201);const principal=await h.auth.verify(B.token);
   const original=await h.store.openChannelCursor(opened.body.channels,opened.body.cursor,cursorScope(principal));
   const expected=await append(300,'paged-replay'),ws=await h.ws(B.token);
   const subscribe=(cursor:string)=>ws.socket.send(JSON.stringify({type:'subscribe',subscriptionId:opened.body.subscriptionId,channels:opened.body.channels,cursor}));
   subscribe(opened.body.cursor);const first=await ws.until(f=>f.type==='replay'&&!f.replayComplete,30000);assert.ok(first.cursor);
   subscribe(first.cursor);await ws.until(f=>f.type==='replay'&&f.replayComplete&&f.cursor!==first.cursor,30000);
   const actual=ws.frames.filter(f=>f.type==='event'&&f.event.payload.tag==='paged-replay').map(f=>f.event.eventId);
   assert.equal(actual.length,300);assert.equal(new Set(actual).size,300);assert.deepEqual(new Set(actual),new Set(expected.map(e=>e.eventId)));
   assert.deepEqual((await h.store.openChannelCursor(opened.body.channels,opened.body.cursor,cursorScope(principal))).positions,original.positions);
   ws.socket.close();
  });
  await t.test('I-10 barrier commit after high-water capture crosses replay/live without loss',async()=>{
   const opened=await sub();assert.equal(opened.status,201);
   const original=h.store.channelHighWater.bind(h.store);let fired=false;
   h.store.channelHighWater=async channels=>{const water=await original(channels);if(!fired){fired=true;await append(1,'watermark-barrier');}return water;};
   try {
    const ws=await h.ws(B.token);ws.socket.send(JSON.stringify({type:'subscribe',subscriptionId:opened.body.subscriptionId,channels:opened.body.channels,cursor:opened.body.cursor}));
    const event=await ws.until(f=>f.type==='event'&&f.event.payload.tag==='watermark-barrier');assert.ok(event.cursor);assert.equal(ws.frames.filter(f=>f.type==='event'&&f.event.eventId===event.event.eventId).length,1);ws.socket.close();
   }finally{h.store.channelHighWater=original;}
  });
  await t.test('I-10 SSE sends equivalent frames, HTTP receipt, disconnect fact and cursor resume',async()=>{
   const opened=await h.http('/v1/subscriptions?transport=sse',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},B.token);assert.equal(opened.status,201,JSON.stringify(opened));
   const controller=new AbortController();
   const response=await fetch(`${h.base}/v1/stream?subscription=${opened.body.subscriptionId}&cursor=${opened.body.cursor}`,{headers:{authorization:`Bearer ${B.token}`},signal:controller.signal});
   assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/text\/event-stream/);assert.equal(response.headers.get('cache-control'),'no-store');
   const reader=response.body!.getReader(),decoder=new TextDecoder(),frames:any[]=[];let pending='';
   async function until(predicate:(f:any)=>boolean) {
    const end=Date.now()+6000;
    while(Date.now()<end) {
     const match=frames.find(predicate);if(match) return match;
     let timer:ReturnType<typeof setTimeout>|undefined;
     const next=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('SSE read timeout')),6000);})]).finally(()=>{if(timer) clearTimeout(timer);});
     if(next.done) throw new Error('SSE ended before expected frame');pending+=decoder.decode(next.value,{stream:true});
     let at:number;while((at=pending.indexOf('\n\n'))>=0){const block=pending.slice(0,at);pending=pending.slice(at+2);const data=block.split('\n').find(l=>l.startsWith('data:'))?.slice(5);if(data) frames.push(JSON.parse(data));}
    }
    throw new Error('SSE frame timeout');
   }
   try {
    await until(f=>f.type==='subscribed');
    const posted=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\nSSE 실제 전달.\nNEXT: HTTP receipt.`},A.token);assert.equal(posted.status,201);await h.settle();
    const event=await until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===posted.body.commentId);
    const receipt=await h.http('/v1/deliveries/receipts',{deliveryIds:[event.event.payload.deliveryId],attempts:[0],subscriptionId:opened.body.subscriptionId},B.token);assert.equal(receipt.status,200,JSON.stringify(receipt));
    assert.equal((await h.pool.query(`SELECT transport FROM "${h.schema}".delivery_receipt WHERE delivery_id=$1`,[event.event.payload.deliveryId])).rows[0].transport,'sse');
    const received=await until(f=>f.type==='event'&&f.event.action==='issus.delivery.delivered'&&f.event.payload.deliveryId===event.event.payload.deliveryId);assert.notEqual(received.cursor,event.cursor);
    const isolated=JSON.parse(JSON.stringify(received)).event.payload;
    assert.deepEqual(isolated.issue,{repoId,issueNumber:number});assert.equal(isolated.commentId,posted.body.commentId);assert.equal(isolated.priority,'ME');assert.equal(isolated.delivery.state,'delivered');assert.equal(isolated.envelope.TO,B.alias);assert.match(isolated.content.body,/SSE 실제 전달/);
    const saved=await h.store.openChannelCursor(opened.body.channels,event.cursor,cursorScope(await h.auth.verify(B.token)));assert.equal(saved.positions[event.event.streamId],event.event.sequence);
   }finally{controller.abort();await reader.cancel().catch(()=>{});}
   for(let i=0;i<50;i++){const row=(await h.pool.query(`SELECT closed_at FROM "${h.schema}".subscription WHERE id=$1`,[opened.body.subscriptionId])).rows[0];if(row.closed_at) break;await new Promise(r=>setTimeout(r,10));}
   assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.subscription.closed' AND payload->>'subscriptionId'=$1`,[opened.body.subscriptionId])).rows[0].count,'1');
  });
 }finally{await h.cleanup();}
});
