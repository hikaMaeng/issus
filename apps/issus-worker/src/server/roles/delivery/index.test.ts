import test from 'node:test';
import assert from 'node:assert/strict';
import type {EventEnvelope} from 'agent/common';
import type {WorkerBindings} from 'issus_runtime/server';
import {deliveryRole} from './index.js';
import {routingRole} from '../routing/index.js';
import {compactRole} from '../compact/index.js';
import {workerExecute} from '../../entry/index.js';

const event=(action:string):EventEnvelope=>({eventId:'reaction-id',eventVersion:1,kind:'command',streamId:'reaction-stream',sequence:'99',sourceEventId:'original-id',sourceStreamId:'original-stream',sourceSequence:'7',action,transactionKey:'reaction-key',channel:'internal:delivery',correlationId:'correlation',source:'worker',audience:'worker',payload:{ownerId:'owner'},createdAt:'2026-10-21T00:00:00Z'});
const context={queue:'issus_delivery',fence:async()=>true};
test('mixed delivery queue dispatches references, overdue and client commands separately',async()=>{
 const calls:string[]=[];
 const b={references:{react:async()=>{calls.push('reference');}},retry:{react:async()=>{calls.push('retry');}},deliveries:{executeIngress:async(_e:unknown,fence:()=>Promise<void>)=>{await fence();calls.push('command');}}} as unknown as WorkerBindings;
 const run=deliveryRole(b),signal=new AbortController().signal;
 for(const action of ['issus.comment.posted','issus.delivery.overdue','issus.delivery.receive']) await run(event(action),signal,()=>{},context);
 assert.deepEqual(calls,['reference','retry','command']);
 await assert.rejects(()=>run(event('issus.delivery.receive'),signal,()=>{},{...context,fence:async()=>false}),/lease lost/);
});
test('routing and compact preserve source3 and reject missing provenance',async()=>{
 let original:unknown;
 const b={routing:{react:async(input:unknown)=>{original=input;}},compact:async(input:unknown)=>{original=input;}} as unknown as WorkerBindings;
 for(const run of [routingRole(b),compactRole(b)]) {
  await run(event('issus.comment.posted'),new AbortController().signal,()=>{},context);
  assert.deepEqual(original,{sourceEventId:'original-id',sourceStreamId:'original-stream',sourceSequence:'7',action:'issus.comment.posted',payload:{ownerId:'owner'}});
  await assert.rejects(()=>run({...event('issus.comment.posted'),sourceSequence:undefined},new AbortController().signal,()=>{},context),/REACTION_SOURCE_INVALID/);
 }
});
test('unknown worker queue fails before any role executes',()=>{
 const execute=workerExecute({} as WorkerBindings);assert.throws(()=>execute(event('unknown'),new AbortController().signal,()=>{},{...context,queue:'not-registered'}),/unknown worker queue/);
});
