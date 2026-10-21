import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {createSchedulerProducer} from './index.js';

test('producer readiness rejects last failure, recovers on the next tick and rejects after stop',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 let failed=true,released=0,errors=0;
 const client={query:async(sql:string)=>({rows:sql.includes('pg_try_advisory_xact_lock')?[{locked:true}]:[]}),release:()=>{released++;}};
 const pool={connect:async()=>{if(failed) throw new Error('producer DB failure');return client;}} as unknown as Pool;
 const producer=createSchedulerProducer({pool,clock:{now:()=>new Date('2026-10-21T09:00:00Z')},onError:()=>{errors++;}});
 await assert.rejects(()=>producer.ready(),/not ready/);await producer.start();assert.equal(errors,1);await assert.rejects(()=>producer.ready(),/not ready/);
 failed=false;t.mock.timers.tick(5000);await new Promise<void>(resolve=>setImmediate(resolve));await producer.ready();assert.equal(released,1);
 failed=true;t.mock.timers.tick(5000);await new Promise<void>(resolve=>setImmediate(resolve));await assert.rejects(()=>producer.ready(),/not ready/);assert.equal(errors,2);
 await producer.stop();await assert.rejects(()=>producer.ready(),/not ready/);
});
