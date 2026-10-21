import { ALIAS, LEGACY_ALIAS, IPISH, charCount, isDigits, strip } from '../constants/index.js';
/** issue_post.py:65–66. */
export const aliasOk = (v: string): boolean => charCount(v) <= 24 && ALIAS.test(v);
export const alias_ok = aliasOk;
/** issue_post.py:96–106; appends the original ordered Korean reasons. */
export function checkRecipient(label: string, x: string, errs: string[], allowAll: boolean): void {
  if (x.toUpperCase() === 'ALL') { if (!allowAll) errs.push(`${label} 'ALL' 불가`); return; }
  if (x.startsWith('#') || isDigits(x) || IPISH.test(x)) errs.push(`${label} '${x}' — 이슈번호·IP 지칭 금지, 별칭만`);
  else if (x.includes('/') || x.includes('@') || !LEGACY_ALIAS.test(x)) errs.push(`${label} '${x}' — 별칭 문자 \`[A-Za-z0-9가-힣_.-]{2,24}\`만(sid·@·공백 금지)`);
  else if (/(오케스트레이터|검증자|리뷰어|감독|owner|orchestrator|reviewer)$/i.test(x) && !aliasOk(x)) errs.push(`${label} '${x}' — 역할명 지칭 금지, 등록된 별칭만`);
}
export const check_recipient = checkRecipient;
/** alias_check.py:45–56; equal or one substitution/insertion/deletion, never transposition. */
export function dist1(a: string, b: string): boolean {
  if (a === b) return true;
  const aa = Array.from(a), bb = Array.from(b);
  if (Math.abs(aa.length-bb.length)>1) return false;
  if (aa.length === bb.length) return aa.filter((x,i) => x !== bb[i]).length === 1;
  const [s,l] = aa.length < bb.length ? [aa,bb] : [bb,aa];
  return l.some((_,i) => [...l.slice(0,i),...l.slice(i+1)].join('') === s.join(''));
}
export interface AliasEvidence { alias: string; evidence: readonly string[] }
export interface AliasCollision extends AliasEvidence { kind: 'exact'|'case'|'substring'|'edit-distance-1' }
/** Server always checks all names including tombstones; case-only is a separate design §2.3 diagnostic. */
export function aliasCollisions(name: string, existing: readonly AliasEvidence[]): AliasCollision[] {
  const low = name.toLowerCase();
  return [...existing].sort((a,b)=>a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0).flatMap(n => {
    const nl=n.alias.toLowerCase();
    const kind = n.alias === name ? 'exact' : nl === low ? 'case' : (low.includes(nl)||nl.includes(low)) && Math.min(charCount(nl),charCount(low))>=3 ? 'substring' : dist1(nl,low) ? 'edit-distance-1' : undefined;
    return kind ? [{...n,kind}] : [];
  });
}
/** alias_check.py:72–74,104–109; caller supplies an owner-scoped registry. */
export function checkAlias(value: string, existing: readonly AliasEvidence[]=[]): string[] {
  const alias=strip(value);
  const errors=aliasOk(alias) ? [] : [`문법 위반 '${alias}' — \`<proj>-<n>-<role>\`(예 p4-24-review) 또는 \`<proj>-<role>\`, 소문자·숫자·한글·'-', ≤24자`];
  for (const c of aliasCollisions(alias,existing)) errors.push(`${c.kind==='case' ? 'exact' : c.kind}: '${c.alias}' used in ${[...c.evidence].sort().slice(0,4).join(', ')}`);
  return errors;
}
