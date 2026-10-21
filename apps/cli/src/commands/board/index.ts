import {ClientError,issuePath,repoPath} from 'issus_domain/front';
import type {BoardResponse} from 'issus_domain/common';
import type {CommandContext} from '../../client/index.js';
import {numberOption,parseRepo,required,value} from '../../entry/arguments/index.js';
import {codepoints} from '../../output/index.js';
import {readUtf8} from '../../state/index.js';

/** Board selection is resolved by the server registry; no silent board creation during find. */
export async function board(ctx:CommandContext):Promise<number> {
  const a=ctx.args,repo=parseRepo(required(a,'repo'));
  if(a.action==='ensure') {
    const result=await ctx.write(repoPath(repo)+'/board/ensure',{boardOwner:required(a,'owner'),...(value(a,'body-file')?{body:await readUtf8(ctx.path(required(a,'body-file')))}:{})});
    await ctx.result(result);return 0;
  }
  const query=new URLSearchParams();if(value(a,'issue')) query.set('issue',String(numberOption(a,'issue')));
  if(value(a,'user-board')) query.set('userBoard',String(numberOption(a,'user-board')));
  const {client}=await ctx.connection();
  let data:BoardResponse;
  try {data=(await client.request<BoardResponse>(repoPath(repo)+'/board?'+query,{signal:ctx.options.signal})).data;}
  catch(error) {
    if(error instanceof ClientError&&error.status===404&&['BOARD_NOT_FOUND','NOT_FOUND'].includes(error.code)) {await ctx.result({found:false},'NONE: 공통 게시판 없음 — 개설 절차 references/board.md#개설 (examples/board-body.md)');return 1;}
    if(error instanceof ClientError&&error.code==='BOARD_UNAVAILABLE') {await ctx.out.line('재개설 필요: 발견된 게시판이 닫혀 있음 — references/board.md#개설');return 3;}
    throw error;
  }
  const detail=(await client.request<{issue:{title:string};stats?:{count?:number}}>(issuePath(repo,data.number))).data;
  await ctx.result(data,`BOARD ${repo}#${data.number} state=${data.state} comments=${detail.stats?.count??0} via=${data.via} title=${codepoints(detail.issue.title??'',80)}`);
  if(data.state.toLowerCase()!=='open') {if(!ctx.out.json) await ctx.out.line('재개설 필요: 발견된 게시판이 닫혀 있음 — references/board.md#개설');return 3;}
  if(value(a,'issue')&&!ctx.out.json) await ctx.out.line(`next: 주 이슈 #${value(a,'issue')} 본문 첫 줄에 \`BOARD:#${data.number}\` 기록(issue_post.py --edit-body)`);
  return 0;
}
