import {header, TYPES, STATES} from 'issus_domain/common';
import {reasonField, type ValidationReason} from '../../entry/client/index.js';
import {composerKo} from '../../resources/composer.js';

export {TYPES, STATES};
export const fieldKeys = ['FROM','TO','TYPE','CC','RE','STATE','DUE','ACK-BY','SEEN','SUPERSEDES','REPLY-IN','MIRROR-OF','GATE','DESTRUCTIVE'] as const;
export type Fields = Record<string,string>;
export interface Draft {fields: Fields; text: string}
export const boardTypes = ['NOTE','ACK','ALIAS','COMPACT'] as const;
/** Supplement the frozen adapter with exact canonical required-key templates only. */
export function composerReasonField(reason: ValidationReason): string|undefined {
  return reasonField(reason) ?? (reason.path === 'body' ? /^(?:필수 봉투 키 없음 (FROM|TO|TYPE)|TYPE (?:ASK|HOLD|DECISION|HANDOFF|ACK|PLAN|CLAIM|RELEASE|REPORT|VERIFY|COMPACT): (RE|DUE|SEEN|STATE|REPLY-IN) 필수)$/.exec(reason.message)?.slice(1).find(Boolean) : undefined);
}
/** Form requirements are affordances only. Canonical server validation is never bypassed. */
export function requiredFields(type: string): readonly string[] {
  return ['FROM','TO','TYPE',...({ASK: ['ACK-BY'], HOLD: ['ACK-BY','SEEN'], DECISION: ['ACK-BY'], HANDOFF: ['ACK-BY','REPLY-IN'], ACK: ['RE'], PLAN: ['DUE'], CLAIM: ['DUE','SEEN'], RELEASE: ['RE'], REPORT: ['STATE'], VERIFY: ['RE'], COMPACT: ['SEEN']}[type] ?? [])];
}
/** Preserve raw text unless a user explicitly applies form edits. Unknown keys prevent a silent round-trip. */
export function parseDraft(body: string): {draft: Draft; lossless: boolean} {
  const parsed = header(body), index = body.indexOf('\n');
  const draft = {fields: {...parsed.values}, text: index < 0 ? '' : body.slice(index + 1)};
  return {draft, lossless: !parsed._noenv && serializeDraft(draft) === body};
}
/** Stable canonical order is used only after explicit form application. No raw string is trimmed. */
export function serializeDraft({fields, text}: Draft): string {
  return fieldKeys.filter(key => fields[key]).map(key => `${key}:${fields[key]}`).join(' ') + '\n' + text;
}
/** Protocol time fields require an explicit numeric offset and no fractional seconds. */
export function protocolTime(now = new Date()): string {return now.toISOString().replace(/\.\d{3}Z$/, '+00:00');}
/** Codepoints and HTTP JSON bytes have different limits. */
export function draftSize(body: string, board = false, metadata: Record<string,unknown> = {}): {chars: number; bytes: number; limit: number} {
  return {chars: Array.from(body).length, bytes: new TextEncoder().encode(JSON.stringify({body, ...metadata})).byteLength, limit: header(body)._type === 'COMPACT' ? 2000 : board && header(body)._type === 'NOTE' ? 1500 : 4000};
}
/** Quick actions produce drafts, never API calls or optimistic delivery changes. */
export function quickDraft(kind: 'ACK'|'HOLD'|'DECISION'|'RELEASE'|'NOENV', from: string, comment: {id: string; body: string; envelope: Record<string,string>}, seen: string, now = new Date()): string {
  const to = comment.envelope.FROM?.split('/')[0] ?? header(comment.body)._from;
  const fields: Fields = {FROM: from, TO: to, TYPE: kind === 'NOENV' ? 'ASK' : kind};
  let text: string;
  if (kind === 'ACK') {fields.RE = comment.id; text = composerKo.ackText;}
  else if (kind === 'RELEASE') {fields.TO = comment.envelope.TO || 'ALL'; fields.RE = comment.id; text = composerKo.releaseText;}
  else if (kind === 'HOLD') {fields['ACK-BY'] = protocolTime(new Date(now.getTime() + 5 * 60000)); fields.SEEN = seen; text = composerKo.holdText;}
  else if (kind === 'DECISION') {fields.TO = comment.envelope.TO && comment.envelope.TO !== 'ALL' ? comment.envelope.TO : to; fields['ACK-BY'] = protocolTime(new Date(now.getTime() + 10 * 60000)); fields.SUPERSEDES = comment.id; text = composerKo.decisionText;}
  else {fields['ACK-BY'] = protocolTime(new Date(now.getTime() + 10 * 60000)); text = composerKo.noenvText(to);}
  return serializeDraft({fields, text});
}
