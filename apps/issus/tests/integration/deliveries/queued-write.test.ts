import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {QUEUES} from 'issus_domain/common';
import {completeQueuedWrite} from './queued-write.js';
import {seedSessions,startDeliveryHarness} from './harness.js';

const operationId='095cc8cd-88fa-4300-a685-7b495e6bb8be',statusUrl=`/v1/operations/${operationId}`;
const accepted={status:202,body:{operationId,status:'queued',posted:null,statusUrl}};
const comment='/v1/repos/tester/delivery/issues/2/comments';

test('deliveries queued writes retain operation identity, final failures and synchronous contracts',async t=>{
 await t.test('§7 POST allowlist converges to the original final status and body',async()=>{
  for(const path of ['/v1/repos','/v1/repos/tester/delivery/issues',comment,comment.replace('comments','close'),comment.replace('comments','reopen'),'/v1/deliveries/receipts','/v1/deliveries/id/application']) {
   let reads=0;const response={commentId:'1000001',posted:true},status=path===comment?201:200;
   const result=await completeQueuedWrite(path,'POST',accepted,async(url,signal)=>{
    assert.equal(url,statusUrl);assert.equal(signal.aborted,false);reads++;
    return {status:200,body:{operationId,...(reads===1?{status:'queued',posted:null}:{httpStatus:status,response})}};
   });
   assert.deepEqual(result,{status,body:response});assert.equal(reads,2);
  }
 });
 await t.test('final 422 response is returned without treating the operation GET 200 as success',async()=>{
  const response={posted:false,error:{code:'INVALID_ENVELOPE',reasons:[{code:'ACK_BY',path:'body',message:'invalid'}]}};
  assert.deepEqual(await completeQueuedWrite(comment,'POST',accepted,async()=>({status:200,body:{operationId,httpStatus:422,response}})),{status:422,body:response});
 });
 await t.test('synchronous and read APIs reject 202 before any polling',async()=>{
  for(const [method,path] of [['POST','/v1/owners/tester/aliases'],['POST','/v1/aliases/id/rename'],['POST','/v1/sessions'],['POST','/v1/subscriptions'],['POST','/v1/inbox/process'],['POST',comment.replace('comments','preflight')],['PATCH',comment.replace('comments','body')],['GET',comment]]) {
   await assert.rejects(()=>completeQueuedWrite(path! ,method!,accepted,async()=>{assert.fail('must not poll synchronous API');}),/requires synchronous completion/);
  }
 });
 await t.test('queued statusUrl cannot change operation or escape to another endpoint',async()=>{
  await assert.rejects(()=>completeQueuedWrite(comment,'POST',{...accepted,body:{...accepted.body,statusUrl:'https://example.test/operations/other'}},async()=>{assert.fail('must not follow an unvalidated URL');}),assert.AssertionError);
  await assert.rejects(()=>completeQueuedWrite(comment,'POST',accepted,async()=>({status:200,body:{operationId:'another',httpStatus:201,response:{}}})),assert.AssertionError);
 });
 await t.test('operation authentication errors fail immediately and immediate results are untouched',async()=>{
  await assert.rejects(()=>completeQueuedWrite(comment,'POST',accepted,async()=>({status:403,body:{error:'forbidden'}})),/operation read failed/);
  const immediate={status:409,body:{posted:false,error:{code:'DUPLICATE_COMMENT'}}};
  assert.equal(await completeQueuedWrite(comment,'POST',immediate,async()=>{assert.fail('no operation to read');}),immediate);
 });
 await t.test('queued operation never completing reaches a bounded deadline',async()=>{
  await assert.rejects(()=>completeQueuedWrite(comment,'POST',accepted,async()=>({status:200,body:{operationId,status:'queued'}}),25),/queued command timed out/);
 });
 await t.test('a stalled operation HTTP read is aborted at the same deadline',async()=>{
  await assert.rejects(()=>completeQueuedWrite(comment,'POST',accepted,async(_url,signal)=>{await delay(1000,undefined,{signal});return {status:200,body:{}};},25),/queued command timed out/);
 });
});

test('delivery harness follows actual queued comment with the session actor and posts once',{timeout:30000},async()=>{
 const h=await startDeliveryHarness();
 try {
  const {A,I}=await seedSessions(h),body=`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\nqueued completion regression\nNEXT: done.`;
  h.paused.add(QUEUES.intake);
  const pending=h.http(`${I}/comments`,{body},A.token,{wait:false});
  let observed=false;
  try {
   for(let i=0;i<100;i++) {
    const count=(await h.pool.query(`SELECT count(*)::int AS n FROM "${h.schema}".command_result WHERE status='queued'`)).rows[0].n;
    if(count>0) {observed=true;break;}
    await delay(10);
   }
  }finally {h.paused.delete(QUEUES.intake);}
  const result=await pending;assert.ok(observed,'observed actual queued admission before releasing worker');assert.equal(result.status,201,JSON.stringify(result));assert.ok(result.body.commentId);
  assert.equal((await h.pool.query(`SELECT count(*)::int AS n FROM "${h.schema}".comment WHERE body=$1`,[body])).rows[0].n,1);
 }finally {await h.cleanup();}
});
