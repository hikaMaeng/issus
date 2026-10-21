import type {ApiError,OperationResult} from '../../../common/protocol/envelope/index.js';

export type FetchLike = (input:string|URL, init?:RequestInit)=>Promise<Response>;
export interface ClientOptions {server:string; token?:string|(()=>string|undefined); fetch?:FetchLike; timeoutMs?:number}
export interface RequestOptions {method?:string; body?:unknown; key?:string; revision?:number; signal?:AbortSignal; headers?:Record<string,string>;onAccepted?:(operation:{operationId:string;statusUrl:string;key:string})=>void|Promise<void>}
export interface HttpResponse<T> {status:number; data:T; headers:Headers}

/** Structured errors contain server diagnostics, never the request headers or bearer. */
export class ClientError extends Error {
  constructor(readonly status:number,readonly code:string,readonly reasons:string[]=[],readonly details?:Record<string,unknown>) {
    super(code); this.name='ClientError';
  }
}
export class OperationTimeout extends Error {
  constructor(readonly operationId:string,readonly key:string) {super('OPERATION_TIMEOUT');this.name='OperationTimeout';}
}

/** URL validation rejects credential-bearing URLs and preserves TLS verification. */
export function serverUrl(input:string): string {
  const url=new URL(input);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error('INVALID_SERVER_URL');
  return url.href.replace(/\/+$/u,'');
}

/** Framework- and environment-independent HTTP client. All mutations are explicit. */
export class IssusClient {
  readonly server:string;
  readonly fetch:FetchLike;
  readonly timeoutMs:number;
  private readonly token:ClientOptions['token'];

  constructor(options:ClientOptions) {
    this.server=serverUrl(options.server); this.token=options.token;
    this.fetch=options.fetch??globalThis.fetch.bind(globalThis);this.timeoutMs=options.timeoutMs??15000;
  }
  headers():Record<string,string> {
    const token=typeof this.token==='function'?this.token():this.token;
    return {Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})};
  }
  url(path:string):URL {
    const url=new URL(path,this.server+'/');
    if(url.origin!==new URL(this.server).origin) throw new ClientError(0,'CROSS_ORIGIN_URL');
    return url;
  }
  async request<T=Record<string,unknown>>(path:string,options:RequestOptions={}):Promise<HttpResponse<T>> {
    if(options.signal?.aborted) throw options.signal.reason;
    const headers={...this.headers(),...(options.body===undefined?{}:{'Content-Type':'application/json'}),...options.headers,
      ...(options.key?{'Idempotency-Key':options.key}:{}),...(options.revision===undefined?{}:{'If-Match':`"${options.revision}"`})};
    let response:Response;
    try {
      response=await this.fetch(this.url(path),{method:options.method??'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body),
        signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(this.timeoutMs)]):AbortSignal.timeout(this.timeoutMs),redirect:'error'});
    } catch(error) {
      if(options.signal?.aborted) throw options.signal.reason;
      if(error instanceof ClientError) throw error;
      throw new ClientError(0,'CONNECTION_FAILED');
    }
    let data:unknown;
    if(response.status!==204) { try {data=await response.json();} catch {throw new ClientError(502,'INVALID_JSON_RESPONSE');} }
    if(!response.ok) {
      const error=(data as ApiError|undefined)?.error;
      throw new ClientError(response.status,error?.code??`HTTP_${response.status}`,error?.reasons?.map(r=>r.message)??(error?.message?[error.message]:[]),error?.details);
    }
    return {status:response.status,data:data as T,headers:response.headers};
  }

  /** Reuses the supplied durable key for every retry. Pending operation results are polled, never resubmitted. */
  async write<T=Record<string,unknown>>(path:string,options:RequestOptions & {key:string},timeoutMs=60000):Promise<T> {
    const start=Date.now();
    let accepted:HttpResponse<Record<string,unknown>>|undefined;
    for(let attempt=0;attempt<2;attempt++) {
      try { accepted=await this.request(path,{...options,headers:{Prefer:'wait=5',...options.headers}});break; }
      catch(error) {if(!(error instanceof ClientError)||error.status!==0||attempt===1) throw error;}
    }
    if(!accepted) throw new ClientError(0,'CONNECTION_FAILED');
    if(accepted.status!==202) return accepted.data as T;
    const id=String(accepted.data.operationId??''), statusUrl=String(accepted.data.statusUrl??`/v1/operations/${encodeURIComponent(id)}`);
    if(!id) throw new ClientError(502,'INVALID_OPERATION_RESPONSE');
    await options.onAccepted?.({operationId:id,statusUrl,key:options.key});
    while(Date.now()-start<timeoutMs) {
      const remaining=Math.max(1,timeoutMs-(Date.now()-start)),deadline=AbortSignal.timeout(Math.ceil(remaining));
      let data:OperationResult<T>;
      try {data=(await this.request<OperationResult<T>>(statusUrl,{signal:options.signal?AbortSignal.any([options.signal,deadline]):deadline})).data;}
      catch(error) {if(deadline.aborted&&!options.signal?.aborted) throw new OperationTimeout(id,options.key);throw error;}
      if(data.httpStatus!==undefined && data.status!=='queued' && data.status!=='running') {
        const nested=data.response as {error?:ApiError['error']}|undefined, error=data.error??nested?.error;
        if(data.httpStatus>=400||data.status==='failed') throw new ClientError(data.httpStatus,error?.code??'OPERATION_FAILED',error?.reasons?.map(r=>r.message)??(error?.message?[error.message]:[]),error?.details);
        return data.response as T;
      }
      await abortableDelay(Math.min(200,Math.max(1,timeoutMs-(Date.now()-start))),options.signal);
    }
    throw new OperationTimeout(id,options.key);
  }
}

/** Abort-aware timer used by reconnect and operation polling. */
export function abortableDelay(ms:number,signal?:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted) {reject(signal.reason);return;}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    const abort=()=>{clearTimeout(timer);reject(signal?.reason);};
    signal?.addEventListener('abort',abort,{once:true});
  });
}

export const repoPath=(repo:string):string=>'/v1/repos/'+repo.split('/').map(encodeURIComponent).join('/');
export const issuePath=(repo:string,issue:number):string=>`${repoPath(repo)}/issues/${issue}`;
