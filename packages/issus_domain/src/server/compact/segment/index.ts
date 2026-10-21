import {compactDue,sinceCompactStats,type CompactPurpose,type CompactStatus,type CompactDueReason} from '../../../common/index.js';
import {applyProjection,commentsFor,CoreError,issueById,type CorePrincipal,type EventTransaction,type IssueRow,type ReactionCoordinates} from '../../backend/index.js';

/** Read native pointer statistics from immutable originals; no projection/token writes. */
export async function compactStatus(tx:EventTransaction,issue:IssueRow,purpose:CompactPurpose='routine'):Promise<CompactStatus> {
  const stats=sinceCompactStats(await commentsFor(tx,issue.repo_id,issue.number),issue.compact_comment_id);
  const owner=(await tx.client.query(`SELECT name FROM ${tx.table('alias')} WHERE id=$1 AND owner_id=$2`,[issue.owner_alias_id,issue.owner_id])).rows[0];
  if(!owner) throw new CoreError(404,'NOT_FOUND');
  return {...stats,...compactDue(stats,issue.is_board,purpose),previousCompactId:issue.compact_comment_id,owner:owner.name};
}

/** Follow P4's owner -> repo -> issue lock order before any compact projection write. */
export async function lockCompactIssue(tx:EventTransaction,ownerId:string,repoId:string,number:number):Promise<IssueRow> {
  await tx.client.query(`SELECT id FROM ${tx.table('owner')} WHERE id=$1 FOR UPDATE`,[ownerId]);
  await tx.client.query(`SELECT id FROM ${tx.table('repo')} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[repoId,ownerId]);
  const issue=(await tx.client.query<IssueRow>(`SELECT * FROM ${tx.table('issue')} WHERE owner_id=$1 AND repo_id=$2 AND number=$3 FOR UPDATE`,[ownerId,repoId,number])).rows[0];
  if(!issue) throw new CoreError(404,'NOT_FOUND');return issue;
}

/** Pointer-derived generation is stable under duplicate/out-of-order source reactions and rebuilds. */
export async function compactGeneration(tx:EventTransaction,issue:IssueRow,compactId=issue.compact_comment_id):Promise<number> {
  if(!compactId) return 0;
  const row=(await tx.client.query(`SELECT count(*)::integer AS generation FROM ${tx.table('comment')} WHERE repo_id=$1 AND issue_number=$2 AND id<=$3 AND validity='v2' AND envelope->>'TYPE'='COMPACT'`,[issue.repo_id,issue.number,compactId])).rows[0];
  return row.generation;
}

/** Caller holds the issue lock. Recompute originals; emit threshold once per native generation. */
export async function refreshCompactSegment(tx:EventTransaction,issue:IssueRow,purpose:CompactPurpose='routine'):Promise<CompactStatus> {
  const status=await compactStatus(tx,issue,purpose),history=await commentsFor(tx,issue.repo_id,issue.number),generation=await compactGeneration(tx,issue);
  const old=(await tx.client.query(`SELECT * FROM ${tx.table('compact_segment')} WHERE repo_id=$1 AND issue_number=$2`,[issue.repo_id,issue.number])).rows[0];
  let fired:CompactDueReason[]=old?.previous_compact_id===issue.compact_comment_id?old.due_reasons:[];
  if(!old||old.previous_compact_id!==issue.compact_comment_id) {
    const emitted=(await tx.client.query(`SELECT payload->'reasons' AS reasons FROM event_store WHERE action='issus.compact.due' AND payload->>'ownerId'=$1 AND payload->'issue'->>'repoId'=$2 AND payload->'issue'->>'issueNumber'=$3 AND payload->>'generation'=$4`,[issue.owner_id,issue.repo_id,String(issue.number),String(generation)])).rows;
    fired=[...new Set(emitted.flatMap(r=>r.reasons as CompactDueReason[]))];
  }
  const thresholdFired=fired.some(r=>r==='comments'||r==='chars');
  const fresh=status.reasons.filter(r=>!fired.includes(r)&&(!['comments','chars'].includes(r)||!thresholdFired));
  const recorded=[...new Set([...fired,...status.reasons])];
  await tx.client.query(`INSERT INTO ${tx.table('compact_segment')}(owner_id,repo_id,issue_number,previous_compact_id,through_id,count,chars,due_reasons,generation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(repo_id,issue_number) DO UPDATE SET previous_compact_id=EXCLUDED.previous_compact_id,through_id=EXCLUDED.through_id,count=EXCLUDED.count,chars=EXCLUDED.chars,due_reasons=EXCLUDED.due_reasons,generation=EXCLUDED.generation`,[issue.owner_id,issue.repo_id,issue.number,issue.compact_comment_id,history.at(-1)?.id??null,status.count,status.chars,recorded,generation]);
  if(fresh.length) tx.fact('issus.compact.due','internal:compact',{ownerId:issue.owner_id,issue:{repoId:issue.repo_id,issueNumber:issue.number},ownerAliasId:issue.owner_alias_id,...(issue.compact_comment_id?{previousCompactId:issue.compact_comment_id}:{}),count:status.count,chars:status.chars,reasons:fresh,generation},`compact-due:${issue.repo_id}:${issue.number}:${generation}:${fresh.join(',')}`,'worker');
  return status;
}

/** P5 compact queue handler. Source verification/dedupe and the generation fact share the UoW. */
export async function applyCompactReaction(tx:EventTransaction,input:ReactionCoordinates):Promise<boolean> {
  if(!['issus.comment.posted','issus.compact.posted'].includes(input.action)) throw new CoreError(422,'COMPACT_REACTION_ACTION');
  return applyProjection(tx,'compact.segment.v1',input,input.payload.ownerId,async fact=>{
    const {repoId,issueNumber}=fact.payload;
    if(typeof repoId!=='string'||typeof issueNumber!=='number') throw new CoreError(422,'REACTION_SOURCE_INVALID');
    const issue=await lockCompactIssue(tx,input.payload.ownerId,repoId,issueNumber);
    await refreshCompactSegment(tx,issue);
  });
}

/** Read status with the same authorization as issue history. */
export async function readCompactStatus(tx:EventTransaction,p:CorePrincipal,repoId:string,number:number):Promise<CompactStatus> {
  return compactStatus(tx,await issueById(tx,p,repoId,number));
}
