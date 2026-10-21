import {CoreError,requireOwner,checkRevision,commentById,commentsFor,issueById,issueChannel,rewriteBody,actorOf,type CorePrincipal,type EventTransaction,type IssueRow} from '../../backend/index.js';
import {postComment} from '../comment/index.js';
import type {IssueState} from '../../../common/index.js';
import {refreshCompactSegment} from '../../compact/segment/index.js';

/** P6 owns the implementation; P4 commits the observation before the close command transaction. */
export type BeforeCloseRefresh=(tx:EventTransaction,issue:IssueRow,purpose:'before-close')=>Promise<unknown>;
export const refreshBeforeClose:BeforeCloseRefresh=refreshCompactSegment;

/** Safety gates use immediate indexes, independently of reaction/route lag. */
export async function closeBlockers(tx:EventTransaction,p:CorePrincipal,issue:IssueRow,finalReportId:string):Promise<Record<string,unknown>> {
  const report=await commentById(tx,p,finalReportId);const comments=await commentsFor(tx,issue.repo_id,issue.number);
  const blockers:Record<string,unknown>={};
  if(!['done','failed','cancelled'].includes(issue.state)) blockers.state=issue.state;
  if(report.repo_id!==issue.repo_id||report.issue_number!==issue.number||report.envelope.TYPE!=='REPORT'||!['done','failed','cancelled'].includes(report.envelope.STATE)||report.author_alias_id!==issue.owner_alias_id) blockers.finalReport=finalReportId;
  const compact=comments.find(c=>c.id===issue.compact_comment_id);
  if(!compact||BigInt(compact.id)<BigInt(finalReportId)||comments.at(-1)?.id!==compact.id||Number(compact.metadata.snapshotRevision)+1!==issue.revision) blockers.compact=issue.compact_comment_id;
  const ds=(await tx.client.query(`SELECT d.* FROM ${tx.table('directive')} d JOIN ${tx.table('comment')} c ON c.id=d.comment_id WHERE c.repo_id=$1 AND c.issue_number=$2`,[issue.repo_id,issue.number])).rows;
  const waiting=ds.filter(d=>!d.acked_by_comment_id&&!d.superseded_by).map(d=>d.comment_id);if(waiting.length) blockers.waitingDirectives=waiting;
  const holds=ds.filter(d=>d.type==='HOLD'&&!d.hold_released_by).map(d=>d.comment_id);if(holds.length) blockers.activeHolds=holds;
  const claims=(await tx.client.query(`SELECT comment_id FROM ${tx.table('claim')} WHERE repo_id=$1 AND issue_number=$2 AND released_by_comment_id IS NULL ORDER BY comment_id`,[issue.repo_id,issue.number])).rows.map(c=>c.comment_id);if(claims.length) blockers.claims=claims;
  const handoffs=(await tx.client.query(`SELECT comment_id FROM ${tx.table('handoff')} WHERE source_repo_id=$1 AND source_issue_number=$2 AND status<>'completed' ORDER BY comment_id`,[issue.repo_id,issue.number])).rows.map(c=>c.comment_id);if(handoffs.length) blockers.handoffs=handoffs;
  return blockers;
}
export async function closeIssue(tx:EventTransaction,p:CorePrincipal,issue:IssueRow,input:{reason:string;finalReportId:string;expectedRevision:number}):Promise<Record<string,unknown>> {
  await requireOwner(tx,p,issue.owner_alias_id);checkRevision(issue,input.expectedRevision);
  if(!issue.is_open) throw new CoreError(409,'ISSUE_CLOSED');
  const blockers=await closeBlockers(tx,p,issue,input.finalReportId);if(Object.keys(blockers).length) throw new CoreError(409,'CLOSE_BLOCKED',undefined,blockers);
  const repo=(await tx.client.query(`SELECT board_issue_id FROM ${tx.table('repo')} WHERE id=$1`,[issue.repo_id])).rows[0];
  let board:IssueRow|undefined;
  if(!issue.is_board) {if(!repo.board_issue_id) throw new CoreError(409,'BOARD_UNAVAILABLE');board=await issueById(tx,p,issue.repo_id,repo.board_issue_id,true);if(!board.is_open) throw new CoreError(409,'BOARD_UNAVAILABLE');}
  const body=rewriteBody(issue,{},tx.now);
  await tx.client.query(`UPDATE ${tx.table('issue')} SET is_open=false,close_reason=$3,body=$4,revision=revision+1,updated_at=$5 WHERE repo_id=$1 AND number=$2`,[issue.repo_id,issue.number,input.reason,body,tx.now]);
  tx.fact('issus.issue.closed',issueChannel(issue.repo_id,issue.number),{ownerId:p.ownerId,repoId:issue.repo_id,issueNumber:issue.number,revision:issue.revision+1,reason:input.reason,finalReportId:input.finalReportId,compactId:issue.compact_comment_id!,body,actor:actorOf(p)});
  if(board) {
    const owner=(await tx.client.query(`SELECT name FROM ${tx.table('alias')} WHERE id=$1`,[issue.owner_alias_id])).rows[0].name;
    const project=(await tx.client.query(`SELECT project_code FROM ${tx.table('repo')} WHERE id=$1`,[issue.repo_id])).rows[0].project_code;
    const from=p.kind==='session'?`${owner}/${p.sid}`:`${owner}/by-${project}-system`;
    await postComment(tx,p,board,{body:`FROM:${from} TO:ALL TYPE:NOTE RE:${input.finalReportId} REPLY-IN:#${issue.number}\n완료 공유 #${issue.number}: ${issue.title} — ${issue.state}. 결과·교훈·산출물은 최종 REPORT ${input.finalReportId} 참조.\n---\n근거: ${input.finalReportId}`});
  }
  return {number:issue.number,body,isOpen:false,revision:issue.revision+1,posted:true};
}
export async function reopenIssue(tx:EventTransaction,p:CorePrincipal,issue:IssueRow,input:{reason:string;state:IssueState;expectedRevision:number}):Promise<Record<string,unknown>> {
  await requireOwner(tx,p,issue.owner_alias_id);checkRevision(issue,input.expectedRevision);
  if(issue.is_open) throw new CoreError(409,'ISSUE_OPEN');if(!input.reason.trim()) throw new CoreError(422,'REASON_REQUIRED');
  const body=rewriteBody(issue,{state:input.state},tx.now);await tx.client.query(`UPDATE ${tx.table('issue')} SET is_open=true,close_reason=NULL,body=$3,state=$4,revision=revision+1,updated_at=$5 WHERE repo_id=$1 AND number=$2`,[issue.repo_id,issue.number,body,input.state,tx.now]);
  tx.fact('issus.issue.reopened',issueChannel(issue.repo_id,issue.number),{ownerId:p.ownerId,repoId:issue.repo_id,issueNumber:issue.number,revision:issue.revision+1,reason:input.reason,body,actor:actorOf(p)});
  return {number:issue.number,body,isOpen:true,revision:issue.revision+1,posted:true};
}
