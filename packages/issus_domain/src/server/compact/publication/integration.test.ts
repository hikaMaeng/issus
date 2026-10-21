import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkComment,charCount,type CompactPacket} from '../../../common/index.js';
import {CoreError,issueById,readIssueHistory,sha256} from '../../backend/index.js';
import {compactHarness} from '../testing/harness.js';
import {lockCompactIssue,refreshCompactSegment} from '../segment/index.js';
import {readCompactHistory} from '../segment/history.js';

test('P6 U-C/I-06 real PostgreSQL + PGMQ',{timeout:120000},async t=>{
  const h=await compactHarness();
  t.diagnostic(`schema=${h.schema} brokerSchema=${h.brokerSchema} queue=${h.queueName}`);
  const fresh=async(n:number)=>{const p=await h.service.packet(h.alpha,h.repoId,n);assert.ok(p);return p;};
  const refresh=(n:number)=>h.uow.run(async tx=>refreshCompactSegment(tx,await lockCompactIssue(tx,h.ownerId,h.repoId,n)));
  const facts=async(n:number)=>(await h.pool.query(`SELECT payload FROM event_store WHERE action='issus.compact.due' AND payload->'issue'->>'issueNumber'=$1`,[String(n)])).rows;
  try {
    await t.test('24 no due / 25 due; replay, out-of-order source and threshold expansion do not duplicate',async()=>{
      const n=await h.newIssue(),ids=await h.add(n,24);assert.equal((await refresh(n)).due,false);assert.equal((await facts(n)).length,0);
      const [id]=await h.add(n,1);assert.equal((await refresh(n)).due,true);assert.equal((await facts(n)).length,1);
      const input=await h.reaction(id);assert.equal(await h.service.react(input),true);assert.equal(await h.service.react(input),false);await h.service.react(await h.reaction(ids[0]));
      assert.equal((await facts(n)).length,1);assert.equal((await h.service.status(h.alpha,h.repoId,n)).count,25);
      const due=(await facts(n))[0].payload;assert.equal(due.ownerAliasId,h.alpha.aliasId);assert.equal(due.generation,0);assert.deepEqual(due.reasons,['comments']);
      const [last]=await h.add(n,1,4000);await h.service.react(await h.reaction(last));assert.equal((await facts(n)).length,1);
      await assert.rejects(()=>h.service.react({...input,sourceSequence:'999999'}),(e:any)=>e.code==='REACTION_SOURCE_INVALID');
      await h.pool.query(`DELETE FROM ${h.q('compact_segment')} WHERE repo_id=$1 AND issue_number=$2`,[h.repoId,n]);
      await h.pool.query(`DELETE FROM ${h.q('projection_applied')} WHERE projection_name='compact.segment.v1' AND source_event_id=$1`,[input.sourceEventId]);
      await h.service.react(input);assert.equal((await facts(n)).length,1);assert.equal((await h.service.status(h.alpha,h.repoId,n)).count,26);
    });
    await t.test('39999/40000 raw codepoints and board29/30 persisted boundaries',async()=>{
      const n=await h.newIssue();await h.add(n,9,4000);await h.add(n,1,3999);assert.equal((await refresh(n)).chars,39999);assert.equal((await facts(n)).length,0);
      // One additional non-BMP character in a separate source comment crosses the raw full-body boundary.
      await h.post(n,{body:h.note('😀')});assert.equal((await refresh(n)).due,true);assert.equal((await facts(n)).length,1);assert.deepEqual((await facts(n))[0].payload.reasons,['chars']);
      const exact=await h.newIssue();await h.add(exact,10,4000);assert.equal((await refresh(exact)).chars,40000);assert.deepEqual((await facts(exact))[0].payload.reasons,['chars']);
      const board=await h.newIssue(true);await h.add(board,29);assert.equal((await refresh(board)).due,false);await h.add(board,1);assert.equal((await refresh(board)).due,true);assert.equal((await facts(board)).length,1);
    });
    await t.test('packet authorization, snapshots, masking, 204 empty and raw token absent from DB',async()=>{
      const n=await h.newIssue();assert.equal(await h.service.packet(h.alpha,h.repoId,n),null);await h.add(n,3);
      const secret='sk-'+'abcDEF0123'.repeat(3),email='test'+'@example.com';await h.post(n,{body:h.note(`${secret} ${email}`)});
      await assert.rejects(()=>h.service.packet(h.bravo,h.repoId,n),(e:any)=>e.status===403);
      const p=await fresh(n);assert.equal(p.count,4);assert.equal(p.comments.length,4);assert.equal(p.previousCompact,null);assert.equal(p.snapshotRevision,1);assert.ok(!JSON.stringify(p).includes(secret));assert.ok(!JSON.stringify(p).includes(email));
      const row=(await h.pool.query(`SELECT * FROM ${h.q('compact_packet')} WHERE token_hash=$1`,[sha256(p.packetToken)])).rows[0];assert.ok(row);assert.ok(!JSON.stringify(row).includes(p.packetToken));assert.equal(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime(),86400000);
    });
    await t.test('marker/through/2001-char reasons are the pinned checker; no comments on rejected metadata',async()=>{
      const n=await h.newIssue();await h.add(n,3);const p=await fresh(n),valid=h.compactRequest(n,p),base=String(valid.body);
      const bodies=[base.replace('## =====','## ===='),base.replace(`through ${p.throughId}`,`through 999999`),base+'x'.repeat(2001-charCount(base))];
      for(const body of bodies) {const r=await h.post(n,{...valid,body});assert.equal(r.httpStatus,422);assert.deepEqual((r.response.error as any).reasons.map((v:any)=>v.message),checkComment(body));}
      for(const patch of [{metadata:{}},{sampledIds:[p.comments[0].id]},{sampledIds:[p.comments[0].id,p.comments[0].id]},{sampledIds:['999999','999998','999997']},{compactedBy:'tt-1-missing'},{body:base.replace('compacted-by:tt-1-bravo','compacted-by:tt-1-alpha')},{body:base.replace(`#${n} through`,'#999 through')}]) assert.equal((await h.post(n,{...valid,...patch})).httpStatus,422);
      assert.equal((await h.post(n,{body:h.note('forbidden'),sampledIds:[]})).httpStatus,422);
      assert.equal((await h.pool.query(`SELECT count(*)::int n FROM ${h.q('comment')} WHERE issue_number=$1`,[n])).rows[0].n,3);
    });
    await t.test('stale last comment / revision / token expiry / mismatched hash each reject',async()=>{
      const n=await h.newIssue();await h.add(n,3);const p=await fresh(n);await h.add(n,1);assert.equal((await h.post(n,h.compactRequest(n,p))).httpStatus,409);
      const p2=await fresh(n);await h.intake.execute({principal:h.alpha,action:'issus.issue.body.edit',payload:{repoId:h.repoId,issueNumber:n,body:'STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T04:00+00:00\nGOAL: changed',expectedRevision:1},idempotencyKey:randomUUID()});
      const r=await h.post(n,h.compactRequest(n,p2));assert.equal((r.response.error as any).code,'COMPACT_STALE');
      const p3=await fresh(n);h.setClock(new Date('2026-10-22T04:00:00Z'));assert.equal((await h.post(n,h.compactRequest(n,p3))).httpStatus,410);h.setClock(new Date('2026-10-21T04:00:00Z'));
      const p4=await fresh(n);await h.pool.query(`UPDATE ${h.q('compact_packet')} SET packet_hash=$2 WHERE token_hash=$1`,[sha256(p4.packetToken),'0'.repeat(64)]);assert.equal((await h.post(n,h.compactRequest(n,p4))).httpStatus,409);
    });
    await t.test('append/send rollback includes comment pointer body revision segment facts queues and result; same key retry succeeds',async()=>{
      for(const failure of ['append','send']) {const n=await h.newIssue();await h.add(n,3);const p=await fresh(n),key=randomUUID(),request=h.compactRequest(n,p),before=await h.fingerprint();
        if(failure==='append') h.failAppend(true);else h.failSend(true);
        try {await assert.rejects(()=>h.post(n,request,h.alpha,key),new RegExp(`P6 injected ${failure==='append'?'append':'queue'} failure`));} finally {h.failAppend(false);h.failSend(false);}
        assert.equal(await h.fingerprint(),before);assert.equal((await h.post(n,request,h.alpha,key)).httpStatus,201);
      }
    });
    await t.test('COMPACT atomically resets generation, keeps identical fact metadata, RE chain and sinceCompact boundary',async()=>{
      const n=await h.newIssue();await h.add(n,3);const p=await fresh(n),request=h.compactRequest(n,p),key=randomUUID();const first=await h.post(n,request,h.alpha,key);assert.equal(first.httpStatus,201,JSON.stringify(first));
      const id=String(first.response.commentId),issue=(await h.pool.query(`SELECT * FROM ${h.q('issue')} WHERE number=$1`,[n])).rows[0];assert.equal(issue.compact_comment_id,id);assert.equal(issue.revision,2);assert.match(issue.body,new RegExp(`COMPACT:${id}`));
      const segment=(await h.pool.query(`SELECT * FROM ${h.q('compact_segment')} WHERE issue_number=$1`,[n])).rows[0];assert.equal(segment.count,0);assert.equal(Number(segment.chars),0);assert.equal(segment.generation,1);assert.deepEqual(segment.due_reasons,[]);
      const saved=(await h.pool.query(`SELECT metadata FROM ${h.q('comment')} WHERE id=$1`,[id])).rows[0].metadata;
      const events=(await h.pool.query(`SELECT payload FROM event_store WHERE (action='issus.comment.posted' AND payload->>'commentId'=$1) OR (action='issus.compact.posted' AND payload->>'compactId'=$1)`,[id])).rows;assert.equal(events.length,2);for(const e of events){assert.deepEqual(e.payload.metadata,saved);assert.ok(!JSON.stringify(e).includes(p.packetToken));}
      assert.deepEqual(await h.post(n,request,h.alpha,key),first);await assert.rejects(()=>h.post(n,{...request,sampledIds:[p.comments[2].id,p.comments[1].id,p.comments[0].id]},h.alpha,key),(e:any)=>e.code==='IDEMPOTENCY_CONFLICT');
      assert.equal(await h.service.packet(h.alpha,h.repoId,n),null);await h.add(n,2);const next=await fresh(n);assert.equal(next.previousCompactId,id);assert.equal(next.comments.length,2);assert.equal(next.previousCompact?.body,request.body);assert.match(next.suggestedEnvelope,new RegExp(`RE:${id}`));
      const r2=h.compactRequest(n,next);assert.equal((await h.post(n,{...r2,body:String(r2.body).replace(` RE:${id}`,'')})).httpStatus,422);const second=await h.post(n,r2);assert.equal(second.httpStatus,201);
      const tail=await h.add(n,2);const history=await h.uow.snapshot(tx=>readCompactHistory(tx,h.alpha,h.repoId,n,{limit:'1'}));assert.equal((history.compact as any).id,second.response.commentId);assert.equal((history.items as any[])[0].id,tail[0]);
      const page2=await h.uow.snapshot(tx=>readCompactHistory(tx,h.alpha,h.repoId,n,{cursor:history.nextCursor,limit:'1'}));assert.equal((page2.items as any[])[0].id,tail[1]);assert.equal(page2.nextCursor,null);
    });
    await t.test('control-only packets and prepare reason+safe idempotent original replay',async()=>{
      const n=await h.newIssue();await h.add(n,1);const first=await fresh(n);assert.equal((await h.post(n,h.compactRequest(n,first))).httpStatus,201);
      const issue=await h.uow.read(tx=>issueById(tx,h.alpha,h.repoId,n));await h.intake.execute({principal:h.alpha,action:'issus.issue.body.edit',payload:{repoId:h.repoId,issueNumber:n,body:issue.body+'\ncontrol-only',expectedRevision:issue.revision},idempotencyKey:randomUUID()});
      const p=await fresh(n);assert.equal(p.count,0);assert.equal(p.controlFactsSinceCompact.length,1);assert.equal(p.throughId,issue.compact_comment_id);assert.match(p.markdown,/CONTROL FACTS/);assert.equal((await h.post(n,h.compactRequest(n,p))).httpStatus,201);
      const m=await h.newIssue();await h.add(m,1);const key=randomUUID(),r=await h.service.prepare(h.alpha,h.repoId,m,'before-decision',key);assert.equal(r.httpStatus,201);assert.equal((await facts(m)).length,1);assert.deepEqual((await facts(m))[0].payload.reasons,['before-decision']);
      await h.add(m,1);assert.deepEqual(await h.service.prepare(h.alpha,h.repoId,m,'before-decision',key),r);await assert.rejects(()=>h.service.prepare(h.alpha,h.repoId,m,'before-handoff',key),(e:any)=>e.code==='IDEMPOTENCY_CONFLICT');
      const stored=(await h.pool.query(`SELECT response FROM ${h.q('command_result')} WHERE idempotency_key=$1`,[key])).rows[0];assert.ok(!JSON.stringify(stored).includes(String(r.response.packetToken)));
    });
    await t.test('history cursor retains original COMPACT and tail while a new summary commits',async()=>{
      const n=await h.newIssue();await h.add(n,3);const p=await fresh(n),first=await h.post(n,h.compactRequest(n,p));assert.equal(first.httpStatus,201);
      const ids=await h.add(n,3),page1=await h.uow.snapshot(tx=>readCompactHistory(tx,h.alpha,h.repoId,n,{limit:'1'}));
      assert.equal((page1.compact as any).id,first.response.commentId);assert.equal((page1.items as any[])[0].id,ids[0]);
      const next=await fresh(n),second=await h.post(n,h.compactRequest(n,next));assert.equal(second.httpStatus,201);await h.add(n,1);
      const page2=await h.uow.snapshot(tx=>readCompactHistory(tx,h.alpha,h.repoId,n,{cursor:page1.nextCursor,limit:'2'}));
      assert.equal((page2.compact as any).id,first.response.commentId);assert.deepEqual((page2.items as any[]).map(c=>c.id),ids.slice(1));assert.deepEqual(page2.snapshot,page1.snapshot);assert.equal(page2.nextCursor,null);
      const all=await h.uow.snapshot(tx=>readCompactHistory(tx,h.alpha,h.repoId,n,{sinceCompact:'false'}));assert.equal((all.items as any[]).length,9);
    });
    await t.test('prepare append failure rolls back due, packet and idempotency record; retry is complete',async()=>{
      const n=await h.newIssue();await h.add(n,1);const before=await h.fingerprint(),key=randomUUID();h.failAppend(true);
      try {await assert.rejects(()=>h.service.prepare(h.alpha,h.repoId,n,'before-close',key),/P6 injected append failure/);} finally {h.failAppend(false);}
      assert.equal(await h.fingerprint(),before);assert.equal((await facts(n)).length,0);
      const result=await h.service.prepare(h.alpha,h.repoId,n,'before-close',key);assert.equal(result.httpStatus,201);assert.deepEqual((await facts(n))[0].payload.reasons,['before-close']);assert.deepEqual(await h.service.prepare(h.alpha,h.repoId,n,'before-close',key),result);
    });
    await t.test('read-only preflight changes zero rows and observes stale packet',async()=>{
      const n=await h.newIssue();await h.add(n,3);const p=await fresh(n),request=h.compactRequest(n,p),before=await h.fingerprint();
      assert.equal((await h.intake.preflight(h.alpha,h.repoId,n,{mode:'comment',request})).valid,true);assert.equal(await h.fingerprint(),before);
      await h.add(n,1);const changed=await h.fingerprint();await assert.rejects(()=>h.intake.preflight(h.alpha,h.repoId,n,{mode:'comment',request}),(e:any)=>e.code==='COMPACT_STALE');assert.equal(await h.fingerprint(),changed);
    });
    await t.test('old HOLD/CLAIM/handoff obligations survive summary and legacy pending differs from ackState',async()=>{
      const n=await h.newIssue();const [seen]=await h.add(n,1);
      const claim=await h.post(n,{body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:CLAIM DUE:2026-10-21T06:00+00:00 SEEN:${seen}\n구간 점유.`});assert.equal(claim.httpStatus,201);
      const ask=await h.post(n,{body:'FROM:tt-1-bravo/s1 TO:tt-1-alpha TYPE:ASK ACK-BY:2026-10-21T04:05+00:00\nASK @tt-1-alpha: 구간 확인.'},h.bravo);assert.equal(ask.httpStatus,201);
      const hold=await h.post(n,{body:`FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:HOLD ACK-BY:2026-10-21T04:05+00:00 SEEN:${ask.response.commentId}\n중단 확인.`});assert.equal(hold.httpStatus,201);
      assert.equal((await h.post(n,{body:`FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:REPORT STATE:running RE:${ask.response.commentId}\n레거시 응답만.`})).httpStatus,201);
      const target=await h.newIssue();await h.pool.query(`UPDATE ${h.q('issue')} SET owner_alias_id=$3,body=replace(body,'OWNER:tt-1-alpha','OWNER:tt-1-bravo') WHERE repo_id=$1 AND number=$2`,[h.repoId,target,h.bravo.aliasId]);
      const handoff=await h.post(n,{body:`FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:HANDOFF ACK-BY:2026-10-21T04:05+00:00 REPLY-IN:#${target}\n후속 이관.`,compactDeferredReason:'긴급 이관'});assert.equal(handoff.httpStatus,201);
      const p=await fresh(n);assert.equal(p.pendingAppendix.pendingLegacy.global.includes(String(ask.response.commentId)),false);assert.ok(p.pendingAppendix.ackState.some(a=>a.directiveId===ask.response.commentId&&a.state==='waiting'));assert.ok(p.pendingAppendix.activeHolds.includes(String(hold.response.commentId)));assert.ok(p.pendingAppendix.claims.includes(String(claim.response.commentId)));
      assert.ok(p.pendingAppendix.handoffs.includes(String(handoff.response.commentId)));assert.equal((await h.post(n,h.compactRequest(n,p))).httpStatus,201);await h.add(n,1);const next=await fresh(n);assert.ok(next.pendingAppendix.activeHolds.includes(String(hold.response.commentId)));assert.ok(next.pendingAppendix.claims.includes(String(claim.response.commentId)));assert.ok(next.pendingAppendix.handoffs.includes(String(handoff.response.commentId)));assert.match(next.markdown,new RegExp(`/comments/${hold.response.commentId}`));
    });
    await t.test('DECISION deferred reason reaches command hash, stored metadata and masked packet audit',async()=>{
      const n=await h.newIssue();await h.add(n,1);const reason='긴급 판단: '+'person'+'@example.com';
      const body='FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:DECISION ACK-BY:2026-10-21T04:05+00:00\n긴급 선행 요약 생략.';
      assert.equal((await h.post(n,{body})).httpStatus,422);const key=randomUUID(),r=await h.post(n,{body,compactDeferredReason:reason},h.alpha,key);assert.equal(r.httpStatus,201);
      const stored=(await h.pool.query(`SELECT metadata FROM ${h.q('comment')} WHERE id=$1`,[r.response.commentId])).rows[0];assert.equal(stored.metadata.compactDeferredReason,reason);
      await assert.rejects(()=>h.post(n,{body,compactDeferredReason:'다른 사유'},h.alpha,key),(e:any)=>e.code==='IDEMPOTENCY_CONFLICT');
      const p=await fresh(n);assert.ok(p.controlFactsSinceCompact.some(f=>f.action==='issus.comment.posted'));assert.ok(!JSON.stringify(p).includes(reason));assert.match(p.markdown,/MASKED:email/);
    });
    await t.test('OWNER transfer invalidates snapshot; prepare empty204 is idempotent and purpose facts dedupe',async()=>{
      const n=await h.newIssue(),key=randomUUID();const empty=await h.service.prepare(h.alpha,h.repoId,n,'before-close',key);assert.equal(empty.httpStatus,204);assert.deepEqual(await h.service.prepare(h.alpha,h.repoId,n,'before-close',key),empty);assert.equal((await facts(n)).length,1);
      await h.add(n,1);await h.service.prepare(h.alpha,h.repoId,n,'before-close',randomUUID());assert.equal((await facts(n)).length,1);
      const p=await fresh(n);await h.pool.query(`UPDATE ${h.q('issue')} SET owner_alias_id=$3,revision=revision+1,body=replace(body,'OWNER:tt-1-alpha','OWNER:tt-1-bravo') WHERE repo_id=$1 AND number=$2`,[h.repoId,n,h.bravo.aliasId]);
      const req=h.compactRequest(n,p);req.body=String(req.body).replace('FROM:tt-1-alpha/s1','FROM:tt-1-bravo/s1');const r=await h.post(n,req,h.bravo);assert.equal((r.response.error as any).code,'COMPACT_STALE');
    });
  }finally{await h.cleanup();t.diagnostic('P6 dedicated domain/broker schemas and PGMQ queue cleaned');}
});
