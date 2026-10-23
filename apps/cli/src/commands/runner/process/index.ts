import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat,readFile} from 'node:fs/promises';
import {isAbsolute,join,extname} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {CliError} from '../../../output/index.js';
import {childEnvironment,mask,safeLines} from '../redaction/index.js';
import {durableWrite} from '../state/index.js';
import type {RunnerOptions} from '../options/index.js';
import {adapterArguments,parseResult,type ParsedResult} from '../adapters/index.js';
const exec=promisify(execFile);
export interface ProcessIdentity {pid:number;creationTime:string;executable:string;cwd:string}
export interface ProcessResult extends ParsedResult {exit:number|null;timedOut:boolean;held:boolean;stopped:boolean;identity?:ProcessIdentity;argv:string[];startedAt:string;endedAt:string}
export interface RunningChild {result:Promise<ProcessResult>;stop:(reason:'HOLD'|'CANCEL'|'TIMEOUT')=>Promise<void>}

// Fixed script only: administrator argv is transported as JSON, never interpolated into PowerShell code.
export const SHIM_BOOTSTRAP=`[Console]::InputEncoding=New-Object Text.UTF8Encoding($false); [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); $OutputEncoding=[Console]::OutputEncoding; $s=$env:ISSUS_RUNNER_NATIVE_JSON|ConvertFrom-Json; $nativeArgs=@($s.args); $promptText=[Console]::In.ReadToEnd(); if($promptText.Length -gt 0){$promptText | & $s.file @nativeArgs}else{& $s.file @nativeArgs}; if($null -eq $LASTEXITCODE){exit 1}; exit $LASTEXITCODE`;
const powershell=():string=>join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
export function nativeInvocation(file:string,args:string[],env:NodeJS.ProcessEnv,platform=process.platform):{file:string;args:string[];env:NodeJS.ProcessEnv} {
  if(platform==='win32'&&['.cmd','.bat','.ps1'].includes(extname(file).toLowerCase())) return {file:powershell(),args:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SHIM_BOOTSTRAP,'utf16le').toString('base64')],env:{...env,ISSUS_RUNNER_NATIVE_JSON:JSON.stringify({file,args})}};
  return {file,args,env};
}
/** Resolve only a host configuration executable; Windows shims are never passed to cmd /c. */
export async function resolveExecutable(file:string,env:NodeJS.ProcessEnv):Promise<string> {
  const exists=async(path:string):Promise<boolean>=>{try {return (await stat(path)).isFile();} catch {return false;}};
  if(isAbsolute(file)) {if(await exists(file)) return file;throw new CliError(2,'EXECUTABLE_NOT_FOUND: '+file);}
  if(/[\\/\r\n\0]/u.test(file)) throw new CliError(2,'INVALID_EXECUTABLE');
  const extensions=process.platform==='win32'&&!extname(file)?(env.PATHEXT??'.COM;.EXE;.BAT;.CMD;.PS1').split(';').map(s=>s.trim()).filter(s=>s.startsWith('.')&&s.length>1):[''];
  for(const dir of (env.PATH??env.Path??'').split(process.platform==='win32'?';':':')) for(const suffix of extensions) {
    const candidate=join(dir,file+suffix);if(await exists(candidate)) return candidate;
  }
  throw new CliError(2,'EXECUTABLE_NOT_FOUND: '+file);
}
/** Read-only Git snapshot is bound to the resolved administrator cwd and disables external diff. */
export async function gitSnapshot(cwd:string):Promise<Record<string,string>> {
  const call=async(args:string[]):Promise<string>=>(await exec('git',['-C',cwd,...args],{windowsHide:true,encoding:'utf8',maxBuffer:4194304})).stdout.trimEnd();
  return {root:await call(['rev-parse','--show-toplevel']),gitDir:await call(['rev-parse','--git-dir']),commonDir:await call(['rev-parse','--git-common-dir']),head:await call(['rev-parse','HEAD']),dirty:await call(['--no-optional-locks','status','--short']),worktrees:await call(['worktree','list','--porcelain'])};
}
/** Compare PID plus OS creation time and executable immediately before a Windows tree kill. */
export async function processIdentity(pid:number,executable:string,cwd:string):Promise<ProcessIdentity|undefined> {
  if(process.platform!=='win32') {try {process.kill(pid,0);return {pid,creationTime:(await readFile(`/proc/${pid}/stat`,'utf8')).split(' ')[21],executable,cwd};} catch {return undefined;}}
  const script=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${Number(pid)}'; if($null -ne $p){@{pid=$p.ProcessId;creationTime=$p.CreationDate.ToUniversalTime().ToString('o');executable=$p.ExecutablePath}|ConvertTo-Json -Compress}`;
  const {stdout}=await exec(powershell(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8'});
  if(!stdout.trim()) return undefined;const p=JSON.parse(stdout);return {...p,cwd};
}
export const sameProcess=(a:ProcessIdentity,b:ProcessIdentity|undefined):boolean=>!!b&&a.pid===b.pid&&a.creationTime===b.creationTime&&a.executable.toLowerCase()===b.executable.toLowerCase()&&a.cwd===b.cwd;

/** Record executable version without inheriting bridge credentials. Failed probes are explicit evidence. */
export async function probeVersion(file:string,env:NodeJS.ProcessEnv):Promise<{verified:boolean;version?:string;reason?:string}> {
  try {
    const inv=nativeInvocation(await resolveExecutable(file,env),['--version'],childEnvironment(env));
    const pending=exec(inv.file,inv.args,{windowsHide:true,env:inv.env,encoding:'utf8',timeout:5000,maxBuffer:1048576});pending.child.stdin?.on('error',()=>undefined);pending.child.stdin?.end();
    const {stdout}=await pending;return {verified:!!stdout.trim(),version:stdout.trim().slice(0,1000)};
  } catch(e) {return {verified:false,reason:'VERSION_PROBE_FAILED: '+String((e as NodeJS.ErrnoException).code??'unknown')};}
}
async function windowsTree(root:ProcessIdentity):Promise<ProcessIdentity[]> {
  const script=`@(Get-CimInstance Win32_Process | ForEach-Object { @{pid=$_.ProcessId;parent=$_.ParentProcessId;creationTime=$_.CreationDate.ToUniversalTime().ToString('o');executable=$_.ExecutablePath} }) | ConvertTo-Json -Compress`;
  const {stdout}=await exec(powershell(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',maxBuffer:4194304});
  const parsed=JSON.parse(stdout||'[]'),rows=(Array.isArray(parsed)?parsed:[parsed]) as (ProcessIdentity&{parent:number})[];
  const ids=new Set([root.pid]),found:ProcessIdentity[]=[];
  for(let changed=true;changed;) {changed=false;for(const row of rows) if(row.pid!==root.pid&&!ids.has(row.pid)&&ids.has(row.parent)&&row.creationTime>=root.creationTime) {ids.add(row.pid);found.push({...row,cwd:root.cwd});changed=true;}}
  return found;
}

/** Spawn native pipes with a strict environment; all buffers are decoded incrementally as UTF-8. */
export function startChild(o:RunnerOptions,dir:string,prompt:string,env:NodeJS.ProcessEnv,token:string|undefined,onIdentity:(p:ProcessIdentity)=>Promise<void>,onSpawn?:(pid:number)=>Promise<void>):RunningChild {
  const argv=adapterArguments(o,dir);let inv=nativeInvocation(o.executable,argv,childEnvironment(env));
  const startedAt=new Date().toISOString();let child:ReturnType<typeof spawn>|undefined,identity:ProcessIdentity|undefined,closed=false,timedOut=false,held=false,stopped=true;
  let stopping:Promise<void>|undefined;
  const stop=(reason:'HOLD'|'CANCEL'|'TIMEOUT'):Promise<void>=>stopping??=(async()=>{
    held=reason==='HOLD';timedOut=reason==='TIMEOUT';
    if(closed||!child?.pid) return;
    identity??=await processIdentity(child.pid,inv.file,o.cwd);
    if(!identity||!sameProcess(identity,await processIdentity(child.pid,inv.file,o.cwd))) {stopped=false;throw new Error('RUNNER_PROCESS_OWNERSHIP_UNCONFIRMED');}
    const descendants=process.platform==='win32'?await windowsTree(identity):[];
    // Recheck after enumeration, immediately before taskkill; never act on a recycled PID.
    if(!sameProcess(identity,await processIdentity(identity.pid,inv.file,o.cwd))) {stopped=false;throw new Error('RUNNER_PROCESS_CHANGED_BEFORE_KILL');}
    if(process.platform==='win32') await exec('taskkill.exe',['/PID',String(identity.pid),'/T','/F'],{windowsHide:true,encoding:'utf8'});
    else process.kill(-identity.pid,'SIGKILL');
    for(let i=0;i<50;i++) {
      if(!sameProcess(identity,await processIdentity(identity.pid,inv.file,o.cwd))) {
        if(process.platform==='win32') {
          const remaining=await windowsTree(identity);
          const known=await Promise.all(descendants.map(p=>processIdentity(p.pid,p.executable,o.cwd)));
          if(remaining.length||known.some((p,n)=>sameProcess(descendants[n],p))) {stopped=false;throw new Error('RUNNER_DESCENDANTS_STILL_ALIVE');}
        }
        return;
      }
      await new Promise(r=>setTimeout(r,100));
    }
    stopped=false;throw new Error('RUNNER_CHILD_STILL_ALIVE');
  })();
  const result=(async():Promise<ProcessResult>=>{
    let stdout='',stderr='',exit:number|null=null,spawnError='';
    const decoderOut=new StringDecoder('utf8'),decoderErr=new StringDecoder('utf8');
    let log:Promise<void>=Promise.resolve(),writing=false,dirty=false,finalOutput=false;
    const persist=(final=false):void=>{
      // Hold incomplete lines so a token split across pipe chunks is never persisted partially.
      dirty=true;finalOutput ||=final;if(writing) return;writing=true;
      log=(async()=>{try {while(dirty) {
        dirty=false;
        const out=finalOutput?stdout:stdout.slice(0,stdout.lastIndexOf('\n')+1),err=finalOutput?stderr:stderr.slice(0,stderr.lastIndexOf('\n')+1);
        await durableWrite(join(dir,'events.jsonl'),safeLines(out,token),token);await durableWrite(join(dir,'transcript.log'),safeLines(err,token),token);
      }} finally {writing=false;}})();
      void log.catch(()=>{spawnError='OUTPUT_CAPTURE_FAILURE';void stop('CANCEL').catch(()=>{stopped=false;});});
    };
    try {
      inv=nativeInvocation(await resolveExecutable(o.executable,env),argv,childEnvironment(env));
      if(stopping) throw new Error('HOLD_OR_CANCEL_BEFORE_SPAWN');
      child=spawn(inv.file,inv.args,{shell:false,cwd:o.cwd,env:inv.env,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
      child.stdin!.on('error',()=>undefined);
      child.stdout!.on('data',(b:Buffer)=>{stdout+=decoderOut.write(b);if(stdout.length>16777216) {stdout=stdout.slice(0,16777216);spawnError='RUNNER_OUTPUT_LIMIT';void stop('CANCEL').catch(()=>{stopped=false;});}persist();});
      child.stderr!.on('data',(b:Buffer)=>{stderr+=decoderErr.write(b);if(stderr.length>16777216) {stderr=stderr.slice(0,16777216);spawnError='RUNNER_OUTPUT_LIMIT';void stop('CANCEL').catch(()=>{stopped=false;});}persist();});
      child.stdin!.end(o.exec==='muse'?'':prompt,'utf8');
      const identityReady=(async()=>{if(child?.pid) {await onSpawn?.(child.pid);identity=await processIdentity(child.pid,inv.file,o.cwd);if(identity) await onIdentity(identity);}})();
      const timer=setTimeout(()=>{void stop('TIMEOUT').catch(()=>{stopped=false;child?.kill();});},o.timeoutMs);
      try {exit=await new Promise<number|null>((resolve)=>{child!.once('error',e=>{spawnError=e.message;closed=true;resolve(null);});child!.once('close',code=>{closed=true;resolve(code);});});}
      finally {clearTimeout(timer);await identityReady;}
    } catch(e) {spawnError=(e as Error).message;}
    stdout+=decoderOut.end();stderr+=decoderErr.end();persist(true);await log;
    let resultFile='';try {resultFile=mask(await readFile(join(dir,'result.md'),'utf8'),token);} catch {}
    const parsed=parseResult(o.exec,stdout,resultFile,exit);
    const reason=spawnError?(spawnError.startsWith('EXECUTABLE_NOT_FOUND: ')?mask(spawnError,token):'SPAWN_OR_CAPTURE_FAILURE: '+mask(spawnError,token)):held?'HOLD':timedOut?'TIMEOUT':parsed.reason;
    if(spawnError) await durableWrite(join(dir,'transcript.log'),stderr+'\n[runner] '+mask(spawnError,token)+'\n',token);
    await durableWrite(join(dir,'result.md'),mask(parsed.text||reason||'No result',token),token);
    return {...parsed,text:mask(parsed.text,token),ok:parsed.ok&&!reason&&stopped,reason,exit,timedOut,held,stopped,identity,argv,startedAt,endedAt:new Date().toISOString()};
  })();
  return {result,stop};
}
