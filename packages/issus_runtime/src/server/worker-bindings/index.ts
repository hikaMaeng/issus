import type {Pool} from 'pg';
import {EventStore,PgmqClient,type ReactionTable,type WorkerExecute} from 'agent/broker';
import {EventUnitOfWork,IntakeService,RoutingService,DeliveryReferenceService,DeliveryCommandService,InboxService,RetryService,DeadlineService,TickService,CoreError,type CompactPublication,type ReactionCoordinates,type EventTransaction,type Clock} from 'issus_domain/server';
import type {EventEnvelope} from 'agent/common';
import {RuntimeAuth} from '../auth/index.js';

export type CompactReaction=(tx:EventTransaction,input:ReactionCoordinates)=>Promise<unknown>;
export interface BindingOptions {schema?:string;clock?:Clock;queueName?:(name:string)=>string;reactions?:ReactionTable;publication?:CompactPublication;compactReaction?:CompactReaction}
/** All role handlers share the worker server's pool and P4 transaction boundary. */
export function createWorkerBindings(pool:Pool,options:BindingOptions={}) {
 const store=new EventStore(pool,undefined,{retentionDays:null}),queue=new PgmqClient(pool);
 const uow=new EventUnitOfWork({pool,eventStore:store,queue,...options}),auth=new RuntimeAuth({uow});
 const intake=new IntakeService({uow,resolvePrincipal:a=>auth.resolveActor(a),publication:options.publication});
 const deliveries=new DeliveryCommandService({uow,resolvePrincipal:a=>auth.resolveActor(a)});
 const routing=new RoutingService(uow),references=new DeliveryReferenceService(uow),retry=new RetryService(uow),deadline=new DeadlineService(uow),tick=new TickService(uow),inbox=new InboxService(uow);
 const compact=options.compactReaction??(async()=>({skipped:'compact-hook-not-attached'}));
 return {uow,store,queue,auth,intake,deliveries,routing,references,retry,deadline,tick,inbox,
  compact:(input:ReactionCoordinates)=>uow.run(tx=>compact(tx,input),input.sourceEventId,'p6-compact')};
}
export type WorkerBindings=ReturnType<typeof createWorkerBindings>;
/** A reaction cannot silently fall back to its consumed command's coordinates. */
export function reactionCoordinates(event:EventEnvelope):ReactionCoordinates {
 if(!event.sourceEventId||!event.sourceStreamId||!event.sourceSequence||typeof event.payload.ownerId!=='string') throw new CoreError(422,'REACTION_SOURCE_INVALID');
 return {sourceEventId:event.sourceEventId,sourceStreamId:event.sourceStreamId,sourceSequence:event.sourceSequence,action:event.action,payload:{ownerId:event.payload.ownerId}};
}
export type RoleExecute=WorkerExecute;
