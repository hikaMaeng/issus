import type {EventTransaction} from '../../backend/index.js';
import type {DeliveryRow} from '../../delivery/receipt/model.js';

/** Internal routing fact and supervisor channel are atomic; neither claims recipient ACK. */
export async function escalateDelivery(tx:EventTransaction,d:DeliveryRow,level:string):Promise<void> {
 const row=(await tx.client.query(`SELECT i.owner_alias_id,o.supervisor_alias_id FROM ${tx.table('comment')} c JOIN ${tx.table('issue')} i ON i.repo_id=c.repo_id AND i.number=c.issue_number JOIN ${tx.table('owner')} o ON o.id=c.owner_id WHERE c.id=$1`,[d.comment_id])).rows[0];
 if(!row) return;
 const payload={ownerId:d.owner_id,deliveryId:d.id,directiveId:d.comment_id!,recipient:d.recipient_alias_id,ownerAliasId:row.owner_alias_id,...(row.supervisor_alias_id?{supervisorAliasId:row.supervisor_alias_id}:{}),attempt:d.attempt,reason:level};
 tx.fact('issus.delivery.escalated','internal:delivery',payload,`escalated:${d.id}:${level}`,'worker');
 tx.fact('issus.delivery.escalated',`supervisor:${d.owner_id}`,payload,`supervisor:${d.id}:${level}`);
}
