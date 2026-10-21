import type {CompactPacket} from 'issus_domain/common';

/** Samples reference distinct source comments in this packet; the server remains the validator. */
export function packetSamples(packet: CompactPacket, selected: readonly string[]): string[] {
  const allowed = new Set(packet.comments.map(comment=>comment.id));
  return [...new Set(selected)].filter(id=>allowed.has(id));
}
/** Only the four allowed publication keys are sent; raw body is never normalized. */
export function compactRequest(body: string, packet: CompactPacket, selected: readonly string[], compactedBy: string) {
  return {body,compactPacketToken:packet.packetToken,sampledIds:packetSamples(packet,selected),compactedBy};
}
/** A draft seed is generated once; later packet changes never overwrite user text. */
export function compactDraft(packet: CompactPacket, number: number, alias?: string, sid?: string): string {
  const envelope = sid ? packet.suggestedEnvelope.replace('/<sid>',`/${sid}`) : packet.suggestedEnvelope;
  return `${envelope}\n## ===== COMPACT #${number} through ${packet.throughId} =====\n\ncompacted-by:${alias??''}`;
}
/** Download the exact masked packet using UTF-8 LF, without exposing private metadata. */
export function packetDownload(packet: CompactPacket, repo: string, number: number): {filename:string;markdown:string} {
  return {filename:`compact_packet_${repo.replaceAll('/','_')}_${number}_${packet.throughId}.md`,markdown:packet.markdown.replace(/\r\n?/g,'\n')};
}
/** Public preview preserves metadata shape while keeping the opaque token out of the DOM. */
export function compactPreview(body: string, packet: CompactPacket, selected: readonly string[], compactedBy: string, masked: string) {
  return {...compactRequest(body,packet,selected,compactedBy),compactPacketToken:masked};
}
