import {join} from 'node:path';
import {scopeKey,subscribe,StreamTimeout,type StreamCheckpoint} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {socketFactory} from '../../client/socket/index.js';
import {numberOption,parseIssue,parseRepo,required,value} from '../../entry/arguments/index.js';
import {CliError,redact} from '../../output/index.js';
import {profileDirectory} from '../../profiles/index.js';
import {StateStore} from '../../state/index.js';

/** Stdout is JSON Lines only, including in nonTTY mode. No implicit ACK/process/application occurs. */
export async function subscribeCommand(ctx:CommandContext):Promise<number> {
  const a=ctx.args,repo=parseRepo(required(a,'repo')),transport=value(a,'transport','ws');
  if(transport!=='ws'&&transport!=='sse') throw new CliError(2,'--transport must be ws or sse');
  const untilMs=value(a,'until')===undefined?undefined:numberOption(a,'until',undefined,2147483647);
  const {client,profile}=await ctx.connection(),p=await ctx.principal();
  if(p.kind!=='session') throw new CliError(2,'subscribe needs a session token');
  const me=value(a,'me',p.alias)!.toLowerCase(),parts=me.split('/');
  if(parts[0]!==p.alias.toLowerCase()||(parts[1]&&parts[1]!==p.sid)||parts.length>2) throw new CliError(2,'subscribe --me must match token alias/sid');
  const issue=parseIssue(required(a,'issue'),repo,client.server);
  if(issue.repo!==repo) throw new CliError(2,'--issue repo differs from --repo');
  const boards=(a.values.board??[]).map(x=>parseIssue(x,repo,client.server));
  if(boards.some(x=>x.repo!==repo)) throw new CliError(2,'subscribe --board must be in the same repo');
  const issues=[...new Set([issue.number,...boards.map(x=>x.number)])].sort((a,b)=>a-b);
  const key=scopeKey({server:client.server,owner:repo.split('/')[0],alias:p.alias,sid:p.sid,repos:[{repo,issues:[issue.number],boards:boards.map(x=>x.number)}],me:[p.alias],sinceCompact:true});
  const store=new StateStore(ctx.path(value(a,'cursor')??join(profileDirectory(ctx.env),'stream-cursors.json'))),old=await store.scope(key);
  const checkpoint=old?.stream;
  try {await subscribe(client,{
    request:{channels:[],from:'since-compact',repo,issues},transport,once:a.flags.has('once'),untilMs,signal:ctx.options.signal,checkpoint,socket:socketFactory,
    key:identity=>ctx.journal().requestKey({server:client.server,actor:p.id,sessionId:p.sessionId,scope:key,stream:identity}),
    onAccepted:operation=>ctx.journal().saveOperation(operation.key,operation.operationId),
    onSubscription:async subscription=>{await ctx.out.line(JSON.stringify({subscription}));},
    onFrame:async frame=>{await ctx.out.line(redact(JSON.stringify(frame),profile.token));},
    save:async (stream:StreamCheckpoint)=>{await store.saveScope(key,{cursors:{...old?.cursors,transportCursor:stream.transportCursor},stream});}
  });} catch(error) {if(error instanceof StreamTimeout) throw new CliError(3,'STREAM_WAIT_TIMEOUT');throw error;}
  return 0;
}
