import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {IssusClient} from 'issus_domain/front';
import type {CompactPacket} from 'issus_domain/common';
import {CompactAssistant, compactDraft, compactRequest, compactPreview, packetDownload, packetSamples} from './index.js';

const packet:CompactPacket={count:3,chars:500,bodyLine1:'STATE:running OWNER:tt-1-author UPDATED:2026-10-21T20:00+09:00',previousCompact:{id:'1000000',body:'previous'},comments:['1000001','1000002','1000003'].map(id=>({id,createdAt:'2026-10-21T10:00:00Z',envelope:{TYPE:'NOTE'},body:'원문'})),markdown:'masked packet\r\nline2\r\n',maskedCount:2,suggestedEnvelope:'FROM:tt-1-author/<sid> TO:ALL TYPE:COMPACT RE:1000000 SEEN:1000003',throughId:'1000003',previousCompactId:'1000000',snapshotRevision:5,packetHash:'safe-hash',packetToken:'private-opaque-token',pendingAppendix:{pendingLegacy:{window:['1000001'],global:['1000001']},ackState:[],activeHolds:[],claims:[],handoffs:[]},controlFactsSinceCompact:[]};
test('U3 COMPACT metadata has exactly four top-level keys and raw body bytes including footer suffix survive',()=>{
  const body=' FROM:x\r\n## ===== COMPACT #2 through 1000003 =====\ncompacted-by:tt-1-reader(표본 대조)\n';
  const request=compactRequest(body,packet,['1000001','1000002','1000003'],'tt-1-reader');
  assert.deepEqual(Object.keys(request),['body','compactPacketToken','sampledIds','compactedBy']);assert.equal(request.body,body);assert.equal(request.compactPacketToken,packet.packetToken);
  assert.ok(!JSON.stringify(compactPreview(body,packet,[],'tt-1-reader','MASKED')).includes(packet.packetToken));
});
test('U3 samples are distinct source ids and control-only packets use empty evidence',()=>{
  assert.deepEqual(packetSamples(packet,['1000001','1000001','1000002','out-of-window']),['1000001','1000002']);
  assert.deepEqual(packetSamples({...packet,comments:[]},['1000001']),[]);
});
test('U3 packet download is UTF-8 LF markdown only with the exact filename; draft includes previous RE and real marker',()=>{
  const file=packetDownload(packet,'owner/repo',2);assert.equal(file.filename,'compact_packet_owner_repo_2_1000003.md');assert.equal(file.markdown,'masked packet\nline2\n');assert.ok(!file.markdown.includes(packet.packetToken));
  const draft=compactDraft(packet,2,'tt-1-reader','s2');assert.match(draft,/FROM:tt-1-author\/s2 TO:ALL TYPE:COMPACT RE:1000000 SEEN:1000003/);assert.match(draft,/\n## ===== COMPACT #2 through 1000003 =====\n/);assert.ok(draft.endsWith('compacted-by:tt-1-reader'));
});
test('U3 COMPACT initial SSR exposes named assistant, loading and manual workflow without leaking tokens',()=>{
  const html=renderToStaticMarkup(<CompactAssistant client={new IssusClient({server:'http://test.invalid'})} repo="o/r" number={2}/>);
  assert.match(html,/section aria-label="COMPACT 도우미"/);assert.match(html,/role="status" aria-busy="true"/);assert.match(html,/>패킷 준비<\/button>/);assert.match(html,/>패킷 다운로드<\/button>/);assert.match(html,/>COMPACT 게시<\/button>/);assert.ok(!html.includes(packet.packetToken));assert.ok(!html.includes('<main'));
});
