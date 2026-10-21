import {pendingLegacy} from '../../../common/index.js';
import {commentsFor,applyProjection,type EventUnitOfWork,type EventTransaction,type ReactionCoordinates} from '../../backend/index.js';
import {lockDeliveryOwner,type DeliveryRow} from '../../delivery/receipt/model.js';

/** Eligibility always uses full canonical issue history for exactly one recipient alias. */
export async function legacyPendingDelivery(tx:EventTransaction,d:DeliveryRow,includeMention=false):Promise<boolean> {
 if((!d.ack_required&&!includeMention)||!d.comment_id) return false;
 const row=(await tx.client.query(`SELECT c.repo_id,c.issue_number,a.name FROM ${tx.table('comment')} c JOIN ${tx.table('alias')} a ON a.id=$2 WHERE c.id=$1`,[d.comment_id,d.recipient_alias_id])).rows[0];
 if(!row) return false;
 return pendingLegacy(await commentsFor(tx,row.repo_id,row.issue_number),[row.name.toLowerCase()]).some(c=>c.id===d.comment_id);
}
export async function cancelDeadline(tx:EventTransaction,d:DeliveryRow):Promise<void> {
 await tx.client.query(`UPDATE ${tx.table('delivery')} SET next_attempt_at=NULL WHERE id=$1`,[d.id]);
 await tx.client.query(`UPDATE ${tx.table('schedule')} SET state='cancelled' WHERE entity_id=$1 AND state='pending'`,[d.id]);
}
export async function scheduleDeadline(tx:EventTransaction,d:DeliveryRow,at:Date,generation:number):Promise<void> {
 await tx.client.query(`INSERT INTO ${tx.table('schedule')}(kind,entity_id,generation,run_at,attempt) VALUES('delivery',$1,$2,$3,$2) ON CONFLICT DO NOTHING`,[d.id,generation,at]);
 await tx.client.query(`UPDATE ${tx.table('delivery')} SET next_attempt_at=$2 WHERE id=$1`,[d.id,at]);
}
/** Queue registration can run after ACK/reference publication without reviving cancelled retries. */
export class DeadlineService {
 constructor(readonly uow:EventUnitOfWork) {}
 async react(input:ReactionCoordinates):Promise<boolean> {
  return this.uow.run(async tx=>{
   await lockDeliveryOwner(tx,input.payload.ownerId);
   return applyProjection(tx,'p5-deadline',input,input.payload.ownerId,async fact=>{
    const d=(await tx.client.query<DeliveryRow>(`SELECT * FROM ${tx.table('delivery')} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[fact.payload.deliveryId,input.payload.ownerId])).rows[0];
    if(!d) return;
    if(!d.ack_required) {
     if(d.classification!=='ME'||!d.comment_id) return;
     if(!await legacyPendingDelivery(tx,d,true)) {await cancelDeadline(tx,d);return;}
     const c=(await tx.client.query(`SELECT envelope FROM ${tx.table('comment')} WHERE id=$1 AND validity='v2'`,[d.comment_id])).rows[0];
     if(c?.envelope['ACK-BY']) await tx.client.query(`INSERT INTO ${tx.table('schedule')}(kind,entity_id,generation,run_at) VALUES('mention',$1,0,$2) ON CONFLICT DO NOTHING`,[d.id,c.envelope['ACK-BY']]);
     return;
    }
    if(!await legacyPendingDelivery(tx,d)) {await cancelDeadline(tx,d);return;}
    if(fact.action==='issus.delivery.queued'&&d.attempt===0&&d.ack_by) await scheduleDeadline(tx,d,new Date(d.ack_by),0);
   });
  },input.sourceEventId,'p5-deadline');
 }
}
