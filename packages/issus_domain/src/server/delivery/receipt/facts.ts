import type {FactAction,FactPayloadMap} from '../../../common/index.js';
import type {EventTransaction} from '../../backend/index.js';
import {createReactionWork} from 'agent/broker';
import {aliasChannel,type DeliveryRow} from './model.js';

/** Append on the caller's client, then persist the actual alias sequence in the same transaction. */
export async function deliveryFact<A extends FactAction>(tx:EventTransaction,d:DeliveryRow,action:A,payload:FactPayloadMap[A],label:string):Promise<void> {
 const draft=tx.fact(action,aliasChannel(d.owner_id,d.recipient_alias_id),payload,label,'client',action==='issus.application.rejected'?'failure':'fact');
 draft.causationEventId=d.source_event_id;draft.source='worker';
 tx.drafts.splice(tx.drafts.indexOf(draft),1);
 const [event]=await tx.options.eventStore.appendManyOn(tx.client,[draft]);
 if(!event) throw new Error('alias fact append returned no event');
 await tx.client.query(`UPDATE ${tx.table('delivery')} SET alias_event_sequence=$2 WHERE id=$1`,[d.id,event.sequence]);
 d.alias_event_sequence=event.sequence;
 for(const queue of tx.options.reactions?.[action]??[]) tx.enqueue(queue,createReactionWork(event,queue));
}
