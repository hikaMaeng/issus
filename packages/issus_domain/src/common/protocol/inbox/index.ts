import type {CommentEnvelope,Decimal,Id,IssueRef,OwnerPayload,SourceCoordinates} from '../envelope/index.js';
import type {Classification,DeliveryState} from '../delivery/index.js';
import type {DeliveryContent} from '../delivery/index.js';
import type {HandoffView} from '../handoff/index.js';
export const INBOX_ACTIONS={process:'issus.inbox.process',processed:'issus.inbox.processed'} as const;
export type Disposition='acked'|'replied'|'ignored';
export interface InboxProcessCommand {deliveryIds:Id[];disposition:Disposition;evidenceCommentId?:Decimal;reason?:string}
export interface InboxProcessed extends OwnerPayload {aliasId:Id;deliveryId:Id;disposition:Disposition;evidenceCommentId?:Decimal;reason?:string}
export interface PendingLegacyView {window:Decimal[];global:Decimal[]}
export interface AckStateView {directiveId:Decimal;state:'waiting'|'acked'|'applied'|'superseded';ackCommentId?:Decimal;appliedByCommentId?:Decimal;supersededBy?:Decimal}
export interface CompactBoundary extends IssueRef {comment:{id:Decimal;body:string;envelope:CommentEnvelope|Record<string,string>}|null}
export interface InboxBootstrap {mode:'snapshot'|'incremental';snapshotId:Id;meAliases:string[];complete:boolean;issues:(IssueRef & {compactId:Decimal|null;throughCommentId:Decimal;eventHighWater:Record<string,Decimal>})[];inboxThroughOrdinal:Decimal;inboxThroughEventSequence:Decimal}
export interface InboxItem extends SourceCoordinates {viewKey:string;commentId?:Decimal;origin:'history'|'inbox'|'merged';priority:Classification;content:DeliveryContent;delivery?:{id:Id;ordinal:Decimal;state:DeliveryState;attempt:number;aliasEventSequence:Decimal}}
export interface ClaimView {commentId:Decimal;aliasId:Id;issue:IssueRef;dueAt:string;releasedByCommentId?:Decimal}
export interface InboxResponse {bootstrap:InboxBootstrap;compact:CompactBoundary[];items:InboxItem[];nextCursor:Id|null;refreshCursor:Id|null;processedCursor:Id|null;pendingLegacy:PendingLegacyView;windowPendingAck:Decimal[];globalPendingAck:Decimal[];ackState:AckStateView[];activeHolds:Decimal[];claims:ClaimView[];handoffs:HandoffView[];footers:string[]}
