import {header,mask,parseIssueBodyEnvelope,splitlines,strip,type CompactPacket} from '../../../common/index.js';
import type {CommentRow,IssueRow} from '../../backend/index.js';

export interface PacketRenderInput {repo:string;issue:IssueRow;previous:CommentRow|null;tail:CommentRow[];now:Date;pendingAppendix:CompactPacket['pendingAppendix'];controlFactsSinceCompact:CompactPacket['controlFactsSinceCompact']}
/** Preserve Python codepoint slicing for the duplicated header/envelope fields. */
const cut=(text:string,n:number):string=>Array.from(text).slice(0,n).join('');

/** compact_prepare.py layout, followed by one ordered MASKS pass over the whole packet. */
export function renderCompactPacket(input:PacketRenderInput):{markdown:string;maskedCount:number} {
  const {repo,issue,previous,tail,now,pendingAppendix,controlFactsSinceCompact}=input;
  const body1={...parseIssueBodyEnvelope(issue.body).envelope};
  const first=strip(issue.body.replace(/^\uFEFF+/u,''));
  const generated=now.toISOString().slice(0,16)+'+0000';
  const through=tail.at(-1)?.id??previous?.id??'0';
  const out=[`# COMPACT INPUT PACKET ${repo}#${issue.number} generated:${generated} prev-compact:${previous?.id??'none'} comments:${tail.length} last-id:${through}`,
    "규칙: 이 패킷 밖 정보를 쓰지 않는다. 패킷에 없는 것은 '미확인'. 출력은 COMPACT 본문만(≤2000자, examples/compact.md 형식).",
    '',`## ISSUE BODY line1: ${first?cut(splitlines(first)[0],300):'-'}`,
    `STATE=${body1.STATE??'-'} OWNER=${body1.OWNER??'-'} REPLY-IN=${body1['REPLY-IN']??'-'} BOARD=${body1.BOARD??'-'}`,''];
  if(previous) out.push(`## PREV COMPACT ${previous.id} ${previous.created_at.toISOString()}`,previous.body,'');
  else out.push('## PREV COMPACT none — issue body follows',issue.body,'');
  out.push(`## COMMENTS AFTER (${tail.length}, ascending)`);
  for(const c of tail) {const h=header(c.body);out.push(`### ${c.id} ${c.created_at.toISOString()}${h._noenv?' [NOENV]':''} | ${cut(h._first,200)}`,c.body,'');}
  if(pendingAppendix.pendingLegacy.window.length||pendingAppendix.pendingLegacy.global.length||pendingAppendix.ackState.length||pendingAppendix.activeHolds.length||pendingAppendix.claims.length||pendingAppendix.handoffs.length) {
    const ids=[...new Set([...pendingAppendix.pendingLegacy.window,...pendingAppendix.pendingLegacy.global,...pendingAppendix.ackState.map(s=>s.directiveId),...pendingAppendix.activeHolds,...pendingAppendix.claims,...pendingAppendix.handoffs])];
    out.push('## PENDING APPENDIX (legacy and acknowledgement state are separate)',JSON.stringify(pendingAppendix),`원문: ${ids.map(id=>`[${id}](/v1/repos/${repo.split('/').map(encodeURIComponent).join('/')}/comments/${id})`).join(' ')}`,'');
  }
  if(controlFactsSinceCompact.length) out.push('## CONTROL FACTS SINCE COMPACT',JSON.stringify(controlFactsSinceCompact),'');
  const result=mask(out.join('\n'));return {markdown:result.text,maskedCount:result.maskedCount};
}

/** Structured JSON fields carry the same masking policy; counts describe the final markdown pass. */
export function maskPacketValue<T>(value:T):T {
  if(typeof value==='string') return mask(value).text as T;
  if(Array.isArray(value)) return value.map(maskPacketValue) as T;
  if(value!==null&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,maskPacketValue(v)])) as T;
  return value;
}
