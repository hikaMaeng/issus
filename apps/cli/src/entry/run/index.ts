import {CommandContext,type ContextOptions} from '../../client/index.js';
import {auth} from '../../commands/auth/index.js';
import {admin} from '../../commands/admin/index.js';
import {alias} from '../../commands/alias/index.js';
import {board} from '../../commands/board/index.js';
import {compact} from '../../commands/compact/index.js';
import {handoff} from '../../commands/handoff/index.js';
import {issue} from '../../commands/issue/index.js';
import {post} from '../../commands/post/index.js';
import {session} from '../../commands/session/index.js';
import {subscribeCommand} from '../../commands/subscribe/index.js';
import {watch} from '../../commands/watch/index.js';
import {CliError,stdioOutput} from '../../output/index.js';
import {parseArguments} from '../arguments/index.js';

const help=`Usage: issus <command> [options]

post --repo o/r --issue N --body-file FILE [--edit-body] [--dry-run]
watch --repo o/r [--me ALIAS ...] [--mine TEXT ...] [--board ISSUE ...] [--peek] ISSUE...
watch --repo o/r --show ID
subscribe --repo o/r --issue N [--me ALIAS/sid] [--transport ws|sse] [--once]
compact [prepare|status|post] --repo o/r --issue N [--out FILE]
alias [check] --owner OWNER [--deep] [--repos o/r,o/r] ALIAS
alias register --owner O --repo o/r --name A --role R --model M --scope S --body-file F [--sid SID]
alias rename --name A --body-file F [--alias-id ID]
board [find] --repo o/r [--issue N] [--user-board N]
board ensure --repo o/r --owner ALIAS [--body-file F]
session open --alias A --sid SID [--reissue-of ID]; session revoke --id ID
issue open --repo o/r --title T --body-file F
issue get|body|close|reopen --repo o/r --issue N [--revision N ...]
handoff accept|complete --repo o/r --issue N --id ID [--ack-comment-id ID|--revision N]
auth set --server URL --token-stdin; auth whoami
admin repo --owner O --slug S --project-code CODE [--auto-board --board-owner ALIAS]

Common: --server URL --profile NAME --profiles-file FILE --token-file FILE --json --no-color
Env: ISSUS_URL (ISSUS_SERVER_URL alias), ISSUS_TOKEN, ISSUS_CONFIG_DIR, ISSUS_PROFILES_FILE
Exit: 0 success; 1 rejected; 2 usage/file/connection/auth/server; 3 pending/timeout.
watch defaults to since-compact; --all-history selects full history. --peek never advances state.
post --dry-run performs local validation + authenticated, read-only server preflight.
COMPACT post requires --packet-file FILE --sampled id,id --compacted-by ALIAS.
`;

/** Injectable entry for deterministic contract tests; production exit is set only by entry/index.ts. */
export async function run(argv:string[],options:Partial<ContextOptions>={}):Promise<number> {
  let ctx:CommandContext|undefined;
  const out=options.out??stdioOutput(argv.includes('--json'));
  try {
    const args=parseArguments(argv);ctx=new CommandContext(args,{...options,out});
    if(args.command==='help'||args.flags.has('help')) {await out.line(help.trimEnd());return 0;}
    const commands:Record<string,(ctx:CommandContext)=>Promise<number>>={post,watch,subscribe:subscribeCommand,compact,alias,board,session,issue,handoff,auth,admin};
    return await commands[args.command](ctx);
  } catch(error) {
    if(ctx) return ctx.reportError(error);
    await out.error(error instanceof CliError?error.message:'CLI 오류');return 2;
  }
}
