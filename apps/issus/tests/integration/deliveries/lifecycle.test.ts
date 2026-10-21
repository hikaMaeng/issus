import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cursorScope} from 'agent/broker';
import {sha256} from 'issus_domain/server';
import {startDeliveryHarness,seedSessions} from './harness.js';
test('WS/SSE canonical bootstrap and graceful SSE drain',{timeout:90000},async t=>{
 const h=await startDeliveryHarness();
 try {
  const {A,I,repoId,number,alias}=await seedSessions(h);
  const first=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\nCOMPACT 전.\nNEXT: 요약.`},A.token);assert.equal(first.status,201);
  const token=randomUUID(),revision=(await h.pool.query(`SELECT revision FROM "${h.schema}".issue WHERE repo_id=$1 AND number=$2`,[repoId,number])).rows[0].revision;
  await h.pool.query(`INSERT INTO "${h.schema}".compact_packet(id,owner_id,repo_id,issue_number,through_id,snapshot_revision,packet_hash,token_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}',$9)`,[randomUUID(),A.principal.ownerId,repoId,number,first.body.commentId,revision,sha256(token),sha256(token),new Date(h.clock.now().getTime()+600000)]);
  const compact=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:ALL TYPE:COMPACT SEEN:${first.body.commentId}\n## ===== COMPACT #${number} through ${first.body.commentId} =====\n전송 bootstrap 시험. 미확인: 없음.\nNEXT: ALL.\n---\ncompacted-by:${A.alias}`,compactPacketToken:token,sampledIds:[first.body.commentId],compactedBy:A.alias},A.token);assert.equal(compact.status,201,JSON.stringify(compact));
  const all=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n가입 전 ALL 원문.\nNEXT: bootstrap.`},A.token);assert.equal(all.status,201);await h.settle();
  const C=await alias('p5-1-newcomer');await h.settle();
  await t.test('new alias receives canonical COMPACT+ALL without transport cursor advancement',async()=>{
   const sub=await h.http('/v1/subscriptions',{channels:[],from:'since-compact',repo:'tester/delivery',issues:[number]},C.token);assert.equal(sub.status,201,JSON.stringify(sub));
   const before=await h.store.openChannelCursor(sub.body.channels,sub.body.cursor,cursorScope(await h.auth.verify(C.token))),ws=await h.ws(C.token);
   ws.socket.send(JSON.stringify({type:'subscribe',subscriptionId:sub.body.subscriptionId,channels:sub.body.channels,cursor:sub.body.cursor}));
   const one=await ws.until(f=>f.type==='event'&&f.event.payload.commentId===compact.body.commentId),two=await ws.until(f=>f.type==='event'&&f.event.payload.commentId===all.body.commentId);await ws.until(f=>f.type==='replay');
   assert.equal(one.event.action,'issus.comment.posted');assert.equal(two.event.payload.body,`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n가입 전 ALL 원문.\nNEXT: bootstrap.`);
   assert.deepEqual((await h.store.openChannelCursor(sub.body.channels,two.cursor,cursorScope(await h.auth.verify(C.token)))).positions,before.positions);
   assert.notEqual(two.cursor,sub.body.cursor);assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery WHERE recipient_alias_id=$1 AND comment_id=$2`,[C.aliasId,all.body.commentId])).rows[0].count,'0');ws.socket.close();
  });
  await t.test('SSE initialization failure closes subscription before returning 503',async()=>{
   const sub=await h.http('/v1/subscriptions?transport=sse',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},C.token);assert.equal(sub.status,201);
   const original=h.streamRuntime.store.channelHighWater;
   h.streamRuntime.store.channelHighWater=async()=>{throw new Error('injected high-water failure');};
   try {
    const failed=await h.http(`/v1/stream?subscription=${sub.body.subscriptionId}&cursor=${sub.body.cursor}`,undefined,C.token);assert.equal(failed.status,503);assert.equal(failed.body.error.code,'SERVICE_UNAVAILABLE');
   }finally{h.streamRuntime.store.channelHighWater=original;}
   const facts=(await h.pool.query(`SELECT payload FROM event_store WHERE action='issus.subscription.closed' AND payload->>'subscriptionId'=$1`,[sub.body.subscriptionId])).rows;
   assert.equal(facts.length,1);assert.equal(facts[0].payload.reason,'sse-initialization-failed');
  });
  await t.test('SSE uses the same bootstrap and shutdown awaits one close fact',async()=>{
   const sub=await h.http('/v1/subscriptions?transport=sse',{channels:[],from:'since-compact',repo:'tester/delivery',issues:[number]},C.token);assert.equal(sub.status,201);
   const controller=new AbortController(),response=await fetch(`${h.base}/v1/stream?subscription=${sub.body.subscriptionId}&cursor=${sub.body.cursor}`,{headers:{authorization:`Bearer ${C.token}`},signal:controller.signal});assert.equal(response.status,200);
   const reader=response.body!.getReader(),decoder=new TextDecoder();let text='';
   try {
    const end=Date.now()+10000;
    while(!text.includes(`"commentId":"${all.body.commentId}"`)||!text.includes('"type":"replay"')) {
     if(Date.now()>end) throw new Error('SSE bootstrap timed out');
     const next=await reader.read();if(next.done) throw new Error('SSE ended early');text+=decoder.decode(next.value,{stream:true});
    }
    assert.ok(text.includes(`"commentId":"${compact.body.commentId}"`));
    await h.streamRuntime.stop();
    for(;;){const next=await reader.read();if(next.done) break;}
    assert.equal((await h.pool.query(`SELECT count(*) FROM event_store WHERE action='issus.subscription.closed' AND payload->>'subscriptionId'=$1`,[sub.body.subscriptionId])).rows[0].count,'1');
    assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed WHERE alias_id=$1`,[C.aliasId])).rows[0].count,'0');
   }finally{controller.abort();await reader.cancel().catch(()=>{});}
   const later=await h.http('/v1/subscriptions?transport=sse',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},C.token);assert.equal(later.status,201);
   const drained=await h.http(`/v1/stream?subscription=${later.body.subscriptionId}&cursor=${later.body.cursor}`,undefined,C.token);assert.equal(drained.status,503);assert.equal(drained.body.error.code,'STREAM_DRAINING');
  });
 }finally{await h.cleanup();}
});
