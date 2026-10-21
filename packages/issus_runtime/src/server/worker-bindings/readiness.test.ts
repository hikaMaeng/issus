import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {QUEUES} from 'issus_domain/common';
import {createWorkerReadiness} from './index.js';

test('initialize and ready fail closed for DB, extension, migration and required queue dependencies',async()=>{
 let missing='';const seen:string[]=[];
 const pool={query:async(sql:string)=>{
  seen.push(sql);if(missing==='db') throw new Error('DB unavailable');
  if(sql.includes('pg_extension')) return {rowCount:missing==='pgmq'?0:1,rows:[]};
  if(sql.includes('schema_migration')) return {rows:(missing==='migration'?['0001-domain-baseline']:['0001-domain-baseline','0002-runtime-auth','0003-canonical-history']).map(id=>({id}))};
  if(sql.includes('list_queues')) return {rows:Object.values(QUEUES).filter(q=>missing!=='queue'||q!==QUEUES.schedule).map(q=>({queue_name:`test_${q}`}))};
  return {rows:[]};
 }} as unknown as Pool;
 const hooks=createWorkerReadiness({schema:'issus_w3_test',queueName:q=>`test_${q}`});
 for(const hook of [hooks.initialize,hooks.ready]) {
  await hook(pool);
  for(missing of ['db','pgmq','migration','queue']) await assert.rejects(()=>hook(pool),/dependencies are not ready/);
  missing='';await hook(pool);
 }
 assert.ok(seen.some(sql=>sql.includes('"issus_w3_test".schema_migration')));
});
