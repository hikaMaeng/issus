import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {ExecutionStore,MetricsRegistry,createInlinePool,startWorkerConsumer} from 'agent/broker';
import type {IngressEvent} from 'agent/common';
import {QUEUES} from 'issus_domain/common';
import {startCoreHarness} from './testing.js';

async function until(check:()=>boolean|Promise<boolean>,ms=40000) {
  const deadline=Date.now()+ms;
  while(!await check()) {if(Date.now()>deadline) throw new Error('timeout waiting for worker state');await delay(25);}
}

test('25P04: real 5s FATAL rolls back, discards clients, releases worker lease and redelivers successfully',{skip:!process.env.ISSUS_TEST_DATABASE_URL,timeout:55000},async t=>{
  const h=await startCoreHarness(),q=`"${h.schema}".timeout_probe`;
  const key=randomUUID(),event:IngressEvent={eventId:randomUUID(),transactionKey:key,action:'issus.timeout.probe',channel:'internal:timeout-probe',audience:'worker',createdAt:new Date().toISOString(),payload:{}};
  const errors:string[]=[],pids:number[]=[],identities:string[]=[];let runs=0,released=0;
  const observed=new WeakSet();
  h.pool.on('acquire',client=>{if(!observed.has(client)) {observed.add(client);client.on('error',(error:Error&{code?:string})=>{if(error.code) errors.push(error.code);});}});
  const executions=new ExecutionStore(h.pool,60),metrics=new MetricsRegistry();
  const originalRelease=executions.release.bind(executions);
  executions.release=async(...args)=>{const ok=await originalRelease(...args);released++;return ok;};
  const worker=createInlinePool(async()=>h.uow.run(async tx=>{
    runs++;identities.push(tx.key);pids.push((await tx.client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    assert.equal((await tx.client.query('SHOW transaction_timeout')).rows[0].transaction_timeout,'5s');
    assert.equal((await tx.client.query('SHOW statement_timeout')).rows[0].statement_timeout,'5s');
    assert.equal((await tx.client.query('SHOW lock_timeout')).rows[0].lock_timeout,'5s');
    await tx.client.query(`INSERT INTO ${q}(key) VALUES($1)`,[key]);
    // No active SQL statement: the server emits FATAL on Client while application work awaits.
    if(runs<=4) await delay(5250);
    tx.enqueue(QUEUES.route,{...event,eventId:randomUUID(),transactionKey:`route:${key}`});
    return {recovered:true};
  },key),1);
  const options={commandQueues:[h.queueName(QUEUES.intake)],eventStore:h.store,executions,pool:worker,metrics,visibilitySeconds:60,pollSeconds:1,batchSize:1,maxInFlight:1,maxExecutionAttempts:1};
  let loop:ReturnType<typeof startWorkerConsumer>|undefined;
  try {
    await h.pool.query(`CREATE TABLE ${q}(key text PRIMARY KEY)`);await executions.ensureSchema();
    await h.queue.send(h.queueName(QUEUES.intake),event);
    let read=false;
    const oneRead={read:async(...args:Parameters<typeof h.queue.read>)=>{if(read) {await delay(20);return [];}read=true;return h.queue.read(...args);},delete:h.queue.delete.bind(h.queue),extendVisibility:h.queue.extendVisibility.bind(h.queue),send:h.queue.send.bind(h.queue),archive:h.queue.archive.bind(h.queue),ensure:h.queue.ensure.bind(h.queue),check:h.queue.check.bind(h.queue)};
    loop=startWorkerConsumer({...options,queue:oneRead});await until(()=>released===1);loop.stop();await loop.done;loop=undefined;
    assert.equal(runs,4);assert.equal(errors.filter(c=>c==='25P04').length,4);assert.equal(new Set(pids).size,4);
    assert.equal((await h.pool.query(`SELECT count(*)::int n FROM ${q}`)).rows[0].n,0,'all failed projections rolled back');
    const lease=(await h.pool.query('SELECT status,result,lease_until<now() AS released FROM agent_execution WHERE transaction_key=$1',[key])).rows[0];
    assert.deepEqual(lease,{status:'running',result:null,released:true});
    assert.equal((await h.pool.query(`SELECT count(*)::int n FROM pgmq."q_${h.queueName(QUEUES.intake)}"`)).rows[0].n,1,'source survives maxExecutionAttempts=1');
    assert.equal((await h.pool.query('SELECT count(*)::int n FROM event_store WHERE transaction_key=$1 AND kind<>\'command\'',[key])).rows[0].n,0,'no terminal failure is committed');
    assert.equal((await h.pool.query('SELECT 1 AS alive')).rows[0].alive,1,'process and pool still usable');
    // Reset visibility only for the retained source in this test's isolated queue.
    const source=(await h.pool.query(`SELECT msg_id FROM pgmq."q_${h.queueName(QUEUES.intake)}"`)).rows[0];
    await h.queue.extendVisibility(h.queueName(QUEUES.intake),String(source.msg_id),0);
    loop=startWorkerConsumer({...options,queue:h.queue});
    await until(async()=>Number((await h.pool.query(`SELECT count(*)::int n FROM pgmq."q_${h.queueName(QUEUES.intake)}"`)).rows[0].n)===0,10000);
    loop.stop();await loop.done;loop=undefined;
    assert.equal(runs,5);assert.equal(new Set(identities).size,1);assert.equal(identities[0],key);
    assert.equal((await h.pool.query(`SELECT count(*)::int n FROM ${q}`)).rows[0].n,1);
    assert.equal((await h.pool.query(`SELECT count(*)::int n FROM pgmq."q_${h.queueName(QUEUES.route)}"`)).rows[0].n,1);
    const recovered=(await h.pool.query('SELECT status,attempts FROM agent_execution WHERE transaction_key=$1',[key])).rows[0];assert.deepEqual(recovered,{status:'completed',attempts:2});
    assert.equal((await h.pool.query('SELECT count(*)::int n FROM event_store WHERE transaction_key=$1 AND kind=\'result\'',[key])).rows[0].n,1);
    t.diagnostic(`FATAL 25P04=${errors.filter(c=>c==='25P04').length}; distinct failed backends=4; UoW attempts=${runs}; lease releases=${released}; execution attempts=2; result=1; projection=1; queued reaction=1; process alive`);
  } finally {loop?.stop();await loop?.done;await worker.destroy();await h.cleanup();}
});
