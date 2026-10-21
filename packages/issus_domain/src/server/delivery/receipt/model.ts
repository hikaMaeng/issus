import type {EventTransaction,CorePrincipal} from '../../backend/index.js';
import {CoreError,authorizePrincipal} from '../../backend/index.js';
import type {Classification,DeliveryState} from '../../../common/index.js';

export interface DeliveryRow {
 id:string;owner_id:string;source_event_id:string;source_stream_id:string;source_sequence:string;
 comment_id:string|null;recipient_alias_id:string;classification:Classification;ordinal:string;
 state:DeliveryState;ack_required:boolean;ack_by:Date|null;attempt:number;next_attempt_at:Date|null;
 version:number;alias_event_sequence:string;content:{body:string;envelope?:Record<string,string>};
}
export type SessionPrincipal=Extract<CorePrincipal,{kind:'session'}>;
/** Delivery mutations require an authenticated session, including worker-time revalidation. */
export async function requireDeliverySession(tx:EventTransaction,p:CorePrincipal):Promise<SessionPrincipal> {
 await authorizePrincipal(tx,p);if(p.kind!=='session') throw new CoreError(403,'SESSION_REQUIRED');return p;
}
/** Follow the P4 owner lock order so posting a reference and retrying serialize. */
export async function lockDeliveryOwner(tx:EventTransaction,ownerId:string):Promise<void> {
 await tx.client.query(`SELECT id FROM ${tx.table('owner')} WHERE id=$1 FOR UPDATE`,[ownerId]);
}
export async function ownDelivery(tx:EventTransaction,p:SessionPrincipal,id:string):Promise<DeliveryRow> {
 const row=(await tx.client.query<DeliveryRow>(`SELECT * FROM ${tx.table('delivery')} WHERE id=$1 AND owner_id=$2 AND recipient_alias_id=$3 FOR UPDATE`,[id,p.ownerId,p.aliasId])).rows[0];
 if(!row) throw new CoreError(403,'DELIVERY_FORBIDDEN');return row;
}
export const aliasChannel=(ownerId:string,aliasId:string):string=>`alias:${ownerId}:${aliasId}`;
export const deliveryView=(d:DeliveryRow)=>({id:d.id,ordinal:d.ordinal,state:d.state,attempt:d.attempt,aliasEventSequence:d.alias_event_sequence});
