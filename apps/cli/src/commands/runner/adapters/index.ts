import {codexArguments} from './codex/index.js';
import {museArguments} from './muse/index.js';
import {claudeArguments} from './claude/index.js';
import type {RunnerOptions,AdapterKind} from '../options/index.js';
export interface ParsedResult {ok:boolean;text:string;model?:string;reason?:string}
export const adapterArguments=(o:RunnerOptions,dir:string):string[]=>({codex:codexArguments,muse:museArguments,claude:claudeArguments}[o.exec])(o,dir);

/** Exit zero alone is insufficient: require the product's terminal success and a nonempty result. */
export function parseResult(kind:AdapterKind,stdout:string,resultFile:string,exit:number|null):ParsedResult {
  let text='',model:string|undefined,complete=false,failed=false;
  try {
    if(kind==='claude') {
      const r=JSON.parse(stdout);
      complete=r.type==='result'&&!r.is_error&&r.subtype==='success'&&(!Array.isArray(r.permission_denials)||r.permission_denials.length===0);
      text=typeof r.result==='string'?r.result:'';model=Object.keys(r.modelUsage??{})[0];failed=!complete;
    } else for(const line of stdout.split(/\r?\n/u).filter(x=>x.trim())) {
      const r=JSON.parse(line);
      if(kind==='codex') {
        if(r.type==='turn.completed') complete=true;
        if(r.type==='turn.failed'||r.type==='error'||r.item?.type==='error') failed=true;
        if(r.type==='item.completed'&&r.item?.type==='agent_message') text=String(r.item.text??'');
      } else {
        if(r.payload_type?.startsWith('run.terminal.')) {complete=r.payload?.terminal==='completed';failed=!complete;text=String(r.payload?.text??text);}
        if(r.payload_type==='run.output.delta') text+=String(r.payload?.text??'');
        if(r.payload_type==='run.model.configured') model=r.payload?.model_id;
      }
    }
  } catch {return {ok:false,text:resultFile||text,model,reason:'INVALID_OR_TRUNCATED_JSON'};}
  text=resultFile||text;
  const denied=/\bpermission[_ ]denied\b|\bpermission_denial\b/iu.test(text);
  const ok=exit===0&&complete&&!failed&&!denied&&!!text.trim();
  return {ok,text,model,reason:ok?undefined:denied?'PERMISSION_DENIED':exit!==0?`EXIT_${exit}`:'TERMINAL_FAILURE_OR_EMPTY_RESULT'};
}
