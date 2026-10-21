import { BOM, KEYS, TOKEN, TYPES, TYPE_HINTS, STATES, STATE_OK_ON, DIRECTIVE, REQUIRED, ASK_LINE, COMPACT_MARK, COMPACT_MAX_CHARS, MAX_CHARS, CONTENT_WINDOW, ISSUE_REF, charCount, splitlines, strip, words, has, sorted, pythonRegex } from '../constants/index.js';
import { aliasOk, checkRecipient } from '../alias/index.js';
import { isoOk } from '../time/index.js';

/** issue_post.py:69–93: parser intentionally returns a partial envelope alongside reasons. */
export function parseEnvelope(first: string, errs: string[] = []): Record<string,string> {
  const h: Record<string,string> = {};
  if (first.startsWith(BOM)) { errs.push('파일 첫머리 BOM 제거 필요(봉투가 깨짐)'); first=first.replace(/^\uFEFF+/u,''); }
  if (pythonRegex(String.raw`^(작성자?|FROM|TO|TYPE|RE)\s*[:：]\s`).test(first) || /^작성/u.test(first)) {
    errs.push('레거시 첫 줄 거부(`작성:`·`TYPE: X`·`FROM: x`) — 봉투 1줄 `FROM:<alias> TO:<alias|ALL> TYPE:<T>`로 작성'); return h;
  }
  if (!strip(first)) { errs.push('첫 줄이 비어 있음 — 봉투 필요'); return h; }
  for (const tok of words(first)) {
    const m=TOKEN.exec(tok);
    if (!m) { errs.push(`봉투 토큰 형식 오류 '${tok}' — \`KEY:value\`, 값에 공백 금지(\`TYPE: X\`·자유 문구 불가)`); continue; }
    const [,k,v]=m;
    if (!has(KEYS,k)) errs.push(`알 수 없는 봉투 키 ${k} — 허용: ${sorted(KEYS)}`);
    else if (Object.hasOwn(h,k)) errs.push(`봉투 키 중복 ${k}`);
    else h[k]=v;
  }
  return h;
}
export const parse_envelope = parseEnvelope;
/** issue_post.py:109–201, including error order and TYPE replacement hints. */
export function checkComment(body: string): string[] {
  const errs: string[]=[];
  const length=charCount(body);
  if (length>MAX_CHARS) errs.push(`본문 ${length}자 > ${MAX_CHARS}자 — 파일·커밋 링크+요약으로`);
  const lines=splitlines(body), h=parseEnvelope(lines[0]??'',errs);
  if (!Object.keys(h).length) return errs;
  for (const k of ['FROM','TO','TYPE']) if (!(k in h)) errs.push(`필수 봉투 키 없음 ${k}`);
  const frm=h.FROM??'';
  if (frm) {
    const at=frm.indexOf('/'), alias=at<0 ? frm : frm.slice(0,at), sid=at<0 ? '' : frm.slice(at+1);
    if (sid.startsWith('by-')) { if (!aliasOk(sid.slice(3))) errs.push(`FROM 대리 게시자 '${sid.slice(3)}' 별칭 문법 위반`); }
    else if (sid && !/^[a-z0-9-]{1,12}$/u.test(sid)) errs.push(`FROM sid '${sid}' — \`[a-z0-9-]\` 12자 이하(짧게, 과제·이슈 인코딩 금지)`);
    if (!aliasOk(alias)) errs.push(`FROM 별칭 '${alias}' 문법 위반 — \`<proj>-<n>-<role>\`(예 p4-24-review) 또는 \`<proj>-<role>\`, 소문자·숫자·한글·'-', ≤24자 (join-naming.md#이름, examples/alias-register.md)`);
  }
  const t=h.TYPE??'';
  if (t && !has(TYPES,t)) errs.push(`TYPE '${t}' 허용 안 됨 — ${sorted(TYPES)}`+(TYPE_HINTS[t] ? ` (대체: ${TYPE_HINTS[t]})` : ''));
  if ('STATE' in h) {
    if (!has(STATES,h.STATE)) errs.push(`STATE '${h.STATE}' enum 아님 — ${sorted(STATES,'|')}`);
    if (t && !has(STATE_OK_ON,t)) errs.push(`STATE는 REPORT·ACK·DECISION에만 — TYPE ${t}에서 제거`);
  }
  for (const k of ['DUE','ACK-BY']) if (k in h && !isoOk(h[k])) errs.push(`${k} '${h[k]}' 시각 형식 오류 — YYYY-MM-DDTHH:MM+09:00 (날짜 필수)`);
  for (const k of ['RE','SEEN','SUPERSEDES']) if (k in h && !pythonRegex(String.raw`^\d+(,\d+)*$`).test(h[k])) errs.push(`${k} '${h[k]}' — comment id(숫자) 목록만`);
  if ('REPLY-IN' in h && !ISSUE_REF.test(h['REPLY-IN'])) errs.push(`REPLY-IN '${h['REPLY-IN']}' — \`#n\` 또는 \`owner/repo#n\``);
  if ('MIRROR-OF' in h && !/^https?:\/\//u.test(h['MIRROR-OF'])) errs.push(`MIRROR-OF '${h['MIRROR-OF']}' — URL 필요`);
  const to=h.TO??'';
  if (to) {
    if (to.includes(',')) errs.push(`TO '${to}' — 정확히 1명 또는 ALL. 알릴 사람은 CC:, 각각 시킬 일은 댓글 둘`);
    else checkRecipient('TO',to,errs,true);
  }
  for (const x of (h.CC??'').split(',').filter(Boolean)) {
    checkRecipient('CC',x,errs,false);
    if (x.toLowerCase()===to.toLowerCase()) errs.push(`CC '${x}'가 TO와 같음`);
  }
  if (has(DIRECTIVE,t)) {
    if (to.toUpperCase()==='ALL') errs.push(`지시성 TYPE ${t}: TO는 1명(ALL 금지) — 모두에게 알릴 뿐이면 NOTE`);
    if (!('ACK-BY' in h)) errs.push(`지시성 TYPE ${t}: ACK-BY 필수`);
  }
  const asks=[...body.matchAll(new RegExp(ASK_LINE.source,ASK_LINE.flags))].map(m=>m[1]);
  for (const x of asks) if (to && x.toLowerCase()!==to.toLowerCase()) errs.push(`\`ASK @${x}:\` 줄의 대상이 TO(${to})와 다름`);
  for (const k of REQUIRED[t]??[]) if (!(k in h)) errs.push(`TYPE ${t}: ${k} 필수`);
  if (t==='ASK') { if (asks.length!==1) errs.push(`TYPE ASK: 본문에 \`ASK @<TO>: <요청 1개>\` 줄 정확히 1개(현재 ${asks.length}) — 요청이 둘이면 댓글 둘`); }
  else if (asks.length && !has(DIRECTIVE,t)) errs.push(`TYPE ${t}에 \`ASK @\` 줄 — 요청은 TYPE ASK로 따로`);
  if (t==='VERIFY' && !pythonRegex(String.raw`^\s*VERDICT:(PASS|FAIL|BLOCKED)\b`,'m').test(body)) errs.push('TYPE VERIFY: 본문에 `VERDICT:PASS|FAIL|BLOCKED` 필수');
  if (t==='ALIAS' && to.toUpperCase()!=='ALL') errs.push('TYPE ALIAS: TO:ALL 필수');
  if (t==='COMPACT') {
    if (to.toUpperCase()!=='ALL') errs.push('TYPE COMPACT: TO:ALL 필수(요약은 전원 공유)');
    if (length>COMPACT_MAX_CHARS) errs.push(`TYPE COMPACT: 본문 ${length}자 > ${COMPACT_MAX_CHARS}자 — 결정·열린 지시·CLAIM·VERDICT·다음 행동만, 상세는 원 id`);
    const m=lines.length>1 ? COMPACT_MARK.exec(strip(lines[1])) : null;
    if (!m) errs.push('TYPE COMPACT: 2번째 줄은 정확히 `## ===== COMPACT #<이슈> through <SEEN id> =====` (강한 마커)');
    else if (h.SEEN && m[2]!==h.SEEN) errs.push(`TYPE COMPACT: 마커의 through ${m[2]} ≠ SEEN ${h.SEEN}`);
  }
  if (!lines.slice(1,1+CONTENT_WINDOW).some(s=>strip(s) && strip(s)!=='---')) errs.push(`봉투 다음 ${CONTENT_WINDOW}줄 안에 내용 없음 — 결론 1–3줄 필수`);
  return errs;
}
export const check_comment = checkComment;
