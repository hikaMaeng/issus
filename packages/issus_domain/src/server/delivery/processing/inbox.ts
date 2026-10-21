import {randomUUID} from 'node:crypto';
import {classify,header,normalizeMe,pendingLegacy,sinceCompactStats,compactDue,type InboxItem,type InboxResponse,type InboxBootstrap,type CompactBoundary,type AckStateView,type ClaimView,type HandoffView} from '../../../common/index.js';
import {CoreError,requestHash,authorizePrincipal,authorizeRepo,aliasByName,issueById,commentsFor,resolveIssueRef,type CorePrincipal,type EventTransaction,type EventUnitOfWork,type IssueRow,type CommentRow} from '../../backend/index.js';
import {aliasChannel,deliveryView,lockDeliveryOwner,type DeliveryRow} from '../receipt/model.js';
import {receiveDeliveries} from '../receipt/index.js';
import {processedCursor} from './index.js';

export interface InboxQuery {repo?:unknown;issues?:unknown;board?:unknown;me?:unknown;mine?:unknown;sinceCompact?:unknown;cursor?:unknown;limit?:unknown}
interface Scope {issues:IssueRow[];me:string[];sinceCompact:boolean;hash:string}
interface Bound {issues:InboxBootstrap['issues'];ordinal:string;sequence:string}
interface HistoryMetadata {revision:number;stats:ReturnType<typeof sinceCompactStats>;compactStatus:Record<string,unknown>}
interface Snapshot {kind:'inbox-page'|'inbox-refresh';bound:Bound;response:InboxResponse;index:number;historyMetadata:Record<string,HistoryMetadata>}
const values=(v:unknown):string[]=>v===undefined?[]:(Array.isArray(v)?v:[v]).flatMap(x=>String(x).split(',')).filter(Boolean);
const expiry=(tx:EventTransaction)=>new Date(tx.now.getTime()+30*86400000);
const inScope=(r:{repo_id:string;issue_number:number},issues:IssueRow[])=>issues.some(i=>i.repo_id===r.repo_id&&i.number===r.issue_number);

/** One snapshot builder for first pull, refresh, subscriptions and issue history. */
export class InboxService {
 constructor(readonly uow:EventUnitOfWork) {}
 async scope(tx:EventTransaction,p:CorePrincipal,q:InboxQuery,includeBoards=true):Promise<Scope> {
  await authorizePrincipal(tx,p);
  const ref=/^([^/]+)\/([^/]+)$/.exec(String(q.repo??''));if(!ref) throw new CoreError(400,'REPO_REQUIRED');
  const repo=(await tx.client.query(`SELECT r.id FROM ${tx.table('repo')} r JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE lower(o.name)=lower($1) AND r.slug=$2 AND r.owner_id=$3`,[ref[1],ref[2],p.ownerId])).rows[0];
  if(!repo) throw new CoreError(404,'NOT_FOUND');await authorizeRepo(tx,p,repo.id);
  const selected=values(q.issues);if(!selected.length||selected.length>100||selected.some(n=>!/^\d+$/.test(n)||Number(n)<1||!Number.isSafeInteger(Number(n)))) throw new CoreError(400,'ISSUES_REQUIRED');
  const issues:IssueRow[]=[];
  const add=(i:IssueRow)=>{if(!issues.some(x=>x.repo_id===i.repo_id&&x.number===i.number)) issues.push(i);};
  for(const n of selected) add(await issueById(tx,p,repo.id,Number(n)));
  if(includeBoards) for(const ref of values(q.board)) add(await resolveIssueRef(tx,p,repo.id,ref.startsWith('#')||ref.includes('#')?ref:`#${ref}`));
  for(let index=0;includeBoards&&index<issues.length;index++) {
   if(issues.length>100) throw new CoreError(400,'SCOPE_TOO_LARGE');
   const board=/(?:^|\s)BOARD:(\S+)/.exec(issues[index].body.split(/\r?\n/)[0])?.[1];if(board) add(await resolveIssueRef(tx,p,issues[index].repo_id,board));
  }
  issues.sort((a,b)=>a.repo_id.localeCompare(b.repo_id)||a.number-b.number);
  const mine=q.mine===undefined?[]:(Array.isArray(q.mine)?q.mine:[q.mine]).map(String);
  const explicit=normalizeMe(values(q.me),mine),me=[...new Set(explicit.length?explicit:p.kind==='session'?[p.alias.toLowerCase()]:[])].sort();
  for(const name of me) {const a=await aliasByName(tx,p.ownerId,name);for(const i of issues) if(!(await tx.client.query(`SELECT 1 FROM ${tx.table('alias_repo')} WHERE alias_id=$1 AND repo_id=$2`,[a.id,i.repo_id])).rowCount&&p.kind!=='bootstrap') throw new CoreError(403,'ME_SCOPE_FORBIDDEN');}
  if(q.sinceCompact!==undefined&&!['true','false'].includes(String(q.sinceCompact))) throw new CoreError(400,'INVALID_PAGINATION');
  const sinceCompact=String(q.sinceCompact)!=='false';
  return {issues,me,sinceCompact,hash:requestHash('p5-inbox',{principal:p.id,ownerId:p.ownerId,...(p.kind==='session'?{aliasId:p.aliasId,sid:p.sid}:{}),issues:issues.map(i=>[i.repo_id,i.number]),me,sinceCompact})};
 }
 private async load(tx:EventTransaction,p:CorePrincipal,scope:Scope,token:unknown):Promise<Snapshot> {
  if(typeof token!=='string'||!/^[0-9a-f-]{36}$/i.test(token)) throw new CoreError(409,'CURSOR_SCOPE_MISMATCH');
  const row=(await tx.client.query(`SELECT * FROM ${tx.table('history_snapshot')} WHERE id=$1`,[token])).rows[0];
  if(!row||new Date(row.expires_at).getTime()<=tx.now.getTime()) throw new CoreError(410,'CURSOR_EXPIRED');
  if(row.principal_id!==p.id||row.scope_hash!==scope.hash||!['inbox-page','inbox-refresh'].includes(row.snapshot.kind)) throw new CoreError(409,'CURSOR_SCOPE_MISMATCH');
  return row.snapshot as Snapshot;
 }
 private async save(tx:EventTransaction,p:CorePrincipal,scope:Scope,snapshot:Snapshot):Promise<string> {
  const id=randomUUID();await tx.client.query(`INSERT INTO ${tx.table('history_snapshot')}(id,principal_id,scope_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5)`,[id,p.id,scope.hash,snapshot,expiry(tx)]);return id;
 }
 /** No cursor row is mutated. Pagination stores frozen values rather than keeping a DB transaction open. */
 async read(p:CorePrincipal,q:InboxQuery):Promise<InboxResponse> {
  const limit=q.limit===undefined?100:Number(q.limit);if(!Number.isSafeInteger(limit)||limit<1||limit>500) throw new CoreError(400,'INVALID_PAGINATION');
  return this.uow.snapshot(tx=>this.readOn(tx,p,q,limit));
 }
 /** Public transaction variant keeps P4's history router on the same snapshot boundary. */
 async readOn(tx:EventTransaction,p:CorePrincipal,q:InboxQuery,limit=q.limit===undefined?100:Number(q.limit)):Promise<InboxResponse> {
   return (await this.pageOn(tx,p,q,limit)).response;
 }
 private async pageOn(tx:EventTransaction,p:CorePrincipal,q:InboxQuery,limit:number,includeBoards=true):Promise<{response:InboxResponse;historyMetadata:Record<string,HistoryMetadata>}> {
   if(!Number.isSafeInteger(limit)||limit<1||limit>500) throw new CoreError(400,'INVALID_PAGINATION');
   await lockDeliveryOwner(tx,p.ownerId);const scope=await this.scope(tx,p,q,includeBoards);
   let snapshot=q.cursor?await this.load(tx,p,scope,q.cursor):undefined;
   if(!snapshot||snapshot.kind==='inbox-refresh') snapshot=await this.build(tx,p,scope,snapshot?.bound);
   const index=snapshot.index,items=snapshot.response.items.slice(index,index+limit),complete=index+limit>=snapshot.response.items.length;
   const nextCursor=complete?null:await this.save(tx,p,scope,{...snapshot,index:index+limit});
   const refreshCursor=complete?await this.save(tx,p,scope,{...snapshot,kind:'inbox-refresh',index:0,response:{...snapshot.response,items:[]}}):null;
   if(p.kind==='session') {
    const ids=items.flatMap(i=>i.delivery?[i.delivery]:[]);
    if(ids.length) await receiveDeliveries(tx,p,{deliveryIds:ids.map(d=>d.id),attempts:ids.map(d=>d.attempt)},'http');
   }
   return {response:{...snapshot.response,items,bootstrap:{...snapshot.response.bootstrap,complete},nextCursor,refreshCursor,processedCursor:await processedCursor(tx,p)},historyMetadata:snapshot.historyMetadata};
 }
 /** Bootstrap generation is read-only except opaque cursor persistence performed by the caller. */
 async build(tx:EventTransaction,p:CorePrincipal,scope:Scope,previous?:Bound):Promise<Snapshot> {
  const histories=new Map<string,CommentRow[]>(),boundaries:InboxBootstrap['issues']=[],compact:CompactBoundary[]=[],historyMetadata:Record<string,HistoryMetadata>={};
  const pendingWindow:string[]=[],pendingGlobal:string[]=[],activeHolds:string[]=[],ackState:AckStateView[]=[],claims:ClaimView[]=[],handoffs:HandoffView[]=[],footers:string[]=[];
  const own=p.kind==='session'?p.aliasId:undefined,channel=own?aliasChannel(p.ownerId,own):undefined;
  const clock=own?(await tx.client.query(`SELECT last_ordinal FROM ${tx.table('inbox_clock')} WHERE alias_id=$1`,[own])).rows[0]:undefined;
  const sequence=channel?(await tx.client.query(`SELECT COALESCE(max(sequence),0)::text AS sequence FROM event_store WHERE channel=$1 AND audience='client'`,[channel])).rows[0].sequence:'0';
  const bound:Bound={issues:boundaries,ordinal:String(clock?.last_ordinal??'0'),sequence};
  for(const issue of scope.issues) {
   const history=await commentsFor(tx,issue.repo_id,issue.number),key=`${issue.repo_id}:${issue.number}`;histories.set(key,history);
   const stats=sinceCompactStats(history,issue.compact_comment_id);historyMetadata[key]={revision:issue.revision,stats,compactStatus:{...stats,...compactDue(stats,issue.is_board),previousCompactId:issue.compact_comment_id}};
   const c=history.find(c=>c.id===issue.compact_comment_id)??null;
   compact.push({repoId:issue.repo_id,issueNumber:issue.number,comment:c?{id:c.id,body:c.body,envelope:c.envelope}:null});
   const water=(await tx.client.query(`SELECT stream_id,max(sequence)::text AS sequence FROM event_store WHERE channel=$1 AND audience='client' GROUP BY stream_id`,[`issue:${issue.repo_id}:${issue.number}`])).rows;
   boundaries.push({repoId:issue.repo_id,issueNumber:issue.number,compactId:c?.id??null,throughCommentId:history.at(-1)?.id??'0',eventHighWater:Object.fromEntries(water.map(r=>[r.stream_id,r.sequence]))});
   const window=scope.sinceCompact&&c?history.filter(r=>BigInt(r.id)>=BigInt(c.id)):history;
   pendingWindow.push(...pendingLegacy(window,scope.me).map(c=>c.id));pendingGlobal.push(...pendingLegacy(history,scope.me).map(c=>c.id));
   const directives=(await tx.client.query(`SELECT d.*,v.id AS delivery_id,v.state AS delivery_state FROM ${tx.table('directive')} d JOIN ${tx.table('comment')} c ON c.id=d.comment_id LEFT JOIN ${tx.table('delivery')} v ON v.comment_id=d.comment_id AND v.recipient_alias_id=d.recipient_alias_id WHERE c.repo_id=$1 AND c.issue_number=$2 AND d.recipient_alias_id=$3 ORDER BY d.comment_id`,[issue.repo_id,issue.number,own??null])).rows;
   for(const d of directives) {
    ackState.push({directiveId:d.comment_id,state:d.applied_by_comment_id?'applied':d.acked_by_comment_id?'acked':d.superseded_by?'superseded':'waiting',...(d.acked_by_comment_id?{ackCommentId:d.acked_by_comment_id}:{}),...(d.applied_by_comment_id?{appliedByCommentId:d.applied_by_comment_id}:{}),...(d.superseded_by?{supersededBy:d.superseded_by}:{})});
    if(d.type==='HOLD'&&!d.hold_released_by) activeHolds.push(d.comment_id);
   }
   const cs=(await tx.client.query(`SELECT * FROM ${tx.table('claim')} WHERE repo_id=$1 AND issue_number=$2 AND released_by_comment_id IS NULL ORDER BY comment_id`,[issue.repo_id,issue.number])).rows;
   for(const c of cs) claims.push({commentId:c.comment_id,aliasId:c.alias_id,issue:{repoId:issue.repo_id,issueNumber:issue.number},dueAt:new Date(c.due_at).toISOString()});
   const hs=(await tx.client.query(`SELECT * FROM ${tx.table('handoff')} WHERE source_repo_id=$1 AND source_issue_number=$2 AND status<>'completed' ORDER BY comment_id`,[issue.repo_id,issue.number])).rows;
   for(const h of hs) handoffs.push({commentId:h.comment_id,sourceIssue:{repoId:h.source_repo_id,issueNumber:h.source_issue_number},targetIssue:{repoId:h.target_repo_id,issueNumber:h.target_issue_number},recipientAliasId:h.recipient_alias_id,status:h.status,...(h.acked_by?{ackedBy:h.acked_by}:{})} as HandoffView);
   footers.push(`${issue.repo_id}#${issue.number} state=${issue.state} compact=${c?.id??'-'} through=${history.at(-1)?.id??'0'}`);
  }
  // A changed COMPACT or issue-set begins a new bootstrap instead of truncating a previous snapshot.
  const incremental=!!previous&&boundaries.length===previous.issues.length&&boundaries.every(b=>previous.issues.some(o=>o.repoId===b.repoId&&o.issueNumber===b.issueNumber&&o.compactId===b.compactId));
  const items=new Map<string,InboxItem>();
  for(const issue of scope.issues) {
   const history=histories.get(`${issue.repo_id}:${issue.number}`)!,old=previous?.issues.find(o=>o.repoId===issue.repo_id&&o.issueNumber===issue.number);
   for(const c of history) {
    const h=header(c.body);if(scope.me.includes(h._from)||c.id===issue.compact_comment_id) continue;
    if(incremental) {if(BigInt(c.id)<=BigInt(old!.throughCommentId)) continue;}
    else if(scope.sinceCompact&&issue.compact_comment_id&&BigInt(c.id)<BigInt(issue.compact_comment_id)) continue;
    const source=(await tx.client.query(`SELECT event_id,stream_id,sequence FROM event_store WHERE action='issus.comment.posted' AND payload->>'ownerId'=$1 AND payload->>'commentId'=$2 ORDER BY sequence LIMIT 1`,[p.ownerId,c.id])).rows[0];if(!source) throw new Error('canonical comment source coordinates missing');
    const priority=classify(h,c.body,scope.me);
    items.set(`comment:${c.id}`,{viewKey:`comment:${c.id}`,commentId:c.id,sourceEventId:source.event_id,sourceStreamId:source.stream_id,sourceSequence:String(source.sequence),origin:'history',priority,content:{body:priority==='OTHER'?h._first:c.body,envelope:c.envelope}});
   }
  }
  const deliveries=own?(await tx.client.query<DeliveryRow & {processed:boolean}>(`SELECT d.*,p.delivery_id IS NOT NULL AS processed FROM ${tx.table('delivery')} d LEFT JOIN ${tx.table('processed')} p ON p.alias_id=d.recipient_alias_id AND p.delivery_id=d.id WHERE d.recipient_alias_id=$1 AND d.ordinal<=$2 ORDER BY d.ordinal`,[own,bound.ordinal])).rows:[];
  for(const d of deliveries) {
   let comment:CommentRow|undefined;
   if(d.comment_id) comment=[...histories.values()].flat().find(c=>c.id===d.comment_id);
   else {
    const source=(await tx.client.query(`SELECT payload FROM event_store WHERE event_id=$1`,[d.source_event_id])).rows[0]?.payload??{};
    let r={repo_id:source.repoId??source.issue?.repoId,issue_number:source.issueNumber??source.issue?.issueNumber};
    if(source.directiveId) {const c=(await tx.client.query(`SELECT repo_id,issue_number FROM ${tx.table('comment')} WHERE id=$1`,[source.directiveId])).rows[0];if(c) r=c;}
    if(!inScope(r,scope.issues)) continue;
   }
   if(d.comment_id&&!comment) continue;
   if(comment&&scope.me.includes(header(comment.body)._from)) continue;
   if(incremental) {if(BigInt(d.ordinal)<=BigInt(previous!.ordinal)&&BigInt(d.alias_event_sequence)<=BigInt(previous!.sequence)) continue;}
   else if(d.processed&&!items.has(`comment:${d.comment_id}`)&&!activeHolds.includes(d.comment_id??'')&&!ackState.some(a=>a.directiveId===d.comment_id&&a.state==='waiting')) continue;
   if(compact.some(c=>c.comment?.id===d.comment_id)) continue;
   const key=d.comment_id?`comment:${d.comment_id}`:`fact:${d.source_event_id}`,existing=items.get(key);
   if(existing&&(existing.sourceEventId!==d.source_event_id||existing.sourceStreamId!==d.source_stream_id||existing.sourceSequence!==String(d.source_sequence))) throw new Error('inbox canonical provenance mismatch');
   const priority=comment?classify(header(comment.body),comment.body,scope.me):d.classification;
   items.set(key,{viewKey:key,...(d.comment_id?{commentId:d.comment_id}:{}),sourceEventId:d.source_event_id,sourceStreamId:d.source_stream_id,sourceSequence:String(d.source_sequence),origin:existing?'merged':'inbox',priority,content:comment?{body:priority==='OTHER'?header(comment.body)._first:comment.body,envelope:comment.envelope}:d.content,delivery:deliveryView(d)});
  }
  const snapshotId=randomUUID();
  const response:InboxResponse={bootstrap:{mode:incremental?'incremental':'snapshot',snapshotId,meAliases:scope.me,complete:false,issues:boundaries,inboxThroughOrdinal:bound.ordinal,inboxThroughEventSequence:bound.sequence},compact,items:[...items.values()],nextCursor:null,refreshCursor:null,processedCursor:null,pendingLegacy:{window:pendingWindow,global:pendingGlobal},windowPendingAck:pendingWindow,globalPendingAck:pendingGlobal,ackState,activeHolds,claims,handoffs,footers};
  return JSON.parse(JSON.stringify({kind:'inbox-page',bound,response,index:0,historyMetadata})) as Snapshot;
 }
 /** Single-issue canonical shape for P1 to inject into P4's history route. */
 async history(tx:EventTransaction,p:CorePrincipal,repoId:string,number:number,q:Record<string,unknown>):Promise<Record<string,unknown>> {
  const repo=(await tx.client.query(`SELECT r.slug,o.name FROM ${tx.table('repo')} r JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE r.id=$1`,[repoId])).rows[0];
  const {response,historyMetadata}=await this.pageOn(tx,p,{...q,repo:`${repo.name}/${repo.slug}`,issues:[number]},q.limit===undefined?100:Number(q.limit),false),meta=historyMetadata[`${repoId}:${number}`];
  const boundary=response.bootstrap.issues.find(i=>i.repoId===repoId&&i.issueNumber===number)!;
  return {...response,compact:response.compact.find(c=>c.repoId===repoId&&c.issueNumber===number)?.comment??null,snapshot:{highWater:boundary.throughCommentId,revision:meta.revision,eventHighWater:boundary.eventHighWater},stats:meta.stats,compactStatus:meta.compactStatus,
   items:response.items.filter(i=>i.commentId).map(i=>({...i,id:i.commentId,body:i.content.body,envelope:i.content.envelope}))};
 }
}
