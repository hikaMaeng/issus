import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {startDeliveryHarness,seedFixtureSessions} from './harness.js';

test('Monitor protocol credential, alias-only automatic subscription and local revoke',{timeout:60000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const {A,B,I,number,repoId}=await seedFixtureSessions(h);
  const sub=await h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},B.token);assert.equal(sub.status,201);
  // Deliberately offer the credential first: the server must select only the public version.
  const socket=new WebSocket(`${h.base.replace('http','ws')}/ws?subscription=${sub.body.subscriptionId}&cursor=${sub.body.cursor}`,[`issus.bearer.${B.token}`,'issus.v1']),frames:any[]=[];
  socket.on('message',raw=>frames.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve,reject)=>{socket.once('open',()=>resolve());socket.once('error',reject);});
  async function until(predicate:(f:any)=>boolean,timeout=6000) {const end=Date.now()+timeout;while(Date.now()<end){const found=frames.find(predicate);if(found) return found;await new Promise(r=>setTimeout(r,10));}throw new Error('Monitor frame timeout');}
  assert.equal(socket.protocol,'issus.v1');
  const subscribed=await until(f=>f.type==='subscribed');assert.deepEqual(subscribed.channels,[`alias:${B.principal.ownerId}:${B.aliasId}`]);
  const deadline=new Date(h.clock.now().getTime()+300000).toISOString().replace('.000Z','+00:00');
  const posted=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline}\nASK @${B.alias}: Monitor 알림 확인.\nNEXT: HTTP 영수 후 ACK.`},A.token);assert.equal(posted.status,201,JSON.stringify(posted));await h.settle();
  const received=await until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.commentId===posted.body.commentId);
  assert.equal(received.event.payload.classification,'ME');assert.match(received.event.payload.content.body,/Monitor/);assert.equal(received.event.payload.content.envelope.TO,B.alias);assert.equal(received.event.payload.sourceStreamId,`channel:issue:${repoId}:${number}`);
  assert.ok(frames.filter(f=>f.type==='event').every(f=>f.event.channel===`alias:${B.principal.ownerId}:${B.aliasId}`));
  const receipt=await h.http('/v1/deliveries/receipts',{deliveryIds:[received.event.payload.deliveryId],attempts:[0],subscriptionId:sub.body.subscriptionId},B.token);assert.equal(receipt.status,200);
  const closed=new Promise<number>(resolve=>socket.once('close',code=>resolve(code))),revokedAt=Date.now();
  assert.equal((await h.http(`/v1/sessions/${B.sessionId}`,undefined,h.bootstrapToken,{method:'DELETE'})).status,200);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const code=await Promise.race([closed,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('local revoke was not immediate')),3000);})]).finally(()=>{if(timer) clearTimeout(timer);});assert.equal(code,1008);assert.ok(Date.now()-revokedAt<3000);
  assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.subscription.closed' AND payload->>'subscriptionId'=$1`,[sub.body.subscriptionId])).rows[0].count,'1');
  const eventText=JSON.stringify((await h.pool.query(`SELECT payload FROM event_store`)).rows);assert.ok(!eventText.includes(B.token));
  t.diagnostic(JSON.stringify({monitorProtocol:socket.protocol,clientSubscribeFrames:0,aliasChannels:subscribed.channels.length,receivedDeliveries:1,revokeCode:code,revokeMs:Date.now()-revokedAt,tokenInEvents:false}));
 }finally{await h.cleanup();}
});
