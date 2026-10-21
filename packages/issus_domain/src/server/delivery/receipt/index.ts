import type {DeliveryReceiveCommand,Transport} from '../../../common/index.js';
import {CoreError,type CorePrincipal,type EventTransaction} from '../../backend/index.js';
import {ownDelivery,requireDeliverySession} from './model.js';
import {deliveryFact} from './facts.js';
export * from './model.js';
export * from './facts.js';

/** Only an explicit stream receipt or completed pull fetch is delivery evidence. */
export async function receiveDeliveries(tx:EventTransaction,principal:CorePrincipal,x:DeliveryReceiveCommand,transport:Transport='http'):Promise<Record<string,unknown>> {
 const p=await requireDeliverySession(tx,principal);
 if(x.subscriptionId) {
  const s=(await tx.client.query(`SELECT transport FROM ${tx.table('subscription')} WHERE id=$1 AND owner_id=$2 AND session_id=$3 AND closed_at IS NULL`,[x.subscriptionId,p.ownerId,p.sessionId])).rows[0];
  if(!s) throw new CoreError(403,'SUBSCRIPTION_FORBIDDEN');
  if(transport==='http') transport=s.transport;
 }
 const receiptIds:string[]=[];
 for(let i=0;i<x.deliveryIds.length;i++) {
  const d=await ownDelivery(tx,p,x.deliveryIds[i]),attempt=x.attempts[i];
  if(attempt>d.attempt) throw new CoreError(422,'ATTEMPT_UNKNOWN');
  const inserted=await tx.client.query(`INSERT INTO ${tx.table('delivery_receipt')}(owner_id,delivery_id,session_id,alias_id,attempt,received_at,transport) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING delivery_id`,[p.ownerId,d.id,p.sessionId,p.aliasId,attempt,tx.now,transport]);
  receiptIds.push(d.id);
  if(!inserted.rowCount) continue;
  if(d.state==='posted') {await tx.client.query(`UPDATE ${tx.table('delivery')} SET state='delivered',version=version+1 WHERE id=$1`,[d.id]);d.state='delivered';}
  await deliveryFact(tx,d,'issus.delivery.delivered',{ownerId:p.ownerId,deliveryId:d.id,sessionId:p.sessionId,transport,attempt,receivedAt:tx.now.toISOString()},`receipt:${d.id}:${p.sessionId}:${attempt}`);
 }
 return {receiptIds,posted:true};
}
