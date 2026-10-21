import {pythonRegex} from '../../validation/constants/index.js';
/** compact_prepare.py:23–39. Ordered substitutions; run once on the entire assembled packet. */
export const MASKS: readonly (readonly [string,RegExp])[] = [
  ['pem',pythonRegex(String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`,'gs')],
  ['github-token',pythonRegex(String.raw`\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b`,'g')],
  ['aws-key',pythonRegex(String.raw`\bAKIA[0-9A-Z]{16}\b`,'g')],
  ['api-key',pythonRegex(String.raw`\bsk-[A-Za-z0-9_-]{16,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b`,'g')],
  ['bearer',pythonRegex(String.raw`\bbearer\s+[A-Za-z0-9._~+/=-]{16,}`,'gi')],
  ['password',pythonRegex(String.raw`\b(passw(?:or)?d|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+`,'gi')],
  ['email',pythonRegex(String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`,'g')]
];
/** Returns text plus substitution count, including overlapping kinds processed in source order. */
export function mask(text: string|null|undefined): {text:string;maskedCount:number} {
  let result=text??'', maskedCount=0;
  for (const [kind,rx] of MASKS) result=result.replace(new RegExp(rx.source,rx.flags),()=>{maskedCount++; return `[MASKED:${kind}]`;});
  return {text:result,maskedCount};
}
