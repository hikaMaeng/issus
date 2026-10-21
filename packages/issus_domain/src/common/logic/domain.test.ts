import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ackState,aliasCollisions,checkAlias,classify,compactDue,header,isCompact,normalizeMe,pendingLegacy,sinceCompactStats,transitionDelivery,checkIssueBody,parseEnvelope,charCount} from '../domain/index.js';

test('classification priority and Unicode mention boundaries use the registry name literally',()=>{
 const me=['aa-reader'];
 for(const [body,want] of [
  ['FROM:aa-author TO:aa-reader TYPE:NOTE CC:aa-reader','ME'],
  ['FROM:aa-author TO:other-aa TYPE:HOLD CC:aa-reader','CC'],
  ['FROM:aa-author TO:other-aa TYPE:HOLD','ALL'],
  ['FROM:aa-author TO:other-aa TYPE:DECISION','ALL'],
  ['FROM:aa-author TO:ALL TYPE:NOTE','ALL'],
  ['작성: aa-author\nTYPE: NOTE','ALL'],
  ['FROM:aa-author TO:other-aa TYPE:ASK','OTHER'],
  ['FROM:aa-author TO:other-aa TYPE:NOTE\n@aa-reader.','ME'],
  ['FROM:aa-author TO:other-aa TYPE:NOTE\n@aa-reader한글','OTHER'],
  ['FROM:aa-author TO:other-aa TYPE:NOTE\n@aa-reader-next','OTHER'],
 ] as const)assert.equal(classify(header(body),body,me),want,body);
 const body='FROM:aa-author TO:other-aa TYPE:NOTE\n@aaXreader';
 assert.equal(classify(header(body),body,['aa.reader']),'OTHER');
 assert.deepEqual(normalizeMe(['AA-READER'],['작성: cc-dd / s2 | 역할']),['aa-reader','cc-dd']);
});

test('global/window legacy pending stays separate from actual direct ACK evidence',()=>{
 const ask={id:'1000000',body:'FROM:aa-author/s1 TO:aa-reader TYPE:ASK\nASK @aa-reader: 확인'};
 const report={id:'1000001',body:'FROM:aa-reader/s2 TO:aa-author TYPE:REPORT RE:1000000 STATE:done\n완료'};
 assert.deepEqual(pendingLegacy([ask,report],['aa-reader']),[]);
 const directive={commentId:ask.id,recipientAliasId:'reader-id',recipientAlias:'aa-reader'};
 assert.equal(ackState(directive,[{...report,authorAliasId:'reader-id',postedByAliasId:'reader-id',validity:'v2'}]).state,'waiting');
 const compact={id:'1000002',body:'FROM:aa-owner TO:ALL TYPE:COMPACT\n## ===== COMPACT #1 through 1000001 ====='};
 assert.deepEqual(pendingLegacy([compact],['aa-reader']),[]);
 assert.deepEqual(pendingLegacy([ask,compact],['aa-reader']).map(c=>c.id),['1000000']);
});

test('only actual TO direct ACK advances ackState; proxy/mention/third party/noenv never do',()=>{
 const d={commentId:'1000000',recipientAliasId:'reader-id',recipientAlias:'aa-reader'};
 const make=(id:string,from:string,authorAliasId='reader-id',postedByAliasId=authorAliasId)=>({id,body:`FROM:${from} TO:aa-author TYPE:ACK RE:1000000,1000009\n확인`,authorAliasId,postedByAliasId,validity:'v2' as const});
 const proxy=make('1000001','aa-reader/by-aa-author','reader-id','author-id');
 const third=make('1000002','aa-other/s1','other-id');
 assert.equal(ackState(d,[proxy,third]).state,'waiting');
 assert.equal(ackState(d,[{...make('1000003','aa-reader/s1'),validity:'noenv'}]).state,'waiting');
 const first=make('1000004','aa-reader/s2'),second=make('1000005','aa-reader/s3');
 assert.deepEqual(ackState(d,[second,proxy,first]),{directiveId:'1000000',state:'acked',ackCommentId:first.id});
 assert.equal(ackState({...d,appliedByCommentId:'1000008'},[first]).state,'applied');
 assert.equal(ackState({...d,supersededBy:'1000009'},[first]).state,'superseded');
 assert.equal(ackState(d,[first]).state,'acked'); // ACK is not a HOLD release.
});

test('delivery state tolerates receipt/ACK/retry reordering without fabricating ACK',()=>{
 assert.deepEqual(transitionDelivery('posted','receive'),{ok:true,state:'delivered',changed:true,ackEvidenceReceipt:false});
 assert.deepEqual(transitionDelivery('posted','ack'),{ok:true,state:'acked',changed:true,ackEvidenceReceipt:true});
 assert.deepEqual(transitionDelivery('posted','apply'),{ok:false,code:'ACK_REQUIRED'});
 assert.deepEqual(transitionDelivery('delivered','apply'),{ok:false,code:'ACK_REQUIRED'});
 assert.equal(transitionDelivery('acked','apply').ok,true);
 for(const state of ['acked','applied','superseded'] as const)for(const event of ['receive','retry','ack'] as const){const r=transitionDelivery(state,event);assert.equal(r.ok,true);if(r.ok)assert.equal(r.state,state);}
 assert.equal(transitionDelivery('posted','ack',false).ok,false);
 assert.equal(transitionDelivery('delivered','apply',false).ok,false);
 const retry=transitionDelivery('posted','retry');assert.ok(retry.ok);assert.equal(retry.state,'posted');
 assert.equal(transitionDelivery('acked','supersede').ok,false);
});

test('compact thresholds 25/40000 and board30 count all post-boundary codepoints',()=>{
 for(const [count,chars,board,want] of [[24,39999,false,false],[25,0,false,true],[0,40000,false,true],[29,39999,true,false],[30,0,true,true]] as const)assert.equal(compactDue({count,chars},board).due,want);
 assert.deepEqual(compactDue({count:0,chars:0},false,'before-close'),{due:true,reasons:['before-close']});
 assert.deepEqual(sinceCompactStats([{id:'9007199254740993',body:'요약'},{id:'9007199254740994',body:'😀\r\n한글'}],'9007199254740993'),{count:1,chars:5});
 assert.equal(isCompact({body:'invalid\n## ===== COMPACT #1 through 1000000 ====='}),true);
 assert.equal(isCompact({body:'invalid\n## COMPACT through 1000000'}),false);
 assert.equal(charCount('😀한글'),3);
});

test('alias collisions distinguish exact/case/substring/edit-distance; transposition is not distance one',()=>{
 const names=['aa-reader','AA-READER','xx-aa-reader','aa-reade','aa-rexder','aa-readre','unrelated'];
 const collisions=aliasCollisions('aa-reader',names.map(alias=>({alias,evidence:['repo#1']})));
 assert.equal(collisions.find(c=>c.alias==='aa-reader')?.kind,'exact');
 assert.equal(collisions.find(c=>c.alias==='AA-READER')?.kind,'case');
 assert.equal(collisions.find(c=>c.alias==='xx-aa-reader')?.kind,'substring');
 assert.equal(collisions.find(c=>c.alias==='aa-reade')?.kind,'substring');
 assert.equal(collisions.find(c=>c.alias==='aa-rexder')?.kind,'edit-distance-1');
 assert.equal(collisions.some(c=>c.alias==='aa-readre'),false);
 assert.deepEqual(checkAlias(' aa-reader '),[]);
 assert.deepEqual(checkAlias('aa-reader',[{alias:'AA-READER',evidence:['repo#1']}]),["exact: 'AA-READER' used in repo#1"]);
 assert.match(checkAlias('Bad')[0],/^문법 위반/);
});

test('issue body syntax preserves Python order loophole; context must enforce STATE OWNER UPDATED',()=>{
 assert.deepEqual(checkIssueBody('OWNER:aa-reader STATE:running UPDATED:2024-01-01T00:00+09:00'),[]);
 for(const s of ['','STATE:running OWNER:aa-reader','OWNER:aa-reader BOARD:#1 COMPACT:123'])assert.ok(checkIssueBody(s).length>0);
 const errs:string[]=[];const h=parseEnvelope('FROM:aa-reader TYPE:NOTE TYPE:ASK UNKNOWN:x',errs);
 assert.equal(h.TYPE,'NOTE');assert.equal(errs.length,2);
});
