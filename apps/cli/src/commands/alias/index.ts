import {aliasOk,checkComment,type AliasCheckResponse} from 'issus_domain/common';
import {repoPath} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {numberOption,parseRepo,required,value} from '../../entry/arguments/index.js';
import {CliError,rejected} from '../../output/index.js';
import {readUtf8} from '../../state/index.js';
import {openSession} from '../session/index.js';

/** Registry checks are owner-wide; --repos filters evidence only. */
export async function alias(ctx:CommandContext):Promise<number> {
  const a=ctx.args;
  if(a.action==='check') {
    const name=a.positionals[0].trim(),owner=required(a,'owner'),limit=numberOption(a,'limit',60);
    const repos=[...new Set((value(a,'repos')??'').split(',').filter(Boolean).map(parseRepo))];
    if(!aliasOk(name)) {
      await ctx.out.line(`alias=${name} owner=${owner} repos=${repos.length}`);await ctx.out.line('CONFLICT:');
      await ctx.out.line(`  - 문법 위반 '${name}' — \`<proj>-<n>-<role>\`(예 p4-24-review) 또는 \`<proj>-<role>\`, 소문자·숫자·한글·'-', ≤24자`);return 1;
    }
    const {client}=await ctx.connection();
    let repoNames=repos;
    if(!repoNames.length) {
      const names:string[]=[];let cursor:string|undefined;
      do {
        const query=new URLSearchParams({limit:'500'});if(cursor) query.set('cursor',cursor);
        const {data}=await client.request<{items:{owner?:string;slug:string}[];nextCursor:string|null}>('/v1/repos?'+query);
        names.push(...data.items.filter(r=>!r.owner||r.owner.toLowerCase()===owner.toLowerCase()).map(r=>`${r.owner??owner}/${r.slug}`));cursor=data.nextCursor??undefined;
      } while(cursor);
      repoNames=[...new Set(names)];
    }
    const {data}=await client.request<AliasCheckResponse>(`/v1/owners/${encodeURIComponent(owner)}/aliases/check`,{method:'POST',body:{name,deep:a.flags.has('deep')},signal:ctx.options.signal});
    if(ctx.out.json) {await ctx.result(data);return data.available?0:1;}
    await ctx.out.line(`alias=${name} owner=${owner} repos=${Math.min(repoNames.length,limit)}`);
    if(a.flags.has('deep')) await ctx.out.line('deep: owner registry 전수 near-collision 검사');
    if(!data.available) {
      await ctx.out.line('CONFLICT:');
      for(const collision of data.collisions) {
        const evidence=collision.evidence.filter(e=>!repos.length||repos.some(r=>e.startsWith(r+'#')||e===r));
        await ctx.out.line(`  - ${collision.kind}: '${collision.alias}' used in ${evidence.slice(0,4).join(', ')||'(owner registry; evidence filter 밖)'}`);
      }
      return 1;
    }
    await ctx.out.line(`OK: '${name}' unused in ${Math.min(repoNames.length,limit)} repos of ${owner}${a.flags.has('deep')?' (deep)':' (search index; --deep for full scan)'}`);
    await ctx.out.error('검사 범위: owner registry 전체 (--repos/--limit는 evidence 출력만 제한)');return 0;
  }
  const file=required(a,'body-file'),body=await readUtf8(ctx.path(file)),reasons=checkComment(body);
  if(reasons.length) {await rejected(ctx.out,file,reasons);return 1;}
  if(a.action==='rename') {
    const p=await ctx.principal(),aliasId=value(a,'alias-id')??(p.kind==='session'?p.aliasId:required(a,'alias-id'));
    const result=await ctx.write(`/v1/aliases/${encodeURIComponent(aliasId)}/rename`,{newName:required(a,'name'),announcementBody:body});
    await ctx.result(result);return 0;
  }
  const owner=required(a,'owner'),repo=parseRepo(required(a,'repo')),{client}=await ctx.connection();
  const {data}=await client.request<{id:string}>(repoPath(repo));
  const name=required(a,'name'),request:Record<string,unknown>={name,role:required(a,'role'),model:required(a,'model'),scope:required(a,'scope'),repos:[data.id],announcementBody:body};
  if(value(a,'announcement-issue')) request.announcementIssue={repoId:data.id,issueNumber:numberOption(a,'announcement-issue')};
  const result=await ctx.write(`/v1/owners/${encodeURIComponent(owner)}/aliases`,request);await ctx.result(result);
  if(value(a,'sid')) return openSession(ctx,{alias:name,sid:required(a,'sid')});
  return 0;
}
