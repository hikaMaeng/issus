import { DIRECTIVE, has } from '../../validation/constants/index.js';
import { header, toMe } from '../classification/index.js';
export interface ReadComment { id: string; body: string }
/** issue_watch.py:273–281, same issue/range only. All my TYPEs RE union + every author's SUPERSEDES union. */
export function pendingLegacy<T extends ReadComment>(comments: readonly T[], me: readonly string[]): T[] {
  const parsed=comments.map(c=>({c,h:header(c.body)}));
  const myRe=new Set(parsed.filter(x=>me.includes(x.h._from)).flatMap(x=>x.h._re));
  const sup=new Set(parsed.flatMap(x=>x.h._sup));
  return parsed.filter(({c,h})=>!me.includes(h._from) && has(DIRECTIVE,h._type) && toMe(h,c.body,me) && !myRe.has(c.id) && !sup.has(c.id)).map(x=>x.c);
}
export interface AckComment extends ReadComment { authorAliasId: string; postedByAliasId: string; validity: 'v2'|'noenv' }
export interface DirectiveEvidence { commentId: string; recipientAliasId: string; recipientAlias: string; supersededBy?: string; appliedByCommentId?: string }
import type {AckStateView} from '../../protocol/inbox/index.js';
export type AckState=AckStateView;
/** Design §5.2 stronger projection. Inputs superseded/applied are already authorized by the UoW. Never uses legacy pending. */
export function ackState(d: DirectiveEvidence, comments: readonly AckComment[]): AckState {
  const ack=comments.filter(c=>{
    const h=header(c.body);
    return c.validity==='v2' && !h._noenv && h._type==='ACK' && h._from===d.recipientAlias.toLowerCase() && c.authorAliasId===d.recipientAliasId && c.postedByAliasId===d.recipientAliasId && !((h.values.FROM??'').split('/')[1]??'').startsWith('by-') && (h.values.RE??'').split(',').includes(d.commentId);
  }).sort((a,b)=>BigInt(a.id)<BigInt(b.id) ? -1 : BigInt(a.id)>BigInt(b.id) ? 1 : 0)[0];
  if (d.supersededBy) return {directiveId:d.commentId,state:'superseded',supersededBy:d.supersededBy,...(ack ? {ackCommentId:ack.id} : {})};
  if (!ack) return {directiveId:d.commentId,state:'waiting'};
  return {directiveId:d.commentId,state:d.appliedByCommentId ? 'applied' : 'acked',ackCommentId:ack.id,...(d.appliedByCommentId ? {appliedByCommentId:d.appliedByCommentId} : {})};
}
