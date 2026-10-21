import {checkIssueBody,parseIssueBodyEnvelope,words,splitlines,type IssueState} from '../../../common/index.js';
import {CoreError,validation,aliasByName,authorizeRepo,requireOwner,checkRevision,resolveIssueRef,issueChannel,splitBodyHeader,type EventTransaction,type CorePrincipal,type IssueRow,actorOf} from '../../backend/index.js';

/** Context restrictions supplement the exact Python syntax reasons without changing them. */
export async function checkBodyContext(tx:EventTransaction,p:CorePrincipal,repoId:string,body:string,issue?:IssueRow,expectedRevision?:number):Promise<Record<string,string>> {
  validation(checkIssueBody(body));const e=parseIssueBodyEnvelope(body).envelope!;
  if(words(splitlines(body)[0]).slice(0,3).map(token=>token.slice(0,token.indexOf(':'))).join(',')!=='STATE,OWNER,UPDATED') validation([{code:'BODY_ORDER',path:'body',message:'이슈 본문 첫 줄 STATE OWNER UPDATED 순서 필수'}]);
  await aliasByName(tx,p.ownerId,e.OWNER);
  if(issue) {
    await requireOwner(tx,p,issue.owner_alias_id);checkRevision(issue,expectedRevision);
    if(!issue.is_open) throw new CoreError(409,'ISSUE_CLOSED');
    if((await aliasByName(tx,p.ownerId,e.OWNER)).id!==issue.owner_alias_id) throw new CoreError(409,'HANDOFF_REQUIRED');
    if((e.COMPACT??null)!==issue.compact_comment_id||(e['REPLY-IN']??null)!==issue.reply_in) validation([{code:'POINTER_MANAGED',path:'body',message:'COMPACT/REPLY-IN 포인터는 전용 명령으로만 변경'}]);
  } else if(e.COMPACT||e['REPLY-IN']) validation([{code:'POINTER_MANAGED',path:'body',message:'신규 이슈 COMPACT/REPLY-IN 포인터 불가'}]);
  const repo=(await tx.client.query(`SELECT board_issue_id FROM ${tx.table('repo')} WHERE id=$1`,[repoId])).rows[0];
  if(e.BOARD) {const board=await resolveIssueRef(tx,p,repoId,e.BOARD);if(board.repo_id!==repoId||board.number!==repo.board_issue_id||!board.is_board) throw new CoreError(409,'BOARD_CONFLICT');}
  else if(repo.board_issue_id&&issue&&splitBodyHeader(issue.body).line.includes(' BOARD:')) throw new CoreError(409,'BOARD_CONFLICT');
  return e as unknown as Record<string,string>;
}
export async function openIssue(tx:EventTransaction,p:CorePrincipal,input:{repoId:string;title:string;body:string}):Promise<Record<string,unknown>> {
  await authorizeRepo(tx,p,input.repoId);const e=await checkBodyContext(tx,p,input.repoId,input.body);
  const repo=(await tx.client.query(`UPDATE ${tx.table('repo')} SET next_issue_number=next_issue_number+1 WHERE id=$1 RETURNING next_issue_number-1 AS n,board_issue_id`,[input.repoId])).rows[0];
  const owner=await aliasByName(tx,p.ownerId,e.OWNER);let body=input.body;
  if(repo.board_issue_id&&!e.BOARD) {const header=splitBodyHeader(body);body=header.line+` BOARD:#${repo.board_issue_id}`+header.tail;}
  await tx.client.query(`INSERT INTO ${tx.table('issue')}(owner_id,repo_id,number,title,body,state,owner_alias_id,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.ownerId,input.repoId,repo.n,input.title,body,e.STATE,owner.id,tx.now]);
  tx.fact('issus.issue.opened',issueChannel(input.repoId,repo.n),{ownerId:p.ownerId,repoId:input.repoId,issueNumber:repo.n,revision:1,number:repo.n,title:input.title,body,state:e.STATE as IssueState,ownerAliasId:owner.id,isBoard:false,actor:actorOf(p)});
  return {number:repo.n,revision:1,posted:true};
}
export async function editIssueBody(tx:EventTransaction,p:CorePrincipal,issue:IssueRow,input:{body:string;expectedRevision:number}):Promise<Record<string,unknown>> {
  const e=await checkBodyContext(tx,p,issue.repo_id,input.body,issue,input.expectedRevision);
  await tx.client.query(`UPDATE ${tx.table('issue')} SET body=$3,state=$4,revision=revision+1,updated_at=$5 WHERE repo_id=$1 AND number=$2`,[issue.repo_id,issue.number,input.body,e.STATE,tx.now]);
  tx.fact('issus.issue.body.edited',issueChannel(issue.repo_id,issue.number),{ownerId:p.ownerId,repoId:issue.repo_id,issueNumber:issue.number,revision:issue.revision+1,previousRevision:issue.revision,body:input.body,reason:'body-edit',actor:actorOf(p)});
  return {revision:issue.revision+1,posted:true};
}
