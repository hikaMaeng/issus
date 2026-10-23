import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import type {ClientCursors,DeliveryVersion} from 'issus_domain/front';

export interface DeliveryRecord {
  id:string;repo:string;commentId:string|null;viewKey:string;ordinal:string;attempt:number;
  source:{eventId:string;streamId:string;sequence:string};
  phase:'STAGED'|'RECEIPTED'|'RETURNED';directive:boolean;directiveType?:string;ackId?:string;reportId?:string;
  handoffAccepted?:boolean;applied?:boolean;processed?:boolean;resolved?:boolean;
  blocked?:{reason:string;remaining:string[];evidenceIds:string[]};
  hydrationError?:{code:string;httpStatus:number|null;at:string};
}
export const businessResolved=(r:DeliveryRecord):boolean=>r.directive?!!(r.reportId&&r.applied&&r.processed&&(r.directiveType!=='HANDOFF'||r.handoffAccepted)):!!r.processed;
export interface WriteRecord {key:string;path:string;hash:string;revision?:number;sessionId?:string;method?:string;operationId?:string;done?:boolean;rejected?:boolean}
export interface JournalData {version:1;scope:string;sessionId:string;cursors:ClientCursors;versions:Record<string,DeliveryVersion>;deliveries:Record<string,DeliveryRecord>;writes:Record<string,WriteRecord>}
export const digest=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Metadata-only journal. All effects wait for atomic write+flush; no body or token is persisted. */
export class Journal {
  data!:JournalData;
  private file='';private lock='';private nonce='';private tail:Promise<unknown>=Promise.resolve();private held=false;
  constructor(readonly directory:string){}
  async bind(identity:{server:string;ownerId:string;aliasId:string;sessionId:string;scope:string}):Promise<boolean>{
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const name=digest([identity.server,identity.ownerId,identity.aliasId]);
    this.file=join(this.directory,name+'.json');this.lock=join(this.directory,name+'.lock');
    this.nonce=randomUUID();
    try{const lock=await open(this.lock,'wx',0o600);try{await lock.writeFile(JSON.stringify({pid:process.pid,nonce:this.nonce})+'\n');await lock.sync();}finally{await lock.close();}this.held=true;}
    catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      // A crashed process may leave a lock. Serialize recovery and never terminate a PID.
      let recovery;
      try{recovery=await open(this.lock+'.recovery','wx',0o600);}catch{throw new Error('BRIDGE_STATE_LOCKED');}
      try{
        const raw=await readFile(this.lock,'utf8'),lock=JSON.parse(raw);
        if(!Number.isSafeInteger(lock.pid)||lock.pid<1)throw new Error('BRIDGE_STATE_LOCKED');
        let alive=true;try{process.kill(lock.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
        if(alive)throw new Error('BRIDGE_STATE_LOCKED');
        if(await readFile(this.lock,'utf8')!==raw)throw new Error('BRIDGE_STATE_LOCKED');
        await unlink(this.lock);
        const handle=await open(this.lock,'wx',0o600);
        try{await handle.writeFile(JSON.stringify({pid:process.pid,nonce:this.nonce})+'\n');await handle.sync();}finally{await handle.close();}this.held=true;
      }finally{await recovery.close();await unlink(this.lock+'.recovery');}
    }
    try{
      let old:JournalData|undefined;
      try{old=JSON.parse(await readFile(this.file,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('BRIDGE_INVALID_JOURNAL');}
      if(old&&(old.version!==1||!old.deliveries||!old.writes||!old.cursors||!old.versions))throw new Error('BRIDGE_INVALID_JOURNAL');
      const same=old?.scope===identity.scope&&old?.sessionId===identity.sessionId;
      this.data={version:1,scope:identity.scope,sessionId:identity.sessionId,cursors:same?old!.cursors:{},versions:same?old!.versions:{},deliveries:old?.deliveries??{},writes:old?.writes??{}};
      await this.update(()=>{});return !!old;
    }catch(error){await this.close();throw error;}
  }
  async update(fn:(data:JournalData)=>void):Promise<void>{
    const job=this.tail.then(async()=>{
      const next=structuredClone(this.data);fn(next);
      const temp=this.file+'.'+randomUUID()+'.tmp';
      try{
        const handle=await open(temp,'wx',0o600);
        try{await handle.writeFile(JSON.stringify(next)+'\n','utf8');await handle.sync();}finally{await handle.close();}
        await rename(temp,this.file);this.data=next;
      }catch(error){await unlink(temp).catch(()=>{});throw error;}
    });
    this.tail=job.catch(()=>{});return job;
  }
  async request(identity:unknown,path:string,hash:string,revision?:number,sessionId?:string,method?:string):Promise<WriteRecord>{
    const id=digest(identity);
    await this.update(d=>{if(!d.writes[id]||d.writes[id].rejected)d.writes[id]={key:randomUUID(),path,hash,...(revision===undefined?{}:{revision}),...(sessionId?{sessionId}:{}),...(method?{method}:{})};});
    return this.data.writes[id];
  }
  async writeState(key:string,patch:Partial<WriteRecord>):Promise<void>{await this.update(d=>{const r=Object.values(d.writes).find(r=>r.key===key);if(!r)throw new Error('BRIDGE_WRITE_NOT_FOUND');Object.assign(r,patch);});}
  async close():Promise<void>{await this.tail;if(this.held){
    this.held=false;const lock=JSON.parse(await readFile(this.lock,'utf8'));
    if(lock.pid!==process.pid||lock.nonce!==this.nonce)throw new Error('BRIDGE_STATE_LOCK_OWNERSHIP_LOST');
    await unlink(this.lock);
  }}
}
