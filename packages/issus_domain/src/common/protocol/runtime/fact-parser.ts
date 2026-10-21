import type {DomainFact,FactAction,FactPayloadMap,ReactionInput} from './index.js';
import type {ParseResult} from './parser.js';
import {object,text,nonempty,number,natural,decimal,bool,texts,issue,state,shape,type Shape,type Test} from './guards.js';
import {parseDomainServerFrame} from './parser.js';
const actor:Test=v=>shape(v,{required:{ownerId:nonempty,aliasId:nonempty,alias:nonempty,sid:nonempty,sessionId:nonempty}});
const stringRecord:Test=v=>object(v)&&Object.values(v).every(text);
const compactMetadata:Test=v=>shape(v,{required:{compactPacketId:nonempty,packetHash:nonempty,throughId:decimal,snapshotRevision:number,sampledIds:x=>Array.isArray(x)&&x.every(decimal)&&new Set(x).size===x.length,compactedBy:nonempty},optional:{previousCompactId:decimal}});
const metadata:Test=v=>shape(v,{required:{}})||shape(v,{required:{compactDeferredReason:nonempty}})||compactMetadata(v);
const content:Test=v=>shape(v,{required:{body:text},optional:{envelope:stringRecord}});
const classification:Test=v=>typeof v==='string'&&['ME','CC','ALL','OTHER'].includes(v);
const transport:Test=v=>typeof v==='string'&&['websocket','sse','http','ack-evidence'].includes(v);
const own={ownerId:nonempty}, repo={...own,repoId:nonempty}, iss={...repo,issueNumber:number,revision:number};
const source={sourceEventId:nonempty,sourceStreamId:nonempty,sourceSequence:decimal};
const closed:Shape={required:{...iss,reason:text,body:text,actor},optional:{finalReportId:decimal,compactId:decimal}};
const aliased:Shape={required:{...repo,aliasId:nonempty,name:nonempty,repos:texts,role:text,model:text,scope:text,actor},optional:{oldName:nonempty}};
const subscribed:Shape={required:{...own,subscriptionId:nonempty,aliasId:nonempty,sid:nonempty,sessionId:nonempty,channels:texts,transport:v=>v==='websocket'||v==='sse'},optional:{reason:text}};
const session:Shape={required:{...own,sessionId:nonempty,aliasId:nonempty,sid:nonempty},optional:{expiresAt:nonempty,reason:text}};
const SHAPES:Record<FactAction,Shape>={
 'issus.repo.created':{required:{...repo,slug:nonempty,projectCode:nonempty,autoBoard:bool,actor,version:number}},
 'issus.issue.opened':{required:{...iss,number,title:nonempty,body:text,state,ownerAliasId:nonempty,isBoard:bool,actor}},
 'issus.issue.body.edited':{required:{...iss,body:text,previousRevision:number,reason:text,actor}},
 'issus.comment.posted':{required:{...iss,commentId:decimal,body:text,envelope:stringRecord,metadata,charCount:natural,author:actor,validity:v=>v==='v2'||v==='noenv'}},
 'issus.comment.rejected':{required:{...own,requestId:nonempty,actorAliasId:nonempty,errorCodes:texts,bodySha256:nonempty,charCount:natural},optional:{issue}},
 'issus.delivery.queued':{required:{...own,...source,deliveryId:nonempty,aliasId:nonempty,ordinal:decimal,classification,ackRequired:bool,attempt:v=>v===0,content},optional:{commentId:decimal,ackBy:nonempty}},
 'issus.delivery.delivered':{required:{...own,deliveryId:nonempty,sessionId:nonempty,transport,attempt:natural,receivedAt:nonempty}},
 'issus.delivery.acked':{required:{...own,deliveryId:nonempty,directiveId:decimal,ackCommentId:decimal,ackAliasId:nonempty}},
 'issus.delivery.applied':{required:{...own,deliveryId:nonempty,directiveId:decimal,evidenceCommentId:decimal,outcome:v=>v==='applied',actor}},
 'issus.delivery.overdue':{required:{...own,deliveryId:nonempty,directiveId:decimal,ackBy:nonempty,attempt:natural,overdueAt:nonempty}},
 'issus.delivery.redelivered':{required:{...own,...source,deliveryId:nonempty,commentId:decimal,attempt:natural,content,nextAttemptAt:nonempty}},
 'issus.delivery.escalated':{required:{...own,deliveryId:nonempty,directiveId:decimal,recipient:nonempty,ownerAliasId:nonempty,attempt:natural,reason:text},optional:{supervisorAliasId:nonempty}},
 'issus.delivery.superseded':{required:{...own,deliveryId:nonempty,byCommentId:decimal,reason:text}},
 'issus.compact.due':{required:{...own,issue,ownerAliasId:nonempty,count:natural,chars:natural,reasons:texts,generation:natural},optional:{previousCompactId:decimal}},
 'issus.compact.posted':{required:{...iss,compactId:decimal,throughId:decimal,packetHash:nonempty,count:natural,chars:natural,bodyRevision:number,metadata:compactMetadata},optional:{previousCompactId:decimal}},
 'issus.issue.closed':closed,
 'issus.issue.reopened':closed,
 'issus.handoff.accepted':{required:{...iss,handoffId:decimal,ackCommentId:decimal,targetIssue:issue,newOwnerAliasId:nonempty}},
 'issus.issue.handed-off':{required:{...iss,handoffId:decimal,ackCommentId:decimal,sourceIssue:issue,targetIssue:issue,oldOwner:nonempty,newOwner:nonempty,body:text}},
 'issus.alias.registered':aliased,
 'issus.alias.renamed':{required:{...aliased.required,oldName:nonempty}},
 'issus.board.created':{required:{...repo,issueNumber:number,ownerAliasId:nonempty,title:nonempty,body:text}},
 'issus.subscription.opened':subscribed,
 'issus.subscription.closed':subscribed,
 'issus.session.opened':session,
 'issus.session.revoked':session,
 'issus.inbox.processed':{required:{...own,aliasId:nonempty,deliveryId:nonempty,disposition:v=>v==='acked'||v==='replied'||v==='ignored'},optional:{evidenceCommentId:decimal,reason:text}},
 'issus.application.rejected':{required:{...own,deliveryId:nonempty,evidenceCommentId:decimal,reason:nonempty}}
};
/** Strict wire shape decoder; contextual authorization, byte counts and referential checks run in the domain UoW. */
export function parseFactPayload<A extends FactAction>(action:A,value:unknown):ParseResult<FactPayloadMap[A]> {
 if (!Object.hasOwn(SHAPES,action)) return {ok:false,code:'UNKNOWN_ACTION'};
 if (!shape(value,SHAPES[action])) return {ok:false,code:'INVALID_PAYLOAD'};
 return {ok:true,value:value as unknown as FactPayloadMap[A]};
}
function factEvent(value:unknown):value is Record<string,unknown> & {action:FactAction} {
 if (!object(value)||typeof value.action!=='string'||!Object.hasOwn(SHAPES,value.action)) return false;
 return !!parseDomainServerFrame({type:'event',event:value,cursor:'00000000-0000-4000-8000-000000000000'})&&parseFactPayload(value.action as FactAction,value.payload).ok;
}
/** Decodes the original catalogued fact/failure, before the broker creates a reaction command. */
export function parseDomainFact(value:unknown):DomainFact|undefined {
 if (!factEvent(value)) return undefined;
 const kind=value.action==='issus.comment.rejected'||value.action==='issus.application.rejected'?'failure':'fact';
 return value.kind===kind ? value as unknown as DomainFact : undefined;
}
/** Decodes the persisted P2 worker command; source coordinates never fall back to its own identity. */
export function parseReactionInput(value:unknown):ReactionInput|undefined {
 if (!factEvent(value)||value.kind!=='command'||value.source!=='worker'||value.audience!=='worker') return undefined;
 if (!nonempty(value.sourceEventId)||!nonempty(value.sourceStreamId)||!decimal(value.sourceSequence)) return undefined;
 return value as unknown as ReactionInput;
}
