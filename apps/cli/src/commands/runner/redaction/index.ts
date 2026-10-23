/** Redact before persistence as well as before publication. Never serialize process.env. */
export function mask(text:string,token?:string):string {
  if(token) text=text.split(token).join('[REDACTED]');
  return text.replace(/\bBearer\s+[^\s"']+/giu,'Bearer [REDACTED]')
    .replace(/issus\.bearer\.[^\s"',]+/gu,'issus.bearer.[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret)["']?\s*[=:]\s*["']?)[^\s"',}]+/giu,'$1[REDACTED]');
}
/** Mask values before JSON escaping, including structured secret fields. */
export function safeData<T>(value:T,token?:string):T {
  if(typeof value==='string') return mask(value,token) as T;
  if(Array.isArray(value)) return value.map(v=>safeData(v,token)) as T;
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/^(?:authorization|cookie|password|secret|api[_-]?key|access[_-]?token|issus[_-]?token)$/iu.test(key)?'[REDACTED]':safeData(v,token)])) as T;
  return value;
}
/** Preserve product JSONL structure while masking nested strings before escaping. */
export const safeLines=(text:string,token?:string):string=>text.split('\n').map(line=>{
  try {return JSON.stringify(safeData(JSON.parse(line),token));} catch {return mask(line,token);}
}).join('\n');
/** Only CLI login and native tool discovery environment is inherited. */
export function childEnvironment(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv {
  const keys=new Set(['path','pathext','systemroot','windir','comspec','temp','tmp','userprofile','homedrive','homepath','home','appdata','localappdata','programfiles','programfiles(x86)','programdata','username','userdomain','lang','lc_all']);
  return {...Object.fromEntries(Object.entries(env).filter(([k,v])=>v!==undefined&&keys.has(k.toLowerCase()))),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',LANG:'C.UTF-8'};
}
