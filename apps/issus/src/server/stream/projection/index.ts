import type {EventEnvelope} from 'agent/common';
import type {Principal} from 'agent/broker';
import {CoreError,type EventUnitOfWork} from 'issus_domain/server';
import {corePrincipal,type RuntimePrincipal} from 'issus_runtime/server';

const states=['posted','delivered','acked','applied','superseded'] as const;
/** Client-only context; canonical facts retain their strict action payloads and reaction provenance. */
export function createDeliveryProjection(uow:EventUnitOfWork) {
 return async(event:EventEnvelope,principal:Principal):Promise<EventEnvelope>=>{
  if(!event.action.startsWith('issus.delivery.')&&event.action!=='issus.application.rejected') return event;
  if(!event.channel.startsWith('alias:')||typeof event.payload.deliveryId!=='string') return event;
  const parts=event.channel.split(':'),p=corePrincipal(principal as RuntimePrincipal);
  if(p.kind!=='session'||parts[1]!==p.ownerId||parts[2]!==p.aliasId) throw new CoreError(403,'DELIVERY_FORBIDDEN');
  return uow.read(async tx=>{
   const d=(await tx.client.query(`SELECT d.*,c.repo_id,c.issue_number,c.id AS context_comment_id,c.envelope AS context_envelope,source.payload AS source_payload,
    COALESCE(history.state_rank,0) AS state_rank,COALESCE(history.attempt,0) AS frame_attempt
    FROM ${tx.table('delivery')} d
    JOIN event_store source ON source.event_id=d.source_event_id::text
    LEFT JOIN ${tx.table('comment')} c ON c.owner_id=d.owner_id AND c.id=COALESCE(d.comment_id,CASE WHEN source.action='issus.delivery.escalated' THEN (source.payload->>'directiveId')::bigint END)
    LEFT JOIN LATERAL (SELECT max(CASE e.action WHEN 'issus.delivery.delivered' THEN 1 WHEN 'issus.delivery.acked' THEN 2 WHEN 'issus.delivery.applied' THEN 3 WHEN 'issus.delivery.superseded' THEN 4 ELSE 0 END) AS state_rank,
     max(CASE WHEN e.payload->>'attempt' ~ '^[0-3]$' THEN (e.payload->>'attempt')::int ELSE 0 END) AS attempt
     FROM event_store e WHERE e.stream_id=$4 AND e.sequence<=$5 AND e.payload->>'deliveryId'=d.id::text) history ON true
    WHERE d.id=$1 AND d.owner_id=$2 AND d.recipient_alias_id=$3`,[event.payload.deliveryId,p.ownerId,p.aliasId,event.streamId,event.sequence])).rows[0];
   if(!d) throw new CoreError(403,'DELIVERY_FORBIDDEN');
   const source=d.source_payload as Record<string,unknown>,ref=(source.issue??source.sourceIssue??{}) as Record<string,unknown>;
   const repoId=d.repo_id??source.repoId??ref.repoId,issueNumber=d.issue_number??source.issueNumber??source.number??ref.issueNumber;
   const issue=typeof repoId==='string'&&Number.isInteger(issueNumber)?{repoId,issueNumber}:null;
   return {...event,payload:{...event.payload,issue,commentId:d.comment_id??d.context_comment_id??null,
    sourceEventId:d.source_event_id,sourceStreamId:d.source_stream_id,sourceSequence:String(d.source_sequence),
    content:d.content,envelope:d.content.envelope??d.context_envelope??null,priority:d.classification,
    delivery:{id:d.id,state:states[d.state_rank],attempt:d.frame_attempt,ordinal:String(d.ordinal),ackRequired:d.ack_required,
     ...(d.ack_by?{ackBy:new Date(d.ack_by).toISOString()}:{}),aliasEventSequence:event.sequence}}};
  });
 };
}
