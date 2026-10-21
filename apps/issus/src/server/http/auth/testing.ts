import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import {EventStore,PgmqClient} from 'agent/broker';
import {EventUnitOfWork,IntakeService,sha256,identifier} from 'issus_domain/server';
import {RuntimeAuth,corePrincipal,createRuntimePool,runMigrations,runtimeAuthMigration,runtimeHistoryMigration,createHealth} from 'issus_runtime/server';
import {QUEUES} from 'issus_domain/common';
import {createCoreTestApp} from './index.js';

/** Integration-only target: unique domain/broker schemas and queue prefix, no production entry mutation. */
export async function startCoreHarness(options:{beforeQueueDelete?:()=>Promise<void>}={}) {
  const url=process.env.ISSUS_TEST_DATABASE_URL;if(!url) throw new Error('ISSUS_TEST_DATABASE_URL is required');
  const suffix=randomBytes(6).toString('hex'),schema=`issus_p4_${suffix}`,brokerSchema=`issus_p4_b_${suffix}`,queuePrefix=`p4_${suffix}_`;
  const queueName=(name:string)=>queuePrefix+name;
  const admin=createRuntimePool(url),pool=createRuntimePool(url,brokerSchema);
  await admin.query(`CREATE SCHEMA ${identifier(brokerSchema)}`);
  let now=new Date('2026-10-21T04:00:00Z'),failAppend=false,failSend=false;
  const store=new EventStore(pool,undefined,{retentionDays:null}),queue=new PgmqClient(pool);
  const uow=new EventUnitOfWork({pool,schema,clock:{now:()=>new Date(now)},eventStore:{appendManyOn:async(...args)=>{if(failAppend) throw new Error('injected append failure');return store.appendManyOn(...args);}},queue:{sendOn:async(...args)=>{if(failSend) throw new Error('injected queue failure');return queue.sendOn(...args);}},queueName,reactions:{'issus.comment.posted':[QUEUES.route]}});
  const baseline=await readFile(new URL('../../../../../../packages/issus_domain/src/server/backend/schema/0001-domain-baseline.sql',import.meta.url),'utf8');
  try {
    await runMigrations({pool,schema,queueName,migrations:[{id:'0001-domain-baseline',sql:baseline},runtimeAuthMigration,runtimeHistoryMigration],ensureBroker:()=>store.ensureSchema()});
    const auth=new RuntimeAuth({uow}),bootstrapToken=randomBytes(32).toString('base64url');const bootstrap=await auth.installBootstrap('tester',sha256(bootstrapToken));
    const failures:unknown[]=[];let paused=false,active:Promise<void>|undefined;
    const intake=new IntakeService({uow,resolvePrincipal:a=>auth.resolveActor(a),onAccepted:()=>{if(!paused) kick();}});
    async function drain():Promise<void> {
      for(;;){const rows=await pool.query('SELECT msg_id,message FROM pgmq.read($1,1,100)',[queueName(QUEUES.intake)]);if(!rows.rowCount) break;
        for(const row of rows.rows){await intake.executeIngress(row.message);await options.beforeQueueDelete?.();await pool.query('SELECT pgmq.delete($1::text,$2::bigint)',[queueName(QUEUES.intake),row.msg_id]);}
      }
    }
    function kick():void {if(active) return;active=drain().catch(e=>{failures.push(e);}).finally(()=>{active=undefined;});}
    /** Wait for accepted work through queue deletion; never consume or discard unrelated queue rows. */
    async function waitForIdle():Promise<void> {while(active) await active;if(failures.length) throw new AggregateError(failures,'core harness worker failed');}
    const health=createHealth({pool,schema,queueName});const app=createCoreTestApp({intake,auth,origin:'http://127.0.0.1:18140',health});
    const server:Server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const address=server.address();if(!address||typeof address==='string') throw new Error('listen failed');const base=`http://127.0.0.1:${address.port}`;
    async function http(path:string,body?:unknown,token=bootstrapToken,options:{method?:string;key?:string;headers?:Record<string,string>;wait?:boolean}={}) {
      const headers:Record<string,string>={'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} :{}),...(body!==undefined||options.method&&options.method!=='GET'?{'idempotency-key':options.key??randomUUID()}:{}),...(options.wait===false?{}:{prefer:'wait=5'}),...options.headers};
      const response=await fetch(base+path,{method:options.method??(body===undefined?'GET':'POST'),headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});const json=await response.json() as any;return {status:response.status,body:json,headers:response.headers};
    }
    async function cleanup() {
      await active;await new Promise<void>(resolve=>server.close(()=>resolve()));server.closeAllConnections();
      const names=(await admin.query('SELECT queue_name FROM pgmq.list_queues()')).rows.map(r=>r.queue_name as string).filter(n=>n.startsWith(queuePrefix));
      for(const name of names) await admin.query('SELECT pgmq.drop_queue($1)',[name]);
      await admin.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);await admin.query(`DROP SCHEMA ${identifier(brokerSchema)} CASCADE`);await pool.end();await admin.end();
    }
    return {pool,uow,auth,intake,store,queue,schema,brokerSchema,queueName,bootstrap,bootstrapToken,http,base,failures,setClock:(date:Date)=>{now=date;},setFailAppend:(value:boolean)=>{failAppend=value;},setFailSend:(value:boolean)=>{failSend=value;},pause:()=>{paused=true;},resume:async()=>{paused=false;await drain();},drain,waitForIdle,cleanup};
  }catch(error){await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS ${identifier(brokerSchema)} CASCADE`);await admin.end();throw error;}
}
