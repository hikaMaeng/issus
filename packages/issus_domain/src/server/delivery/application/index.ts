import {CoreError,actorOf,commentById,refs,type EventTransaction,type CorePrincipal} from '../../backend/index.js';
import type {DeliveryApplyCommand} from '../../../common/index.js';
import {ownDelivery,requireDeliverySession} from '../receipt/model.js';
import {deliveryFact} from '../receipt/facts.js';
import {reconcileDirectiveDelivery} from '../ack/index.js';

/** Applied means a direct recipient submitted a relevant REPORT/VERIFY after a direct ACK. */
export async function applyDelivery(tx:EventTransaction,principal:CorePrincipal,x:DeliveryApplyCommand):Promise<Record<string,unknown>> {
 const p=await requireDeliverySession(tx,principal),d=await ownDelivery(tx,p,x.deliveryId);
 await reconcileDirectiveDelivery(tx,d);
 if(!d.ack_required||!d.comment_id) throw new CoreError(422,'APPLICATION_NOT_DIRECTIVE');
 if(!['acked','applied'].includes(d.state)) throw new CoreError(409,'ACK_REQUIRED');
 const c=await commentById(tx,p,x.evidenceCommentId);
 if(c.validity!=='v2'||c.author_alias_id!==p.aliasId||c.posted_by_alias_id!==p.aliasId||c.envelope.FROM.split('/')[1].startsWith('by-')||!['REPORT','VERIFY'].includes(c.envelope.TYPE)||!refs(c.envelope.RE).includes(d.comment_id)) throw new CoreError(422,'APPLICATION_EVIDENCE_UNRELATED');
 if(x.outcome==='not-applied') {
  if(!x.reason?.trim()) throw new CoreError(422,'APPLICATION_REASON_REQUIRED');
  await deliveryFact(tx,d,'issus.application.rejected',{ownerId:p.ownerId,deliveryId:d.id,evidenceCommentId:c.id,reason:x.reason},`application-rejected:${d.id}:${tx.key}`);
  return {deliveryId:d.id,outcome:'not-applied',posted:true};
 }
 if(d.state==='applied') return {deliveryId:d.id,outcome:'applied',posted:true};
 await tx.client.query(`UPDATE ${tx.table('directive')} SET applied_by_comment_id=$2 WHERE comment_id=$1 AND recipient_alias_id=$3`,[d.comment_id,c.id,p.aliasId]);
 await tx.client.query(`UPDATE ${tx.table('directive_recipient')} SET applied_comment_id=COALESCE(applied_comment_id,$3) WHERE comment_id=$1 AND alias_id=$2`,[d.comment_id,p.aliasId,c.id]);
 await tx.client.query(`UPDATE ${tx.table('delivery')} SET state='applied',version=version+1,next_attempt_at=NULL WHERE id=$1`,[d.id]);d.state='applied';
 await deliveryFact(tx,d,'issus.delivery.applied',{ownerId:p.ownerId,deliveryId:d.id,directiveId:d.comment_id,evidenceCommentId:c.id,outcome:'applied',actor:actorOf(p)},`applied:${d.id}`);
 return {deliveryId:d.id,outcome:'applied',posted:true};
}
