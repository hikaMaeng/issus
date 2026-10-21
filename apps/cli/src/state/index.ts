import {createHash,randomUUID} from 'node:crypto';
import type {ClientCursors,DeliveryVersion,StreamCheckpoint} from 'issus_domain/front';
import {readJson,updateJson} from './files/index.js';

export {readUtf8,readJson,atomicWrite,updateJson} from './files/index.js';
export interface ScopeState {cursors:ClientCursors;versions?:Record<string,DeliveryVersion>;stream?:StreamCheckpoint}
interface StateFile {version:1;scopes:Record<string,ScopeState>;requests:Record<string,{key:string;operationId?:string}>}
const empty=():StateFile=>({version:1,scopes:{},requests:{}});

/** Only hashes, UUID keys and cursors are persisted; bearer and request bodies are excluded. */
export class StateStore {
  constructor(readonly file:string) {}
  async scope(key:string):Promise<ScopeState|undefined> {return (await this.read()).scopes[key];}
  private async read():Promise<StateFile> {
    const value=await readJson<Record<string,unknown>>(this.file,empty() as unknown as Record<string,unknown>);
    // Python's timestamp map cannot safely become a native received/processed cursor.
    if(value.version!==1||!value.scopes||!value.requests) return empty();
    return value as unknown as StateFile;
  }
  async saveScope(key:string,state:ScopeState):Promise<void> {
    await updateJson<StateFile>(this.file,empty(),value=>({version:1,scopes:{...(value.version===1?value.scopes:{}),[key]:state},requests:value.version===1?value.requests:{}}));
  }
  async requestKey(identity:unknown):Promise<string> {
    const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:1).map(([k,x])=>[k,canonical(x)])):v;
    const hash=createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex');
    const result=await updateJson(this.file,empty(),value=>{
      const current=value.version===1?value:empty();
      current.requests[hash]??={key:randomUUID()};return current;
    });
    return result.requests[hash].key;
  }
  async saveOperation(key:string,operationId:string):Promise<void> {
    await updateJson(this.file,empty(),value=>{for(const request of Object.values(value.requests)) if(request.key===key) request.operationId=operationId;return value;});
  }
}
