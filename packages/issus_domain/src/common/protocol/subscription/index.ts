import type {Decimal,DomainEvent,Id,OwnerPayload} from '../envelope/index.js';
import type {InboxBootstrap,CompactBoundary,PendingLegacyView,AckStateView} from '../inbox/index.js';
export const SUBSCRIPTION_ACTIONS={opened:'issus.subscription.opened',closed:'issus.subscription.closed'} as const;
export const CHANNEL_MAX_COUNT=32;
export const CHANNEL_MAX_CHARS=128;
export const RECEIPT_MAX_IDS=100;
export interface SubscriptionRequest {channels:string[];from:'since-compact'|'start'|'now';repo:string;issues:number[]}
export interface SubscriptionResponse {subscriptionId:Id;channels:string[];cursor:Id;bootstrap:InboxBootstrap;compact:CompactBoundary[];pendingLegacy:PendingLegacyView;windowPendingAck:Decimal[];globalPendingAck:Decimal[];ackState:AckStateView[]}
export interface SubscriptionOpened extends OwnerPayload {subscriptionId:Id;aliasId:Id;sid:string;sessionId:Id;channels:string[];transport:'websocket'|'sse';reason?:string}
export type SubscriptionClosed=SubscriptionOpened;
/** Read/receipt only. No client event mutation frame exists in the domain protocol. */
export type DomainClientFrame={type:'subscribe';subscriptionId:Id;channels:string[];cursor?:Id}|{type:'receipt';subscriptionId:Id;deliveryIds:Id[];attempts:number[];cursor:Id};
export type DomainServerFrame={type:'ready';channels:string[]}|{type:'subscribed';subscriptionId:Id;channels:string[];cursor?:Id;replayComplete:boolean}|{type:'event';event:DomainEvent;cursor:Id}|{type:'replay';cursor:Id;replayComplete:boolean}|{type:'error';code:string;message:string;retryable:boolean};
