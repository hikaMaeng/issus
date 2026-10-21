import type {Decimal,Id,IssuePayload,IssueRef} from '../envelope/index.js';
export const HANDOFF_ACTIONS={accept:'issus.handoff.accept',complete:'issus.handoff.complete',accepted:'issus.handoff.accepted'} as const;
export interface HandoffAcceptCommand {handoffId:Decimal;ackCommentId:Decimal}
export interface HandoffCompleteCommand {handoffId:Decimal;expectedRevision:number}
export interface HandoffAccepted extends IssuePayload {handoffId:Decimal;ackCommentId:Decimal;targetIssue:IssueRef;newOwnerAliasId:Id}
export interface IssueHandedOff extends IssuePayload {handoffId:Decimal;ackCommentId:Decimal;sourceIssue:IssueRef;targetIssue:IssueRef;oldOwner:Id;newOwner:Id;body:string}
export interface HandoffView {commentId:Decimal;sourceIssue:IssueRef;targetIssue:IssueRef;recipientAliasId:Id;ackedBy?:Decimal;status:'pending'|'accepted'|'completed'}
