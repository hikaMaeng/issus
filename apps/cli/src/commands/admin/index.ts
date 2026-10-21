import type {CommandContext} from '../../client/index.js';
import {required} from '../../entry/arguments/index.js';

/** Bootstrap-only repo creation; server owns authorization and registry transactions. */
export async function admin(ctx:CommandContext):Promise<number> {
  const a=ctx.args,autoBoard=a.flags.has('auto-board'),result=await ctx.write('/v1/repos',{owner:required(a,'owner'),slug:required(a,'slug'),projectCode:required(a,'project-code'),autoBoard,...(autoBoard?{boardOwner:required(a,'board-owner')}:{})});
  await ctx.result(result);return 0;
}
