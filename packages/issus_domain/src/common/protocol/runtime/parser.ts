import type {CommandAction,CommandPayloadMap} from './index.js';
import type {DomainClientFrame,DomainServerFrame} from '../subscription/index.js';
import {CHANNEL_MAX_CHARS,CHANNEL_MAX_COUNT,RECEIPT_MAX_IDS} from '../subscription/index.js';
import {parseCommentRequest} from '../../validation/comment/request.js';
import {object,text,nonempty,number,decimal,bool,texts,issue,state,shape,uuid,type Shape,type Test} from './guards.js';

const SHAPES:Record<CommandAction,Shape>={
 'issus.repo.create':{required:{owner:nonempty,slug:nonempty,projectCode:nonempty,autoBoard:bool},optional:{boardOwner:nonempty}},
 'issus.issue.open':{required:{repoId:nonempty,title:nonempty,body:text}},
 'issus.issue.body.edit':{required:{repoId:nonempty,issueNumber:number,body:text,expectedRevision:number}},
 'issus.issue.close':{required:{repoId:nonempty,issueNumber:number,reason:text,finalReportId:decimal,expectedRevision:number}},
 'issus.issue.reopen':{required:{repoId:nonempty,issueNumber:number,reason:text,state,expectedRevision:number}},
 'issus.comment.post':{required:{repoId:nonempty,issueNumber:number,body:text},optional:{compactPacketToken:nonempty,sampledIds:v=>Array.isArray(v)&&v.every(decimal),compactedBy:nonempty,compactDeferredReason:text}},
 'issus.alias.register':{required:{owner:nonempty,name:nonempty,role:text,model:text,scope:text,repos:texts,announcementBody:text},optional:{announcementIssue:issue}},
 'issus.alias.rename':{required:{aliasId:nonempty,newName:nonempty,announcementBody:text},optional:{announcementIssue:issue}},
 'issus.board.ensure':{required:{repoId:nonempty,boardOwner:nonempty},optional:{body:text}},
 'issus.handoff.accept':{required:{handoffId:decimal,ackCommentId:decimal}},
 'issus.handoff.complete':{required:{handoffId:decimal,expectedRevision:number}},
 'issus.delivery.receive':{required:{deliveryIds:texts,attempts:v=>Array.isArray(v)&&v.every(x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)},optional:{subscriptionId:nonempty}},
 'issus.delivery.apply':{required:{deliveryId:nonempty,evidenceCommentId:decimal,outcome:v=>v==='applied'||v==='not-applied'},optional:{reason:text}},
 'issus.inbox.process':{required:{deliveryIds:texts,disposition:v=>v==='acked'||v==='replied'||v==='ignored'},optional:{evidenceCommentId:decimal,reason:text}},
 'issus.clock.tick':{required:{slot:nonempty}}
};
export type ParseResult<T>={ok:true;value:T}|{ok:false;code:'UNKNOWN_ACTION'|'INVALID_PAYLOAD'};
/** Parses business payload before the server attaches actor/idempotency/owner and broker provenance. Unknown keys are rejected. */
export function parseCommandPayload<A extends CommandAction>(action:A,value:unknown):ParseResult<CommandPayloadMap[A]> {
  if (!Object.hasOwn(SHAPES,action)) return {ok:false,code:'UNKNOWN_ACTION'};
  if (!shape(value,SHAPES[action])) return {ok:false,code:'INVALID_PAYLOAD'};
  if (action==='issus.comment.post') {const {repoId:_,issueNumber:__,...request}=value; if (!parseCommentRequest(request).ok) return {ok:false,code:'INVALID_PAYLOAD'};}
  if (action==='issus.delivery.receive' && ((value.deliveryIds as unknown[]).length>(RECEIPT_MAX_IDS)||(value.deliveryIds as unknown[]).length!==(value.attempts as unknown[]).length)) return {ok:false,code:'INVALID_PAYLOAD'};
  return {ok:true,value:value as unknown as CommandPayloadMap[A]};
}
const channels:Test=v=>Array.isArray(v)&&v.length<=CHANNEL_MAX_COUNT&&v.every(x=>typeof x==='string'&&x.length<=CHANNEL_MAX_CHARS&&x.length>0);
/** Shape only: channel authorization and cursor ownership remain mandatory at the authenticated boundary. */
export function parseDomainClientFrame(value:unknown):DomainClientFrame|undefined {
  if (!object(value)) return undefined;
  if (value.type==='subscribe'&&shape(value,{required:{type:v=>v==='subscribe',subscriptionId:uuid,channels},optional:{cursor:uuid}})) return value as unknown as DomainClientFrame;
  if (value.type==='receipt'&&shape(value,{required:{type:v=>v==='receipt',subscriptionId:uuid,deliveryIds:v=>Array.isArray(v)&&v.length<=RECEIPT_MAX_IDS&&v.length>0&&v.every(uuid),attempts:v=>Array.isArray(v)&&v.every(x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0),cursor:uuid}})&&(value.deliveryIds as unknown[]).length===(value.attempts as unknown[]).length) return value as unknown as DomainClientFrame;
  return undefined;
}
/** Does not discard payload metadata or source coordinates. Business payload validation is the action decoder's responsibility. */
export function parseDomainServerFrame(value:unknown):DomainServerFrame|undefined {
  if (!object(value)) return undefined;
  const shapes:Record<string,Shape>={ready:{required:{type:v=>v==='ready',channels}},subscribed:{required:{type:v=>v==='subscribed',subscriptionId:uuid,channels,replayComplete:bool},optional:{cursor:uuid}},replay:{required:{type:v=>v==='replay',cursor:uuid,replayComplete:bool}},error:{required:{type:v=>v==='error',code:nonempty,message:text,retryable:bool}},event:{required:{type:v=>v==='event',cursor:uuid,event:v=>shape(v,{required:{eventId:uuid,eventVersion:x=>x===1,kind:x=>typeof x==='string'&&['command','fact','result','progress','failure','control'].includes(x),streamId:nonempty,sequence:decimal,action:nonempty,transactionKey:nonempty,channel:nonempty,correlationId:nonempty,source:x=>typeof x==='string'&&['client','server','worker','scheduler'].includes(x),audience:x=>x==='worker'||x==='client',payload:object,createdAt:nonempty},optional:{replyChannel:nonempty,causationEventId:nonempty,sourceEventId:nonempty,sourceStreamId:nonempty,sourceSequence:decimal}})}}};
  return typeof value.type==='string'&&Object.hasOwn(shapes,value.type)&&shape(value,shapes[value.type]) ? value as unknown as DomainServerFrame : undefined;
}
