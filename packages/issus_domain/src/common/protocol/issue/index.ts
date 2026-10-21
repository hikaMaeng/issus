import type {Actor,Decimal,Id,IssuePayload,IssueState,IssueBodyEnvelope,IsoTime} from '../envelope/index.js';
export const ISSUE_ACTIONS={open:'issus.issue.open',opened:'issus.issue.opened',editBody:'issus.issue.body.edit',bodyEdited:'issus.issue.body.edited',close:'issus.issue.close',closed:'issus.issue.closed',reopen:'issus.issue.reopen',reopened:'issus.issue.reopened',handedOff:'issus.issue.handed-off'} as const;
export interface IssueOpenCommand {repoId:Id;title:string;body:string}
export interface IssueBodyEditCommand {repoId:Id;issueNumber:number;body:string;expectedRevision:number}
export interface IssueCloseCommand {repoId:Id;issueNumber:number;reason:string;finalReportId:Decimal;expectedRevision:number}
export interface IssueReopenCommand {repoId:Id;issueNumber:number;reason:string;state:IssueState;expectedRevision:number}
export interface IssueOpened extends IssuePayload {number:number;title:string;body:string;state:IssueState;ownerAliasId:Id;isBoard:boolean;actor:Actor}
export interface IssueBodyEdited extends IssuePayload {body:string;previousRevision:number;reason:string;actor:Actor}
export interface IssueClosed extends IssuePayload {reason:string;finalReportId?:Decimal;compactId?:Decimal;body:string;actor:Actor}
export type IssueReopened=IssueClosed;
export interface IssueView {repoId:Id;number:number;title:string;body:string;envelope:IssueBodyEnvelope;state:IssueState;ownerAliasId:Id;isOpen:boolean;closeReason?:string;replyIn?:string;compactCommentId?:Decimal;isBoard:boolean;revision:number;updatedAt:IsoTime}
