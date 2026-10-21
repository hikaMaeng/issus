import {randomUUID} from 'node:crypto';
import {CoreError,commentById,refs,requestHash,type CorePrincipal,type EventTransaction} from '../../backend/index.js';
import type {InboxProcessCommand} from '../../../common/index.js';
import {ownDelivery,requireDeliverySession} from '../receipt/model.js';
import {reconcileDirectiveDelivery} from '../ack/index.js';

/** The continuous prefix is computed from confirmed dispositions, never from display order. */
export async function processingPosition(tx:EventTransaction,aliasId:string):Promise<{ordinal:string;lastSeenCommentId:string|null}> {
 const r=(await tx.client.query(`SELECT COALESCE((SELECT min(d.ordinal)-1 FROM ${tx.table('delivery')} d LEFT JOIN ${tx.table('processed')} p ON p.delivery_id=d.id AND p.alias_id=d.recipient_alias_id WHERE d.recipient_alias_id=$1 AND p.delivery_id IS NULL),(SELECT max(ordinal) FROM ${tx.table('delivery')} WHERE recipient_alias_id=$1),0)::text AS ordinal`,[aliasId])).rows[0];
 const last=(await tx.client.query(`SELECT max(comment_id)::text AS id FROM ${tx.table('delivery')} WHERE recipient_alias_id=$1 AND ordinal<=$2`,[aliasId,r.ordinal])).rows[0];
 return {ordinal:r.ordinal,lastSeenCommentId:last.id};
}
export async function processedCursor(tx:EventTransaction,p:CorePrincipal):Promise<string|null> {
 if(p.kind!=='session') return null;
 const position=await processingPosition(tx,p.aliasId);if(position.ordinal==='0') return null;
 const hash=requestHash('processed',{ownerId:p.ownerId,aliasId:p.aliasId});
 const old=(await tx.client.query(`SELECT id FROM ${tx.table('history_snapshot')} WHERE principal_id=$1 AND scope_hash=$2 AND snapshot->>'ordinal'=$3 AND expires_at>$4 LIMIT 1`,[p.aliasId,hash,position.ordinal,tx.now])).rows[0];
 if(old) return old.id;
 const id=randomUUID();await tx.client.query(`INSERT INTO ${tx.table('history_snapshot')}(id,principal_id,scope_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5)`,[id,p.aliasId,hash,{kind:'processed',...position},new Date(tx.now.getTime()+30*86400000)]);return id;
}
/** A directive cannot be ignored or hidden by a response lacking its actual recipient ACK. */
export async function processInbox(tx:EventTransaction,principal:CorePrincipal,x:InboxProcessCommand):Promise<Record<string,unknown>> {
 const p=await requireDeliverySession(tx,principal),evidence=x.evidenceCommentId?await commentById(tx,p,x.evidenceCommentId):undefined;
 for(const id of x.deliveryIds) {
  const d=await ownDelivery(tx,p,id);await reconcileDirectiveDelivery(tx,d);
  if(d.ack_required&&!['acked','applied','superseded'].includes(d.state)) throw new CoreError(409,'ACK_REQUIRED');
  if(x.disposition==='ignored') {if(d.ack_required||!x.reason?.trim()) throw new CoreError(409,'DIRECTIVE_IGNORE_FORBIDDEN');}
  else if(!evidence||evidence.validity!=='v2'||evidence.author_alias_id!==p.aliasId||evidence.posted_by_alias_id!==p.aliasId||!d.comment_id||!refs(evidence.envelope.RE).includes(d.comment_id)||x.disposition==='acked'&&evidence.envelope.TYPE!=='ACK') throw new CoreError(422,'PROCESSING_EVIDENCE_UNRELATED');
  const inserted=await tx.client.query(`INSERT INTO ${tx.table('processed')}(owner_id,alias_id,delivery_id,disposition,evidence_comment_id,reason,recorded_by_session,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING delivery_id`,[p.ownerId,p.aliasId,id,x.disposition,evidence?.id??null,x.reason??null,p.sessionId,tx.now]);
  if(inserted.rowCount) tx.fact('issus.inbox.processed','internal:inbox',{ownerId:p.ownerId,aliasId:p.aliasId,deliveryId:id,disposition:x.disposition,...(evidence?{evidenceCommentId:evidence.id}:{}),...(x.reason?{reason:x.reason}:{})},`processed:${id}`,'worker');
 }
 return {processedCursor:await processedCursor(tx,p),...await processingPosition(tx,p.aliasId),posted:true};
}
