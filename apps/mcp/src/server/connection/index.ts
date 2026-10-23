import type {Principal,SessionPrincipal} from 'issus_domain/common';
import {ClientError,IssusClient,OperationTimeout,scopeKey,type FetchLike,type RequestOptions} from 'issus_domain/front';
import type {BridgeConfig} from '../config/index.js';
import {Journal,digest} from '../journal/index.js';
import {Redactor} from '../redaction/index.js';

export class BridgeError extends Error {
  constructor(readonly code:string,readonly reasons:string[]=[],readonly posted:false|null=false,readonly operationId?:string,readonly httpStatus:number|null=null){super(code);}
}
export interface ErrorView {code:string;httpStatus:number|null;reasons:string[];retryable:boolean;posted:false|null;operationId?:string}

/** Host adapter around the public client. Pull mode never creates a stream/checkpoint. */
export class Connection {
  readonly client:IssusClient;readonly journal:Journal;readonly redactor:Redactor;
  identity?:SessionPrincipal;resumed=false;private opening?:Promise<SessionPrincipal>;private fatal?:ClientError;
  constructor(readonly config:BridgeConfig,fetch?:FetchLike){
    this.client=new IssusClient({server:config.server,token:config.token,fetch});this.redactor=new Redactor(config.token);this.journal=new Journal(config.stateDir);
  }
  scope(boards=this.config.boards,p=this.identity!):string {
    return scopeKey({server:this.client.server,owner:this.config.repo.split('/')[0],alias:p.alias,sid:p.sid,repos:[{repo:this.config.repo,issues:this.config.issues,boards}],me:[p.alias],sinceCompact:true});
  }
  async principal(signal?:AbortSignal):Promise<SessionPrincipal>{
    if(this.fatal)throw this.fatal;
    if(this.identity)return this.identity;
    if(!this.opening)this.opening=(async()=>{
      const raw=(await this.client.request<Principal|{principal:Principal}>('/v1/auth/me',{signal})).data;
      const p='principal' in raw?raw.principal:raw;
      if(p?.kind!=='session')throw new BridgeError('BRIDGE_SESSION_REQUIRED');
      if(![p.ownerId,p.aliasId,p.sessionId].every(v=>typeof v==='string'&&/^[0-9a-f-]{36}$/iu.test(v))||typeof p.alias!=='string'||typeof p.sid!=='string')throw new BridgeError('BRIDGE_INVALID_PRINCIPAL');
      const owner=(await this.client.request<{owner_id:string}>(`/v1/repos/${this.config.repo.split('/').map(encodeURIComponent).join('/')}`,{signal})).data;
      if(owner.owner_id!==p.ownerId)throw new BridgeError('BRIDGE_OWNER_MISMATCH');
      const identity:SessionPrincipal={kind:'session',id:p.id,ownerId:p.ownerId,aliasId:p.aliasId,alias:p.alias.toLowerCase(),sid:p.sid,sessionId:p.sessionId,capabilities:p.capabilities};
      this.resumed=await this.journal.bind({server:this.client.server,ownerId:p.ownerId,aliasId:p.aliasId,sessionId:p.sessionId,scope:this.scope(this.config.boards,identity)});
      this.identity=identity;
      return this.identity;
    })().catch(error=>{this.opening=undefined;if(error instanceof ClientError&&[401,403].includes(error.status))this.fatal=error;throw error;});
    return this.opening;
  }
  async request<T>(path:string,options:RequestOptions={}):Promise<T>{
    if(this.fatal)throw this.fatal;
    try{return (await this.client.request<T>(path,options)).data;}
    catch(error){if(error instanceof ClientError&&[401,403].includes(error.status))this.fatal=error;throw error;}
  }
  async write<T>(path:string,body:unknown,options:RequestOptions&{identity?:unknown;timeoutMs?:number}={}):Promise<T>{
    const p=await this.principal(options.signal);
    if(this.fatal)throw this.fatal;
    const hash=digest(body),identity=[this.client.server,p.sessionId,options.method??'POST',path,options.identity??hash];
    const previous=Object.values(this.journal.data.writes).find(w=>w.path===path&&w.hash===hash&&!w.done&&!w.rejected&&w.sessionId&&w.sessionId!==p.sessionId);
    if(previous)throw new BridgeError('BRIDGE_PREVIOUS_SESSION_WRITE_UNCERTAIN',[],null,previous.operationId);
    const record=await this.journal.request(identity,path,hash,options.revision,p.sessionId,options.method??'POST');
    if(record.hash!==hash)throw new BridgeError('BRIDGE_REQUEST_BODY_CHANGED');
    try{
      const value=await this.client.write<T>(path,{method:options.method??'POST',body,revision:record.revision,key:record.key,signal:options.signal,
        onAccepted:async accepted=>{await this.journal.writeState(record.key,{operationId:accepted.operationId});}},options.timeoutMs??60000);
      await this.journal.writeState(record.key,{done:true});return value;
    }catch(error){
      if(error instanceof ClientError&&error.status>=400&&error.status<500&&![408,429].includes(error.status)){
        await this.journal.writeState(record.key,{rejected:true});
        if([401,403].includes(error.status))this.fatal=error;
        throw error;
      }
      if(error instanceof OperationTimeout)throw new BridgeError('OPERATION_TIMEOUT',[],null,error.operationId);
      if(options.signal?.aborted)throw new BridgeError('BRIDGE_CANCELLED',[],null,record.operationId);
      if(error instanceof ClientError)throw new BridgeError(error.code,error.reasons,null,record.operationId,error.status||null);
      throw error;
    }
  }
  error(error:unknown):ErrorView {
    if(error instanceof ClientError)return {code:error.code,httpStatus:error.status||null,reasons:error.reasons,retryable:error.status===0||[429,503].includes(error.status),posted:false};
    if(error instanceof BridgeError)return {code:error.code,httpStatus:error.httpStatus,reasons:error.reasons,retryable:error.posted===null,posted:error.posted,...(error.operationId?{operationId:error.operationId}:{})};
    if(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))return {code:'BRIDGE_CANCELLED',httpStatus:null,reasons:[],retryable:false,posted:false};
    const code=error instanceof Error&&/^BRIDGE_[A-Z_]+$/u.test(error.message)?error.message:'BRIDGE_INTERNAL_ERROR';
    return {code,httpStatus:null,reasons:[],retryable:false,posted:false};
  }
  async close():Promise<void>{await this.journal.close();}
}
