import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ClientError} from 'issus_domain/front';
import {fixture,worker,sender,repo,authToken,principal,ids} from '../../testing/fixture/index.js';
import {loadConfig,parseOptions} from '../config/index.js';
import {Journal} from '../journal/index.js';
import {toolDefinitions,input,output} from './schema.js';
import {systemComment} from '../../testing/fixture/host-response.js';

test('host system proxy author and legacy empty names are readable across consecutive waits',async t=>{
  const f=await fixture();t.after(()=>f.stop());const first=f.ask();
  const system=f.add('system'),legacy=f.add('legacy',{validity:'noenv'});
  f.comments.set(system.comment.id,systemComment(system.comment));
  legacy.comment.author.alias='';legacy.comment.author.sid='';
  await f.subscribe();
  assert.equal((await f.call('issus_wait',{timeoutMs:1000})).data.delivery.commentId,first.comment.id);
  const proxy=await f.call('issus_show',{commentId:system.comment.id});
  assert.equal(proxy.ok,true);assert.equal(proxy.data.author.sid,'by-bridge-system');
  assert.equal((await f.call('issus_wait',{timeoutMs:1000})).data.delivery.commentId,system.comment.id);
  assert.equal((await f.call('issus_wait',{timeoutMs:1000})).data.delivery.validity,'noenv');
  assert.equal((await f.call('issus_status')).data.queueSize,0);
  assert.equal(input.issus_subscribe.safeParse({alias:worker,sid:'by-bridge-system'}).success,false);
});

test('host fact with null or absent commentId is packetized without comment lookup',async t=>{
  const f=await fixture();t.after(()=>f.stop());
  const facts=[f.add('control fact null'),f.add('control fact absent')];
  for(const [i,fact] of facts.entries()){
    fact.item.viewKey='fact:'+fact.item.sourceEventId;
    if(i===0)Object.assign(fact.item,{commentId:null});else delete fact.item.commentId;
  }
  assert.equal((await f.subscribe()).ok,true);
  for(const fact of facts){
    const result=await f.call('issus_wait',{timeoutMs:1000});assert.equal(result.ok,true);
    assert.equal(result.data.delivery.commentId,null);assert.equal(result.data.delivery.viewKey,fact.item.viewKey);
    assert.equal(result.data.delivery.body,fact.item.content.body);assert.equal(result.data.delivery.ackRequired,false);
  }
  assert.equal(f.requests.filter(r=>/\/comments\//u.test(r.path)).length,0);
  assert.equal(f.receiptCount,2);assert.equal(f.processed.size,0);
  assert.equal((await f.call('issus_status')).data.queueSize,0);
});

test('permanent comment failures skip only that item, preserve diagnostics and survive refresh/restart',async t=>{
  const f=await fixture();t.after(()=>f.stop());
  const malformed=f.ask('malformed'),missing=f.ask('missing'),next=f.ask('healthy');
  Object.assign(malformed.comment.author,{sid:123});
  const missingPath='/v1/repos/'+repo+'/comments/'+missing.comment.id;
  f.faults.set(missingPath,{status:404,code:'NOT_FOUND',times:100});
  await f.subscribe();
  const result=await f.call('issus_wait',{timeoutMs:1000});assert.equal(result.ok,true);
  assert.equal(result.data.delivery.commentId,next.comment.id);
  const status=await f.call('issus_status');assert.equal(status.data.queueSize,0);
  assert.deepEqual(status.data.lastError,{code:'NOT_FOUND',httpStatus:404,commentId:missing.comment.id,viewKey:missing.item.viewKey});
  assert.equal(f.receiptCount,1);assert.equal(f.processed.size,0);
  const skipped=f.connection.journal.data.deliveries[malformed.item.delivery!.id];
  assert.equal(skipped.phase,'STAGED');assert.equal(skipped.resolved,undefined);
  assert.equal(skipped.hydrationError?.code,'BRIDGE_INVALID_COMMENT_RESPONSE');
  const before=f.requests.filter(r=>r.path===missingPath).length;
  await f.bridge.waiter.refresh();await f.bridge.close();f.reopen();await f.subscribe();
  assert.equal((await f.call('issus_status')).data.lastError.commentId,missing.comment.id);
  assert.equal((await f.call('issus_wait',{timeoutMs:1000})).data.delivery.commentId,next.comment.id);
  assert.equal((await f.call('issus_wait',{timeoutMs:50})).data.delivery,null);
  assert.equal((await f.call('issus_status')).data.lastError.commentId,missing.comment.id);
  assert.equal(f.requests.filter(r=>r.path===missingPath).length,before);
  for(const name of await readdir(f.directory)){
    const stored=await readFile(join(f.directory,name),'utf8');
    assert.equal(stored.includes(malformed.comment.body),false);assert.equal(stored.includes(authToken),false);
  }
});

test('comment lookup transport and authentication failures retain retry/terminal behavior',async t=>{
  for(const status of [503,401]){
    const f=await fixture();t.after(()=>f.stop());const first=f.ask(),next=f.ask();
    await f.subscribe();const path='/v1/repos/'+repo+'/comments/'+first.comment.id;
    f.faults.set(path,{status,code:status===503?'UNAVAILABLE':'UNAUTHENTICATED',times:100});
    const result=await f.call('issus_wait',{timeoutMs:50});assert.equal(result.ok,false);assert.equal(result.error.httpStatus,status);
    assert.equal(f.connection.journal.data.deliveries[first.item.delivery!.id].hydrationError,undefined);
    assert.equal(f.connection.journal.data.deliveries[next.item.delivery!.id].phase,'STAGED');assert.equal(f.receiptCount,0);
  }
});

test('persisted comment failure diagnostics redact server credential canaries',async t=>{
  const f=await fixture();t.after(()=>f.stop());const bad=f.ask(),next=f.ask();
  await f.subscribe();f.faults.set('/v1/repos/'+repo+'/comments/'+bad.comment.id,{status:404,code:'MISSING_'+authToken});
  const result=await f.call('issus_wait',{timeoutMs:1000});assert.equal(result.data.delivery.commentId,next.comment.id);
  assert.equal((await f.call('issus_status')).data.lastError.code,'MISSING_[REDACTED]');
  for(const name of await readdir(f.directory))assert.equal((await readFile(join(f.directory,name),'utf8')).includes(authToken),false);
});

test('M01 closed discovery schemas, exact ACK selector and bounded wait',()=>{
  const tools=toolDefinitions();assert.equal(tools.length,10);
  for(const tool of tools){assert.equal(tool.inputSchema.additionalProperties,false);assert.ok(tool.outputSchema.anyOf);}
  assert.equal(input.issus_wait.safeParse({timeoutMs:1500001}).success,false);
  assert.equal(input.issus_wait.safeParse({timeoutMs:1,token:'hidden'}).success,false);
  assert.equal(input.issus_ack.safeParse({body:'x'}).success,false);
  assert.equal(input.issus_ack.safeParse({body:'x',commentId:'1000001',deliveryId:randomUUID()}).success,false);
});

test('M02 principal binding is exact, idempotent and does not create receipt/process',async t=>{
  const f=await fixture();t.after(()=>f.stop());f.ask();
  assert.equal((await f.call('issus_wait')).error.code,'BRIDGE_NOT_SUBSCRIBED');
  assert.equal((await f.call('issus_subscribe',{alias:worker,sid:'s2'})).error.code,'BRIDGE_PRINCIPAL_MISMATCH');
  assert.equal((await f.subscribe()).ok,true);assert.equal((await f.subscribe()).ok,true);
  assert.equal(f.receiptCount,0);assert.equal(f.processed.size,0);
  assert.equal((await f.call('issus_subscribe',{alias:sender})).error.code,'BRIDGE_PRINCIPAL_MISMATCH');
  assert.equal((await f.call('issus_status')).data.principal.alias,worker);
});

test('M02 bootstrap and cross-owner principal are rejected before inbox',async t=>{
  const f=await fixture();t.after(()=>f.stop());f.faultPrincipal={kind:'bootstrap',id:ids.session,ownerId:ids.owner,capabilities:['bootstrap']};
  assert.equal((await f.subscribe()).error.code,'BRIDGE_SESSION_REQUIRED');
  f.faultPrincipal={...principal,ownerId:randomUUID()};
  assert.equal((await f.subscribe()).error.code,'BRIDGE_OWNER_MISMATCH');assert.equal(f.requests.filter(r=>r.path==='/v1/inbox').length,0);
});

test('M03 ASK → receipt → ACK → REPORT → apply → process preserves separate states',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.ask('nonce-한국어');
  assert.equal((await f.subscribe()).ok,true);
  const received=await f.call('issus_wait',{timeoutMs:1000}),p=received.data.delivery;
  assert.equal(p.commentId,a.comment.id);assert.equal(p.body,a.comment.body);assert.equal(p.context.issueBody,f.body);assert.equal(p.source.eventId,a.item.sourceEventId);assert.equal(p.ackRequired,true);
  assert.deepEqual(p.envelope,a.comment.envelope);
  assert.deepEqual(p.receipt,{confirmed:true,transport:'http'});assert.equal(f.states.get(a.comment.id)?.state,'waiting');
  const ack=await f.call('issus_ack',{deliveryId:p.deliveryId,body:f.ackBody(a.comment.id)});assert.equal(ack.ok,true);assert.equal(ack.data.acked,true);
  let record=f.connection.journal.data.deliveries[p.deliveryId];assert.ok(record.ackId);assert.equal(record.resolved,false);
  const report=await f.call('issus_post',{repo,issue:4,body:f.reportBody(a.comment.id)});assert.equal(report.ok,true);
  const apply=await f.call('issus_apply',{deliveryId:p.deliveryId,evidenceCommentId:report.data.commentId,outcome:'applied'});assert.equal(apply.data.recorded,true);
  record=f.connection.journal.data.deliveries[p.deliveryId];assert.equal(record.applied,true);assert.equal(record.resolved,false);
  const processed=await f.call('issus_process',{deliveryIds:[p.deliveryId],disposition:'replied',evidenceCommentId:report.data.commentId});assert.equal(processed.ok,true);
  assert.equal(f.connection.journal.data.deliveries[p.deliveryId].resolved,true);
  for(const result of [received,ack,report,apply,processed])assert.equal(JSON.stringify(result).includes(authToken),false);
});

test('M04 empty timeout, cancellation, concurrent wait and status are independent',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();
  const empty=await f.call('issus_wait',{timeoutMs:20});assert.equal(empty.data.timedOut,true);assert.equal(empty.data.delivery,null);
  const abort=new AbortController(),pending=f.bridge.call('issus_wait',{timeoutMs:10000},abort.signal);
  await new Promise(r=>setTimeout(r,10));
  assert.equal((await f.call('issus_status')).data.waiting,true);
  assert.equal((await f.call('issus_wait',{timeoutMs:10})).error.code,'BRIDGE_WAIT_IN_PROGRESS');
  abort.abort();assert.equal((await pending).isError,true);assert.equal((await f.call('issus_status')).data.waiting,false);
  assert.equal(f.receiptCount,0);assert.equal(f.processed.size,0);
});

test('M05 canonical-only history is previewed and never synthesized as delivery',async t=>{
  const f=await fixture();t.after(()=>f.stop());f.pageSize=1;
  const history=f.add(`FROM:${sender}/s1 TO:ALL TYPE:NOTE\n가입 전 기록`,{delivery:false});
  f.compact=[{repoId:ids.repo,issueNumber:4,comment:{id:history.comment.id,body:history.comment.body,envelope:history.comment.envelope}}];
  const a=f.ask();await f.subscribe();
  const first=await f.call('issus_inbox',{limit:1});assert.equal(first.data.items.length,1);assert.ok(first.data.nextCursor);
  const second=await f.call('issus_inbox',{limit:1,cursor:first.data.nextCursor});assert.equal(second.data.items.length,1);
  assert.equal(f.receiptCount,0);assert.equal(f.processed.size,0);
  const packet=(await f.call('issus_wait',{timeoutMs:500})).data.delivery;assert.equal(packet.commentId,a.comment.id);assert.equal(packet.context.compact.id,history.comment.id);
  assert.equal(f.bridge.waiter.items.size,2);assert.equal(Object.keys(f.connection.journal.data.deliveries).length,1);
});

test('M06 new snapshot each refresh, BigInt versions, attempts and late routes do not duplicate work',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.ask();a.item.delivery!.aliasEventSequence='9007199254740995';await f.subscribe();
  const id=a.item.delivery!.id;assert.equal((await f.call('issus_wait',{timeoutMs:500})).data.delivery.deliveryId,id);
  a.item.delivery!.attempt=9;a.item.delivery!.aliasEventSequence='9007199254740997';a.item.delivery!.state='acked';
  await f.bridge.waiter.refresh();assert.equal(f.connection.journal.data.versions[id].sequence,'9007199254740997');
  a.item.delivery!.attempt=0;a.item.delivery!.aliasEventSequence='9007199254740996';a.item.delivery!.state='posted';
  await f.bridge.waiter.refresh();assert.equal(f.connection.journal.data.versions[id].sequence,'9007199254740997');
  assert.equal((await f.call('issus_wait',{timeoutMs:20})).data.delivery,null);
  const late=f.ask('late route');assert.equal((await f.call('issus_wait',{timeoutMs:500})).data.delivery.commentId,late.comment.id);
  assert.equal(f.receiptCount,2);
});

test('M07 410 restores snapshot, keeps active HOLD and never advances process',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();
  const hold=f.add(`FROM:${sender}/s1 TO:${worker} TYPE:HOLD ACK-BY:2026-10-24T17:00+09:00\n즉시 중단.`);f.expireNext=true;
  const value=await f.call('issus_wait',{timeoutMs:500});assert.equal(value.ok,true);assert.equal(value.data.delivery.commentId,hold.comment.id);assert.deepEqual(value.data.delivery.context.activeHolds,[hold.comment.id]);
  assert.equal(f.connection.journal.data.cursors.processedCursor,null);
});

test('M06 partial snapshot timeout retains completed refresh cursor and resumes same snapshot',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();
  const committed=f.connection.journal.data.cursors.refreshCursor;f.pageSize=1;
  const a=f.ask('first'),b=f.ask('second');f.delayPaginationMs=100;
  const interrupted=await f.call('issus_wait',{timeoutMs:30});assert.equal(interrupted.data.timedOut,true);
  assert.equal(f.connection.journal.data.cursors.refreshCursor,committed);assert.equal(f.receiptCount,0);
  f.delayPaginationMs=0;
  assert.equal((await f.call('issus_wait',{timeoutMs:1000})).data.delivery.commentId,a.comment.id);
  assert.equal((await f.call('issus_wait',{timeoutMs:1000})).data.delivery.commentId,b.comment.id);
  assert.equal(f.bridge.waiter.items.size,2);
});

test('M07 ACK then process then crash remains recovery work, even when absent from inbox',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.ask();await f.subscribe();const p=(await f.call('issus_wait',{timeoutMs:500})).data.delivery;
  const ack=await f.call('issus_ack',{deliveryId:p.deliveryId,body:f.ackBody(a.comment.id)});assert.equal(ack.data.acked,true);
  await f.call('issus_process',{deliveryIds:[p.deliveryId],disposition:'acked',evidenceCommentId:ack.data.commentId});
  assert.equal(f.connection.journal.data.deliveries[p.deliveryId].resolved,false);
  await f.bridge.close();f.hideProcessed=true;f.reopen();await f.subscribe();
  const recovered=(await f.call('issus_wait',{timeoutMs:500})).data.delivery;
  assert.equal(recovered.deliveryId,p.deliveryId);assert.equal(recovered.recovery,true);assert.equal(recovered.body,p.body);
  assert.equal((await f.call('issus_wait',{timeoutMs:20})).data.delivery,null);
});

test('M07 resolved work is excluded after restart; sid change discards old cursors',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.add(`FROM:${sender}/s1 TO:ALL TYPE:NOTE\n정보`);await f.subscribe();
  const p=(await f.call('issus_wait',{timeoutMs:500})).data.delivery;
  await f.call('issus_process',{deliveryIds:[p.deliveryId],disposition:'ignored',reason:'기록 완료'});
  const old=f.connection.journal.data.cursors.refreshCursor;assert.ok(old);
  await f.bridge.close();f.faultPrincipal={...principal,sid:'s2',sessionId:randomUUID()};f.reopen();
  const start=f.requests.length;assert.equal((await f.call('issus_subscribe',{alias:worker,sid:'s2'})).ok,true);
  const snapshots=f.requests.slice(start).filter(r=>r.path==='/v1/inbox');assert.equal(snapshots.length,1);
  assert.equal((await f.call('issus_wait',{timeoutMs:20})).data.delivery,null);assert.equal(f.processed.has(a.item.delivery!.id),true);
});

test('M08 canonical local and server 422 reasons retain order, dryRun creates no write',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();const body=`FROM:${worker}/s1 TO:ALL TYPE:NOTE\n검사`;
  const dry=await f.call('issus_post',{repo,issue:4,body,dryRun:true});assert.equal(dry.data.kind,'preflight');assert.equal(f.postCount,0);
  const local=await f.call('issus_post',{repo,issue:4,body:'invalid'});assert.equal(local.error.httpStatus,422);assert.ok(local.error.reasons.length);
  f.faults.set('/v1/repos/'+repo+'/issues/4/preflight',{status:422,code:'EXACT_REASONS',reasons:['두 번째가 아닌 첫 사유','마지막 사유']});
  const server=await f.call('issus_post',{repo,issue:4,body});assert.equal(server.error.code,'EXACT_REASONS');assert.deepEqual(server.error.reasons,['두 번째가 아닌 첫 사유','마지막 사유']);assert.equal(f.postCount,0);
});

test('M08 edit412 is not overwritten; COMPACT metadata is passed top-level',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();
  f.faults.set('/v1/repos/'+repo+'/issues/4/body',{status:412,code:'REVISION_MISMATCH'});
  const edit=await f.call('issus_post',{repo,issue:4,body:f.body,editBody:true});assert.equal(edit.error.httpStatus,412);assert.equal(f.revision,1);
  const body=`FROM:${worker}/s1 TO:ALL TYPE:COMPACT SEEN:1000001\n## ===== COMPACT #4 through 1000001 =====\n기록.\ncompacted-by:${worker}`;
  const compact=await f.call('issus_post',{repo,issue:4,body,compactPacketToken:'packet-private-canary',sampledIds:['1000001'],compactedBy:worker});assert.equal(compact.ok,true);
  const req=f.requests.find(r=>r.path.endsWith('/comments'))!;assert.equal(req.body.compactPacketToken,'packet-private-canary');assert.equal('metadata' in req.body,false);
  assert.equal(JSON.stringify(compact).includes('packet-private-canary'),false);
});

test('M08 accepted202 timeout retains operation/key and resumes without another publication',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();f.queueNext=true;f.operationPending=true;
  const path='/v1/repos/'+repo+'/issues/4/comments',body={body:`FROM:${worker}/s1 TO:ALL TYPE:NOTE\n한 번만 게시`};
  await assert.rejects(f.connection.write(path,body,{timeoutMs:20}),e=>(e as {code:string;operationId:string}).code==='OPERATION_TIMEOUT'&&(e as {operationId:string}).operationId===f.operationId);
  const keys=f.requests.filter(r=>r.path===path).map(r=>r.key);assert.equal(keys.length,1);
  const journal=Object.values(f.connection.journal.data.writes).find(w=>w.operationId===f.operationId);assert.equal(journal?.key,keys[0]);
  f.operationPending=false;await f.connection.write(path,body,{timeoutMs:500});
  assert.equal(f.postCount,1);assert.deepEqual(f.requests.filter(r=>r.path===path).map(r=>r.key),[keys[0],keys[0]]);
});

test('M08 post committed but hydration failed is uncertain and retry uses same key',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();
  f.faults.set('/v1/repos/'+repo+'/comments/'+String(f.next+1),{status:503,code:'HYDRATION_UNAVAILABLE',reasons:['retry original request']});
  const body=`FROM:${worker}/s1 TO:ALL TYPE:NOTE\n게시 응답 후 조회 장애`;
  const uncertain=await f.call('issus_post',{repo,issue:4,body});assert.equal(uncertain.error.posted,null);assert.equal(uncertain.error.httpStatus,503);assert.equal(f.postCount,1);
  const resumed=await f.call('issus_post',{repo,issue:4,body});assert.equal(resumed.ok,true);assert.equal(f.postCount,1);
  const writes=f.requests.filter(r=>r.path.endsWith('/comments')&&r.method==='POST');assert.equal(writes[0].key,writes[1].key);
});

test('M09 NOTE ACK and third-party ACK are published without direct-TO ACK effect',async t=>{
  const f=await fixture();t.after(()=>f.stop());const note=f.add(`FROM:${sender}/s1 TO:ALL TYPE:NOTE\n알림`),other=f.add(`FROM:${sender}/s1 TO:mc-4-other TYPE:ASK ACK-BY:2026-10-24T17:00+09:00\nASK @mc-4-other: 확인`);
  await f.subscribe();
  for(const c of [note.comment,other.comment]){const ack=await f.call('issus_ack',{commentId:c.id,body:f.ackBody(c.id)});assert.equal(ack.ok,true);assert.equal(ack.data.acked,false);}
});

test('M09 apply-before-ACK retains server ACK_REQUIRED409',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.ask();await f.subscribe();const p=(await f.call('issus_wait',{timeoutMs:500})).data.delivery;
  const evidence=f.add(f.reportBody(a.comment.id),{delivery:false});
  const result=await f.call('issus_apply',{deliveryId:p.deliveryId,evidenceCommentId:evidence.comment.id,outcome:'applied'});
  assert.equal(result.error.code,'ACK_REQUIRED');assert.equal(result.error.httpStatus,409);assert.equal(f.connection.journal.data.deliveries[p.deliveryId].applied,undefined);
});

test('P1-2 mention-only ACK clears own legacy pending without direct ACK authority',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.add(`FROM:${sender}/s1 TO:mc-4-other TYPE:DECISION ACK-BY:2026-10-24T17:00+09:00\n보조 독자 @${worker}는 의견을 기록한다.`,{delivery:false});
  await f.subscribe();assert.ok((await f.call('issus_inbox')).data.pendingLegacy.global.includes(a.comment.id));
  const claim={repo,issue:4,body:`FROM:${worker}/s1 TO:${sender} TYPE:CLAIM DUE:2026-10-24T17:00+09:00 SEEN:${a.comment.id}\n점유: 전용 시험 자원.`};
  assert.equal((await f.call('issus_post',claim)).error.code,'PENDING_ACK');
  const result=await f.call('issus_ack',{commentId:a.comment.id,body:f.ackBody(a.comment.id,'보조 독자 응답, 실행 담당은 원 TO.')});assert.equal(result.data.acked,false);
  assert.equal((await f.call('issus_inbox')).data.pendingLegacy.global.includes(a.comment.id),false);assert.equal(f.states.get(a.comment.id)?.state,'waiting');
  assert.equal((await f.call('issus_post',claim)).ok,true);
});

test('P1-3 objection ACK leaves HANDOFF pending; explicit accept uses target ACK',async t=>{
  const f=await fixture();t.after(()=>f.stop());const h=f.add(`FROM:${sender}/s1 TO:${worker} TYPE:HANDOFF ACK-BY:2026-10-24T17:00+09:00 REPLY-IN:#5\n책임 수용 여부를 검토한다.`);
  await f.subscribe();const objection=await f.call('issus_ack',{commentId:h.comment.id,body:f.ackBody(h.comment.id,'반론. 조건 미충족.')});assert.equal(objection.ok,true);assert.equal(f.handoffs.get(h.comment.id),'pending');assert.equal(f.acceptCount,0);
  const targetAck=await f.call('issus_post',{repo,issue:5,body:f.ackBody(h.comment.id,'수용. target에서 책임을 받는다.')});assert.equal(targetAck.ok,true);
  const accepted=await f.call('issus_handoff_accept',{repo,issue:4,handoffId:h.comment.id,ackCommentId:targetAck.data.commentId});assert.equal(accepted.ok,true);assert.equal(accepted.data.status,'accepted');assert.equal(f.handoffs.get(h.comment.id),'accepted');
  assert.equal(f.requests.some(r=>r.path.endsWith('/complete')),false);
});

test('M11 target ACK/source NOTE and lost accept response recover with the same operation',async t=>{
  const f=await fixture();t.after(()=>f.stop());const h=f.add(`FROM:${sender}/s1 TO:${worker} TYPE:HANDOFF ACK-BY:2026-10-24T17:00+09:00 REPLY-IN:#5\n새 책임을 target에서 수용한다.`);
  await f.subscribe();
  const target=await f.call('issus_post',{repo,issue:5,body:f.ackBody(h.comment.id)});assert.equal(target.ok,true);
  assert.equal((await f.call('issus_inbox')).data.pendingLegacy.global.includes(h.comment.id),true);
  const note=await f.call('issus_post',{repo,issue:4,body:`FROM:${worker}/s1 TO:${sender} TYPE:NOTE RE:${h.comment.id}\n수용 ACK는 #5의 ${target.data.commentId}에 게시했다.`});assert.equal(note.ok,true);
  assert.equal((await f.call('issus_inbox')).data.pendingLegacy.global.includes(h.comment.id),false);
  f.queueNext=true;f.operationPending=true;
  const args={repo,issue:4,handoffId:h.comment.id,ackCommentId:target.data.commentId};
  const uncertain=(await f.bridge.call('issus_handoff_accept',args,AbortSignal.timeout(150))).structuredContent as any;assert.equal(uncertain.error.posted,null);assert.equal(f.acceptCount,1);
  await f.bridge.close();f.reopen();await f.subscribe();f.operationPending=false;
  const accepted=await f.call('issus_handoff_accept',args);assert.equal(accepted.ok,true);assert.equal(accepted.data.status,'accepted');assert.equal(f.acceptCount,1);
  const writes=f.requests.filter(r=>r.path.endsWith('/accept'));assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);
});

test('M10 known token, bearer subprotocol and errors are masked; journal stores no bodies',async t=>{
  const f=await fixture();t.after(()=>f.stop());const a=f.ask('private '+authToken+' issus.bearer.'+authToken);await f.subscribe();
  const shown=await f.call('issus_show',{commentId:a.comment.id});assert.equal(shown.data.redacted,true);
  const received=await f.call('issus_wait',{timeoutMs:500});assert.equal(received.data.delivery.redacted,true);
  f.faults.set('/v1/repos/'+repo+'/issues/4/preflight',{status:422,code:'CANARY',reasons:['first '+authToken,'second']});
  const error=await f.call('issus_post',{repo,issue:4,body:`FROM:${worker}/s1 TO:ALL TYPE:NOTE\n공유`});
  const text=JSON.stringify([shown,received,error,await f.call('issus_status')]);assert.equal(text.includes(authToken),false);assert.equal(text.includes('issus.bearer.'),false);
  for(const name of await readdir(f.directory)){const stored=await readFile(join(f.directory,name),'utf8');assert.equal(stored.includes(authToken),false);assert.equal(stored.includes(a.comment.body),false);}
});

test('M10 config rejects server/token mismatch and invalid scope without printing credentials',async t=>{
  const f=await fixture();t.after(()=>f.stop());const file=join(f.directory,'profile.json');
  await writeFile(file,JSON.stringify({version:1,active:'test',profiles:{test:{server:'https://old.invalid',token:authToken}}}),'utf8');
  const env={ISSUS_URL:'https://new.invalid',ISSUS_REPO:repo,ISSUS_ISSUES:'4',ISSUS_PROFILES_FILE:file};
  await assert.rejects(loadConfig(env),/BRIDGE_PROFILE_SERVER_MISMATCH/u);
  assert.throws(()=>parseOptions(['--state-dir','relative']),/BRIDGE_ABSOLUTE_PATH_REQUIRED/u);
  const config=await loadConfig({...env,ISSUS_TOKEN:authToken,ISSUS_BRIDGE_STATE_DIR:f.directory});assert.equal(config.server,'https://new.invalid');
  await assert.rejects(loadConfig({...env,ISSUS_TOKEN:authToken,ISSUS_ISSUES:''}),/BRIDGE_ISSUES_REQUIRED/u);
});

test('M10 401 is terminal for this connection and transport errors are not empty timeout',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();f.faults.set('/v1/inbox',{status:401,code:'UNAUTHENTICATED'});
  const failed=await f.call('issus_wait',{timeoutMs:200});assert.equal(failed.error.httpStatus,401);assert.equal(failed.error.retryable,false);
  const before=f.requests.length;assert.equal((await f.call('issus_wait',{timeoutMs:100})).error.code,'UNAUTHENTICATED');assert.equal(f.requests.length,before);
});

test('M07 journal exclusive lock does not let another same-alias writer mutate state',async t=>{
  const f=await fixture();t.after(()=>f.stop());await f.subscribe();const j=new Journal(f.directory);
  await assert.rejects(j.bind({server:f.url,ownerId:ids.owner,aliasId:ids.alias,sessionId:ids.session,scope:f.connection.scope()}),/BRIDGE_STATE_LOCKED/u);
  assert.equal((await f.call('issus_status')).data.subscribed,true);
});
