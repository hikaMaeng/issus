import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDatabasePool,readEnv} from 'agent/broker';
import {QUEUES} from 'issus_domain/common';
import {sha256} from 'issus_domain/server';
import {createBroker} from '../../dist/server/entry/broker/index.js';
import {createIssusWorker} from '../../../issus-worker/dist/server/entry/index.js';
import {createIssusScheduler} from '../../../issus-scheduler/dist/server/entry/index.js';
import {p9FixtureClock} from './p9-clock.mjs';

// Host-only production artifacts. This file never runs Vite, installs tools or changes production schemas.
const target=new URL(process.env.ISSUS_TEST_SERVER_URL??'invalid:');
assert.equal(target.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(target.hostname));assert.equal(target.pathname,'/');assert.ok(!target.search&&!target.hash&&!target.username&&!target.password);
const port=Number(target.port);assert.ok(Number.isInteger(port)&&port>=10000&&port<=59997);
const database=process.env.ISSUS_TEST_DATABASE_URL;assert.ok(database,'ISSUS_TEST_DATABASE_URL required');
const workspace=new URL('../../../../',import.meta.url), stamp=new Date().toISOString().replace(/[:.]/g,'-'), output=new URL(`.cache/p9-ui/host-${stamp}/`,workspace);
await mkdir(output,{recursive:true});
const suffix=randomBytes(6).toString('hex'),schema=`issus_test_p8_${suffix}`,brokerSchema=`issus_test_p8_b_${suffix}`,prefix=`p9_browser_${suffix}_`,clockFile=new URL('clock.json',output);
await writeFile(clockFile,'{"offsetMs":0}\n','utf8');
// P9-19's separate injected Clock changes no TTL constant and adds no production route.
const clock=p9FixtureClock(fileURLToPath(clockFile));
const queueName=name=>name.startsWith(prefix)?name:prefix+name,admin=createDatabasePool(database,2),url=new URL(database);
url.searchParams.set('options',`-c search_path=${brokerSchema},public`);
const token=randomBytes(32).toString('base64url'),artifacts={};let broker,worker,scheduler,childCode=1,createdBrokerSchema=false;
const files=['ui.test.mjs','p9-u1.test.mjs','p9-u2.test.mjs','p9-u3.test.mjs'];
try {
  for(const path of ['apps/issus/dist/front/index.html','apps/issus/dist/manifest.json','apps/issus/dist/server/entry/broker/index.js','apps/issus-worker/dist/server/entry/index.js','apps/issus-scheduler/dist/server/entry/index.js'])artifacts[path]=createHash('sha256').update(await readFile(new URL(path,workspace))).digest('hex');
  for(const file of files)await readFile(new URL(file,import.meta.url));
  const html=await readFile(new URL('apps/issus/dist/front/index.html',workspace),'utf8');assert.ok(html.includes('/assets/'));assert.ok(!html.includes('/src/front/'));
  await admin.query(`CREATE SCHEMA "${brokerSchema}"`);createdBrokerSchema=true;
  const source={...process.env,DATABASE_URL:url.toString(),PORT:String(port),AGENT_QUEUE:queueName(QUEUES.intake),AGENT_DATABASE_POOL_MAX:'4',QUEUE_POLL_SECONDS:'1'};
  broker=createBroker({config:{DATABASE_URL:url.toString(),ISSUS_OWNER:'tester',ISSUS_BOOTSTRAP_TOKEN_FILE:'unused-memory-bootstrap',ISSUS_ORIGIN:target.origin,PORT:port,HOST:'127.0.0.1',ISSUS_SESSION_TTL_SECONDS:172800},env:readEnv(source),baselineSql:await readFile(new URL('apps/issus/dist/migrations/0001-domain-baseline.sql',workspace),'utf8'),migrationsDirectory:fileURLToPath(new URL('apps/issus/dist/migrations/extra/',workspace)),bootstrapTokenHash:sha256(token),schema,queueName});
  broker.intake.uow.options.clock=clock;
  broker.intake.options.onAccepted=event=>clock.onAccepted(event);
  await broker.service.start();
  worker=createIssusWorker({schema,queueName,clock},{...source,PORT:String(port+1)});await worker.start();
  scheduler=createIssusScheduler({schema,queueName,clock},{...source,PORT:String(port+2)});await scheduler.start();
  assert.equal((await fetch(target.origin+'/ready')).status,200);
  childCode=await new Promise((resolve,reject)=>{
    const standard=process.argv.includes('--standard');
    const executable=standard?(process.platform==='win32'?(process.env.ComSpec??'cmd.exe'):'npm'):process.execPath;
    const args=standard?(process.platform==='win32'?['/d','/s','/c','npm run test:browser']:['run','test:browser']):['--test','--test-concurrency=1',...files.map(file=>fileURLToPath(new URL(file,import.meta.url)))];
    const child=spawn(executable,args,{cwd:fileURLToPath(workspace),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,ISSUS_TEST_SERVER_URL:target.origin,ISSUS_TEST_DATABASE_URL:database,ISSUS_TEST_SCHEMA:schema,ISSUS_TEST_BROKER_SCHEMA:brokerSchema,ISSUS_TEST_BOOTSTRAP_TOKEN:token,ISSUS_TEST_OWNER:'tester',ISSUS_TEST_CLOCK_FILE:fileURLToPath(clockFile)}});
    let log='';child.stdout.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{log+=chunk;process.stderr.write(chunk);});
    const timer=setTimeout(()=>child.kill(),1200000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',async code=>{clearTimeout(timer);try{await writeFile(new URL('browser.log',output),log,'utf8');resolve(code??1);}catch(error){reject(error);}});
  });
} finally {
  await writeFile(clockFile,'{"offsetMs":0}\n','utf8');
  const stopErrors=[];for(const service of [scheduler,worker,broker?.service]){try{await service?.stop();}catch(error){stopErrors.push(error.code??error.name);}}
  for(const row of (await admin.query('SELECT queue_name FROM pgmq.list_queues()')).rows)if(row.queue_name.startsWith(prefix))await admin.query('SELECT pgmq.drop_queue($1)',[row.queue_name]);
  if(createdBrokerSchema){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS "${brokerSchema}" CASCADE`);}
  const remainingSchemas=Number((await admin.query('SELECT count(*) FROM pg_namespace WHERE nspname=ANY($1::text[])',[[schema,brokerSchema]])).rows[0].count),remainingQueues=(await admin.query('SELECT queue_name FROM pgmq.list_queues()')).rows.filter(row=>row.queue_name.startsWith(prefix)).length;
  await admin.end();await rm(clockFile);
  await writeFile(new URL('results.json',output),JSON.stringify({timestamp:new Date().toISOString(),server:target.origin,schema,brokerSchema,prefix,childCode,stopErrors,remainingSchemas,remainingQueues,artifacts,files,standard:process.argv.includes('--standard'),clock:'separate fixture; production TTL unchanged'},null,2)+'\n');
  assert.deepEqual(stopErrors,[]);assert.equal(remainingSchemas,0);assert.equal(remainingQueues,0);
}
process.exitCode=childCode;
