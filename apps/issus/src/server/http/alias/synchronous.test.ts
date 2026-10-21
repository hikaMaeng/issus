import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCoreHarness} from '../auth/testing.js';

test('alias registration and rename complete with the intake worker paused and no Prefer',async()=>{
  const h=await startCoreHarness();
  try {
    const repo=await h.http('/v1/repos',{owner:'tester',slug:'sync-alias',projectCode:'s6',autoBoard:true});
    assert.equal(repo.status,201);await h.waitForIdle();h.pause();
    const key=randomUUID(),path='/v1/owners/tester/aliases';
    const payload={name:'s6-1-author',role:'test',model:'fake',scope:'sync regression',repos:[repo.body.repoId],announcementBody:'FROM:s6-1-author/by-s6-system TO:ALL TYPE:ALIAS\ns6-1-author | test | fake | sync | s1'};
    const result=await h.http(path,payload,h.bootstrapToken,{key,wait:false});
    assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(result.body.posted,true);
    assert.deepEqual((await h.http(path,payload,h.bootstrapToken,{key,wait:false})).body,result.body);
    assert.equal((await h.http(path,{...payload,scope:'changed'},h.bootstrapToken,{key,wait:false})).status,409);
    const session=await h.http('/v1/sessions',{alias:payload.name,sid:'s1'});assert.equal(session.status,201);
    const renamed=await h.http(`/v1/aliases/${result.body.aliasId}/rename`,{newName:'s6-1-writer',announcementBody:'FROM:s6-1-author/s1 TO:ALL TYPE:ALIAS\ns6-1-author→s6-1-writer'},session.body.token,{wait:false});
    assert.equal(renamed.status,200,JSON.stringify(renamed.body));assert.equal(renamed.body.posted,true);
    assert.equal((await h.pool.query(`SELECT count(*)::int AS n FROM pgmq.${'q_'+h.queueName('issus_intake')}`)).rows[0].n,0);
    const record=(await h.pool.query(`SELECT status,http_status FROM "${h.schema}".command_result WHERE idempotency_key=$1`,[key])).rows[0];
    assert.deepEqual(record,{status:'done',http_status:201});
  } finally {await h.cleanup();}
});
