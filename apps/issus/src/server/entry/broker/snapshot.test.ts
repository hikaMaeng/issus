import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {EventUnitOfWork,type EventTransaction} from 'issus_domain/server';
import {createRuntimePool} from 'issus_runtime/server';
import {BrokerUnitOfWork} from './snapshot.js';

test('broker RR snapshots recover beyond four real serialization conflicts and roll back every failed attempt',async()=>{
  const database=process.env.ISSUS_TEST_DATABASE_URL;assert.ok(database);
  const pool=createRuntimePool(database),schema=`issus_s6_snapshot_${randomBytes(5).toString('hex')}`;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE "${schema}".probe(id int PRIMARY KEY,value int NOT NULL);INSERT INTO "${schema}".probe VALUES(1,0);CREATE TABLE "${schema}".effect(attempt int)`);
    const options={pool,schema,eventStore:{appendManyOn:async()=>[]},queue:{sendOn:async()=>''}};
    let attempt=0;
    const conflict=(failures:number)=>async(tx:EventTransaction)=>{
      const current=++attempt;
      assert.equal((await tx.client.query('SHOW transaction_isolation')).rows[0].transaction_isolation,'repeatable read');
      await tx.client.query(`SELECT value FROM ${tx.table('probe')} WHERE id=1`);
      await tx.client.query(`INSERT INTO ${tx.table('effect')} VALUES($1)`,[current]);
      if(current<=failures) await pool.query(`UPDATE "${schema}".probe SET value=value+1 WHERE id=1`);
      await tx.client.query(`UPDATE ${tx.table('probe')} SET value=value+1 WHERE id=1`);
      return current;
    };
    await assert.rejects(new EventUnitOfWork(options).snapshot(conflict(4)),{code:'40001'});
    assert.equal(attempt,4);assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "${schema}".effect`)).rows[0].n,0);
    attempt=0;assert.equal(await new BrokerUnitOfWork(options).snapshot(conflict(4)),5);
    assert.deepEqual((await pool.query(`SELECT attempt FROM "${schema}".effect`)).rows,[{attempt:5}]);
    attempt=0;await pool.query(`DELETE FROM "${schema}".effect`);
    await assert.rejects(new BrokerUnitOfWork(options).snapshot(conflict(100)),{code:'40001'});
    assert.ok(attempt>=4&&attempt<=12&&attempt%4===0);assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "${schema}".effect`)).rows[0].n,0);
    attempt=0;await assert.rejects(new BrokerUnitOfWork(options).snapshot(async()=>{attempt++;throw Object.assign(new Error('nonretryable'),{code:'42P01'});}),{code:'42P01'});
    assert.equal(attempt,1);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
  }
});
