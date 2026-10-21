import type {Actor,CommentEnvelope,Decimal,Id,IssuePayload,IssueRef,IsoTime,OwnerPayload} from '../envelope/index.js';
export const COMMENT_ACTIONS={post:'issus.comment.post',posted:'issus.comment.posted',rejected:'issus.comment.rejected'} as const;
/** Design §6.3: HTTP keys are preserved to the command; never accept a metadata wrapper. */
export interface CommentPostRequest {body:string;compactPacketToken?:string;sampledIds?:Decimal[];compactedBy?:string;compactDeferredReason?:string}
export interface CommentPostCommand extends CommentPostRequest {repoId:Id;issueNumber:number}
export interface CompactCommentMetadata {compactPacketId:Id;packetHash:string;previousCompactId?:Decimal;throughId:Decimal;snapshotRevision:number;sampledIds:Decimal[];compactedBy:string}
export type CommentMetadata=CompactCommentMetadata|{compactDeferredReason:string}|Record<string,never>;
export interface CommentView {id:Decimal;repoId:Id;issueNumber:number;body:string;envelope:CommentEnvelope|Record<string,string>;metadata:CommentMetadata;author:Actor;postedByAliasId:Id;createdAt:IsoTime;charCount:number;validity:'v2'|'noenv'}
export interface CommentPosted extends IssuePayload {commentId:Decimal;body:string;envelope:CommentEnvelope;metadata:CommentMetadata;charCount:number;author:Actor;validity:'v2'|'noenv'}
export interface CommentRejected extends OwnerPayload {requestId:Id;actorAliasId:Id;issue?:IssueRef;errorCodes:string[];bodySha256:string;charCount:number}
export interface ValidateRequest {mode:'comment'|'issue-body';body:string}
export type PreflightRequest={mode:'comment';request:CommentPostRequest}|{mode:'issue-body';request:{body:string}};
export interface PreflightResponse {valid:true;posted:false;mode:'comment'|'issue-body';chars:number;envelope:Record<string,string>;context:{repoId:Id;issueNumber:number;revision:number;checkedAt:IsoTime};compact:{due:boolean;reasons:string[];count:number;chars:number;previousCompactId:Decimal|null}}
