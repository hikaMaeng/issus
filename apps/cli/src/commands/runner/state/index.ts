import {createHash,randomUUID} from 'node:crypto';
import {open,mkdir,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {InboxItem} from 'issus_domain/common';
import type {ClientCursors,DeliveryVersion,StreamCheckpoint} from 'issus_domain/front';
import {CliError} from '../../../output/index.js';
import {mask,safeData} from '../redaction/index.js';

export type Phase='STAGED'|'RECEIPTED'|'ACK_POSTED'|'RESERVED'|'CONTEXT_READY'|'SPAWN_INTENT'|'RUNNING'|'RESULT_READY'|'REPORT_POSTED'|'APPLICATION_RECORDED'|'PROCESSED';
const order:Phase[]=['STAGED','RECEIPTED','ACK_POSTED','RESERVED','CONTEXT_READY','SPAWN_INTENT','RUNNING','RESULT_READY','REPORT_POSTED','APPLICATION_RECORDED','PROCESSED'];
export interface Job {id:string;commentId:string;sourceEventId:string;item:InboxItem;phase:Phase;ackId?:string;reportId?:string;outcome?:'done'|'failed'|'blocked';reason?:string;spawnIntent?:string;pid?:number;creationTime?:string;spawnCount:number;recovery?:boolean;acceptedHandoff?:boolean;replyIssue?:number;result?:string;resumeAuthorized?:boolean;bootId?:string}
export interface Journal {version:1;identity:string;scope:string;sid:string;jobs:Record<string,Job>;sourceIndex:Record<string,string>;cursors:ClientCursors;versions:Record<string,DeliveryVersion>;stream?:StreamCheckpoint;holds:string[]}
export interface Effect {key:string;path:string;body:unknown;operationId?:string;result?:unknown;done?:boolean;sessionId?:string}

/** Flush file bytes before an atomic same-volume rename. Failure stops the next external effect. */
export async function durableWrite(file:string,text:string,token?:string):Promise<void> {
  await mkdir(dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
  const f=await open(tmp,'wx',0o600);
  try {await f.writeFile(mask(text,token).replace(/\r\n/gu,'\n'),'utf8');await f.sync();} finally {await f.close();}
  try {
    for(let attempt=0;;attempt++) {
      try {await rename(tmp,file);break;}
      catch(e) {if(process.platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes((e as NodeJS.ErrnoException).code??'')||attempt>=5) throw e;await new Promise(r=>setTimeout(r,10*2**attempt));}
    }
  } catch(e) {await unlink(tmp).catch(()=>undefined);throw e;}
}
export const atLeast=(job:Job,phase:Phase):boolean=>order.indexOf(job.phase)>=order.indexOf(phase);
/** Transitions are monotonic; ACK does not imply REPORT/application/process completion. */
export function advance(job:Job,phase:Phase):void {
  if(order.indexOf(phase)<order.indexOf(job.phase)) throw new Error('RUNNER_STATE_REGRESSION');job.phase=phase;
}
export const validId=(s:string):boolean=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(s);

/** Alias-wide journal survives sid changes; stale locks are never stolen automatically. */
export class RunnerStore {
  readonly directory:string;readonly lockFile:string;readonly bootId=randomUUID();data:Journal;private serial:Promise<unknown>=Promise.resolve();private lock?:Awaited<ReturnType<typeof open>>;
  constructor(root:string,readonly alias:string,identity:string,scope:string,sid:string,readonly token?:string,lockRoot?:string) {
    if(!/^[a-z0-9가-힣-]+$/u.test(alias)||alias.length>24) throw new CliError(2,'unsafe alias path');
    this.directory=join(root,alias);this.data={version:1,identity,scope,sid,jobs:{},sourceIndex:{},cursors:{},versions:{},holds:[]};
    this.lockFile=lockRoot?join(lockRoot,identityHash([identity])+'.lock'):join(this.directory,'runner.lock');
  }
  path(id:string,file:string):string {if(!validId(id)||!/^[a-z0-9.-]+$/u.test(file)) throw new Error('UNSAFE_EVIDENCE_PATH');return join(this.directory,id,file);}
  async acquire():Promise<void> {
    await mkdir(this.directory,{recursive:true});
    await mkdir(dirname(this.lockFile),{recursive:true});
    try {this.lock=await open(this.lockFile,'wx',0o600);await this.lock.writeFile(JSON.stringify({pid:process.pid,identity:this.data.identity,alias:this.alias,createdAt:new Date().toISOString()}));await this.lock.sync();}
    catch {if(this.lock) {await this.lock.close();this.lock=undefined;await unlink(this.lockFile).catch(()=>undefined);}throw new CliError(2,'RUNNER_LOCKED: verify stale lock manually: '+this.lockFile);}
    try {
      const old=JSON.parse(await readFile(join(this.directory,'journal.json'),'utf8')) as Journal;
      if(old.version!==1||old.identity!==this.data.identity) throw new CliError(2,'RUNNER_JOURNAL_SCOPE_MISMATCH');
      const scope=this.data.scope,sid=this.data.sid;this.data=old;
      if(old.sid!==sid||old.scope!==scope) {this.data.cursors={};this.data.versions={};this.data.stream=undefined;}
      this.data.scope=scope;this.data.sid=sid;
    } catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT') {await this.close();throw e;}}
    try {await this.save();} catch(e) {await this.close();throw e;}
  }
  async close():Promise<void> {await this.serial;if(this.lock) {await this.lock.close();this.lock=undefined;await unlink(this.lockFile);}}
  async change<T>(fn:(data:Journal)=>T|Promise<T>):Promise<T> {
    const task=this.serial.then(async()=>{const result=await fn(this.data);await durableWrite(join(this.directory,'journal.json'),JSON.stringify(this.data,(key,value)=>key==='result'?undefined:value,2)+'\n',this.token);return result;});
    this.serial=task.catch(()=>undefined);return task;
  }
  async save():Promise<void> {await this.change(()=>undefined);}
  async evidence(id:string,file:string,data:unknown):Promise<void> {await durableWrite(this.path(id,file),typeof data==='string'?data:JSON.stringify(safeData(data,this.token),null,2)+'\n',this.token);}
  async stage(item:InboxItem):Promise<Job> {
    if(!item.delivery||!validId(item.delivery.id)||!validId(item.sourceEventId)) throw new Error('INVALID_RUNNER_DELIVERY');
    return this.change(async d=>{
      let id=d.sourceIndex[item.sourceEventId]??(item.commentId?d.sourceIndex['comment:'+item.commentId]:undefined)??item.delivery!.id;
      let job=d.jobs[id];
      const minimal={...item,content:{body:''}};
      if(job&&!job.item.delivery) {
        const prior=job;id=item.delivery!.id;
        // Keep idempotency keys when a completed or in-flight virtual ACK gains a delivery ID.
        await this.evidence(id,'outbox.json',{...await this.effects(id),...await this.effects(prior.id)});
        job={...prior,id,sourceEventId:item.sourceEventId,item:minimal,phase:'STAGED',recovery:prior.recovery||prior.bootId!==this.bootId};
        prior.phase='PROCESSED';prior.reason='MERGED_DELIVERY:'+id;d.jobs[id]=job;d.sourceIndex[item.sourceEventId]=id;if(item.commentId) d.sourceIndex['comment:'+item.commentId]=id;
      }
      else if(!job) {job={id,commentId:item.commentId??'',sourceEventId:item.sourceEventId,item:minimal,phase:'STAGED',spawnCount:0,bootId:this.bootId};d.jobs[id]=job;d.sourceIndex[item.sourceEventId]=id;if(item.commentId) d.sourceIndex['comment:'+item.commentId]=id;}
      else if(item.delivery!.attempt>=job.item.delivery!.attempt) job.item={...minimal,delivery:{...item.delivery!,id:job.id}};
      return job;
    });
  }
  async effects(id:string):Promise<Record<string,Effect>> {try {return JSON.parse(await readFile(this.path(id,'outbox.json'),'utf8'));} catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT') return {};throw e;}}
  async effect(id:string,name:string,path:string,body:unknown,sessionId?:string):Promise<Effect> {
    let result!:Effect;await this.change(async()=>{
      const all=await this.effects(id),old=all[name];
      if(old&&(old.path!==path||JSON.stringify(old.body)!==JSON.stringify(body))) throw new Error('RUNNER_EFFECT_CHANGED');
      result=old??{key:randomUUID(),path,body,sessionId};all[name]=result;await this.evidence(id,'outbox.json',all);
    });return result;
  }
  async updateEffect(id:string,name:string,update:Partial<Effect>):Promise<void> {await this.change(async()=>{const all=await this.effects(id);if(!all[name]) throw new Error('MISSING_OUTBOX');Object.assign(all[name],update);await this.evidence(id,'outbox.json',all);});}
}
export const identityHash=(parts:string[]):string=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
