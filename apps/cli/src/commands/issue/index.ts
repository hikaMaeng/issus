import {checkIssueBody} from 'issus_domain/common';
import {issuePath,repoPath} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {duration,numberOption,parseIssue,parseRepo,required} from '../../entry/arguments/index.js';
import {CliError,rejected} from '../../output/index.js';
import {readUtf8} from '../../state/index.js';

/** Issue gates are delegated unchanged to the revision-checked server API. */
export async function issue(ctx:CommandContext):Promise<number> {
  const a=ctx.args,repo=parseRepo(required(a,'repo'));let body:string|undefined;
  if(['open','body'].includes(a.action)) {const file=required(a,'body-file');body=await readUtf8(ctx.path(file));const reasons=checkIssueBody(body);if(reasons.length) {await rejected(ctx.out,file,reasons);return 1;}}
  if(a.action==='open') {const result=await ctx.write(repoPath(repo)+'/issues',{title:required(a,'title'),body},{timeoutMs:duration(a)});await ctx.result(result);return 0;}
  const {client}=await ctx.connection(),ref=parseIssue(required(a,'issue'),repo,client.server);
  if(ref.repo!==repo) throw new CliError(2,'--issue repo differs from --repo');
  const path=issuePath(repo,ref.number);
  if(a.action==='get') {await ctx.result((await client.request(path)).data);return 0;}
  const revision=numberOption(a,'revision');
  const request=a.action==='body'?{body}:a.action==='close'?{reason:required(a,'reason'),finalReportId:required(a,'final-report-id')}:{reason:required(a,'reason'),state:required(a,'state')};
  const result=await ctx.write(path+'/'+a.action,request,{method:a.action==='body'?'PATCH':'POST',revision,timeoutMs:duration(a)});await ctx.result(result);return 0;
}
