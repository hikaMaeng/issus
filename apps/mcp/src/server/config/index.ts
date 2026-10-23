import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join,resolve} from 'node:path';
import {serverUrl} from 'issus_domain/front';

const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const numbers=(raw:string|undefined,required=false):number[]=>{
  if(!raw){if(required)throw new Error('BRIDGE_ISSUES_REQUIRED');return [];}
  const values=raw.split(',');
  if(values.some(v=>!/^\d+$/u.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1))throw new Error('BRIDGE_INVALID_ISSUES');
  return [...new Set(values.map(Number))].sort((a,b)=>a-b);
};
export interface BridgeConfig {server:string;token:string;repo:string;issues:number[];boards:number[];stateDir:string;pollMs:number}
export interface ConfigOptions {profile?:string;profilesFile?:string;stateDir?:string}

/** Only these startup options are accepted; models cannot change credentials through tools. */
export function parseOptions(args:string[]):ConfigOptions {
  const out:ConfigOptions={},keys:Record<string,keyof ConfigOptions>={'--profile':'profile','--profiles-file':'profilesFile','--state-dir':'stateDir'};
  for(let i=0;i<args.length;i++){
    const k=keys[args[i]],value=args[++i];
    if(!k||!value||value.startsWith('--')||out[k]!==undefined)throw new Error('BRIDGE_INVALID_OPTION');
    if(k!=='profile'&&!isAbsolute(value))throw new Error('BRIDGE_ABSOLUTE_PATH_REQUIRED');
    out[k]=value;
  }
  return out;
}

/** Read the existing CLI profile format, but never write or emit a token file. */
export async function loadConfig(env:NodeJS.ProcessEnv=process.env,options:ConfigOptions={}):Promise<BridgeConfig> {
  const directory=resolve(env.ISSUS_CONFIG_DIR??join(homedir(),'.config','issus'));
  let stored:{server?:string;token?:string}|undefined;
  if(!env.ISSUS_TOKEN||!(env.ISSUS_URL??env.ISSUS_SERVER_URL)||options.profile||env.ISSUS_PROFILE){
    try{
      const raw=JSON.parse(await readFile(options.profilesFile??env.ISSUS_PROFILES_FILE??join(directory,'profiles.json'),'utf8'));
      if(raw.version!==1||!raw.profiles||typeof raw.profiles!=='object')throw new Error('BRIDGE_INVALID_PROFILE');
      stored=raw.profiles[options.profile??env.ISSUS_PROFILE??raw.active??'default'];
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('BRIDGE_INVALID_PROFILE');}
  }
  const raw=env.ISSUS_URL??env.ISSUS_SERVER_URL??stored?.server;
  if(!raw)throw new Error('BRIDGE_URL_REQUIRED');
  let server:string;try{server=serverUrl(raw);}catch{throw new Error('BRIDGE_INVALID_URL');}
  const token=env.ISSUS_TOKEN??stored?.token;
  if(typeof token!=='string'||!token||/[\r\n]/u.test(token))throw new Error('BRIDGE_TOKEN_REQUIRED');
  if(!env.ISSUS_TOKEN&&stored?.token&&stored.server&&serverUrl(stored.server)!==server)throw new Error('BRIDGE_PROFILE_SERVER_MISMATCH');
  const poll=env.ISSUS_POLL_MS??'1000';
  if(!/^\d+$/u.test(poll)||Number(poll)<250||Number(poll)>10000)throw new Error('BRIDGE_INVALID_POLL_MS');
  const stateDir=options.stateDir??env.ISSUS_BRIDGE_STATE_DIR??join(directory,'bridge');
  if(!isAbsolute(stateDir))throw new Error('BRIDGE_ABSOLUTE_PATH_REQUIRED');
  if(!env.ISSUS_REPO||!repoPattern.test(env.ISSUS_REPO))throw new Error('BRIDGE_REPO_REQUIRED');
  return {server,token,repo:env.ISSUS_REPO,issues:numbers(env.ISSUS_ISSUES,true),boards:numbers(env.ISSUS_BOARDS),stateDir,pollMs:Number(poll)};
}
