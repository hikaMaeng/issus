import type {Actor,Decimal,Id,IsoTime,OwnerPayload,SourceCoordinates} from '../envelope/index.js';
import type {CommentEnvelope} from '../envelope/index.js';
export type Classification='ME'|'CC'|'ALL'|'OTHER';
export type DeliveryState='posted'|'delivered'|'acked'|'applied'|'superseded';
export const DELIVERY_ACTIONS={receive:'issus.delivery.receive',apply:'issus.delivery.apply',queued:'issus.delivery.queued',delivered:'issus.delivery.delivered',acked:'issus.delivery.acked',applied:'issus.delivery.applied',overdue:'issus.delivery.overdue',redelivered:'issus.delivery.redelivered',escalated:'issus.delivery.escalated',superseded:'issus.delivery.superseded',applicationRejected:'issus.application.rejected'} as const;
export type Transport='websocket'|'sse'|'http'|'ack-evidence';
export interface DeliveryContent {body:string;envelope?:CommentEnvelope|Record<string,string>}
export interface DeliveryReceiveCommand {deliveryIds:Id[];attempts:number[];subscriptionId?:Id}
export interface DeliveryApplyCommand {deliveryId:Id;evidenceCommentId:Decimal;outcome:'applied'|'not-applied';reason?:string}
export interface DeliveryQueued extends OwnerPayload,SourceCoordinates {deliveryId:Id;commentId?:Decimal;aliasId:Id;ordinal:Decimal;classification:Classification;ackRequired:boolean;ackBy?:IsoTime;attempt:0;content:DeliveryContent}
export interface DeliveryDelivered extends OwnerPayload {deliveryId:Id;sessionId:Id;transport:Transport;attempt:number;receivedAt:IsoTime}
export interface DeliveryAcked extends OwnerPayload {deliveryId:Id;directiveId:Decimal;ackCommentId:Decimal;ackAliasId:Id}
export interface DeliveryApplied extends OwnerPayload {deliveryId:Id;directiveId:Decimal;evidenceCommentId:Decimal;outcome:'applied';actor:Actor}
export interface DeliveryOverdue extends OwnerPayload {deliveryId:Id;directiveId:Decimal;ackBy:IsoTime;attempt:number;overdueAt:IsoTime}
export interface DeliveryRedelivered extends OwnerPayload,SourceCoordinates {deliveryId:Id;commentId:Decimal;attempt:number;content:DeliveryContent;nextAttemptAt:IsoTime}
export interface DeliveryEscalated extends OwnerPayload {deliveryId:Id;directiveId:Decimal;recipient:Id;ownerAliasId:Id;supervisorAliasId?:Id;attempt:number;reason:string}
export interface DeliverySuperseded extends OwnerPayload {deliveryId:Id;byCommentId:Decimal;reason:string}
export interface ApplicationRejected extends OwnerPayload {deliveryId:Id;evidenceCommentId:Decimal;reason:string}
export interface DeliveryView extends SourceCoordinates {id:Id;commentId?:Decimal;recipientAliasId:Id;ordinal:Decimal;classification:Classification;state:DeliveryState;ackRequired:boolean;ackBy?:IsoTime;attempt:number;nextAttemptAt?:IsoTime;version:number;aliasEventSequence:Decimal}
export interface DirectiveView {commentId:Decimal;recipientAliasId:Id;type:'ASK'|'HOLD'|'DECISION'|'HANDOFF';ackBy:IsoTime;ackedByCommentId?:Decimal;supersededBy?:Decimal;appliedByCommentId?:Decimal;holdReleasedBy?:Decimal}
export interface DirectiveRecipientView {commentId:Decimal;aliasId:Id;via:'to'|'mention';ackCommentId?:Decimal;appliedCommentId?:Decimal}
