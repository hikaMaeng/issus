import {pathToFileURL} from 'node:url';
import {createWorkerServer,readEnv,runService,combineServices,type Service} from 'agent/broker';
import {QUEUES} from 'issus_domain/common';
import {createRuntimePool,createWorkerBindings,createSchedulerProducer,type BindingOptions} from 'issus_runtime/server';
import {tickRole} from '../roles/tick/index.js';

/** Five-second producer and scheduler queue consumer shut down as one service. */
export function createIssusScheduler(options:BindingOptions={},source:NodeJS.ProcessEnv=process.env):Service {
 const env=readEnv({...source,AGENT_ROLE:'worker'}),pool=createRuntimePool(env.databaseUrl),name=options.queueName?.(QUEUES.schedule)??QUEUES.schedule;
 const producer=createSchedulerProducer({pool,schema:options.schema,queueName:options.queueName,clock:options.clock,onError:()=>console.error(JSON.stringify({event:'scheduler.producer.failed'}))});
 const worker=createWorkerServer({env,queues:[name],maxConcurrent:2,executeWith:database=>tickRole(createWorkerBindings(database,options))});
 const service=combineServices(worker,producer);
 return {start:()=>service.start(),async stop(){await service.stop();await pool.end();}};
}
export const start=()=>runService(createIssusScheduler());
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) void start();
