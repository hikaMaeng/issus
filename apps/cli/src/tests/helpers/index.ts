import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {FetchLike} from 'issus_domain/front';
import type {Output} from '../../output/index.js';
import {run} from '../../entry/run/index.js';

export const root=resolve(process.cwd(),'../..');
export const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const principal={kind:'session',id:id(1),ownerId:id(2),aliasId:id(3),sessionId:id(4),alias:'issus-1-client',sid:'s1',capabilities:[]} as const;
export const timestamp='2026-10-21T06:00:00Z';
export const apiError=(status:number,code:string,reasons:string[]=[],details?:Record<string,unknown>)=>Response.json({error:{code,reasons:reasons.map(message=>({code:'RULE',path:'body',message})),details},posted:false,requestId:id(100)},{status});

export async function harness(fetch?:FetchLike,tty=false) {
  const directory=await mkdtemp(join(tmpdir(),'issus-cli-한글-'));
  const stdout:string[]=[],stderr:string[]=[],out:Output={json:false,tty,line:text=>{stdout.push(text+'\n');},error:text=>{stderr.push(text+'\n');}};
  const env={ISSUS_URL:'http://127.0.0.1:18140',ISSUS_TOKEN:'test-only-session',ISSUS_CONFIG_DIR:join(directory,'config'),USERNAME:process.env.USERNAME,USERDOMAIN:process.env.USERDOMAIN};
  return {directory,env,stdout,stderr,out,run:async(args:string[],options:Parameters<typeof run>[1]={})=>{stdout.length=0;stderr.length=0;out.json=args.includes('--json');return run(args,{out,env,cwd:directory,fetch,...options});}};
}
export const readFixture=async(file:string):Promise<string>=>readFile(join(root,'apps/cli/tests/fixtures',file),'utf8');
