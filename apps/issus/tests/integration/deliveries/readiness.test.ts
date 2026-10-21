import test from 'node:test';
import assert from 'node:assert/strict';
import {QUEUES} from 'issus_domain/common';
import {createIssusWorker} from '../../../../issus-worker/src/server/entry/index.js';
import {createIssusScheduler} from '../../../../issus-scheduler/src/server/entry/index.js';
import {eventually,startAssembledHarness,unusedPort} from './assembled-harness.js';

test('worker/scheduler app /ready rejects missing migrations and queue, then recovers',{timeout:90000},async t=>{
 const h=await startAssembledHarness();
 const ready=async()=>Promise.all([h.ports.worker,h.ports.scheduler].map(async port=>(await fetch(`http://127.0.0.1:${port}/ready`)).status));
 try {
  assert.deepEqual(await ready(),[200,200]);
  const row=(await h.pool.query(`DELETE FROM "${h.schema}".schema_migration WHERE id='0003-canonical-history' RETURNING *`)).rows[0];assert.ok(row);
  try {assert.deepEqual(await ready(),[503,503]);}
  finally {await h.pool.query(`INSERT INTO "${h.schema}".schema_migration(id,sha256,applied_at) VALUES($1,$2,$3)`,[row.id,row.sha256,row.applied_at]);}
  assert.deepEqual(await ready(),[200,200]);
  const name=h.queueName(QUEUES.intake);await h.pool.query('SELECT pgmq.drop_queue($1)',[name]);
  try {assert.deepEqual(await ready(),[503,503]);}
  finally {await h.pool.query('SELECT pgmq.create($1)',[name]);}
  await eventually(ready,s=>s.every(n=>n===200));
  t.diagnostic(JSON.stringify({initial:[200,200],missingMigration:[503,503],missingQueue:[503,503],restored:[200,200]}));
 }finally {await h.cleanup();}
});

test('worker/scheduler app liveness survives unavailable DB while readiness is 503',{timeout:45000},async t=>{
 for(const factory of [createIssusWorker,createIssusScheduler]) {
  const port=await unusedPort(),dbPort=await unusedPort(),url=new URL(process.env.ISSUS_TEST_DATABASE_URL!);url.port=String(dbPort);
  const service=factory({schema:'issus_w3_unavailable'}, {DATABASE_URL:url.toString(),PORT:String(port),QUEUE_POLL_SECONDS:'1',AGENT_DATABASE_POOL_MAX:'2'});
  let failure:unknown;const starting=service.start().catch(error=>{failure=error;});
  try {
   await eventually(async()=>{try {return (await fetch(`http://127.0.0.1:${port}/health`)).status;}catch {return 0;}},s=>s===200,5000);
   await starting;assert.ok(failure,'unavailable database must fail initialization');
   assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);
   assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status,503);
   t.diagnostic(JSON.stringify({service:factory.name,dbUnavailable:true,health:200,ready:503}));
  }finally {await service.stop();await starting;}
 }
});
