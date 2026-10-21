import {spawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
import type {WakeAdapter} from 'issus_domain/common';
export interface CommandTarget {executable:string;args:readonly string[]}
/** Fixed executable/argv, shell=false, bounded runtime; stdout is discarded. Real integration unverified. */
export function createCommandAdapter(targets:Readonly<Record<string,CommandTarget>>):WakeAdapter {
 for(const t of Object.values(targets)) if(!isAbsolute(t.executable)) throw new Error('absolute executable required');
 return {kind:'command',async wake(input,signal){
  const t=targets[input.alias];if(!t) return {accepted:false};
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(5000)]);
  return new Promise(resolve=>{
   const child=spawn(t.executable,[...t.args],{shell:false,windowsHide:true,stdio:['pipe','ignore','ignore'],signal:bounded,env:{...process.env,ISSUS_DELIVERY_ID:input.deliveryId,ISSUS_WAKE_IDEMPOTENCY_KEY:input.idempotencyKey}});
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
   child.once('error',()=>resolve({accepted:false}));child.once('exit',code=>resolve({accepted:code===0}));
  });
 }};
}
