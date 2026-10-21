import {CoreError,commentsFor,type CompactPublication} from '../../backend/index.js';
import {compactGeneration} from '../segment/index.js';
import {compactPacketHash,type PacketSnapshot} from '../packet/index.js';

/** P4 calls after immutable insertion and before pointer/facts; failures roll back its entire UoW. */
export const compactPublication:CompactPublication=async(tx,{issue,comment,packet,metadata})=>{
  const snapshot=packet.snapshot as PacketSnapshot|undefined;
  if(!snapshot||snapshot.ownerAliasId!==issue.owner_alias_id||snapshot.repoId!==issue.repo_id||snapshot.issueNumber!==issue.number||compactPacketHash(snapshot)!==packet.packet_hash) throw new CoreError(409,'COMPACT_STALE');
  const evidence=snapshot.packet;
  if(evidence.previousCompactId!==issue.compact_comment_id||evidence.throughId!==metadata.throughId||evidence.snapshotRevision!==issue.revision||metadata.packetHash!==packet.packet_hash||metadata.compactPacketId!==packet.id) throw new CoreError(409,'COMPACT_STALE');
  const history=await commentsFor(tx,issue.repo_id,issue.number),covered=history.filter(c=>c.id!==comment.id&&(!issue.compact_comment_id||BigInt(c.id)>BigInt(issue.compact_comment_id)));
  if((history.filter(c=>c.id!==comment.id).at(-1)?.id??'0')!==evidence.throughId||covered.length!==evidence.count||covered.some((c,i)=>c.id!==evidence.comments[i]?.id)) throw new CoreError(409,'COMPACT_STALE');
  const generation=await compactGeneration(tx,issue,comment.id);
  await tx.client.query(`INSERT INTO ${tx.table('compact_segment')}(owner_id,repo_id,issue_number,previous_compact_id,through_id,count,chars,due_reasons,generation) VALUES($1,$2,$3,$4,$4,0,0,'{}',$5) ON CONFLICT(repo_id,issue_number) DO UPDATE SET previous_compact_id=EXCLUDED.previous_compact_id,through_id=EXCLUDED.through_id,count=0,chars=0,due_reasons='{}',generation=EXCLUDED.generation`,[issue.owner_id,issue.repo_id,issue.number,comment.id,generation]);
};
