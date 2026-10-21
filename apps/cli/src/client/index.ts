import {join,resolve} from 'node:path';
import type {Principal} from 'issus_domain/common';
import {ClientError,FrameError,IssusClient,OperationTimeout,type ClientOptions,type RequestOptions} from 'issus_domain/front';
import type {Arguments} from '../entry/arguments/index.js';
import {value} from '../entry/arguments/index.js';
import {CliError,redact,type Output} from '../output/index.js';
import {loadProfile,profileDirectory,type Profile, type ProfileOptions} from '../profiles/index.js';
import {StateStore} from '../state/index.js';

export interface ContextOptions {out:Output;env?:NodeJS.ProcessEnv;cwd?:string;fetch?:ClientOptions['fetch'];stdin?:()=>Promise<string>;signal?:AbortSignal}
export class CommandContext {
  readonly env:NodeJS.ProcessEnv;readonly cwd:string;readonly out:Output;readonly profileOptions:ProfileOptions;
  private connected?:{client:IssusClient;profile:Profile};
  private identity?:Principal;
  constructor(readonly args:Arguments,readonly options:ContextOptions) {
    this.env=options.env??process.env;this.cwd=options.cwd??process.cwd();
    this.out={...options.out,line:text=>options.out.line(redact(text,this.connected?.profile.token)),error:text=>options.out.error(redact(text,this.connected?.profile.token))};
    this.profileOptions={server:value(args,'server'),profile:value(args,'profile'),profilesFile:value(args,'profiles-file'),tokenFile:value(args,'token-file')};
  }
  path(file:string):string {return resolve(this.cwd,file);}
  async connection():Promise<{client:IssusClient;profile:Profile}> {
    if(!this.connected) {const profile=await loadProfile(this.profileOptions,this.env);this.connected={client:new IssusClient({...profile,fetch:this.options.fetch}),profile};}
    return this.connected;
  }
  async principal():Promise<Principal> {
    if(!this.identity) {
      const {client}=await this.connection(),{data}=await client.request<Principal|{principal:Principal}>('/v1/auth/me',{signal:this.options.signal});
      this.identity='principal' in data?data.principal:data;
      if(!this.identity||!['bootstrap','session'].includes(this.identity.kind)) throw new ClientError(0,'INVALID_PRINCIPAL');
    }
    return this.identity;
  }
  journal():StateStore {return new StateStore(join(profileDirectory(this.env),'requests.json'));}
  async write<T=Record<string,unknown>>(path:string,body:unknown,options:{method?:string;revision?:number;timeoutMs?:number;key?:string}={}):Promise<T> {
    const {client}=await this.connection(),p=await this.principal();
    const request:RequestOptions & {key:string}={method:options.method??'POST',body,revision:options.revision,signal:this.options.signal,
      key:options.key??await this.journal().requestKey({server:client.server,actor:p.id,sessionId:p.kind==='session'?p.sessionId:undefined,path,method:options.method??'POST',body,revision:options.revision})};
    request.onAccepted=async operation=>{await this.journal().saveOperation(operation.key,operation.operationId);};
    return client.write<T>(path,request,options.timeoutMs);
  }
  async result(data:unknown,line?:string):Promise<void> {
    const {profile}=await this.connection();
    await this.out.line(redact(this.out.json?JSON.stringify(data):line??JSON.stringify(data),profile.token));
  }
  async stdin():Promise<string> {
    if(this.options.stdin) return this.options.stdin();
    if(process.stdin.isTTY) throw new CliError(2,'--token-stdin needs redirected standard input');
    process.stdin.setEncoding('utf8');let text='';for await(const chunk of process.stdin) {text+=chunk;if(text.length>16384) throw new CliError(2,'standard input too large');}return text;
  }
  async reportError(error:unknown):Promise<number> {
    const token=this.connected?.profile.token;
    if(error instanceof OperationTimeout) {
      await this.out.error(`pending operation=${error.operationId} key=${error.key}; 같은 명령으로 재시도`);return 3;
    }
    if(error instanceof ClientError) {
      const exit=[401,403,429].includes(error.status)||error.status===0||error.status>=500?2:1;
      await this.out.error(redact(error.code,token));
      for(const reason of error.reasons) await this.out.error(redact(`  - ${reason}`,token));
      if(error.code==='SESSION_TOKEN_NOT_REPLAYABLE') {
        const d=error.details;
        await this.out.error(`token 응답 재생 불가: sessionId=${d?.sessionId??'?'}; bootstrap으로 session open --alias ${d?.alias??'<alias>'} --sid <미사용새sid> --reissue-of ${d?.sessionId??'<id>'} (새 key 자동 저장, 이전 token revoke)`);
      }
      return exit;
    }
    if(error instanceof CliError) {await this.out.error(redact(error.message,token));return error.exitCode;}
    if(error instanceof FrameError) {await this.out.error(error.code);return 2;}
    if(this.options.signal?.aborted) return 0;
    await this.out.error('CLI 오류: 요청 또는 로컬 상태를 처리할 수 없습니다');return 2;
  }
}
