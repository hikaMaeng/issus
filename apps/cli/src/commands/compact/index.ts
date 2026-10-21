import type {CompactPacket,CompactStatus} from 'issus_domain/common';
import {ClientError,issuePath} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {parseIssue,parseRepo,required,value} from '../../entry/arguments/index.js';
import {chars,CliError} from '../../output/index.js';
import {atomicWrite} from '../../state/index.js';
import {post} from '../post/index.js';

/** Read-only packet export; a metadata sidecar carries the opaque server packet token. */
export async function compact(ctx:CommandContext):Promise<number> {
  if(ctx.args.action==='post') return post(ctx);
  const a=ctx.args,repo=parseRepo(required(a,'repo')),{client}=await ctx.connection(),ref=parseIssue(required(a,'issue'),repo,client.server);
  if(ref.repo!==repo) throw new CliError(2,'--issue repo differs from --repo');
  const path=issuePath(repo,ref.number);
  if(a.action==='status') {const {data}=await client.request<CompactStatus>(path+'/compact/status');await ctx.result(data);return 0;}
  const result=await client.request<CompactPacket>(path+'/compact/packet?format=json',{signal:ctx.options.signal});
  if(result.status===204) {
    const {data}=await client.request<CompactStatus>(path+'/compact/status');
    await ctx.result({empty:true,previousCompactId:data.previousCompactId},`nothing to compact: 0 comments after COMPACT ${data.previousCompactId??'None'}`);return 1;
  }
  const packet=result.data;
  if(!packet||typeof packet.markdown!=='string'||typeof packet.packetToken!=='string') throw new ClientError(0,'INVALID_PACKET_RESPONSE');
  const last=packet.comments.at(-1)?.id??packet.throughId,output=value(a,'out')??`compact_packet_${repo.replace('/','_')}_${ref.number}_${last}.md`;
  await atomicWrite(ctx.path(output),packet.markdown);
  await atomicWrite(ctx.path(output+'.meta.json'),JSON.stringify({packetToken:packet.packetToken,packetHash:packet.packetHash,throughId:packet.throughId,previousCompactId:packet.previousCompactId,snapshotRevision:packet.snapshotRevision},null,2)+'\n');
  if(ctx.out.json) await ctx.result({packet:output,comments:packet.count,chars:packet.chars,packetChars:chars(packet.markdown),masked:packet.maskedCount,previousCompactId:packet.previousCompactId,envelope:packet.suggestedEnvelope});
  else {
    await ctx.out.line(`packet=${output} comments=${packet.count} chars=${packet.chars} packet-chars=${chars(packet.markdown)} masked=${packet.maskedCount} prev-compact=${packet.previousCompactId??'-'}`);
    await ctx.out.line(`envelope: ${packet.suggestedEnvelope}`);
    if(packet.count<=10) await ctx.out.line('note: ≤10 comments — OWNER may write the COMPACT directly (references/compact.md)');
  }
  return 0;
}
