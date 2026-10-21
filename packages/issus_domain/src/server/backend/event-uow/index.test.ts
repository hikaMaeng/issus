import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {Pool} from 'pg';
import {EventUnitOfWork} from './index.js';
import {CoreError} from '../command-result/index.js';

class Client extends EventEmitter {
  queries:string[]=[];
  released:(boolean|Error|undefined)[]=[];
  rollbackError=false;
  async query(sql:string) {this.queries.push(sql);if(this.rollbackError&&sql==='ROLLBACK') throw new Error('not queryable');return {rows:[],rowCount:0};}
  release(error?:boolean|Error) {this.released.push(error);}
}
function harness() {
  const clients:Client[]=[],keys:string[]=[];
  const uow=new EventUnitOfWork({pool:{connect:async()=>{const c=new Client();clients.push(c);return c;}} as unknown as Pool,eventStore:{appendManyOn:async()=>[]},queue:{sendOn:async()=> '1'}});
  return {uow,clients,keys};
}
const fatal=()=>Object.assign(new Error('terminating connection due to transaction timeout'),{code:'25P04',severity:'FATAL'});

test('asynchronous FATAL is retried on a fresh lease with stable generated command identity',async()=>{
  const h=harness();let calls=0;
  const result=await h.uow.run(async tx=>{
    h.keys.push(tx.key);calls++;
    if(calls===1) (tx.client as unknown as Client).emit('error',fatal());
    return 'ok';
  });
  assert.equal(result,'ok');assert.equal(calls,2);assert.equal(new Set(h.keys).size,1);
  assert.deepEqual(h.clients.map(c=>c.released),[[true],[false]]);
  assert.ok(!h.clients[0].queries.includes('COMMIT'));assert.ok(!h.clients[0].queries.includes('ROLLBACK'));
  for(const c of h.clients) {assert.equal(c.listenerCount('error'),0);assert.ok(c.queries.includes("SET LOCAL transaction_timeout='5s'"));}
});
test('timeout query rejection keeps its SQLSTATE when rollback also fails and stops after four attempts',async()=>{
  const h=harness(),cause=fatal();
  await assert.rejects(h.uow.run(async tx=>{(tx.client as unknown as Client).rollbackError=true;throw cause;},'stable'),e=>e===cause);
  assert.equal(h.clients.length,4);assert.deepEqual(h.clients.map(c=>c.released),[[true],[true],[true],[true]]);
  for(const c of h.clients) assert.equal(c.listenerCount('error'),0);
});
test('read-only borrowers capture asynchronous FATAL and discard without retry or flush',async()=>{
  const h=harness(),cause=fatal();
  await assert.rejects(h.uow.read(async tx=>{(tx.client as unknown as Client).emit('error',cause);return 'uncommitted';}),e=>e===cause);
  assert.equal(h.clients.length,1);assert.deepEqual(h.clients[0].released,[true]);
  assert.deepEqual(h.clients[0].queries,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY']);
});
test('serialization/deadlock retry and unique conflict semantics survive lease handling',async()=>{
  for(const code of ['40001','40P01']) {
    const h=harness();let runs=0;
    assert.equal(await h.uow.run(async()=>{if(runs++===0) throw Object.assign(new Error(code),{code});return 7;}),7);
    assert.equal(h.clients.length,2);assert.deepEqual(h.clients[0].released,[false]);
  }
  const h=harness();await assert.rejects(h.uow.run(async()=>{throw Object.assign(new Error('unique'),{code:'23505'});}),e=>e instanceof CoreError&&e.status===409);
  assert.equal(h.clients.length,1);
});
test('rollback failure discards a connection without masking the original application error',async()=>{
  const h=harness(),cause=new Error('append failed');
  await assert.rejects(h.uow.run(async tx=>{(tx.client as unknown as Client).rollbackError=true;throw cause;}),e=>e===cause);
  assert.deepEqual(h.clients[0].released,[true]);
});
