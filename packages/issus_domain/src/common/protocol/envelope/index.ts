import type { STATES, TYPES } from '../../validation/constants/index.js';
export type Id=string;
export type Decimal=string;
export type IsoTime=string;
export type IssueState=typeof STATES[number];
export type CommentType=typeof TYPES[number];
export interface Actor {ownerId:Id;aliasId:Id;alias:string;sid:string;sessionId:Id}
export interface IssueRef {repoId:Id;issueNumber:number}
export interface SourceCoordinates {sourceEventId:Id;sourceStreamId:string;sourceSequence:Decimal}
export interface OwnerPayload {ownerId:Id}
export interface RepoPayload extends OwnerPayload {repoId:Id}
export interface IssuePayload extends RepoPayload {issueNumber:number;revision:number}
export interface CommandContext {actor:Actor;idempotencyKey:Id}
export interface CommentEnvelope {FROM:string;TO:string;TYPE:CommentType;CC?:string;RE?:string;STATE?:IssueState;DUE?:IsoTime;'ACK-BY'?:IsoTime;SEEN?:string;SUPERSEDES?:string;'REPLY-IN'?:string;'MIRROR-OF'?:string;GATE?:string;DESTRUCTIVE?:string}
export interface IssueBodyEnvelope {STATE:IssueState;OWNER:string;UPDATED:IsoTime;'REPLY-IN'?:string;COMPACT?:Decimal;BOARD?:string}
/** Domain specialization of agent EventEnvelope v1; explicit audience and action-indexed payload. */
export interface DomainEvent<A extends string=string,P=unknown> {
  eventId:Id;eventVersion:1;kind:'command'|'fact'|'result'|'progress'|'failure'|'control';streamId:string;sequence:Decimal;action:A;transactionKey:string;channel:string;replyChannel?:string;causationEventId?:Id;correlationId:Id;source:'client'|'server'|'worker'|'scheduler';audience:'worker'|'client';payload:P;createdAt:IsoTime;
  sourceEventId?:Id;sourceStreamId?:string;sourceSequence?:Decimal;
}
export interface ValidationReason {code:string;path:string;message:string}
export interface ApiError {error:{code:string;message?:string;reasons?:ValidationReason[];details?:Record<string,unknown>};posted:false;requestId:Id}
export interface AcceptedOperation {operationId:Id;status:'queued';statusUrl:string;posted:null}
export interface OperationResult<T=unknown> {status:'queued'|'running'|'done'|'failed';posted:boolean|null;httpStatus?:number;response?:T;error?:ApiError['error']}
/** Scope factories keep canonical order independent of the author session. */
export const aliasChannel=(ownerId:Id,aliasId:Id):string=>`alias:${ownerId}:${aliasId}`;
export const repoChannel=(repoId:Id):string=>`repo:${repoId}:all`;
export const issueChannel=(repoId:Id,number:number):string=>`issue:${repoId}:${number}`;
export const sessionChannel=(sessionId:Id):string=>`session:${sessionId}`;
export const supervisorChannel=(ownerId:Id):string=>`supervisor:${ownerId}`;
export const internalChannel=(scope:string):string=>`internal:${scope}`;
export const canonicalStream=(channel:string):string=>`channel:${channel}`;
