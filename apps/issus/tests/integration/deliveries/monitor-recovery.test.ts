import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {startDeliveryHarness,seedSessions} from './harness.js';
import {eventually} from './assembled-harness.js';

test('Monitor fixed /ws URL auto-subscribes and recovers only from the receipt-confirmed position',{timeout:90000},async t=>{
 const h=await startDeliveryHarness(),sockets:WebSocket[]=[];
 try {
  const {A,B,I,number}=await seedSessions(h);
  async function connect(query='') {
   const socket=new WebSocket(`${h.base.replace('http','ws')}/ws${query}`,['issus.v1',`issus.bearer.${B.token}`]),frames:any[]=[];sockets.push(socket);
   socket.on('message',raw=>frames.push(JSON.parse(String(raw))));
   await new Promise<void>((resolve,reject)=>{socket.once('open',()=>resolve());socket.once('error',reject);});
   const until=(predicate:(f:any)=>boolean):Promise<any>=>eventually<any>(async()=>frames.find(predicate),Boolean);
   const subscribed=await until(f=>f.type==='subscribed');assert.deepEqual(subscribed.channels,[`alias:${B.principal.ownerId}:${B.aliasId}`]);
   return {socket,frames,until,id:subscribed.subscriptionId};
  }
  const manual=await h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},B.token);assert.equal(manual.status,201);
  const one=await connect();assert.equal(one.id,manual.body.subscriptionId);
  const reused=await h.subscriptions.monitor(B.principal);assert.equal(reused.subscriptionId,one.id);
  await one.until(f=>f.type==='replay');
  for(const frame of one.frames.filter(f=>f.type==='event'&&f.event.action==='issus.delivery.queued')) {
   one.socket.send(JSON.stringify({type:'receipt',subscriptionId:one.id,deliveryIds:[frame.event.payload.deliveryId],attempts:[frame.event.payload.delivery.attempt],cursor:frame.cursor}));
   await one.until(f=>f.type==='event'&&f.event.action==='issus.delivery.delivered'&&f.event.payload.deliveryId===frame.event.payload.deliveryId);
  }
  const body=`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:2026-10-21T18:00+09:00\nASK @${B.alias}: 고정 URL 깨우기.\nNEXT: ACK.`;
  const ask=await h.http(`${I}/comments`,{body},A.token);assert.equal(ask.status,201,JSON.stringify(ask));await h.settle();
  const first=await one.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===ask.body.commentId);
  one.socket.send(JSON.stringify({type:'receipt',subscriptionId:one.id,deliveryIds:[first.event.payload.deliveryId],attempts:[0],cursor:first.cursor}));
  await one.until(f=>f.type==='event'&&f.event.action==='issus.delivery.delivered'&&f.event.payload.deliveryId===first.event.payload.deliveryId);
  assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery_receipt WHERE delivery_id=$1 AND transport='websocket'`,[first.event.payload.deliveryId])).rows[0].count,'1');
  const note=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n미영수 알림.\nNEXT: 재장전.`},A.token);assert.equal(note.status,201);await h.settle();
  await one.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===note.body.commentId);
  one.socket.close();await eventually(async()=>(await h.pool.query(`SELECT closed_at FROM "${h.schema}".subscription WHERE id=$1`,[one.id])).rows[0].closed_at,Boolean);
  const two=await connect();assert.notEqual(two.id,one.id);await two.until(f=>f.type==='replay');
  const replayed=await two.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===note.body.commentId);
  assert.ok(!two.frames.some(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===ask.body.commentId));
  two.socket.send(JSON.stringify({type:'receipt',subscriptionId:two.id,deliveryIds:[replayed.event.payload.deliveryId],attempts:[0],cursor:replayed.cursor}));
  await two.until(f=>f.type==='event'&&f.event.action==='issus.delivery.delivered'&&f.event.payload.deliveryId===replayed.event.payload.deliveryId);
  two.socket.close();await eventually(async()=>(await h.pool.query(`SELECT closed_at FROM "${h.schema}".subscription WHERE id=$1`,[two.id])).rows[0].closed_at,Boolean);
  const three=await connect(`?subscription=${two.id}&cursor=${first.cursor}`);assert.notEqual(three.id,two.id);await three.until(f=>f.type==='replay');
  assert.ok(!three.frames.some(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===note.body.commentId));
  const next=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n닫힌 id 승계 후 실시간.\nNEXT: 확인.`},A.token);assert.equal(next.status,201);await h.settle();
  await three.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===next.body.commentId);
  const later=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\n앞선 영수 gap보다 뒤의 알림.\nNEXT: 먼저 영수.`},A.token);assert.equal(later.status,201);await h.settle();
  const laterFrame=await three.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===later.body.commentId);
  three.socket.send(JSON.stringify({type:'receipt',subscriptionId:three.id,deliveryIds:[laterFrame.event.payload.deliveryId],attempts:[0],cursor:laterFrame.cursor}));
  await three.until(f=>f.type==='event'&&f.event.action==='issus.delivery.delivered'&&f.event.payload.deliveryId===laterFrame.event.payload.deliveryId);
  three.socket.close();await eventually(async()=>(await h.pool.query(`SELECT closed_at FROM "${h.schema}".subscription WHERE id=$1`,[three.id])).rows[0].closed_at,Boolean);
  const four=await connect();await four.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===next.body.commentId);
  assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".subscription WHERE session_id=$1 AND closed_at IS NULL`,[B.sessionId])).rows[0].count,'1');
  t.diagnostic(JSON.stringify({fixedUrl:true,clientSubscribeFrames:0,activeReuse:true,subscriptionGenerations:4,wsReceiptPersisted:true,unreceiptedReplay:true,receiptedQueuedReplay:0,closedIdRecovered:true,outOfOrderReceiptGapPreserved:true,issue:number}));
 }finally {for(const socket of sockets) socket.terminate();await h.cleanup();}
});
