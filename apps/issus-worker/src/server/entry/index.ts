import {pathToFileURL} from 'node:url';
import {createWorkerServer,readEnv,runService,type Service} from 'agent/broker';
import {QUEUES} from 'issus_domain/common';
import {applyCompactReaction,compactPublication} from 'issus_domain/server';
import {createWorkerBindings,type BindingOptions,type WorkerBindings,type RoleExecute} from 'issus_runtime/server';
import {intakeRole} from '../roles/intake/index.js';
import {routingRole} from '../roles/routing/index.js';
import {deliveryRole} from '../roles/delivery/index.js';
import {compactRole} from '../roles/compact/index.js';

/** Queue routing lives in this role binding, never in domain handlers. */
export function workerExecute(b:WorkerBindings,queueName:(name:string)=>string=(n=>n)):RoleExecute {
 const roles:Record<string,RoleExecute>={[queueName(QUEUES.intake)]:intakeRole(b),[queueName(QUEUES.route)]:routingRole(b),[queueName(QUEUES.delivery)]:deliveryRole(b),[queueName(QUEUES.compact)]:compactRole(b)};
 return (event,signal,emit,context)=>{const role=roles[context.queue];if(!role) throw new Error('unknown worker queue');return role(event,signal,emit,context);};
}
/** The worker frame owns pool, execution fence, queue consumer and health listener. */
export function createIssusWorker(options:BindingOptions={},source:NodeJS.ProcessEnv=process.env):Service {
 const queues=[QUEUES.intake,QUEUES.route,QUEUES.delivery,QUEUES.compact].map(n=>options.queueName?.(n)??n);
 const env=readEnv({...source,AGENT_ROLE:'worker',AGENT_QUEUE:queues[0],AGENT_QUEUES:queues.join(','),ISSUS_EVENT_RETENTION_DAYS:'null'});
 const bindings={compactReaction:applyCompactReaction,publication:compactPublication,...options};
 return createWorkerServer({env,queues,reactionQueues:[QUEUES.route,QUEUES.compact].map(n=>options.queueName?.(n)??n),maxConcurrent:8,executeWith:pool=>workerExecute(createWorkerBindings(pool,bindings),options.queueName)});
}
export const start=()=>runService(createIssusWorker());
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) void start();
