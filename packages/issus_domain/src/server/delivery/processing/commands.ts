import {randomUUID} from 'node:crypto';
import type {IngressEvent} from 'agent/common';
import {parseCommandPayload,QUEUES,type Actor,type CommandAction,type DeliveryApplyCommand,type DeliveryReceiveCommand,type InboxProcessCommand} from '../../../common/index.js';
import {CoreError,actorOf,authorizePrincipal,requestHash,requireIdempotencyKey,reserveCommand,recorded,accepted,finishCommand,type CommandRecord,type EventUnitOfWork,type EventTransaction,type CorePrincipal,type HttpResult} from '../../backend/index.js';
import {receiveDeliveries} from '../receipt/index.js';
import {lockDeliveryOwner,ownDelivery,requireDeliverySession} from '../receipt/model.js';
import {applyDelivery} from '../application/index.js';
import {processInbox} from './index.js';

export interface DeliveryCommand {principal:CorePrincipal;action:CommandAction;payload:Record<string,unknown>;idempotencyKey:string}
export interface DeliveryCommandOptions {uow:EventUnitOfWork;resolvePrincipal:(actor:Actor)=>Promise<CorePrincipal>;onAccepted?:(event:IngressEvent)=>void}
/** P4 admission/UoW primitives, same operation table and polling API, separate delivery queue. */
export class DeliveryCommandService {
 readonly uow:EventUnitOfWork;
 constructor(readonly options:DeliveryCommandOptions) {this.uow=options.uow;}
 private async check(tx:EventTransaction,c:DeliveryCommand):Promise<void> {
  if(!['issus.delivery.receive','issus.delivery.apply','issus.inbox.process'].includes(c.action)||!parseCommandPayload(c.action,c.payload).ok) throw new CoreError(422,'INVALID_PAYLOAD');
  const p=await requireDeliverySession(tx,c.principal),x=c.payload;
  const ids=c.action==='issus.delivery.apply'?[String(x.deliveryId)]:x.deliveryIds as string[];
  for(const id of ids) {
   const row=(await tx.client.query(`SELECT 1 FROM ${tx.table('delivery')} WHERE id=$1 AND owner_id=$2 AND recipient_alias_id=$3`,[id,p.ownerId,p.aliasId])).rowCount;
   if(!row) throw new CoreError(403,'DELIVERY_FORBIDDEN');
  }
 }
 async submit(command:DeliveryCommand):Promise<HttpResult> {
  const key=requireIdempotencyKey(command.idempotencyKey),hash=requestHash(command.action,command.payload);
  const previous=await this.uow.read(async tx=>{
   await authorizePrincipal(tx,command.principal);
   const r=(await tx.client.query<CommandRecord>(`SELECT * FROM ${tx.table('command_result')} WHERE principal_id=$1 AND idempotency_key=$2`,[command.principal.id,key])).rows[0];
   if(r) {if(r.request_hash!==hash) throw new CoreError(409,'IDEMPOTENCY_CONFLICT');return recorded(r);}
   await this.check(tx,command);return undefined;
  });if(previous) return previous;
  let queued:IngressEvent|undefined;
  const result=await this.uow.run(async tx=>{
   const r=await reserveCommand(tx.client,tx.table('command_result'),command.principal.id,key,hash);if(!r.created) return recorded(r.record);
   await authorizePrincipal(tx,command.principal);
   queued={eventId:randomUUID(),action:command.action,transactionKey:key,channel:'internal:delivery',replyChannel:`session:${command.principal.id}`,sessionId:command.principal.id,correlationId:r.record.operation_id,audience:'worker',createdAt:tx.now.toISOString(),payload:{...command.payload,ownerId:command.principal.ownerId,actor:actorOf(command.principal),idempotencyKey:key}};
   tx.enqueue(QUEUES.delivery,queued);await tx.client.query(`UPDATE ${tx.table('command_result')} SET status='queued' WHERE operation_id=$1`,[r.record.operation_id]);return accepted(r.record);
  },key,command.principal.id);
  if(queued) this.options.onAccepted?.(queued);return result;
 }
 async executeIngress(event:IngressEvent,fence?:()=>Promise<void>):Promise<HttpResult> {
  const {ownerId,actor,idempotencyKey,...payload}=event.payload,a=actor as Actor;
  if(!a||a.ownerId!==ownerId||idempotencyKey!==event.transactionKey) throw new CoreError(422,'INVALID_COMMAND_CONTEXT');
  return this.execute({principal:await this.options.resolvePrincipal(a),action:event.action as CommandAction,payload,idempotencyKey:String(idempotencyKey)},fence);
 }
 async execute(c:DeliveryCommand,fence?:()=>Promise<void>):Promise<HttpResult> {
  await fence?.();const key=requireIdempotencyKey(c.idempotencyKey);
  return this.uow.run(async tx=>{
   const {record}=await reserveCommand(tx.client,tx.table('command_result'),c.principal.id,key,requestHash(c.action,c.payload));if(record.http_status!==null) return recorded(record);
   await lockDeliveryOwner(tx,c.principal.ownerId);await tx.client.query('SAVEPOINT delivery_command');
   const drafts=tx.drafts.length,pending=tx.pending.length;let result:HttpResult;
   try {
    await this.check(tx,c);let response:Record<string,unknown>;
    if(c.action==='issus.delivery.receive') response=await receiveDeliveries(tx,c.principal,c.payload as unknown as DeliveryReceiveCommand);
    else if(c.action==='issus.delivery.apply') response=await applyDelivery(tx,c.principal,c.payload as unknown as DeliveryApplyCommand);
    else response=await processInbox(tx,c.principal,c.payload as unknown as InboxProcessCommand);
    await fence?.();result={httpStatus:200,response};
   }catch(e) {if(!(e instanceof CoreError)) throw e;await tx.client.query('ROLLBACK TO SAVEPOINT delivery_command');tx.drafts.splice(drafts);tx.pending.splice(pending);result={httpStatus:e.status,response:e.response(record.operation_id)};}
   await finishCommand(tx.client,tx.table('command_result'),record,result);return result;
  },key,c.principal.id);
 }
}
