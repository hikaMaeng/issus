import {applyProjection,type EventUnitOfWork,type EventTransaction,type ReactionCoordinates} from '../../backend/index.js';
import {legacyPendingDelivery,cancelDeadline,scheduleDeadline} from '../../scheduling/deadline/index.js';
import {escalateDelivery} from '../../scheduling/escalation/index.js';
import {deliveryFact} from '../receipt/facts.js';
import {lockDeliveryOwner,type DeliveryRow} from '../receipt/model.js';

/** Worker retry budgets and ACK deadline attempts are separate; this never posts a comment. */
export class RetryService {
 constructor(readonly uow:EventUnitOfWork) {}
 async react(input:ReactionCoordinates):Promise<boolean> {
  return this.uow.run(async tx=>{
   await lockDeliveryOwner(tx,input.payload.ownerId);
   return applyProjection(tx,'p5-delivery-retry',input,input.payload.ownerId,async fact=>{
    const d=(await tx.client.query<DeliveryRow>(`SELECT * FROM ${tx.table('delivery')} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[fact.payload.deliveryId,input.payload.ownerId])).rows[0];
    if(!d||!await legacyPendingDelivery(tx,d)) {if(d) await cancelDeadline(tx,d);return;}
    const attempt=Number(fact.payload.attempt);if(attempt!==d.attempt+1||attempt>3) return;
    const next=new Date(tx.now.getTime()+[0,30000,120000,900000][attempt]);
    d.attempt=attempt;await tx.client.query(`UPDATE ${tx.table('delivery')} SET attempt=$2,version=version+1 WHERE id=$1`,[d.id,attempt]);
    await deliveryFact(tx,d,'issus.delivery.redelivered',{ownerId:d.owner_id,deliveryId:d.id,sourceEventId:d.source_event_id,sourceStreamId:d.source_stream_id,sourceSequence:d.source_sequence,commentId:d.comment_id!,attempt,content:d.content,nextAttemptAt:next.toISOString()},`retry:${d.id}:${attempt}`);
    const directive=(await tx.client.query(`SELECT type FROM ${tx.table('directive')} WHERE comment_id=$1`,[d.comment_id])).rows[0];
    if(directive?.type==='HOLD'&&attempt===1||attempt===3) await escalateDelivery(tx,d,attempt===1?'hold-overdue':'attempts-exhausted');
    await scheduleDeadline(tx,d,next,attempt);
   });
  },input.sourceEventId,'p5-delivery-retry');
 }
}
