import {CliError} from '../../output/index.js';

export interface Arguments {command:string;action:string;positionals:string[];values:Record<string,string[]>;flags:Set<string>}
type Spec={values?:string[];repeat?:string[];flags?:string[]};
const common:Spec={values:['server','profile','profiles-file','token-file'],flags:['json','no-color','help']};
const specs:Record<string,Spec>={
 runner:{values:['me','exec','model','effort','cwd','sandbox','max-parallel','repo','issue','config','exec-path','timeout','until'],repeat:['board'],flags:['once','record-info']},
 post:{values:['repo','issue','body-file','timeout','packet-file','sampled','compacted-by','compact-deferred-reason'],flags:['edit-body','dry-run']},
 watch:{values:['repo','state','limit','show','page-size','processed-file'],repeat:['me','mine','board'],flags:['full','peek','since-compact','compact-due','all-history']},
 subscribe:{values:['repo','issue','me','transport','cursor','until'],repeat:['board'],flags:['once','since-compact']},
 compact:{values:['repo','issue','out','body-file','packet-file','sampled','compacted-by','timeout'],flags:['dry-run']},
 alias:{values:['owner','repos','limit','repo','name','role','model','scope','sid','alias-id','body-file','announcement-issue'],flags:['deep']},
 board:{values:['repo','issue','user-board','owner','body-file']},
 session:{values:['alias','sid','reissue-of','resume-from','id','timeout']},
 issue:{values:['repo','issue','title','body-file','reason','final-report-id','revision','state','timeout']},
 handoff:{values:['repo','issue','id','ack-comment-id','revision','timeout']},
 auth:{flags:['token-stdin']},
 admin:{values:['owner','slug','project-code','board-owner'],flags:['auto-board']}
};
const actions:Record<string,string[]>={compact:['prepare','status','post'],alias:['check','register','rename'],board:['find','ensure'],session:['open','revoke'],issue:['open','get','body','close','reopen'],handoff:['accept','complete'],auth:['set','whoami'],admin:['repo']};

/** Non-repeat options, including flags, reject duplicate occurrences instead of silently overwriting. */
export function parseArguments(argv:string[]):Arguments {
  if(!argv.length||['--help','-h'].includes(argv[0])) return {command:'help',action:'',positionals:[],values:{},flags:new Set()};
  const command=argv[0];if(!specs[command]) throw new CliError(2,`Unknown command '${command}'. Use issus --help.`);
  const values:Record<string,string[]>={},flags=new Set<string>(),positionals:string[]=[];
  const spec=specs[command], valueNames=new Set([...(common.values??[]),...(spec.values??[]),...(spec.repeat??[])]),flagNames=new Set([...(common.flags??[]),...(spec.flags??[])]);
  let action=actions[command]?.[0]??'';
  let i=1;
  if(actions[command]?.includes(argv[i])) action=argv[i++];
  for(;i<argv.length;i++) {
    const arg=argv[i];
    if(arg==='--') {positionals.push(...argv.slice(i+1));break;}
    if(arg==='-h') {if(flags.has('help')) throw new CliError(2,'duplicate --help');flags.add('help');continue;}
    if(!arg.startsWith('--')) {positionals.push(arg);continue;}
    const equal=arg.indexOf('='),name=arg.slice(2,equal<0?undefined:equal);
    if(flagNames.has(name)) {
      if(equal>=0||flags.has(name)) throw new CliError(2,`invalid or duplicate --${name}`);
      flags.add(name);continue;
    }
    if(!valueNames.has(name)) throw new CliError(2,`unknown option --${name}`);
    if(values[name]&&!spec.repeat?.includes(name)) throw new CliError(2,`duplicate --${name}`);
    const value=equal>=0?arg.slice(equal+1):argv[++i];
    if(value===undefined||value.startsWith('--')||value==='') throw new CliError(2,`--${name} needs a value`);
    (values[name]??=[]).push(value);
  }
  if(command==='watch'&&flags.has('since-compact')&&flags.has('all-history')) throw new CliError(2,'--since-compact and --all-history are mutually exclusive');
  if(!['watch','alias'].includes(command)&&positionals.length) throw new CliError(2,`unexpected argument '${positionals[0]}'`);
  if(command==='alias'&&action==='check'&&positionals.length!==1&&!flags.has('help')) throw new CliError(2,'alias check needs one ALIAS');
  if(command==='alias'&&action!=='check'&&positionals.length) throw new CliError(2,'unexpected alias argument');
  return {command,action,positionals,values,flags};
}
export const value=(a:Arguments,name:string,fallback?:string):string|undefined=>a.values[name]?.[0]??fallback;
export const required=(a:Arguments,name:string):string=>{const v=value(a,name);if(!v) throw new CliError(2,`--${name} is required`);return v;};
export const numberOption=(a:Arguments,name:string,fallback?:number,max=Number.MAX_SAFE_INTEGER):number=>{
  const raw=value(a,name),n=raw===undefined?fallback:Number(raw);
  if(n===undefined||!/^\d+$/u.test(raw??String(n))||!Number.isSafeInteger(n)||n<=0||n>max) throw new CliError(2,`--${name} needs an integer in 1..${max}`);
  return n;
};
export const duration=(a:Arguments):number=>{
  const raw=value(a,'timeout','60s')!,m=/^(\d+(?:\.\d+)?)(ms|s|m)?$/u.exec(raw);
  const ms=m?Number(m[1])*(m[2]==='ms'?1:m[2]==='m'?60000:1000):0;
  if(!Number.isFinite(ms)||ms<=0) throw new CliError(2,'--timeout needs a positive duration');
  return ms;
};

export interface IssueReference {repo:string;number:number}
export function parseRepo(repo:string):string {
  if(!/^[^/\s?#\\]+\/[^/\s?#\\]+$/u.test(repo)||repo.split('/').some(s=>s==='.'||s==='..')) throw new CliError(2,'usage: --repo OWNER/REPO --issue N');
  return repo;
}
/** Service refs only. GitHub URLs explicitly fail instead of implying synchronization. */
export function parseIssue(input:string,repo?:string,server?:string):IssueReference {
  let target=repo,n=input;
  if(/^https?:\/\//u.test(input)) {
    const url=new URL(input);
    if(url.hostname==='github.com'||url.hostname.endsWith('.github.com')) throw new CliError(2,'unsupported source: GitHub URL (자동 연결/동기화 없음)');
    if(!server||url.origin!==new URL(server).origin) throw new CliError(2,'unsupported source: 다른 서비스 URL');
    const m=/^\/(?:v1\/)?repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/u.exec(url.pathname);
    if(!m||url.search||url.hash) throw new CliError(2,`cannot resolve issue '${input}' (give --repo or OWNER/REPO#N)`);
    target=`${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`;n=m[3];
  } else {
    const m=/^([^/#\s]+\/[^/#\s]+)#(\d+)$/u.exec(input);
    if(m) {target=m[1];n=m[2];}
  }
  if(!target||!/^\d+$/u.test(n)||Number(n)<=0||!Number.isSafeInteger(Number(n))) throw new CliError(2,`cannot resolve issue '${input}' (give --repo or OWNER/REPO#N)`);
  return {repo:parseRepo(target),number:Number(n)};
}
