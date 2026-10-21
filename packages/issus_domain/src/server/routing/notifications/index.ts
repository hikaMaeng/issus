import {deterministicEventId} from 'agent/server';
import {applyProjection,type EventTransaction,type EventUnitOfWork,type ReactionCoordinates,type CanonicalFact,type CommentRow,type IssueRow} from '../../backend/index.js';
import type {FactPayloadMap} from '../../../common/index.js';
import {commentRecipients,type Recipient} from '../recipients/index.js';
import {deliveryFact} from '../../delivery/receipt/facts.js';
import {type DeliveryRow,lockDeliveryOwner} from '../../delivery/receipt/model.js';
import {reconcileDirectiveDelivery} from '../../delivery/ack/index.js';

/** Natural source/alias key and the ordinal clock are durable across worker restarts. */
export async function queueDelivery(tx:EventTransaction,fact:CanonicalFact,recipient:Recipient,content:DeliveryRow['content'],comment?:CommentRow):Promise<DeliveryRow|undefined> {
 const ownerId=String(fact.payload.ownerId),id=deterministicEventId(`delivery:${fact.eventId}:${recipient.aliasId}`);
 if((await tx.client.query(`SELECT 1 FROM ${tx.table('delivery')} WHERE source_event_id=$1 AND recipient_alias_id=$2`,[fact.eventId,recipient.aliasId])).rowCount) return undefined;
 const clock=(await tx.client.query(`INSERT INTO ${tx.table('inbox_clock')}(owner_id,alias_id,last_ordinal) VALUES($1,$2,1) ON CONFLICT(alias_id) DO UPDATE SET last_ordinal=${tx.table('inbox_clock')}.last_ordinal+1 RETURNING last_ordinal`,[ownerId,recipient.aliasId])).rows[0];
 const ackBy=recipient.ackRequired?comment?.envelope['ACK-BY']:null;
 const d=(await tx.client.query<DeliveryRow>(`INSERT INTO ${tx.table('delivery')}(id,owner_id,source_event_id,source_stream_id,source_sequence,comment_id,recipient_alias_id,classification,ordinal,ack_required,ack_by,next_attempt_at,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12) RETURNING *`,[id,ownerId,fact.eventId,fact.streamId,fact.sequence,comment?.id??null,recipient.aliasId,recipient.classification,clock.last_ordinal,recipient.ackRequired,ackBy,content])).rows[0];
 await deliveryFact(tx,d,'issus.delivery.queued',{ownerId,deliveryId:id,sourceEventId:fact.eventId,sourceStreamId:fact.streamId,sourceSequence:fact.sequence,...(comment?{commentId:comment.id}:{}),aliasId:recipient.aliasId,ordinal:d.ordinal,classification:recipient.classification,ackRequired:recipient.ackRequired,...(ackBy?{ackBy}:{}),attempt:0,content},`queued:${id}`);
 if(d.ack_required) await reconcileDirectiveDelivery(tx,d);
 return d;
}
/** One reaction projection commits all alias deliveries, facts and downstream queues together. */
export class RoutingService {
 constructor(readonly uow:EventUnitOfWork) {}
 async react(input:ReactionCoordinates):Promise<boolean> {
  return this.uow.run(async tx=>{
   await lockDeliveryOwner(tx,input.payload.ownerId);
   return applyProjection(tx,'p5-routing',input,input.payload.ownerId,fact=>this.route(tx,fact));
  },input.sourceEventId,'p5-routing');
 }
 private async route(tx:EventTransaction,fact:CanonicalFact):Promise<void> {
  const x=fact.payload,ownerId=String(x.ownerId);
  if(fact.action==='issus.comment.posted') {
   const comment=(await tx.client.query<CommentRow>(`SELECT * FROM ${tx.table('comment')} WHERE id=$1 AND owner_id=$2`,[x.commentId,ownerId])).rows[0];
   if(!comment) throw new Error('canonical comment missing');
   const issue=(await tx.client.query<IssueRow>(`SELECT * FROM ${tx.table('issue')} WHERE repo_id=$1 AND number=$2`,[comment.repo_id,comment.issue_number])).rows[0];
   for(const r of await commentRecipients(tx,comment,issue)) await queueDelivery(tx,fact,r,{body:r.classification==='OTHER'?comment.body.split(/\r?\n/)[0]:comment.body,envelope:comment.envelope},comment);
   return;
  }
  let ids:string[]=[];
  if(fact.action==='issus.delivery.escalated') {
   if(fact.streamId!=='channel:internal:delivery') return;
   const original=(await tx.client.query(`SELECT c.author_alias_id FROM ${tx.table('comment')} c WHERE c.id=$1 AND c.owner_id=$2`,[x.directiveId,ownerId])).rows[0];
   ids=[String(x.ownerAliasId),...(x.supervisorAliasId?[String(x.supervisorAliasId)]:[]),...(original?[original.author_alias_id]:[]),...(String(x.reason).startsWith('mention-pending')?[String(x.recipient)]:[])];
  } else if(fact.action==='issus.compact.due') ids=[String(x.ownerAliasId)];
  else {
   const ref=(x.issue??x.sourceIssue??{}) as Record<string,unknown>,repoId=String(x.repoId??ref.repoId??''),number=Number(x.issueNumber??x.number??ref.issueNumber);
   if(repoId) {
    const members=(await tx.client.query(`SELECT alias_id FROM ${tx.table('alias_repo')} WHERE repo_id=$1`,[repoId])).rows;ids=members.map(r=>r.alias_id);
    if(number) {const issue=(await tx.client.query(`SELECT owner_alias_id FROM ${tx.table('issue')} WHERE repo_id=$1 AND number=$2`,[repoId,number])).rows[0];if(issue) ids.push(issue.owner_alias_id);}
   }
   if(x.oldOwner) ids.push(String(x.oldOwner));if(x.newOwner) ids.push(String(x.newOwner));
  }
  for(const id of [...new Set(ids)].sort()) {
   const alias=(await tx.client.query(`SELECT name FROM ${tx.table('alias')} WHERE id=$1 AND owner_id=$2 AND status='active'`,[id,ownerId])).rows[0];
   if(alias) await queueDelivery(tx,fact,{aliasId:id,alias:alias.name,classification:fact.action==='issus.compact.due'?'ME':'ALL',ackRequired:false},{body:JSON.stringify({action:fact.action,...x})});
  }
 }
}
