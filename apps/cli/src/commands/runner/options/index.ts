import {stat,realpath} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import type {Arguments} from '../../../entry/arguments/index.js';
import {duration,numberOption,parseRepo,required,value} from '../../../entry/arguments/index.js';
import {CliError} from '../../../output/index.js';
import {aliasOk} from 'issus_domain/common';
import {readJson} from '../../../state/index.js';

export type AdapterKind='codex'|'muse'|'claude';
export interface RunnerOptions {
  me:string;sid?:string;exec:AdapterKind;model:string;effort:string;cwd:string;sandbox:string;
  repo:string;issue:number;boards:number[];allowedSenders:string[];allowedTypes:string[];
  once:boolean;untilMs?:number;timeoutMs:number;recordInfo:boolean;evidenceRoot:string;executable:string;profile?:string;
}
interface Config {version:1;profile?:string;repo?:string;issue?:number;boards?:number[];cwd?:string;allowedSenders:string[];allowedTypes?:string[];maxParallel?:number;recordInfo?:boolean;timeoutMs?:number;sandbox?:string;evidenceRoot?:string;executables?:Partial<Record<AdapterKind,string>>;model?:string;effort?:string}
const fail=(s:string):never=>{throw new CliError(2,s);};
const positive=(n:unknown,name:string):number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0?n:fail(`${name} needs a positive integer`);

/** Administrative configuration only; no executable, cwd or policy is read from a comment. */
export async function runnerOptions(a:Arguments,cwd:string,env:NodeJS.ProcessEnv):Promise<RunnerOptions> {
  const configFile=value(a,'config');if(configFile&&!isAbsolute(configFile)) fail('--config must be absolute');
  const c=configFile?await readJson<Config>(configFile):undefined;
  if(!c||c.version!==1||!Array.isArray(c.allowedSenders)||!c.allowedSenders.length||c.allowedSenders.some(x=>typeof x!=='string'||!x.trim())) fail('runner config version 1 and nonempty allowedSenders required');
  const cfg=c!;
  const me=required(a,'me'),parts=me.split('/');
  if(parts.length>2||!parts[0]||(parts.length===2&&!parts[1])) fail('--me needs alias[/sid]');
  if(!aliasOk(parts[0].toLowerCase())||cfg.allowedSenders.some(x=>!aliasOk(x.toLowerCase()))) fail('invalid canonical alias');
  const kind=required(a,'exec');if(!['codex','muse','claude'].includes(kind)) fail('--exec must be codex|muse|claude');
  const exec=kind as AdapterKind,effort=value(a,'effort',cfg.effort??'high')!;
  if(!(exec==='muse'?['low','medium','high','xhigh']:['low','medium','high']).includes(effort)) fail('unsupported effort');
  const sandbox=value(a,'sandbox',cfg.sandbox??(exec==='codex'?'workspace-write':'edits'))!;
  if(!(exec==='codex'?['read-only','workspace-write']:exec==='muse'?['edits']:['read-only','edits']).includes(sandbox)) fail('unsupported sandbox');
  if((value(a,'max-parallel')===undefined?cfg.maxParallel??1:numberOption(a,'max-parallel'))!==1) fail('--max-parallel must be 1');
  const repo=parseRepo(value(a,'repo',cfg.repo??env.ISSUS_REPO)??fail('--repo required'));
  const rawIssue=value(a,'issue',cfg.issue===undefined?env.ISSUS_ISSUES:String(cfg.issue));
  if(!rawIssue||!/^\d+$/u.test(rawIssue)) fail('one positive --issue required');
  const issue=positive(Number(rawIssue),'issue');
  const boards=[...new Set((a.values.board??cfg.boards??[]).map(x=>positive(typeof x==='string'&&/^\d+$/u.test(x)?Number(x):x,'board')))];
  const work=value(a,'cwd',cfg.cwd??cwd)!;if(!isAbsolute(work)||!(await stat(work)).isDirectory()) fail('--cwd must be an existing absolute directory');
  const evidenceRoot=cfg.evidenceRoot??join(work,'.cache','runner');if(!isAbsolute(evidenceRoot)) fail('evidenceRoot must be absolute');
  const override=value(a,'exec-path');if(override&&!isAbsolute(override)) fail('--exec-path must be absolute');
  const executable=override??cfg.executables?.[exec]??(exec==='muse'?'C:/Users/hika0/AppData/Local/Programs/muse/muse.cmd':exec);
  if(/[\r\n\0]/u.test(executable)) fail('invalid executable');
  const allowedTypes=cfg.allowedTypes??['ASK','DECISION','HANDOFF','HOLD'];
  if(!Array.isArray(allowedTypes)||allowedTypes.some(x=>!['ASK','DECISION','HANDOFF','HOLD'].includes(x))) fail('invalid allowedTypes');
  return {me:parts[0].toLowerCase(),sid:parts[1],exec,model:value(a,'model',cfg.model??({codex:'gpt-6.1-sol',muse:'muse-spark-1.3',claude:'sonnet'}[exec]))!,effort,
    cwd:await realpath(work),sandbox,repo,issue,boards,allowedSenders:cfg.allowedSenders.map(x=>x.toLowerCase()),allowedTypes,once:a.flags.has('once'),
    untilMs:value(a,'until')===undefined?undefined:numberOption(a,'until',undefined,2147483647),timeoutMs:value(a,'timeout')===undefined?positive(cfg.timeoutMs??1200000,'timeoutMs'):duration(a),
    recordInfo:a.flags.has('record-info')||cfg.recordInfo!==false,evidenceRoot,executable,profile:cfg.profile};
}
