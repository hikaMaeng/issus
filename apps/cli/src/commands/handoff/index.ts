import {issuePath} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {duration,numberOption,parseIssue,parseRepo,required} from '../../entry/arguments/index.js';
import {CliError} from '../../output/index.js';

/** Accept references an actual ACK comment; complete carries an explicit optimistic revision. */
export async function handoff(ctx:CommandContext):Promise<number> {
  const a=ctx.args,repo=parseRepo(required(a,'repo')),{client}=await ctx.connection(),ref=parseIssue(required(a,'issue'),repo,client.server),id=required(a,'id');
  if(ref.repo!==repo||!/^\d+$/u.test(id)) throw new CliError(2,'invalid handoff issue/id');
  const body=a.action==='accept'?{ackCommentId:required(a,'ack-comment-id')}:{expectedRevision:numberOption(a,'revision')};
  const result=await ctx.write(`${issuePath(repo,ref.number)}/handoffs/${id}/${a.action}`,body,{timeoutMs:duration(a)});await ctx.result(result);return 0;
}
