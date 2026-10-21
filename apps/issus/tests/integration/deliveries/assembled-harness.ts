import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {readEnv} from 'agent/broker';
import {identifier,sha256} from 'issus_domain/server';
import {createRuntimePool,parseRuntimeConfig} from 'issus_runtime/server';
import {createBroker} from '../../../src/server/entry/broker/index.js';
import {createIssusWorker} from '../../../../issus-worker/src/server/entry/index.js';
import {createIssusScheduler} from '../../../../issus-scheduler/src/server/entry/index.js';
import {completeQueuedWrite} from './queued-write.js';

/** Allocate only a test listener port; deployed ports still come from validated env. */
export async function unusedPort():Promise<number> {
 for(;;) {
  const port=await new Promise<number>((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();if(!a||typeof a==='string') return reject(new Error('no port'));s.close(()=>resolve(a.port));});});
  if(port>=10000&&port<=59999) return port;
 }
}
/** Bounded observation of an asynchronous consumer, never a replacement consumer or manual tick. */
export async function eventually<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=20000):Promise<T> {
 const end=Date.now()+timeout;let value:T;
 do {value=await read();if(accept(value)) return value;await new Promise(r=>setTimeout(r,20));}while(Date.now()<end);
 throw new Error(`consumer observation timed out: ${JSON.stringify(value!)}`);
}
/** Production broker/worker/scheduler factories, isolated schemas/queues, no fixture drain loop. */
export async function startAssembledHarness() {
 const databaseUrl=process.env.ISSUS_TEST_DATABASE_URL;if(!databaseUrl) throw new Error('ISSUS_TEST_DATABASE_URL is required');
 const suffix=randomBytes(6).toString('hex'),schema=`issus_w3_${suffix}`,brokerSchema=`issus_w3_b_${suffix}`,prefix=`w3_${suffix}_`,queueName=(q:string)=>q.startsWith(prefix)?q:prefix+q;
 const admin=createRuntimePool(databaseUrl),sockets:WebSocket[]=[];
 await admin.query(`CREATE SCHEMA ${identifier(brokerSchema)}`);
 const url=new URL(databaseUrl);url.searchParams.set('options',`-c search_path=${brokerSchema},public`);
 const pool=createRuntimePool(url.toString(),brokerSchema),brokerPort=await unusedPort(),workerPort=await unusedPort(),schedulerPort=await unusedPort(),base=`http://127.0.0.1:${brokerPort}`;
 const source={DATABASE_URL:url.toString(),PORT:String(brokerPort),QUEUE_POLL_SECONDS:'1',AGENT_DATABASE_POOL_MAX:'6',LOG_TAIL_POLL_MS:'20'};
 const config=parseRuntimeConfig({...source,ISSUS_OWNER:'tester',ISSUS_BOOTSTRAP_TOKEN_FILE:'unused-in-memory-test-token',ISSUS_ORIGIN:base}),token=randomBytes(32).toString('base64url');
 const baselineSql=await readFile(new URL('../../../../../packages/issus_domain/src/server/backend/schema/0001-domain-baseline.sql',import.meta.url),'utf8');
 const broker=createBroker({config,env:readEnv({...source,AGENT_ROLE:'broker'}),baselineSql,bootstrapTokenHash:sha256(token),schema,queueName});
 let offset=0;const clock={now:()=>new Date(Date.now()+offset)},options={schema,queueName,clock};
 const worker=createIssusWorker(options,{...source,PORT:String(workerPort)}),scheduler=createIssusScheduler(options,{...source,PORT:String(schedulerPort)});
 async function cleanup() {
  for(const s of sockets) s.terminate();
  try {await scheduler.stop();}finally {try {await worker.stop();}finally {try {await broker.service.stop();}finally {
   for(const {queue_name} of (await admin.query('SELECT queue_name FROM pgmq.list_queues()')).rows) if(queue_name.startsWith(prefix)) await admin.query('SELECT pgmq.drop_queue($1)',[queue_name]);
   await admin.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS ${identifier(brokerSchema)} CASCADE`);
   await pool.end();await admin.end();
  }}}
 }
 try {
  await broker.service.start();await worker.start();await scheduler.start();
  for(const port of [brokerPort,workerPort,schedulerPort]) await eventually(async()=>(await fetch(`http://127.0.0.1:${port}/ready`)).status,s=>s===200);
  async function http(path:string,body?:unknown,bearer=token,extra:{method?:string;headers?:Record<string,string>}={}) {
   const method=extra.method??(body===undefined?'GET':'POST'),authorization=extra.headers?.authorization??`Bearer ${bearer}`;
   const response=await fetch(base+path,{method,headers:{'content-type':'application/json',authorization,'idempotency-key':randomUUID(),prefer:'wait=5',...extra.headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const text=await response.text();
   return completeQueuedWrite(path,method,{status:response.status,body:text?JSON.parse(text):null},async(statusUrl,signal)=>{
    const operation=await fetch(base+statusUrl,{signal,headers:{authorization}});
    return {status:operation.status,body:await operation.json()};
   });
  }
  async function ws(bearer:string,subscriptionId:string,cursor:string) {
   const socket=new WebSocket(`${base.replace('http','ws')}/ws?subscription=${subscriptionId}&cursor=${cursor}`,['issus.v1',`issus.bearer.${bearer}`]),frames:any[]=[],lines:string[]=[];sockets.push(socket);
   socket.on('message',data=>{const text=String(data);lines.push(text);frames.push(JSON.parse(text));});
   await new Promise<void>((resolve,reject)=>{socket.once('open',()=>resolve());socket.once('error',reject);});
   const until=(predicate:(f:any)=>boolean,timeout=20000):Promise<any>=>eventually<any>(async()=>frames.find(predicate),value=>!!value,timeout);
   return {socket,frames,lines,until};
  }
  return {pool,admin,schema,brokerSchema,prefix,queueName,broker,worker,scheduler,ports:{broker:brokerPort,worker:workerPort,scheduler:schedulerPort},base,http,ws,clock,advance:(ms:number)=>{offset+=ms;},cleanup};
 }catch(error){await cleanup();throw error;}
}
