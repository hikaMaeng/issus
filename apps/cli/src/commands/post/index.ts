import {checkComment,checkIssueBody,header,splitlines} from 'issus_domain/common';
import {ClientError,issuePath} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {duration,parseIssue,parseRepo,required,value} from '../../entry/arguments/index.js';
import {chars,CliError,codepoints,rejected} from '../../output/index.js';
import {readJson,readUtf8} from '../../state/index.js';

interface PacketMeta {packetToken:string;throughId?:string;packetHash?:string}

/** Shared by post and compact post; metadata stays outside the envelope. */
export async function commentRequest(ctx:CommandContext,body:string):Promise<Record<string,unknown>> {
  const a=ctx.args,h=header(body),request:Record<string,unknown>={body};
  if(h._type==='COMPACT') {
    const packet=required(a,'packet-file'),sampled=required(a,'sampled'),by=required(a,'compacted-by');
    if(!/^\d+(,\d+)*$/u.test(sampled)) throw new CliError(2,'--sampled needs comma-separated comment ids');
    let meta:PacketMeta;
    try {meta=await readJson<PacketMeta>(ctx.path(packet.endsWith('.meta.json')?packet:packet+'.meta.json'));}
    catch(error) {throw error;}
    if(!meta.packetToken||typeof meta.packetToken!=='string') throw new CliError(2,'packet sidecar missing packetToken');
    request.compactPacketToken=meta.packetToken;request.sampledIds=[...new Set(sampled.split(','))];request.compactedBy=by;
  } else if(['packet-file','sampled','compacted-by'].some(k=>value(a,k))) throw new CliError(2,'COMPACT metadata requires TYPE:COMPACT');
  if(value(a,'compact-deferred-reason')) request.compactDeferredReason=value(a,'compact-deferred-reason');
  return request;
}

/** Canonical Python stdout is preserved. Additional preflight diagnostics go only to stderr. */
export async function post(ctx:CommandContext):Promise<number> {
  const a=ctx.args,repo=parseRepo(required(a,'repo')),file=required(a,'body-file'),rawIssue=required(a,'issue'),timeoutMs=duration(a);
  if(!/^https?:\/\//u.test(rawIssue)) parseIssue(rawIssue,repo);
  const body=await readUtf8(ctx.path(file)),edit=a.flags.has('edit-body');
  if(edit&&['packet-file','sampled','compacted-by','compact-deferred-reason'].some(k=>value(a,k))) throw new CliError(2,'--edit-body accepts no comment metadata');
  const reasons=edit?checkIssueBody(body):checkComment(body);
  if(reasons.length) {await rejected(ctx.out,file,reasons);return 1;}
  const {client,profile}=await ctx.connection(),ref=parseIssue(rawIssue,repo,client.server);
  if(ref.repo!==repo) throw new CliError(2,'--issue repo differs from --repo');
  const path=issuePath(repo,ref.number),request=edit?{body}:await commentRequest(ctx,body);
  let revision:number|undefined;
  if(edit) {
    const result=await client.request<{revision:number}>(path,{signal:ctx.options.signal});revision=result.data.revision;
    if(!Number.isSafeInteger(revision)||revision!<=0) throw new ClientError(0,'INVALID_REVISION');
  }
  let preflight:Record<string,unknown>|undefined;
  if(a.flags.has('dry-run')) {
    try {
      preflight=(await client.request<Record<string,unknown>>(path+'/preflight',{method:'POST',body:{mode:edit?'issue-body':'comment',request},revision,signal:ctx.options.signal})).data;
    } catch(error) {
      if(error instanceof ClientError&&error.status===422) {await rejected(ctx.out,file,error.reasons.length?error.reasons:[error.code]);return 1;}
      throw error;
    }
    if(preflight.valid!==true||preflight.posted!==false) throw new ClientError(0,'INVALID_PREFLIGHT_RESPONSE');
  }
  const kind=edit?'issue-body':'comment',ok=`OK ${kind} ${repo}#${ref.number} chars=${chars(body)} | ${codepoints(splitlines(body.replace(/^\uFEFF+/u,''))[0],160)}`;
  if(a.flags.has('dry-run')) {
    if(ctx.out.json) await ctx.result(preflight);
    else {await ctx.out.line(ok);await ctx.out.line('dry-run: not posted');}
    const context=preflight!.context as {checkedAt?:string}|undefined,compact=preflight!.compact as {due?:boolean;count?:number;chars?:number}|undefined;
    await ctx.out.error(`preflight checkedAt=${context?.checkedAt??'-'} compact-due=${compact?.due??false} comments=${compact?.count??0} chars=${compact?.chars??0}`);
    return 0;
  }
  if(!ctx.out.json) await ctx.out.line(ok);
  const result=await ctx.write<Record<string,unknown>>(edit?path+'/body':path+'/comments',request,{method:edit?'PATCH':'POST',revision,timeoutMs});
  await ctx.result(result,edit?`posted issue-body: ${profile.server}/v1/repos/${repo}/issues/${ref.number}`:`posted comment id=${result.commentId} url=${profile.server}/v1/repos/${repo}/issues/${ref.number}/comments/${result.commentId}`);
  return 0;
}
