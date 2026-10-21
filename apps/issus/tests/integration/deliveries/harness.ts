import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import {WebSocket} from 'ws';
import {EventStore,PgmqClient,attachWebSocketTransport,MetricsRegistry,readEnv} from 'agent/broker';
import type {EventEnvelope} from 'agent/common';
import {EventUnitOfWork,IntakeService,DeliveryCommandService,RoutingService,DeliveryReferenceService,RetryService,DeadlineService,TickService,InboxService,sha256,identifier,insertAlias,reserveSystem,type CorePrincipal,type ReactionCoordinates} from 'issus_domain/server';
import {RuntimeAuth,createRuntimePool,runMigrations,runtimeAuthMigration,runtimeHistoryMigration,createHealth,corePrincipal,type CompactReaction} from 'issus_runtime/server';
import {QUEUES} from 'issus_domain/common';
import {createCoreHttpRouter,coreHttpError} from '../../../src/server/http/auth/index.js';
import {createDeliveryHttpRouter,createInboxHistoryReader} from '../../../src/server/http/inbox/index.js';
import {SubscriptionService} from '../../../src/server/http/subscriptions/index.js';
import {createStreamCallbacks} from '../../../src/server/stream/callbacks/index.js';
import {createSseRuntime,createSseRouter} from '../../../src/server/stream/sse/index.js';
import {reactions} from '../../../src/server/reactions/table/index.js';
import {completeQueuedWrite} from './queued-write.js';

/** Real PostgreSQL/pgmq, independent P5 composition; no production/public table is used. */
export async function startDeliveryHarness(harnessOptions:{compactReaction?:CompactReaction}={}) {
 const url=process.env.ISSUS_TEST_DATABASE_URL;if(!url) throw new Error('ISSUS_TEST_DATABASE_URL is required');
 const suffix=randomBytes(6).toString('hex'),schema=`issus_p5_${suffix}`,brokerSchema=`issus_p5_b_${suffix}`,prefix=`p5_${suffix}_`,queueName=(n:string)=>n.startsWith(prefix)?n:prefix+n;
 const admin=createRuntimePool(url);await admin.query(`CREATE SCHEMA ${identifier(brokerSchema)}`);
 const pool=createRuntimePool(url,brokerSchema),store=new EventStore(pool,undefined,{retentionDays:null}),queue=new PgmqClient(pool);
 let now=new Date('2026-10-21T06:00:00Z'),failAppend=false,failSend=false;
 const clock={now:()=>new Date(now)};
 const physicalReactions=Object.fromEntries(Object.entries(reactions).map(([a,qs])=>[a,qs.map(queueName)]));
 const uow=new EventUnitOfWork({pool,schema,clock,queueName,reactions:physicalReactions,eventStore:{appendManyOn:async(...args)=>{if(failAppend) throw new Error('injected append failure');return store.appendManyOn(...args);}},queue:{sendOn:async(...args)=>{if(failSend) throw new Error('injected send failure');return queue.sendOn(...args);}}});
 let server:Server|undefined,transport:ReturnType<typeof attachWebSocketTransport>|undefined,sse:ReturnType<typeof createSseRuntime>|undefined,timer:ReturnType<typeof setInterval>|undefined,active:Promise<void>|undefined;
 const failures:unknown[]=[],paused=new Set<string>();
 try {
  const baseline=await readFile(new URL('../../../../../packages/issus_domain/src/server/backend/schema/0001-domain-baseline.sql',import.meta.url),'utf8');
  await runMigrations({pool,schema,queueName,migrations:[{id:'0001-domain-baseline',sql:baseline},runtimeAuthMigration,runtimeHistoryMigration],ensureBroker:()=>store.ensureSchema()});
  const auth=new RuntimeAuth({uow}),bootstrapToken=randomBytes(32).toString('base64url'),bootstrap=await auth.installBootstrap('tester',sha256(bootstrapToken));
  const intake=new IntakeService({uow,resolvePrincipal:a=>auth.resolveActor(a),onAccepted:()=>kick()}),deliveries=new DeliveryCommandService({uow,resolvePrincipal:a=>auth.resolveActor(a),onAccepted:()=>kick()}),routing=new RoutingService(uow),references=new DeliveryReferenceService(uow),retry=new RetryService(uow),deadline=new DeadlineService(uow),tick=new TickService(uow),inbox=new InboxService(uow),subscriptions=new SubscriptionService(uow,inbox);
  const coordinates=(e:EventEnvelope):ReactionCoordinates=>({sourceEventId:e.sourceEventId!,sourceStreamId:e.sourceStreamId!,sourceSequence:e.sourceSequence!,action:e.action,payload:{ownerId:String(e.payload.ownerId)}});
  async function drain() {
   for(let round=0;round<200;round++) {
    let processed=0;
    for(const name of Object.values(QUEUES)) {
     if(paused.has(name)) continue;
     const rows=(await pool.query('SELECT msg_id,message FROM pgmq.read($1,1,100)',[queueName(name)])).rows;
     for(const row of rows) {
      const e=row.message as EventEnvelope;
      if(name===QUEUES.intake) await intake.executeIngress(e);
      else if(name===QUEUES.route) await routing.react(coordinates(e));
      else if(name===QUEUES.delivery) {
       if(e.action==='issus.comment.posted') await references.react(coordinates(e));
       else if(e.action==='issus.delivery.overdue') await retry.react(coordinates(e));
       else await deliveries.executeIngress(e);
      } else if(name===QUEUES.schedule) {
       if(e.action==='issus.clock.tick') await tick.tick(String(e.payload.slot));else await deadline.react(coordinates(e));
      }
      else if(name===QUEUES.compact&&harnessOptions.compactReaction) await uow.run(tx=>harnessOptions.compactReaction!(tx,coordinates(e)),e.sourceEventId,'p6-compact');
      await queue.delete(queueName(name),String(row.msg_id));processed++;
     }
    }
    if(!processed) break;
   }
  }
  function kick(){if(active) return;active=drain().catch(e=>{failures.push(e);}).finally(()=>{active=undefined;});}
  timer=setInterval(kick,10);
  const health=createHealth({pool,schema,queueName}),origin='http://127.0.0.1:18140',options={intake,auth,origin,health,historyReader:createInboxHistoryReader(inbox)},app=express(),callbacks=createStreamCallbacks({auth,subscriptions,store,origin});
  auth.options.onRevoked=callbacks.onSessionRevoked;
  app.use(createDeliveryHttpRouter(options,{inbox,deliveries,subscriptions}));
  sse=createSseRuntime(pool);app.use(createSseRouter(options,subscriptions,sse,callbacks));app.use(createCoreHttpRouter(options));app.use(coreHttpError);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const address=server.address();if(!address||typeof address==='string') throw new Error('no HTTP listener');const base=`http://127.0.0.1:${address.port}`;
  const env=readEnv({DATABASE_URL:url,PORT:'18140'});
  transport=attachWebSocketTransport(server,env,queue,sse.hub,store,new MetricsRegistry(),callbacks.socketPolicy);
  async function http(path:string,body?:unknown,token=bootstrapToken,options:{method?:string;key?:string;headers?:Record<string,string>;wait?:boolean}={}) {
   const method=options.method??(body===undefined?'GET':'POST'),authorization=options.headers?.authorization??(token?`Bearer ${token}`:undefined);
   const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(authorization?{authorization}:{}),'idempotency-key':options.key??randomUUID(),...(options.wait===false?{}:{prefer:'wait=5'}),...options.headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
   return completeQueuedWrite(path,method,{status:response.status,body:await response.json()},async(statusUrl,signal)=>{
    const operation=await fetch(base+statusUrl,{signal,headers:authorization?{authorization}:{}});
    return {status:operation.status,body:await operation.json()};
   });
  }
  async function settle(){for(let i=0;i<50;i++){await active;await drain();if(!active) break;}if(failures.length) throw failures[0];}
  async function ws(token:string) {
   const socket=new WebSocket(base.replace('http','ws')+'/ws',{headers:{authorization:`Bearer ${token}`}}),frames:any[]=[];
   socket.on('message',raw=>frames.push(JSON.parse(String(raw))));
   await new Promise<void>((resolve,reject)=>{socket.once('open',()=>resolve());socket.once('error',reject);});
   async function until(predicate:(f:any)=>boolean,timeout=6000):Promise<any> {const end=Date.now()+timeout;while(Date.now()<end){const f=frames.find(predicate);if(f) return f;await new Promise(r=>setTimeout(r,10));}throw new Error(`WS frame timeout: ${JSON.stringify(frames).slice(-1000)}`);}
   return {socket,frames,until};
  }
  return {pool,admin,schema,brokerSchema,prefix,queueName,uow,store,queue,auth,bootstrap,bootstrapToken,intake,deliveries,routing,references,retry,deadline,tick,inbox,subscriptions,http,ws,base,clock,streamRuntime:sse,
   setClock:(value:Date)=>{now=value;},advance:(ms:number)=>{now=new Date(now.getTime()+ms);},paused,failures,settle,drain,
   failAppend:(v:boolean)=>{failAppend=v;},failSend:(v:boolean)=>{failSend=v;},
   async cleanup(){if(timer) clearInterval(timer);await active;await transport?.closeClientsAndRemoveSubscriptions();await sse?.stop();server?.closeAllConnections();if(server) await new Promise<void>(r=>server!.close(()=>r()));for(const {queue_name} of (await admin.query('SELECT queue_name FROM pgmq.list_queues()')).rows) if(queue_name.startsWith(prefix)) await admin.query('SELECT pgmq.drop_queue($1)',[queue_name]);await admin.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);await admin.query(`DROP SCHEMA ${identifier(brokerSchema)} CASCADE`);await pool.end();await admin.end();}
  };
 }catch(e){if(timer) clearInterval(timer);await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS ${identifier(brokerSchema)} CASCADE`);for(const {queue_name} of (await admin.query('SELECT queue_name FROM pgmq.list_queues()')).rows) if(queue_name.startsWith(prefix)) await admin.query('SELECT pgmq.drop_queue($1)',[queue_name]);await admin.end();throw e;}
}
export type DeliveryHarness=Awaited<ReturnType<typeof startDeliveryHarness>>;

/** Bootstrap registration uses the real P4 public HTTP paths and immutable announcement comments. */
export async function seedSessions(h:DeliveryHarness) {
 if(process.env.ISSUS_P5_CONTEXT_FIXTURE==='1') return seedFixtureSessions(h);
 const repo=await h.http('/v1/repos',{owner:'tester',slug:'delivery',projectCode:'p5',autoBoard:true});if(repo.status!==201) {await h.settle();throw new Error(`repo ${JSON.stringify(repo)}`);}
 const repoId=repo.body.repoId;
 async function alias(name:string) {
  const registered=await h.http('/v1/owners/tester/aliases',{name,role:'test',model:'fake',scope:'integration',repos:[repoId],announcementBody:`FROM:${name}/by-p5-system TO:ALL TYPE:ALIAS\n${name} | 시험 | fake | integration | s1\n---\n근거: test`});
  if(registered.status!==201) throw new Error(`alias ${JSON.stringify(registered)}`);
  const session=await h.http('/v1/sessions',{alias:name,sid:'s1'});if(session.status!==201) throw new Error(`session ${JSON.stringify(session)}`);
  const principal=corePrincipal(await h.auth.verify(session.body.token));return {...session.body,aliasId:registered.body.aliasId,principal};
 }
 const A=await alias('p5-1-author'),B=await alias('p5-1-reader');
 const issue=await h.http('/v1/repos/tester/delivery/issues',{title:'P5 delivery',body:'STATE:running OWNER:p5-1-author UPDATED:2026-10-21T15:00+09:00\nGOAL: delivery integration'});
 if(issue.status!==201) throw new Error(`issue ${JSON.stringify(issue)}`);await h.settle();
 return {repoId,number:issue.body.number,A,B,alias,I:`/v1/repos/tester/delivery/issues/${issue.body.number}`};
}

/** Explicit P5 precondition fixture, independent of the separately owned repo/alias fact model migration.
 * Alias rules still use P4 insertAlias; issue/comment/session/queue/HTTP paths remain real.
 * This is not evidence that the public repo/alias registration API passes.
 */
export async function seedFixtureSessions(h:DeliveryHarness) {
 const repoId=randomUUID();
 await h.uow.run(async tx=>{
  const system=await reserveSystem(tx,h.bootstrap,'p5');
  await tx.client.query(`INSERT INTO ${tx.table('repo')}(id,owner_id,slug,project_code,auto_board) VALUES($1,$2,'delivery','p5',true)`,[repoId,h.bootstrap.ownerId]);
  await tx.client.query(`INSERT INTO ${tx.table('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[h.bootstrap.ownerId,system,repoId]);
 });
 const board=await h.intake.execute({principal:h.bootstrap,action:'issus.board.ensure',payload:{repoId,boardOwner:'p5-board'},idempotencyKey:randomUUID()});if(board.httpStatus!==201) throw new Error(`fixture board ${JSON.stringify(board)}`);
 async function alias(name:string) {
  const aliasId=await h.uow.run(async tx=>{
   const id=await insertAlias(tx,h.bootstrap,name,'test','fake','integration fixture');
   await tx.client.query(`INSERT INTO ${tx.table('alias_repo')}(owner_id,alias_id,repo_id) VALUES($1,$2,$3)`,[h.bootstrap.ownerId,id,repoId]);return id;
  });
  const announcement=await h.intake.execute({principal:h.bootstrap,action:'issus.comment.post',payload:{repoId,issueNumber:1,body:`FROM:${name}/by-p5-system TO:ALL TYPE:ALIAS\n${name} | 시험 | fake | integration | s1\n---\n근거: explicit P5 fixture`},idempotencyKey:randomUUID()});if(announcement.httpStatus!==201) throw new Error(`fixture announcement ${JSON.stringify(announcement)}`);
  const session=await h.http('/v1/sessions',{alias:name,sid:'s1'});if(session.status!==201) throw new Error(`fixture session ${JSON.stringify(session)}`);
  return {...session.body,aliasId,principal:corePrincipal(await h.auth.verify(session.body.token))};
 }
 const A=await alias('p5-1-author'),B=await alias('p5-1-reader');
 const issue=await h.http('/v1/repos/tester/delivery/issues',{title:'P5 delivery fixture',body:'STATE:running OWNER:p5-1-author UPDATED:2026-10-21T15:00+09:00\nGOAL: P5 current-source integration'});
 if(issue.status!==201) throw new Error(`fixture issue ${JSON.stringify(issue)}`);await h.settle();
 return {repoId,number:issue.body.number,A,B,alias,I:`/v1/repos/tester/delivery/issues/${issue.body.number}`};
}
