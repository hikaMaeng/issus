import { TOKEN, splitlines, strip, words, pythonRegex, PY_WORD_SOURCE } from '../../validation/constants/index.js';
/** issue_watch.py:51–61,93–164. Unknown v2 keys remain readable; validation is a separate boundary. */
export const BROADCAST_DIRECTIVE = ['HOLD','DECISION'] as const;
export const LEGACY_TYPE: Readonly<Record<string,string>> = {REQUEST:'ASK',STATUS_REQUEST:'ASK',STATUS:'REPORT',CHECKPOINT:'REPORT',DONE:'REPORT',RESULT:'REPORT',FACT:'REPORT',FACTS:'REPORT',DIAG:'REPORT',DEPLOY:'REPORT',SUMMARY:'REPORT',CORRECTION:'REPORT',BLOCKED:'REPORT',REVIEW:'VERIFY',ACCEPTANCE:'VERIFY',SLOT:'CLAIM',START:'CLAIM',RESTORE:'RELEASE',REF:'NOTE',SUPPLY:'NOTE',NOTICE:'NOTE',READY:'NOTE',PROTOCOL:'NOTE',GATE:'DECISION',MOVE:'HANDOFF',REPLY:'ACK',RE:'ACK',PROPOSAL:'PLAN'};
export interface ReadHeader {
  values: Record<string,string>;
  _type: string; _from: string; _to: string[]; _cc: string[]; _re: string[]; _sup: string[]; _first: string; _noenv: boolean;
}
import type {Classification} from '../../protocol/delivery/index.js';
export type {Classification} from '../../protocol/delivery/index.js';
/** Canonical watcher ids deliberately ignores references shorter than six digits. */
export const ids = (value?: string): string[] => value?.match(pythonRegex(String.raw`\d{6,}`,'g'))??[];
export function header(body: string): ReadHeader {
  const lines=splitlines(body.replace(/^\uFEFF+/u,'')).filter(l=>strip(l));
  const first=strip(lines[0]??''), toks=words(first), v2=!!toks.length && toks.every(t=>TOKEN.test(t));
  const h: Record<string,string>={};
  if (v2) for (const t of toks) { const at=t.indexOf(':'), k=t.slice(0,at); if (!(k in h)) h[k]=t.slice(at+1); }
  else {
    const head=lines.slice(0,12).join('\n');
    for (const m of head.matchAll(pythonRegex(String.raw`^\**\s*(FROM|TO|TYPE|RE|CC)\s*[:：]\s*\**\s*([^\n*]+?)\s*\**\s*$`,'gm'))) if (!(m[1] in h)) h[m[1]]=strip(m[2]);
    for (const l of lines.slice(0,3)) {
      const m=pythonRegex(String.raw`^작성자?\s*[:：]\s*([^|\n]+?)\s*(?:\||$)`).exec(strip(l));
      if (m) { h.FROM=strip(m[1].split('/')[0]); break; }
    }
    if ('TYPE' in h) h.TYPE=strip(h.TYPE).split(pythonRegex(String.raw`[\s/|(]`))[0];
    if ('TO' in h) h.TO=h.TO.split(/[,、·/]/u).map(x=>x.replace(/^[ *@]+|[ *@]+$/gu,'')).filter(Boolean).join(',');
  }
  const t=(h.TYPE??'').toUpperCase();
  return {values:h,_type:v2 ? t : LEGACY_TYPE[t]??t,_from:strip((h.FROM??'').split('/')[0]).toLowerCase(),_to:(h.TO??'').split(',').filter(Boolean).map(x=>x.toLowerCase()),_cc:(h.CC??'').split(',').filter(Boolean).map(x=>x.toLowerCase()),_re:ids(h.RE),_sup:ids(h.SUPERSEDES),_first:first,_noenv:!(v2 && ['FROM','TO','TYPE'].every(k=>k in h))};
}
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Python \w is Unicode alphanumeric + underscore; mention has no left-boundary requirement. */
const pythonWord=new RegExp(`^${PY_WORD_SOURCE}$`,'u');
export const mentioned = (body: string, me: readonly string[]): boolean => me.some(m=>{
  const rx=new RegExp(`@${escapeRegex(m).replace(/[iI]/gu,'[iI\\u0130\\u0131]')}`,'giu');
  for(const match of body.matchAll(rx)){
    const next=Array.from(body.slice(match.index+match[0].length))[0]??'';
    if(next!=='-'&&!pythonWord.test(next))return true;
  }
  return false;
});
export const toMe = (h: ReadHeader, body: string, me: readonly string[]): boolean => me.some(m=>h._to.includes(m)) || mentioned(body,me);
export const to_me = toMe;
/** Caller normalizes me aliases as issue_watch main does; own FROM filtering belongs to the caller. */
export function classify(h: ReadHeader, body: string, me: readonly string[]): Classification {
  if (toMe(h,body,me)) return 'ME';
  if (me.some(m=>h._cc.includes(m))) return 'CC';
  if (!h._to.length || h._to.includes('all') || (BROADCAST_DIRECTIVE as readonly string[]).includes(h._type)) return 'ALL';
  return 'OTHER';
}
export const normalizeMe = (me: readonly string[], mine: readonly string[]=[]): string[] => [...me.map(m=>m.toLowerCase()),...mine.map(m=>strip(strip(m).replace(/^작성:\s*/u,'').split('|')[0].split('/')[0]).toLowerCase()).filter(Boolean)];
