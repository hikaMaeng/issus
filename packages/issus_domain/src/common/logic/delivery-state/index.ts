import type {DeliveryState} from '../../protocol/delivery/index.js';
export type {DeliveryState} from '../../protocol/delivery/index.js';
export type DeliveryTransition = 'receive'|'ack'|'apply'|'supersede'|'retry';
/** Design §5.2; transport retries never imply receipt or ACK and cannot move terminal state backwards. */
export const DELIVERY_TRANSITIONS: Readonly<Record<DeliveryState,Readonly<Partial<Record<DeliveryTransition,DeliveryState>>>>> = {
  posted:{receive:'delivered',ack:'acked',supersede:'superseded',retry:'posted'},
  delivered:{receive:'delivered',ack:'acked',supersede:'superseded',retry:'delivered'},
  acked:{receive:'acked',ack:'acked',apply:'applied',retry:'acked'},
  applied:{receive:'applied',ack:'applied',apply:'applied',retry:'applied'},
  superseded:{receive:'superseded',ack:'superseded',supersede:'superseded',retry:'superseded'}
};
export type TransitionResult = {ok:true;state:DeliveryState;changed:boolean;ackEvidenceReceipt:boolean}|{ok:false;code:'ACK_REQUIRED'|'INVALID_TRANSITION'};
/** Authorization/evidence verification is a server responsibility; this pure transition table never grants it. */
export function transitionDelivery(state: DeliveryState, event: DeliveryTransition, ackRequired=true): TransitionResult {
  if (!ackRequired && (event==='ack'||event==='apply')) return {ok:false,code:'INVALID_TRANSITION'};
  const next=DELIVERY_TRANSITIONS[state][event];
  if (!next) return {ok:false,code:event==='apply' && (state==='posted'||state==='delivered') ? 'ACK_REQUIRED' : 'INVALID_TRANSITION'};
  return {ok:true,state:next,changed:next!==state,ackEvidenceReceipt:event==='ack' && state==='posted'};
}
