import {pathToFileURL} from 'node:url';
import {createWorkerServer,readEnv,runService,type Service} from 'agent/broker';
import {QUEUES} from 'issus_domain/common';
import {createWorkerBindings,createWorkerReadiness,createSchedulerProducer,type BindingOptions} from 'issus_runtime/server';
import {tickRole} from '../roles/tick/index.js';

/** Five-second producer and scheduler queue consumer shut down as one service. */
export function createIssusScheduler(options:BindingOptions={},source:NodeJS.ProcessEnv=process.env):Service {
 const name=options.queueName?.(QUEUES.schedule)??QUEUES.schedule;
 const env=readEnv({...source,AGENT_ROLE:'worker',AGENT_QUEUE:name,AGENT_QUEUES:name,ISSUS_EVENT_RETENTION_DAYS:'null'});
 let producer:ReturnType<typeof createSchedulerProducer>|undefined;
 const readiness=createWorkerReadiness(options);
 const worker=createWorkerServer({env,queues:[name],initialize:readiness.initialize,ready:async database=>{await readiness.ready(database);await producer?.ready();if(!producer) throw new Error('scheduler producer is not ready');},maxConcurrent:2,executeWith:database=>{
  producer=createSchedulerProducer({pool:database,schema:options.schema,queueName:options.queueName,clock:options.clock,onError:()=>console.error(JSON.stringify({event:'scheduler.producer.failed'}))});
  return tickRole(createWorkerBindings(database,options));
 }});
 return {async start(){await worker.start();try{await producer!.start();}catch(error){await worker.stop();throw error;}},async stop(){try{await producer?.stop();}finally{await worker.stop();}}};
}
export const start=()=>runService(createIssusScheduler());
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) void start();
