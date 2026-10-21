import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFactPayload} from 'issus_domain/common';
import {createDeliveryProjection} from '../../../src/server/stream/projection/index.js';
import {eventually,startAssembledHarness} from './assembled-harness.js';

test('I-01–06 two sessions: assembled broker→worker→scheduler→COMPACT→close',{timeout:180000},async t=>{
 const h=await startAssembledHarness();
 try {
  // Admission-only response exercises operation polling through the real broker/worker.
  const repo=await h.http('/v1/repos',{owner:'tester',slug:'delivery',projectCode:'p5',autoBoard:true},undefined,{headers:{prefer:'wait=0'}});assert.equal(repo.status,201,JSON.stringify(repo));const repoId=repo.body.repoId;
  async function session(alias:string) {
   const registered=await h.http('/v1/owners/tester/aliases',{name:alias,role:'test',model:'fake',scope:'assembled delivery integration',repos:[repoId],announcementBody:`FROM:${alias}/by-p5-system TO:ALL TYPE:ALIAS\n${alias} | 시험 | fake | integration | s1\n---\n근거: assembled test`});assert.equal(registered.status,201,JSON.stringify(registered));
   const s=await h.http('/v1/sessions',{alias,sid:'s1'});assert.equal(s.status,201,JSON.stringify(s));return {...s.body,aliasId:registered.body.aliasId};
  }
  const A=await session('p5-1-author'),B=await session('p5-1-reader');
  const opened=await h.http('/v1/repos/tester/delivery/issues',{title:'two-session acceptance',body:`STATE:running OWNER:${A.alias} UPDATED:2026-10-21T18:30+09:00\nGOAL: assembled acceptance`});assert.equal(opened.status,201,JSON.stringify(opened));
  const number=opened.body.number,I=`/v1/repos/tester/delivery/issues/${number}`;
  const post=(who:typeof A,body:string,metadata:Record<string,unknown>={})=>h.http(`${I}/comments`,{body,...metadata},who.token);
  const deadline=(ms=300000)=>new Date(h.clock.now().getTime()+ms).toISOString().replace(/\.\d{3}Z$/,'+00:00');
  async function subscribe(who:typeof A) {
   const s=await h.http('/v1/subscriptions',{channels:[],from:'now',repo:'tester/delivery',issues:[number]},who.token);assert.equal(s.status,201,JSON.stringify(s));
   const ws=await h.ws(who.token,s.body.subscriptionId,s.body.cursor);await ws.until(f=>f.type==='subscribed');return {...ws,id:s.body.subscriptionId};
  }
  const a=await subscribe(A),b=await subscribe(B);
  const notification=(ws:typeof a,action:string,commentId:string)=>ws.until(f=>f.type==='event'&&f.event.action===action&&f.event.payload.commentId===commentId);
  const assertContext=(frame:any,body:string,commentId:string,state:string,attempt=0)=>{
   // Deserialize this single line alone: no queued-frame cache or HTTP lookup is available.
   const isolated=JSON.parse(JSON.stringify(frame)),p=isolated.event.payload;
   assert.deepEqual(p.issue,{repoId,issueNumber:number});assert.equal(p.commentId,commentId);assert.equal(p.content.body,body);assert.equal(p.envelope.TO,B.alias);assert.equal(p.priority,'ME');assert.equal(p.delivery.id,p.deliveryId);assert.equal(p.delivery.state,state);assert.equal(p.delivery.attempt,attempt);
   assert.ok(!JSON.stringify(frame).includes('\n'));return isolated;
  };
  const askBody=`FROM:${A.alias}/s1 TO:${B.alias} TYPE:ASK ACK-BY:${deadline()}\nASK @${B.alias}: 두 세션 전체 흐름.\nNEXT: ACK 후 반영 보고.`,ask=await post(A,askBody);assert.equal(ask.status,201,JSON.stringify(ask));
  const queued=await notification(b,'issus.delivery.queued',ask.body.commentId);assertContext(queued,askBody,ask.body.commentId,'posted');
  assert.equal(queued.event.payload.deliveryId.split('-')[2][0],'8');
  const receipt=(ws:typeof a,frame:any)=>ws.socket.send(JSON.stringify({type:'receipt',subscriptionId:ws.id,deliveryIds:[frame.event.payload.deliveryId],attempts:[frame.event.payload.delivery.attempt],cursor:frame.cursor}));
  receipt(b,queued);
  const delivered=await notification(b,'issus.delivery.delivered',ask.body.commentId);assertContext(delivered,askBody,ask.body.commentId,'delivered');
  const durable=(await h.pool.query(`SELECT d.state,r.transport,r.attempt FROM "${h.schema}".delivery d JOIN "${h.schema}".delivery_receipt r ON r.delivery_id=d.id WHERE d.id=$1 AND r.session_id=$2`,[queued.event.payload.deliveryId,B.sessionId])).rows;
  assert.deepEqual(durable,[{state:'delivered',transport:'websocket',attempt:0}]);
  const ack=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${ask.body.commentId}\n수용 — WS 수신 확인.\nNEXT: 반영.`);assert.equal(ack.status,201,JSON.stringify(ack));
  assertContext(await notification(b,'issus.delivery.acked',ask.body.commentId),askBody,ask.body.commentId,'acked');
  const report=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:REPORT STATE:done RE:${ask.body.commentId}\n반영 보고.\nNEXT: 검증.\n---\n근거: assembled integration`);assert.equal(report.status,201,JSON.stringify(report));
  assert.equal((await h.http(`/v1/deliveries/${queued.event.payload.deliveryId}/application`,{evidenceCommentId:report.body.commentId,outcome:'applied'},B.token)).status,200);
  assertContext(await notification(b,'issus.delivery.applied',ask.body.commentId),askBody,ask.body.commentId,'applied');
  // Replay an earlier fact after state advancement: its projected state and coordinates remain stable.
  const canonical=(await h.pool.query(`SELECT payload FROM event_store WHERE event_id=$1`,[delivered.event.eventId])).rows[0].payload;
  assert.ok(parseFactPayload('issus.delivery.delivered',canonical).ok);assert.equal(canonical.issue,undefined);
  const principal=await h.broker.auth.verify(B.token),project=createDeliveryProjection(h.broker.intake.uow);
  assert.deepEqual(await project({...delivered.event,payload:canonical},principal),delivered.event);
  const otherPrincipal=await h.broker.auth.verify(A.token);
  await assert.rejects(()=>project({...delivered.event,payload:canonical},otherPrincipal),/DELIVERY_FORBIDDEN/);
  const holdBody=`FROM:${A.alias}/s1 TO:${B.alias} TYPE:HOLD ACK-BY:${deadline(5000)} SEEN:${report.body.commentId}\n작업 중단.\nASK @${B.alias}: 중단 확인.\nNEXT: 해제 전 보류.`,hold=await post(A,holdBody);assert.equal(hold.status,201,JSON.stringify(hold));
  const holdQueued=await notification(b,'issus.delivery.queued',hold.body.commentId);receipt(b,holdQueued);await notification(b,'issus.delivery.delivered',hold.body.commentId);
  const before=Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment WHERE repo_id=$1 AND issue_number=$2`,[repoId,number])).rows[0].count);
  h.advance(6000);const retried=await notification(b,'issus.delivery.redelivered',hold.body.commentId);assertContext(retried,holdBody,hold.body.commentId,'delivered',1);receipt(b,retried);
  h.advance(30000);const second=await b.until(f=>f.type==='event'&&f.event.action==='issus.delivery.redelivered'&&f.event.payload.deliveryId===holdQueued.event.payload.deliveryId&&f.event.payload.attempt===2);assertContext(second,holdBody,hold.body.commentId,'delivered',2);
  assert.equal(Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment WHERE repo_id=$1 AND issue_number=$2`,[repoId,number])).rows[0].count),before);
  const escalation=await a.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.content.body.includes('hold-overdue'));assert.deepEqual(escalation.event.payload.issue,{repoId,issueNumber:number});
  const holdAck=await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${hold.body.commentId} STATE:hold\n수용 — 중단 유지.\nNEXT: 해제 대기.`);assert.equal(holdAck.status,201,JSON.stringify(holdAck));
  const inbox=await h.http(`/v1/inbox?repo=tester/delivery&issues=${number}`,undefined,B.token);assert.ok(inbox.body.activeHolds.includes(hold.body.commentId));
  const decision=await post(A,`FROM:${A.alias}/s1 TO:${B.alias} TYPE:DECISION ACK-BY:${deadline()} SUPERSEDES:${hold.body.commentId}\nDECISION: 중단 해제.\nNEXT: ACK.`,{compactDeferredReason:'전체 수용 시험의 중단 해제'});assert.equal(decision.status,201,JSON.stringify(decision));
  assert.equal((await post(B,`FROM:${B.alias}/s1 TO:${A.alias} TYPE:ACK RE:${decision.body.commentId}\n수용 — 해제 확인.\nNEXT: 요약.`)).status,201);
  const final=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:REPORT STATE:done RE:${report.body.commentId}\n두 세션 전달 완료.\nNEXT: COMPACT 후 닫기.\n---\n근거: integration`);assert.equal(final.status,201,JSON.stringify(final));
  const count=Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment WHERE repo_id=$1 AND issue_number=$2`,[repoId,number])).rows[0].count);
  for(let i=count;i<25;i++) assert.equal((await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:NOTE\n구간 댓글 ${i+1}.\nNEXT: OWNER 요약.`)).status,201);
  const due=await a.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.content.body.includes('issus.compact.due')&&JSON.parse(f.event.payload.content.body).issue.issueNumber===number);assert.deepEqual(due.event.payload.issue,{repoId,issueNumber:number});
  const beforeSummary=await h.http(I,undefined,A.token);
  const finished=await h.http(`${I}/body`,{body:beforeSummary.body.body.replace(/^STATE:running /,'STATE:done ')},A.token,{method:'PATCH',headers:{'if-match':`"${beforeSummary.body.revision}"`}});assert.equal(finished.status,200,JSON.stringify(finished));
  const packet=await h.http(`${I}/compact/packet`,undefined,A.token);assert.equal(packet.status,200,JSON.stringify(packet));const p=packet.body;
  const compact=await post(A,`FROM:${A.alias}/s1 TO:ALL TYPE:COMPACT SEEN:${p.throughId}\n## ===== COMPACT #${number} through ${p.throughId} =====\nASK 수신·ACK·반영, HOLD 재전달2회와 해제 확인. 미확인: 없음.\nNEXT: 닫기.\n---\ncompacted-by:${A.alias}`,{compactPacketToken:p.packetToken,sampledIds:p.comments.slice(-3).map((c:any)=>c.id),compactedBy:A.alias});assert.equal(compact.status,201,JSON.stringify(compact));
  const current=await h.http(I,undefined,A.token),closed=await h.http(`${I}/close`,{reason:'두 세션 전체 수용 완료',finalReportId:final.body.commentId},A.token,{headers:{'if-match':`"${current.body.revision}"`}});assert.equal(closed.status,200,JSON.stringify(closed));assert.equal(closed.body.isOpen,false);
  const closedFrame=await b.until(f=>f.type==='event'&&f.event.action==='issus.delivery.queued'&&f.event.payload.content.body.includes('issus.issue.closed'));assert.deepEqual(closedFrame.event.payload.issue,{repoId,issueNumber:number});
  assert.ok(a.lines.concat(b.lines).every(line=>!line.includes('\n')));
  const ticks=await eventually(async()=>(await h.pool.query(`SELECT count(*)::int AS n FROM event_store WHERE action='issus.clock.tick' AND source='scheduler'`)).rows[0].n,n=>n>=2);
  t.diagnostic(JSON.stringify({assembly:'production broker + worker + scheduler factories',sessions:2,standaloneStates:['posted','delivered','acked','applied'],holdAttempts:2,generatedRetryComments:0,nativeCompactDue:true,packetFixture:false,compactPublished:true,issueClosed:true,schedulerTicks:ticks}));
 }finally {await h.cleanup();}
});
