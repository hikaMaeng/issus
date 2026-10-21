import {CoreError,issueById,commentById,refs,requireOwner,checkRevision,rewriteBody,issueChannel,actorOf,type CorePrincipal,type EventTransaction} from '../../backend/index.js';

export async function loadHandoff(tx:EventTransaction,p:CorePrincipal,id:string):Promise<Record<string,any>> {
  const h=(await tx.client.query(`SELECT * FROM ${tx.table('handoff')} WHERE comment_id=$1 AND owner_id=$2 FOR UPDATE`,[id,p.ownerId])).rows[0];if(!h) throw new CoreError(404,'NOT_FOUND');
  const pairs=[{repoId:h.source_repo_id,n:h.source_issue_number},{repoId:h.target_repo_id,n:h.target_issue_number}].sort((a,b)=>a.repoId.localeCompare(b.repoId)||a.n-b.n);
  for(const pair of pairs) await issueById(tx,p,pair.repoId,pair.n,true);return h;
}
/** Receipt ACK and explicit acceptance are separate; dissent ACK alone leaves pending. */
export async function acceptHandoff(tx:EventTransaction,p:CorePrincipal,input:{handoffId:string;ackCommentId:string}):Promise<Record<string,unknown>> {
  const h=await loadHandoff(tx,p,input.handoffId);
  if(p.kind!=='session'||p.aliasId!==h.recipient_alias_id) throw new CoreError(403,'FORBIDDEN');
  const ack=await commentById(tx,p,input.ackCommentId);
  if(ack.envelope.TYPE!=='ACK'||ack.author_alias_id!==p.aliasId||ack.posted_by_alias_id!==p.aliasId||ack.envelope.FROM.includes('/by-')||!refs(ack.envelope.RE).includes(input.handoffId)||!((ack.repo_id===h.source_repo_id&&ack.issue_number===h.source_issue_number)||(ack.repo_id===h.target_repo_id&&ack.issue_number===h.target_issue_number))) throw new CoreError(422,'HANDOFF_ACK_INVALID');
  if(h.status!=='pending') throw new CoreError(409,'HANDOFF_STATE');
  await tx.client.query(`UPDATE ${tx.table('handoff')} SET status='accepted',acked_by=$2 WHERE comment_id=$1`,[input.handoffId,input.ackCommentId]);
  const source=await issueById(tx,p,h.source_repo_id,h.source_issue_number);await tx.client.query(`UPDATE ${tx.table('issue')} SET revision=revision+1,updated_at=$3 WHERE repo_id=$1 AND number=$2`,[source.repo_id,source.number,tx.now]);
  tx.fact('issus.handoff.accepted',issueChannel(source.repo_id,source.number),{ownerId:p.ownerId,repoId:source.repo_id,issueNumber:source.number,revision:source.revision+1,handoffId:input.handoffId,ackCommentId:input.ackCommentId,targetIssue:{repoId:h.target_repo_id,issueNumber:h.target_issue_number},newOwnerAliasId:h.recipient_alias_id});
  return {handoffId:input.handoffId,status:'accepted',revision:source.revision+1,posted:true};
}
export async function completeHandoff(tx:EventTransaction,p:CorePrincipal,input:{handoffId:string;expectedRevision:number}):Promise<Record<string,unknown>> {
  const h=await loadHandoff(tx,p,input.handoffId);const source=await issueById(tx,p,h.source_repo_id,h.source_issue_number);
  await requireOwner(tx,p,source.owner_alias_id);checkRevision(source,input.expectedRevision);
  if(h.status!=='accepted'||!h.acked_by) throw new CoreError(409,'HANDOFF_PENDING');
  const same=h.source_repo_id===h.target_repo_id&&h.source_issue_number===h.target_issue_number;
  const target=await issueById(tx,p,h.target_repo_id,h.target_issue_number);if(!target.is_open) throw new CoreError(409,'ISSUE_CLOSED');
  const newOwner=(await tx.client.query(`SELECT name FROM ${tx.table('alias')} WHERE id=$1`,[h.recipient_alias_id])).rows[0].name;
  const targetRepo=(await tx.client.query(`SELECT o.name AS owner,r.slug FROM ${tx.table('repo')} r JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE r.id=$1`,[target.repo_id])).rows[0];
  const replyIn=target.repo_id===source.repo_id?`#${target.number}`:`${targetRepo.owner}/${targetRepo.slug}#${target.number}`;
  const body=rewriteBody(source,same?{owner:newOwner}:{state:'cancelled',replyIn},tx.now);
  await tx.client.query(`UPDATE ${tx.table('issue')} SET body=$3,state=$4,owner_alias_id=$5,reply_in=$6,revision=revision+1,updated_at=$7 WHERE repo_id=$1 AND number=$2`,[source.repo_id,source.number,body,same?source.state:'cancelled',same?h.recipient_alias_id:source.owner_alias_id,same?source.reply_in:replyIn,tx.now]);
  await tx.client.query(`UPDATE ${tx.table('handoff')} SET status='completed' WHERE comment_id=$1`,[input.handoffId]);
  tx.fact('issus.issue.handed-off',issueChannel(source.repo_id,source.number),{ownerId:p.ownerId,repoId:source.repo_id,issueNumber:source.number,revision:source.revision+1,handoffId:input.handoffId,ackCommentId:h.acked_by,sourceIssue:{repoId:source.repo_id,issueNumber:source.number},targetIssue:{repoId:target.repo_id,issueNumber:target.number},oldOwner:source.owner_alias_id,newOwner:h.recipient_alias_id,body});
  return {handoffId:input.handoffId,status:'completed',body,revision:source.revision+1,posted:true};
}
