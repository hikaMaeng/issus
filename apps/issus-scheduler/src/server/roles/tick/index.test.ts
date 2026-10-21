import test from 'node:test';
import assert from 'node:assert/strict';
import type {EventEnvelope} from 'agent/common';
import type {WorkerBindings} from 'issus_runtime/server';
import {tickRole} from './index.js';
test('scheduler consumes ticks separately from deadline reaction source coordinates',async()=>{
 const seen:unknown[]=[];
 const b={tick:{tick:async(slot:string)=>{seen.push(slot);}},deadline:{react:async(input:unknown)=>{seen.push(input);}}} as unknown as WorkerBindings;
 const e={action:'issus.clock.tick',payload:{slot:'2026-10-21T06:00:00.000Z',ownerId:'scheduler'}} as unknown as EventEnvelope,run=tickRole(b),signal=new AbortController().signal,context={queue:'issus_schedule',fence:async()=>true};
 await run(e,signal,()=>{},context);assert.equal(seen[0],'2026-10-21T06:00:00.000Z');
 await assert.rejects(()=>run({...e,action:'issus.delivery.queued'},signal,()=>{},context),/REACTION_SOURCE_INVALID/);
});
