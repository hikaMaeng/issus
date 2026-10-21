import {applyProjection,type EventUnitOfWork,type EventTransaction,type ReactionCoordinates,type CommentRow} from '../../backend/index.js';
import {deliveryFact} from '../receipt/facts.js';
import {lockDeliveryOwner,type DeliveryRow} from '../receipt/model.js';
import {legacyPendingDelivery,cancelDeadline} from '../../scheduling/deadline/index.js';

/** P4's synchronous directive index is authoritative even if route arrives after ACK. */
export async function reconcileDirectiveDelivery(tx:EventTransaction,d:DeliveryRow):Promise<void> {
 if(!d.ack_required||!d.comment_id||['applied','superseded'].includes(d.state)) return;
 const directive=(await tx.client.query(`SELECT * FROM ${tx.table('directive')} WHERE comment_id=$1 AND recipient_alias_id=$2`,[d.comment_id,d.recipient_alias_id])).rows[0];
 if(!directive) return;
 if(directive.acked_by_comment_id&&!['acked','applied'].includes(d.state)) {
  const ack=(await tx.client.query<CommentRow>(`SELECT * FROM ${tx.table('comment')} WHERE id=$1`,[directive.acked_by_comment_id])).rows[0];
  // The synchronous index has already checked logical FROM == authenticated alias and no proxy.
  const inserted=await tx.client.query(`INSERT INTO ${tx.table('delivery_receipt')}(owner_id,delivery_id,session_id,alias_id,attempt,received_at,transport,evidence) VALUES($1,$2,$3,$4,$5,$6,'ack-evidence',$7) ON CONFLICT DO NOTHING RETURNING delivery_id`,[d.owner_id,d.id,ack.author_session_id,d.recipient_alias_id,d.attempt,tx.now,{ackCommentId:ack.id}]);
  if(d.state==='posted'&&inserted.rowCount) await deliveryFact(tx,d,'issus.delivery.delivered',{ownerId:d.owner_id,deliveryId:d.id,sessionId:ack.author_session_id,transport:'ack-evidence',attempt:d.attempt,receivedAt:tx.now.toISOString()},`ack-receipt:${d.id}`);
  await tx.client.query(`UPDATE ${tx.table('delivery')} SET state='acked',next_attempt_at=NULL,version=version+1 WHERE id=$1`,[d.id]);d.state='acked';
  await deliveryFact(tx,d,'issus.delivery.acked',{ownerId:d.owner_id,deliveryId:d.id,directiveId:d.comment_id,ackCommentId:ack.id,ackAliasId:d.recipient_alias_id},`acked:${d.id}`);
 }
 if(directive.superseded_by&&['posted','delivered'].includes(d.state)) {
  await tx.client.query(`UPDATE ${tx.table('delivery')} SET state='superseded',next_attempt_at=NULL,version=version+1 WHERE id=$1`,[d.id]);d.state='superseded';
  await deliveryFact(tx,d,'issus.delivery.superseded',{ownerId:d.owner_id,deliveryId:d.id,byCommentId:directive.superseded_by,reason:'authorized-correction'},`superseded:${d.id}`);
 }
}
/** References are indexed synchronously by P4; asynchronous projection only publishes missing facts. */
export class DeliveryReferenceService {
 constructor(readonly uow:EventUnitOfWork) {}
 async react(input:ReactionCoordinates):Promise<boolean> {
  return this.uow.run(async tx=>{
   await lockDeliveryOwner(tx,input.payload.ownerId);
   return applyProjection(tx,'p5-delivery-references',input,input.payload.ownerId,async fact=>{
    if(fact.action!=='issus.comment.posted') return;
    const refs=(await tx.client.query(`SELECT referenced_comment_id FROM ${tx.table('comment_reference')} WHERE comment_id=$1`,[fact.payload.commentId])).rows.map(r=>r.referenced_comment_id);
    if(!refs.length) return;
    const deliveries=(await tx.client.query<DeliveryRow>(`SELECT * FROM ${tx.table('delivery')} WHERE owner_id=$1 AND comment_id=ANY($2::bigint[]) ORDER BY id FOR UPDATE`,[input.payload.ownerId,refs])).rows;
    for(const d of deliveries) {await reconcileDirectiveDelivery(tx,d);if(!await legacyPendingDelivery(tx,d,true)) await cancelDeadline(tx,d);}
   });
  },input.sourceEventId,'p5-delivery-references');
 }
}
