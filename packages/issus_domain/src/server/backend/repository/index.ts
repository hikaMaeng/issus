import type {EventTransaction} from '../event-uow/index.js';
import {CoreError} from '../command-result/index.js';
import {authorizeRepo,type CorePrincipal} from '../authorization/index.js';
import {pendingLegacy,sinceCompactStats,compactDue,type IssueState,type CompactPurpose} from '../../../common/index.js';
export * from './reads.js';

export interface IssueRow {owner_id:string;repo_id:string;number:number;title:string;body:string;state:IssueState;owner_alias_id:string;is_open:boolean;reply_in:string|null;compact_comment_id:string|null;is_board:boolean;revision:number;updated_at:Date}
export interface AliasRow {id:string;owner_id:string;name:string;status:string;renamed_to:string|null;role:string;model:string;scope:string}
export interface CommentRow {id:string;owner_id:string;repo_id:string;issue_number:number;body:string;envelope:Record<string,string>;metadata:Record<string,unknown>;author_alias_id:string;author_session_id:string;posted_by_alias_id:string;created_at:Date;char_count:number;validity:'v2'|'noenv'}
export async function aliasByName(tx:EventTransaction,ownerId:string,name:string):Promise<AliasRow> {
  const a=(await tx.client.query<AliasRow>(`SELECT * FROM ${tx.table('alias')} WHERE owner_id=$1 AND folded_name=lower($2)`,[ownerId,name])).rows[0];
  if(!a) throw new CoreError(422,'RECIPIENT_UNKNOWN',[{code:'RECIPIENT_UNKNOWN',path:'alias',message:`등록되지 않은 별칭 ${name}`}]);
  if(a.status==='renamed') {const next=(await tx.client.query(`SELECT name FROM ${tx.table('alias')} WHERE id=$1`,[a.renamed_to])).rows[0];throw new CoreError(409,'ALIAS_RENAMED',undefined,{name:next?.name});}
  return a;
}
export async function issueById(tx:EventTransaction,p:CorePrincipal,repoId:string,n:number,lock=false):Promise<IssueRow> {
  await authorizeRepo(tx,p,repoId);
  const row=(await tx.client.query<IssueRow>(`SELECT * FROM ${tx.table('issue')} WHERE repo_id=$1 AND number=$2 ${lock?'FOR UPDATE':''}`,[repoId,n])).rows[0];
  if(!row) throw new CoreError(404,'NOT_FOUND');return row;
}
export async function commentsFor(tx:EventTransaction,repoId:string,n:number):Promise<CommentRow[]> {return (await tx.client.query<CommentRow>(`SELECT * FROM ${tx.table('comment')} WHERE repo_id=$1 AND issue_number=$2 ORDER BY id`,[repoId,n])).rows;}
/** Author names/sid describe the immutable original envelope, not a later registry rename. */
export function commentView(c:CommentRow):Record<string,unknown> {return {id:c.id,repoId:c.repo_id,issueNumber:c.issue_number,body:c.body,envelope:c.envelope,metadata:c.metadata,author:{ownerId:c.owner_id,aliasId:c.author_alias_id,alias:c.envelope.FROM?.split('/')[0]??'',sid:c.envelope.FROM?.split('/')[1]??'',sessionId:c.author_session_id},postedByAliasId:c.posted_by_alias_id,createdAt:c.created_at,charCount:c.char_count,validity:c.validity};}
export async function commentById(tx:EventTransaction,p:CorePrincipal,id:string):Promise<CommentRow> {
  const c=(await tx.client.query<CommentRow>(`SELECT * FROM ${tx.table('comment')} WHERE id=$1 AND owner_id=$2`,[id,p.ownerId])).rows[0];
  if(!c) throw new CoreError(422,'REFERENCE_UNKNOWN',[{code:'REFERENCE_UNKNOWN',path:'envelope.RE',message:`참조 댓글 없음 ${id}`}]);
  await authorizeRepo(tx,p,c.repo_id);return c;
}
export async function resolveIssueRef(tx:EventTransaction,p:CorePrincipal,repoId:string,ref:string):Promise<IssueRow> {
  const m=/^(?:(.+)\/(.+))?#(\d+)$/.exec(ref);if(!m) throw new CoreError(422,'ISSUE_REFERENCE');
  if(m[1]) {const r=(await tx.client.query(`SELECT r.id FROM ${tx.table('repo')} r JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE lower(o.name)=lower($1) AND r.slug=$2`,[m[1],m[2]])).rows[0];if(!r) throw new CoreError(404,'NOT_FOUND');repoId=r.id;}
  return issueById(tx,p,repoId,Number(m[3]));
}
export const refs=(value?:string):string[]=>value?value.split(','):[];
export function checkRevision(issue:IssueRow,revision:unknown):void {if(revision===undefined||revision===null) throw new CoreError(428,'IF_MATCH_REQUIRED');if(Number(revision)!==issue.revision) throw new CoreError(412,'REVISION_MISMATCH');}
export const issueChannel=(repoId:string,n:number):string=>`issue:${repoId}:${n}`;
/** Python protocol timestamps require an explicit numeric UTC offset and no fraction. */
export const envelopeTime=(now:Date):string=>now.toISOString().replace(/\.\d{3}Z$/,'+00:00');
/** Preserve every original line separator and byte after the protocol header. */
export function splitBodyHeader(body:string):{line:string;tail:string} {const boundary=/\r\n|[\n\v\f\r\x1c-\x1e\x85\u2028\u2029]/u.exec(body);return boundary?{line:body.slice(0,boundary.index),tail:body.slice(boundary.index)}:{line:body,tail:''};}
/** Rebuild the canonical first line, preserving the free body exactly after its first newline. */
export function rewriteBody(issue:IssueRow,changes:Partial<{state:IssueState;owner:string;compact:string;replyIn:string;board:string}>,now:Date):string {
  const header=splitBodyHeader(issue.body);const old=Object.fromEntries(header.line.split(/\s+/).map(t=>{const i=t.indexOf(':');return[t.slice(0,i),t.slice(i+1)];}));
  const e={...old,STATE:changes.state??old.STATE,OWNER:changes.owner??old.OWNER,UPDATED:envelopeTime(now),...(changes.compact?{COMPACT:changes.compact}:{}),...(changes.replyIn?{'REPLY-IN':changes.replyIn}:{}),...(changes.board?{BOARD:changes.board}:{})};
  const line=['STATE','OWNER','UPDATED','REPLY-IN','COMPACT','BOARD'].filter(k=>e[k as keyof typeof e]).map(k=>`${k}:${e[k as keyof typeof e]}`).join(' ');
  return line+header.tail;
}
export async function issueDiagnostics(tx:EventTransaction,issue:IssueRow,me:string[],purpose:CompactPurpose='routine'):Promise<Record<string,unknown>> {
  const comments=await commentsFor(tx,issue.repo_id,issue.number);const tail=comments.filter(c=>!issue.compact_comment_id||BigInt(c.id)>=BigInt(issue.compact_comment_id));
  const global=pendingLegacy(comments,me).map(c=>c.id),window=pendingLegacy(tail,me).map(c=>c.id);
  const ds=(await tx.client.query(`SELECT d.* FROM ${tx.table('directive')} d JOIN ${tx.table('comment')} c ON c.id=d.comment_id WHERE c.repo_id=$1 AND c.issue_number=$2 ORDER BY d.comment_id`,[issue.repo_id,issue.number])).rows;
  const ackState=ds.map(d=>({directiveId:d.comment_id,state:d.superseded_by?'superseded':d.applied_by_comment_id?'applied':d.acked_by_comment_id?'acked':'waiting',...(d.acked_by_comment_id?{ackCommentId:d.acked_by_comment_id}:{})}));
  const claims=(await tx.client.query(`SELECT comment_id FROM ${tx.table('claim')} WHERE repo_id=$1 AND issue_number=$2 AND released_by_comment_id IS NULL ORDER BY comment_id`,[issue.repo_id,issue.number])).rows.map(c=>c.comment_id);
  const stats=sinceCompactStats(comments,issue.compact_comment_id);return {stats,compact:{...stats,...compactDue(stats,issue.is_board,purpose),previousCompactId:issue.compact_comment_id},pendingLegacy:{window,global},windowPendingAck:window,globalPendingAck:global,ackState,activeHolds:ds.filter(d=>d.type==='HOLD'&&!d.hold_released_by).map(d=>d.comment_id),claims};
}
