import {header, TYPES, STATES} from 'issus_domain/common';
import {reasonField, type ValidationReason} from '../../entry/client/index.js';
import {composerKo} from '../../resources/composer.js';

export {TYPES, STATES};
export const fieldKeys = ['FROM','TO','TYPE','CC','RE','STATE','DUE','ACK-BY','SEEN','SUPERSEDES','REPLY-IN','MIRROR-OF','GATE','DESTRUCTIVE'] as const;
export type Fields = Record<string,string>;
export interface Draft {fields: Fields; text: string}
export const boardTypes = ['NOTE','ACK','ALIAS','COMPACT'] as const;
const bodyFieldPatterns = [
  /^(?:필수 봉투 키 없음 (FROM|TO|TYPE)|TYPE (?:ASK|HOLD|DECISION|HANDOFF|ACK|PLAN|CLAIM|RELEASE|REPORT|VERIFY|COMPACT): (RE|DUE|SEEN|STATE|REPLY-IN) 필수)$/,
  new RegExp(`^봉투 키 중복 (${fieldKeys.join('|')})$`),
  /^(TO) '.*' — 정확히 1명 또는 ALL\. 알릴 사람은 CC:, 각각 시킬 일은 댓글 둘$/,
  /^(TO|CC) '.*' — (?:이슈번호·IP 지칭 금지, 별칭만|별칭 문자 `\[A-Za-z0-9가-힣_\.\-\]\{2,24\}`만\(sid·@·공백 금지\)|역할명 지칭 금지, 등록된 별칭만)$/,
  /^(CC) 'ALL' 불가$/,
  /^(CC) '.*'가 TO와 같음$/,
  /^(DUE|ACK-BY) '.*' 시각 형식 오류 — YYYY-MM-DDTHH:MM\+09:00 \(날짜 필수\)$/,
  /^(RE|SEEN|SUPERSEDES) '.*' — comment id\(숫자\) 목록만$/,
  /^(REPLY-IN) '.*' — `#n` 또는 `owner\/repo#n`$/,
  /^(MIRROR-OF) '.*' — URL 필요$/,
  new RegExp(`^(STATE) '.*' enum 아님 — ${[...STATES].sort().join('\\|')}$`),
  /^(STATE)는 REPORT·ACK·DECISION에만 — TYPE \S+에서 제거$/,
  new RegExp(`^(TYPE) '.*' 허용 안 됨 — ${[...TYPES].sort().join(' ')}(?: \\(대체: .*\\))?$`),
  /^(FROM) 대리 게시자 '.*' 별칭 문법 위반$/,
  /^(FROM) sid '.*' — `\[a-z0-9-\]` 12자 이하\(짧게, 과제·이슈 인코딩 금지\)$/,
  /^(FROM) 별칭 '.*' 문법 위반 — `<proj>-<n>-<role>`\(예 p4-24-review\) 또는 `<proj>-<role>`, 소문자·숫자·한글·'-', ≤24자 \(join-naming\.md#이름, examples\/alias-register\.md\)$/,
  /^지시성 TYPE (?:ASK|HOLD|DECISION|HANDOFF): (TO)는 1명\(ALL 금지\) — 모두에게 알릴 뿐이면 NOTE$/,
  /^TYPE (?:ALIAS|COMPACT): (TO):ALL 필수(?:\(요약은 전원 공유\))?$/,
] as const;

/** Associate explicit canonical diagnostics only; body content and alias errors remain unassigned. */
export function composerReasonField(reason: ValidationReason): string|undefined {
  const direct = reasonField(reason);
  if (direct || reason.path !== 'body') return direct;
  for (const pattern of bodyFieldPatterns) {
    const field = pattern.exec(reason.message)?.slice(1).find(Boolean);
    if (field) return field;
  }
  return undefined;
}

/** Keep every matching reason in server order, including duplicates, with exact descriptive text. */
export function fieldFeedback(reasons: readonly ValidationReason[], field: string, id: string) {
  const messages = reasons.filter(reason => composerReasonField(reason) === field).map((reason, index) => ({id: `${id}-error-${index}`, message: reason.message}));
  return {invalid: messages.length > 0, describedBy: messages.length ? messages.map(reason => reason.id).join(' ') : undefined, messages};
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
