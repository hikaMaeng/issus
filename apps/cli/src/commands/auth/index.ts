import {serverUrl} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {required} from '../../entry/arguments/index.js';
import {CliError} from '../../output/index.js';
import {saveProfile} from '../../profiles/index.js';

/** Tokens enter through env, explicit bearer file, or redirected stdin and never leave through stdout. */
export async function auth(ctx:CommandContext):Promise<number> {
  if(ctx.args.action==='set') {
    if(!ctx.args.flags.has('token-stdin')) throw new CliError(2,'auth set requires --token-stdin');
    let server:string;try {server=serverUrl(required(ctx.args,'server'));} catch {throw new CliError(2,'invalid server URL');}
    const token=(await ctx.stdin()).trim();if(!token||/[\r\n]/u.test(token)) throw new CliError(2,'token-stdin needs one nonempty token');
    await saveProfile({server,token},ctx.profileOptions,ctx.env);
    await ctx.out.line(ctx.out.json?JSON.stringify({saved:true,server}):`auth saved server=${server}`);return 0;
  }
  const p=await ctx.principal();await ctx.result(p);return 0;
}
