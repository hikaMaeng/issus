import type {Decimal,Id,IssuePayload,IssueRef,OwnerPayload,IsoTime} from '../envelope/index.js';
import type {CompactCommentMetadata} from '../comment/index.js';
import type {PendingLegacyView,AckStateView} from '../inbox/index.js';
export type {CompactPublication,CompactPublicationInput} from '../../../server/backend/index.js';
export const COMPACT_ACTIONS={due:'issus.compact.due',posted:'issus.compact.posted'} as const;
export type CompactPurpose='routine'|'before-decision'|'before-handoff'|'before-close';
export type CompactDueReason='comments'|'chars'|Exclude<CompactPurpose,'routine'>;
export interface CompactStats {count:number;chars:number}
export interface CompactStatus extends CompactStats {previousCompactId:Decimal|null;due:boolean;reasons:CompactDueReason[];owner:string}
export interface CompactDue extends OwnerPayload,CompactStats {issue:IssueRef;ownerAliasId:Id;previousCompactId?:Decimal;reasons:CompactDueReason[];generation:number}
export interface CompactPosted extends IssuePayload,CompactStats {compactId:Decimal;previousCompactId?:Decimal;throughId:Decimal;packetHash:string;bodyRevision:number;metadata:CompactCommentMetadata}
export interface CompactPacket extends CompactStats {bodyLine1:string;previousCompact:{id:Decimal;body:string}|null;comments:{id:Decimal;createdAt:IsoTime;envelope:Record<string,string>;body:string}[];markdown:string;maskedCount:number;suggestedEnvelope:string;throughId:Decimal;previousCompactId:Decimal|null;snapshotRevision:number;packetHash:string;packetToken:string;pendingAppendix:{pendingLegacy:PendingLegacyView;ackState:AckStateView[];activeHolds:Decimal[];claims:Decimal[];handoffs:Decimal[]};controlFactsSinceCompact:{eventId:Id;action:string;createdAt:IsoTime;changes:Record<string,unknown>}[]}
