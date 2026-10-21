import { BOM, TOKEN, BODY_KEYS, STATES, LEGACY_ALIAS, ISSUE_REF, strip, words, splitlines, has, sorted, isDigits } from '../constants/index.js';
import { aliasOk } from '../alias/index.js';
import { isoOk } from '../time/index.js';
import type {IssueBodyEnvelope} from '../../protocol/envelope/index.js';
/** issue_post.py:204–233; missing keys return a reason instead of the Python KeyError. */
export function checkIssueBody(body: string): string[] {
  const errs: string[]=[];
  let first=strip(body) ? splitlines(body)[0]??'' : '';
  if (first.startsWith(BOM)) { errs.push('파일 첫머리 BOM 제거 필요'); first=first.replace(/^\uFEFF+/u,''); }
  const shape='`STATE:<enum> OWNER:<alias> UPDATED:<iso> [REPLY-IN:#n] [COMPACT:<id>] [BOARD:#n]`';
  const toks=words(first), h: Record<string,string>={};
  const preview=Array.from(first).slice(0,120).join('');
  for (const tok of toks) {
    const m=TOKEN.exec(tok);
    if (!m || !has(BODY_KEYS,m[1]) || m[1] in h) { errs.push(`이슈 본문 첫 줄은 ${shape} 형식 — 토큰 '${tok}' 불가(현재: ${preview})`); return errs; }
    h[m[1]]=m[2];
  }
  if (toks.length<3 || toks.slice(0,3).some(k=>!['STATE:','OWNER:','UPDATED:'].some(p=>k.startsWith(p))) || ['STATE','OWNER','UPDATED'].some(k=>!(k in h))) {
    errs.push(`이슈 본문 첫 줄은 ${shape} 순서로 STATE OWNER UPDATED 먼저 — 현재: ${preview}`); return errs;
  }
  if (!has(STATES,h.STATE)) errs.push(`STATE '${h.STATE}' enum 아님 — ${sorted(STATES,'|')}`);
  if (!(aliasOk(h.OWNER)||LEGACY_ALIAS.test(h.OWNER))) errs.push(`OWNER '${h.OWNER}' 별칭 문법 위반`);
  if (!isoOk(h.UPDATED)) errs.push(`UPDATED '${h.UPDATED}' 시각 형식 오류 — YYYY-MM-DDTHH:MM+09:00`);
  for (const k of ['REPLY-IN','BOARD']) if (k in h && !ISSUE_REF.test(h[k])) errs.push(`${k} '${h[k]}' — \`#n\` 또는 \`owner/repo#n\``);
  if ('COMPACT' in h && !isDigits(h.COMPACT)) errs.push(`COMPACT '${h.COMPACT}' — 최신 COMPACT comment id(숫자)`);
  return errs;
}
export const check_issue_body = checkIssueBody;
/** Parse only after canonical syntax validation. Exact STATE→OWNER→UPDATED ordering is a server context rule. */
export function parseIssueBodyEnvelope(body:string):{reasons:string[];envelope?:IssueBodyEnvelope} {
  const reasons=checkIssueBody(body);
  if (reasons.length) return {reasons};
  return {reasons,envelope:Object.fromEntries(words(splitlines(body)[0]).map(tok=>{const at=tok.indexOf(':');return [tok.slice(0,at),tok.slice(at+1)];})) as unknown as IssueBodyEnvelope};
}
