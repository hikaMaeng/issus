import {randomBytes,randomUUID} from 'node:crypto';
import {parseIssueBodyEnvelope,sinceCompactStats,splitlines,type CompactPacket,type AckStateView} from '../../../common/index.js';
import {authorizePrincipal,requireOwner,issueById,issueDiagnostics,commentsFor,issueChannel,requestHash,sha256,CoreError,type CorePrincipal,type EventTransaction,type IssueRow} from '../../backend/index.js';
import {renderCompactPacket,maskPacketValue} from './render.js';
export * from './render.js';

export const COMPACT_PACKET_TTL_MS=24*60*60*1000;
export interface PacketSnapshot {ownerAliasId:string;repoId:string;issueNumber:number;packet:Omit<CompactPacket,'packetToken'|'packetHash'>}
/** Canonical hash survives JSONB object-key reordering and includes issue/OWNER snapshot bindings. */
export const compactPacketHash=(snapshot:PacketSnapshot):string=>requestHash('compact.packet.snapshot.v1',snapshot);
/** Random command/packet UUIDs reconstruct a prepare reply without storing its raw opaque token. */
export const preparedPacketToken=(operationId:string,packetId:string):string=>requestHash('compact.prepare.packet-token.v1',{operationId,packetId});

/** Body/ownership/handoff changes are included even when no comment was appended. */
export async function controlFactsSinceCompact(tx:EventTransaction,issue:IssueRow):Promise<CompactPacket['controlFactsSinceCompact']> {
  const previous=issue.compact_comment_id?(await commentsFor(tx,issue.repo_id,issue.number)).find(c=>c.id===issue.compact_comment_id):undefined;
  const revision=previous?Number(previous.metadata.snapshotRevision)+1:1;
  const rows=(await tx.client.query(`SELECT event_id,action,created_at,payload FROM event_store WHERE stream_id=$1 AND payload->>'ownerId'=$2 AND ((action=ANY($3::text[]) AND (payload->>'revision')::integer>$4) OR (action='issus.comment.posted' AND payload->'metadata' ? 'compactDeferredReason' AND (payload->>'commentId')::bigint>$5)) ORDER BY sequence`,[`channel:${issueChannel(issue.repo_id,issue.number)}`,issue.owner_id,['issus.issue.body.edited','issus.handoff.accepted','issus.issue.handed-off','issus.issue.closed','issus.issue.reopened'],revision,issue.compact_comment_id??'0'])).rows;
  return rows.map(r=>({eventId:r.event_id,action:r.action,createdAt:new Date(r.created_at).toISOString(),changes:r.payload}));
}

/** Caller uses a REPEATABLE READ writable snapshot; only token hashes and masked content persist. */
export async function issueCompactPacket(tx:EventTransaction,p:CorePrincipal,repoId:string,number:number,operationId?:string):Promise<CompactPacket|null> {
  await authorizePrincipal(tx,p);const issue=await issueById(tx,p,repoId,number);await requireOwner(tx,p,issue.owner_alias_id);
  const history=await commentsFor(tx,repoId,number),previous=history.find(c=>c.id===issue.compact_comment_id)??null;
  if(issue.compact_comment_id&&(!previous||previous.validity!=='v2'||previous.envelope.TYPE!=='COMPACT')) throw new CoreError(409,'COMPACT_POINTER_INVALID');
  const tail=history.filter(c=>!issue.compact_comment_id||BigInt(c.id)>BigInt(issue.compact_comment_id));
  const controls=await controlFactsSinceCompact(tx,issue);
  if(!tail.length&&!controls.length) return null;
  const owner=(await tx.client.query(`SELECT a.name,r.slug,o.name AS owner FROM ${tx.table('alias')} a JOIN ${tx.table('repo')} r ON r.id=$1 JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE a.id=$2`,[repoId,issue.owner_alias_id])).rows[0];
  const diagnostics=await issueDiagnostics(tx,issue,[owner.name.toLowerCase()]);
  const handoffs=(await tx.client.query(`SELECT comment_id FROM ${tx.table('handoff')} WHERE (source_repo_id=$1 AND source_issue_number=$2 OR target_repo_id=$1 AND target_issue_number=$2) AND status<>'completed' ORDER BY comment_id`,[repoId,number])).rows.map(r=>r.comment_id as string);
  const pendingAppendix:CompactPacket['pendingAppendix']={pendingLegacy:diagnostics.pendingLegacy as CompactPacket['pendingAppendix']['pendingLegacy'],ackState:diagnostics.ackState as AckStateView[],activeHolds:diagnostics.activeHolds as string[],claims:diagnostics.claims as string[],handoffs};
  const throughId=history.at(-1)?.id??'0';
  const suggestedEnvelope=`FROM:${owner.name}/<sid> TO:ALL TYPE:COMPACT${previous?` RE:${previous.id}`:''} SEEN:${throughId}`;
  const rendered=renderCompactPacket({repo:`${owner.owner}/${owner.slug}`,issue,previous,tail,now:tx.now,pendingAppendix,controlFactsSinceCompact:controls});
  const packet:PacketSnapshot['packet']=maskPacketValue({...sinceCompactStats(history,issue.compact_comment_id),bodyLine1:splitlines(issue.body)[0]??'',previousCompact:previous?{id:previous.id,body:previous.body}:null,comments:tail.map(c=>({id:c.id,createdAt:c.created_at.toISOString(),envelope:c.envelope,body:c.body})),suggestedEnvelope,throughId,previousCompactId:issue.compact_comment_id,snapshotRevision:issue.revision,pendingAppendix,controlFactsSinceCompact:controls,...rendered});
  // rendered markdown is already masked exactly once; retain its count and bytes.
  Object.assign(packet,rendered);
  const snapshot:PacketSnapshot={ownerAliasId:issue.owner_alias_id,repoId,issueNumber:number,packet};
  const hash=compactPacketHash(snapshot),packetId=randomUUID(),token=operationId?preparedPacketToken(operationId,packetId):randomBytes(32).toString('base64url');
  await tx.client.query(`INSERT INTO ${tx.table('compact_packet')}(id,owner_id,repo_id,issue_number,previous_compact_id,through_id,snapshot_revision,packet_hash,token_hash,snapshot,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[packetId,p.ownerId,repoId,number,issue.compact_comment_id,throughId,issue.revision,hash,sha256(token),snapshot,new Date(tx.now.getTime()+COMPACT_PACKET_TTL_MS),tx.now]);
  return {...packet,packetHash:hash,packetToken:token};
}

/** Python default filename; CLI owns --out and writes markdown plus a private metadata sidecar. */
export function compactPacketFilename(repo:string,number:number,throughId:string):string {
  return `compact_packet_${repo.replaceAll('/','_')}_${number}_${throughId}.md`;
}
