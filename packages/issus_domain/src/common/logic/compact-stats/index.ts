import { COMPACT_MARK, charCount, splitlines, strip } from '../../validation/constants/index.js';
import { header, type ReadHeader } from '../classification/index.js';
import type { ReadComment } from '../pending-ack/index.js';
/** issue_watch.py:100–105,178–180. Native valid pointers are chosen by the server, never by this legacy detector. */
export const COMPACT_DUE_COMMENTS=25;
export const COMPACT_DUE_CHARS=40000;
export const COMPACT_DUE_COMMENTS_BOARD=30;
export function isCompact(c: Pick<ReadComment,'body'>, h: ReadHeader=header(c.body)): boolean {
  if (!h._noenv && h._type==='COMPACT') return true;
  const lines=splitlines(c.body.replace(/^\uFEFF+/u,'')).filter(l=>strip(l));
  return lines.length>1 && COMPACT_MARK.test(strip(lines[1]));
}
export const is_compact=isCompact;
/** issue_watch.py:212–215: supplied compact ID is excluded, comments compared as bigint. */
export function sinceCompactStats(comments: readonly ReadComment[], compactId: string|null): {count:number;chars:number} {
  const tail=comments.filter(c=>compactId===null || BigInt(c.id)>BigInt(compactId));
  return {count:tail.length,chars:tail.reduce((n,c)=>n+charCount(c.body),0)};
}
export const since_compact_stats=sinceCompactStats;
import type {CompactPurpose,CompactDueReason} from '../../protocol/compact/index.js';
export type {CompactPurpose,CompactDueReason} from '../../protocol/compact/index.js';
/** Threshold reasons are deterministic; emitting once per generation belongs to the transactional projection. */
export function compactDue(stats: {count:number;chars:number}, board=false, purpose: CompactPurpose='routine'): {due:boolean;reasons:CompactDueReason[]} {
  const reasons: CompactDueReason[]=[];
  if (stats.count>=(board ? COMPACT_DUE_COMMENTS_BOARD : COMPACT_DUE_COMMENTS)) reasons.push('comments');
  if (stats.chars>=COMPACT_DUE_CHARS) reasons.push('chars');
  if (purpose!=='routine') reasons.push(purpose);
  return {due:reasons.length>0,reasons};
}
