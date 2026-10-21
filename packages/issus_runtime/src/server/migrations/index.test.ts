import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createRuntimePool} from './index.js';

test('runtime pool guards checked-out Client errors between SQL statements',{skip:!process.env.ISSUS_TEST_DATABASE_URL,timeout:15000},async()=>{
  const pool=createRuntimePool(process.env.ISSUS_TEST_DATABASE_URL!);let client=await pool.connect();
  try {
    assert.ok(client.listenerCount('error')>=1,'factory retains a listener after pg-pool checkout');
    const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await client.query('BEGIN');await client.query("SET LOCAL transaction_timeout='5s'");
    // No test listener: without the factory guard this FATAL would terminate the process.
    await delay(5250);await assert.rejects(client.query('SELECT 1'));
    client.release(true);client=await pool.connect();
    assert.notEqual((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);
    assert.equal((await client.query('SELECT 1 AS alive')).rows[0].alive,1);
  } finally {client.release();await pool.end();}
});
test('idle Pool error is handled and the terminated backend is replaced',{skip:!process.env.ISSUS_TEST_DATABASE_URL,timeout:10000},async()=>{
  const pool=createRuntimePool(process.env.ISSUS_TEST_DATABASE_URL!),admin=createRuntimePool(process.env.ISSUS_TEST_DATABASE_URL!);
  try {
    const client=await pool.connect(),pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;client.release();
    await admin.query('SELECT pg_terminate_backend($1)',[pid]);
    const deadline=Date.now()+3000;while(pool.totalCount!==0&&Date.now()<deadline) await delay(20);
    assert.equal(pool.totalCount,0);assert.equal((await pool.query('SELECT 1 AS alive')).rows[0].alive,1);
    assert.notEqual((await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);
  } finally {await pool.end();await admin.end();}
});
