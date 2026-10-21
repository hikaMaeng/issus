import type {SessionCreatedResponse,SessionCreateRequest} from 'issus_domain/common';
import type {CommandContext} from '../../client/index.js';
import {duration,required,value} from '../../entry/arguments/index.js';
import {CliError} from '../../output/index.js';
import {saveProfile} from '../../profiles/index.js';

/** Initial token is saved before success output; token-loss recovery follows design §7.1 explicitly. */
export async function openSession(ctx:CommandContext,input?:SessionCreateRequest):Promise<number> {
  const a=ctx.args,request=input??{alias:required(a,'alias'),sid:required(a,'sid'),...(value(a,'resume-from')?{resumeFrom:value(a,'resume-from')}:{ }),...(value(a,'reissue-of')?{reissueOf:value(a,'reissue-of')}:{})};
  const {profile}=await ctx.connection(),p=await ctx.principal();if(p.kind!=='bootstrap') throw new CliError(2,'session open needs bootstrap authentication');
  const result=await ctx.write<SessionCreatedResponse>('/v1/sessions',request,{timeoutMs:duration(a)});
  if(!result.token||typeof result.token!=='string') throw new CliError(2,'session response missing token; 같은 key로 재시도 후 재발급 안내 확인');
  await saveProfile({server:profile.server,token:result.token,alias:result.alias,sid:result.sid,sessionId:result.sessionId,expiresAt:result.expiresAt},ctx.profileOptions,ctx.env);
  await ctx.result({sessionId:result.sessionId,alias:result.alias,sid:result.sid,expiresAt:result.expiresAt,saved:true},`session=${result.sessionId} alias=${result.alias}/${result.sid} expires=${result.expiresAt} profile=saved`);
  return 0;
}
export async function session(ctx:CommandContext):Promise<number> {
  if(ctx.args.action==='open') return openSession(ctx);
  const result=await ctx.write(`/v1/sessions/${encodeURIComponent(required(ctx.args,'id'))}`,undefined,{method:'DELETE'});await ctx.result(result);return 0;
}
