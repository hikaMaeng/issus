import {once} from 'node:events';

export class CliError extends Error {
  constructor(readonly exitCode:number,message:string) {super(message);this.name='CliError';}
}
export interface Output {
  json:boolean; tty:boolean;
  line:(text:string)=>void|Promise<void>;
  error:(text:string)=>void|Promise<void>;
}

/** Node writes strings as UTF-8 on Windows regardless of the console code page. */
export function stdioOutput(json=false):Output {
  process.stdout.setDefaultEncoding('utf8');process.stderr.setDefaultEncoding('utf8');
  return {json,tty:!!process.stdin.isTTY,
    line:async(text)=>{if(!process.stdout.write(text+'\n','utf8')) await once(process.stdout,'drain');},
    error:async(text)=>{if(!process.stderr.write(text+'\n','utf8')) await once(process.stderr,'drain');}};
}

/** No raw request object, token, cookie, or stack trace is printed. */
export function redact(text:string,token?:string):string {
  if(token) text=text.split(token).join('[REDACTED]');
  return text.replace(/\bBearer\s+[^\s"']+/giu,'Bearer [REDACTED]');
}
export const codepoints=(text:string,n:number):string=>Array.from(text).slice(0,n).join('');
export const chars=(text:string):number=>Array.from(text).length;

export async function rejected(out:Output,file:string,reasons:string[]):Promise<void> {
  if(out.json) {await out.line(JSON.stringify({valid:false,file,reasons}));return;}
  await out.line(`REJECTED (${reasons.length}): ${file}`);
  for(const reason of reasons) await out.line(`  - ${reason}`);
}
