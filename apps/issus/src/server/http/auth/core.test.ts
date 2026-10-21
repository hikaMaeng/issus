import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {requestHash,sha256,CoreError,issueById,applyProjection,type CorePrincipal} from 'issus_domain/server';
import {corePrincipal,runMigrations,runtimeAuthMigration,runtimeHistoryMigration} from 'issus_runtime/server';
import {QUEUES,parseFactPayload,type FactAction} from 'issus_domain/common';
import {startCoreHarness} from './testing.js';

const enabled=!!process.env.ISSUS_TEST_DATABASE_URL;
const stamp='2026-10-21T04:00:00+00:00';
test('P4 real DB + listening HTTP acceptance',{skip:!enabled},async t=>{
  const h=await startCoreHarness();
  const R='/v1/repos/tester/core';
  let repoId:string,alphaToken:string,bravoToken:string,alpha:CorePrincipal,bravo:CorePrincipal,issueNumber:number,askId:string;
  const q=(name:string)=>`"${h.schema}"."${name}"`;
  const sqlCount=async(table:string)=>(await h.pool.query(`SELECT count(*)::int AS n FROM ${q(table)}`)).rows[0].n;
  async function fingerprint() {
    const tables=(await h.pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[h.schema])).rows.map(r=>r.tablename);
    const rows:unknown[]=[];
    for(const table of tables) rows.push([table,(await h.pool.query(`SELECT to_jsonb(t) AS row FROM ${q(table)} t ORDER BY to_jsonb(t)::text`)).rows]);
    for(const table of ['event_store','event_stream_sequence']) rows.push([table,(await h.pool.query(`SELECT to_jsonb(t) AS row FROM "${h.brokerSchema}"."${table}" t ORDER BY to_jsonb(t)::text`)).rows]);
    for(const queue of Object.values(QUEUES)) rows.push([queue,(await h.pool.query(`SELECT to_jsonb(t) AS row FROM pgmq."q_${h.queueName(queue)}" t ORDER BY msg_id`)).rows]);
    return sha256(JSON.stringify(rows));
  }
  async function post(from:string,to:string,type:string,content:string,extra='',token=alphaToken,number=issueNumber,metadata:Record<string,unknown>={}) {return h.http(`${R}/issues/${number}/comments`,{body:`FROM:${from} TO:${to} TYPE:${type}${extra?' '+extra:''}\n${content}`, ...metadata},token);}
  async function newIssue(owner='tt-1-alpha',title='core case') {const r=await h.http(`${R}/issues`,{title,body:`STATE:running OWNER:${owner} UPDATED:${stamp}\nGOAL: integration`});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.number as number;}
  async function packet(number:number,token=alphaToken) {
    const issue=(await h.pool.query(`SELECT * FROM ${q('issue')} WHERE repo_id=$1 AND number=$2`,[repoId,number])).rows[0];
    const comments=(await h.pool.query(`SELECT id FROM ${q('comment')} WHERE repo_id=$1 AND issue_number=$2 ORDER BY id`,[repoId,number])).rows;
    const tail=comments.filter(c=>!issue.compact_comment_id||BigInt(c.id)>BigInt(issue.compact_comment_id));const through=comments.at(-1)?.id??'0';
    const tokenValue=randomBytes(32).toString('base64url'),packetId=randomUUID();
    await h.pool.query(`INSERT INTO ${q('compact_packet')}(id,owner_id,repo_id,issue_number,previous_compact_id,through_id,snapshot_revision,packet_hash,token_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2026-10-22T04:00:00Z')`,[packetId,h.bootstrap.ownerId,repoId,number,issue.compact_comment_id,through,issue.revision,sha256(packetId),sha256(tokenValue),{chars:100}]);
    return {issue,token:tokenValue,through,samples:tail.slice(0,3).map(c=>c.id as string)};
  }
  async function compact(number:number,token=alphaToken,alias='tt-1-alpha') {const p=await packet(number,token);const r=await post(`${alias}/s1`,'ALL','COMPACT',`## ===== COMPACT #${number} through ${p.through} =====\n구간 요약.\ncompacted-by:${alias}`,`SEEN:${p.through}${p.issue.compact_comment_id?' RE:'+p.issue.compact_comment_id:''}`,token,number,{compactPacketToken:p.token,sampledIds:p.samples,compactedBy:alias});assert.equal(r.status,201,JSON.stringify(r.body));return r;}
  try {
    await t.test('ready checks DB pgmq migrations queues',async()=>{assert.equal((await h.http('/health')).status,200);const ready=await h.http('/ready');assert.equal(ready.status,200);assert.equal(Object.values(ready.body.checks).every(Boolean),true);});
    const repo=await h.http('/v1/repos',{owner:'tester',slug:'core',projectCode:'tt',autoBoard:true});assert.equal(repo.status,201,JSON.stringify(repo.body));repoId=repo.body.repoId;
    for(const name of ['tt-1-alpha','tt-1-bravo']) {const alias=await h.http('/v1/owners/tester/aliases',{name,role:'test',model:'fixture',scope:'core',repos:[repoId],announcementBody:`FROM:${name}/by-tt-system TO:ALL TYPE:ALIAS\n${name} | test | fixture | core | s1`});assert.equal(alias.status,201,JSON.stringify(alias.body));const session=await h.http('/v1/sessions',{alias:name,sid:'s1'});assert.equal(session.status,201,JSON.stringify(session.body));if(name.endsWith('alpha')) alphaToken=session.body.token;else bravoToken=session.body.token;}
    alpha=corePrincipal(await h.auth.verify(alphaToken!));bravo=corePrincipal(await h.auth.verify(bravoToken!));issueNumber=await newIssue();
    await t.test('I-02 same-key original response, payload mismatch, different-key duplicate',async()=>{
      const body='FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:ASK ACK-BY:2026-10-21T04:05:00+00:00\nASK @tt-1-bravo: 검토.';const key=randomUUID();
      const first=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key});assert.equal(first.status,201,JSON.stringify(first.body));askId=first.body.commentId;
      const retry=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key});assert.equal(retry.status,201);assert.deepEqual(retry.body,first.body);
      const conflict=await h.http(`${R}/issues/${issueNumber}/comments`,{body:body+' 변경'},alphaToken!,{key});assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'IDEMPOTENCY_CONFLICT');
      const duplicate=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!);assert.equal(duplicate.status,409);assert.equal(duplicate.body.error.code,'DUPLICATE_COMMENT');
      const counts=await h.pool.query(`SELECT count(*)::int n FROM ${q('comment')} WHERE repo_id=$1 AND issue_number=$2`,[repoId,issueNumber]);assert.equal(counts.rows[0].n,1);
      assert.equal((await h.pool.query(`SELECT count(*)::int n FROM event_store WHERE action='issus.comment.posted' AND payload->>'commentId'=$1`,[askId])).rows[0].n,1);
    });
    await t.test('preflight success/failure produces zero DB event queue diff; worker rechecks',async()=>{
      const candidates=[{body:'FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:ASK ACK-BY:2026-10-21T04:06:00+00:00\nASK @tt-1-bravo: 추가 확인.'},{body:'FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:ASK ACK-BY:2026-10-21T03:00:00+00:00\nASK @tt-1-bravo: 만료.'},{body:'FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:HOLD ACK-BY:2026-10-21T04:11:00+00:00 SEEN:'+askId+'\n중단.'},{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nunknown.',metadata:{}},{body:'FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:ASK ACK-BY:2026-10-21T04:05:00+00:00\nASK @tt-1-bravo: 검토.'}];
      for(let i=0;i<candidates.length;i++){const before=await fingerprint();const result=await h.http(`${R}/issues/${issueNumber}/preflight`,{mode:'comment',request:candidates[i]},alphaToken!);assert.equal(result.status,i===0?200:i===4?409:422,JSON.stringify(result.body));if(i===0){assert.equal(result.body.context.checkedAt,'2026-10-21T04:00:00.000Z');assert.equal(result.body.posted,false);}assert.equal(await fingerprint(),before);}
      const before=await fingerprint();assert.equal((await h.http(`${R}/issues/${issueNumber}/preflight`,{mode:'issue-body',request:{body:`STATE:done OWNER:tt-1-alpha UPDATED:${stamp}\nGOAL: done`}},alphaToken!)).status,428);assert.equal(await fingerprint(),before);
      const stale=await h.http(`${R}/issues/${issueNumber}/preflight`,{mode:'issue-body',request:{body:`STATE:done OWNER:tt-1-alpha UPDATED:${stamp}\nGOAL: done`}},alphaToken!,{headers:{'if-match':'"99"'}});assert.equal(stale.status,412);
      h.pause();const queued=await h.http(`${R}/issues/${issueNumber}/comments`,candidates[0],alphaToken!,{wait:false});assert.equal(queued.status,202);h.setClock(new Date('2026-10-21T04:07:00Z'));await h.resume();const operation=await h.http('/v1/operations/'+queued.body.operationId,undefined,alphaToken!);assert.equal(operation.body.httpStatus,422);assert.equal(operation.body.posted,false);h.setClock(new Date('2026-10-21T04:00:00Z'));
    });
    await t.test('ACK any reference is permitted; only direct TO ACK changes strong index',async()=>{
      const third=await post('tt-1-alpha/s1','tt-1-bravo','ACK','제3자 확인.',`RE:${askId}`);assert.equal(third.status,201);
      assert.equal((await h.pool.query(`SELECT acked_by_comment_id FROM ${q('directive')} WHERE comment_id=$1`,[askId])).rows[0].acked_by_comment_id,null);
      const ack=await post('tt-1-bravo/s1','tt-1-alpha','ACK','수용.',`RE:${askId}`,bravoToken!);assert.equal(ack.status,201);
      assert.equal((await h.pool.query(`SELECT acked_by_comment_id FROM ${q('directive')} WHERE comment_id=$1`,[askId])).rows[0].acked_by_comment_id,ack.body.commentId);
      const board=await post('tt-1-alpha/s1','ALL','NOTE','게시판 정보.','',alphaToken!,1);assert.equal(board.status,201);
      assert.equal((await post('tt-1-bravo/s1','tt-1-alpha','ACK','정보에 답변.',`RE:${board.body.commentId}`,bravoToken!,1)).status,201);
    });
    await t.test('append/send failures rollback projections counters events command results',async()=>{
      for(const failure of ['append','send']) {const before=await fingerprint();const key=randomUUID();if(failure==='append') h.setFailAppend(true);else h.setFailSend(true);
        const original=h.uow.options.reactions;try{await assert.rejects(()=>h.intake.execute({principal:alpha!,action:'issus.comment.post',payload:{repoId,issueNumber,body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nrollback-${failure}`},idempotencyKey:key}));}finally{h.setFailAppend(false);h.setFailSend(false);}
        assert.equal(await fingerprint(),before);const result=await h.intake.execute({principal:alpha!,action:'issus.comment.post',payload:{repoId,issueNumber,body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nrollback-${failure}`},idempotencyKey:key});assert.equal(result.httpStatus,201);
      }
    });
    await t.test('I-08 queue survives admission/restart; final replay has one comment',async()=>{
      h.pause();const key=randomUUID(),body='FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nrestart proof';const queued=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key,wait:false});assert.equal(queued.status,202);
      const rows=(await h.pool.query('SELECT msg_id,message FROM pgmq.read($1::text,1,100)',[h.queueName(QUEUES.intake)])).rows;assert.equal(rows.length,1);
      h.setFailAppend(true);await assert.rejects(()=>h.intake.executeIngress(rows[0].message));h.setFailAppend(false);
      const one=await h.intake.executeIngress(rows[0].message),two=await h.intake.executeIngress(rows[0].message);assert.deepEqual(two,one);
      const retry=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key});assert.equal(retry.status,201);assert.equal(retry.body.commentId,one.response.commentId);
      assert.equal((await h.pool.query(`SELECT count(*)::int n FROM ${q('comment')} WHERE body=$1`,[body])).rows[0].n,1);await h.pool.query('SELECT pgmq.delete($1::text,$2::bigint)',[h.queueName(QUEUES.intake),rows[0].msg_id]);await h.resume();
    });
    await t.test('I-08 real worker process death at read, precommit and postcommit boundaries',async()=>{
      h.pause();const key=randomUUID(),body='FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nactual child-process crash recovery';const queued=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key,wait:false});assert.equal(queued.status,202);
      const fromSource=import.meta.url.endsWith('.ts');const args=fromSource?['--import','tsx',fileURLToPath(new URL('./worker-fixture.ts',import.meta.url))]:['--import',pathToFileURL(process.env.P4_TEST_LOADER!).href,fileURLToPath(new URL('./worker-fixture.js',import.meta.url))];
      const counter=(await h.pool.query(`SELECT last_id FROM ${q('comment_counter')}`)).rows[0].last_id;
      for(const [stage,exit,comments] of [['after-read',71,0],['before-commit',72,0],['after-commit',73,1],['complete',0,1]] as const) {
        const worker=spawnSync(process.execPath,args,{env:{...process.env,P4_DOMAIN_SCHEMA:h.schema,P4_BROKER_SCHEMA:h.brokerSchema,P4_QUEUE_PREFIX:h.queueName(''),P4_CRASH_STAGE:stage},stdio:['ignore','inherit','inherit'],timeout:10000});assert.equal(worker.error,undefined);assert.equal(worker.status,exit,stage);
        assert.equal((await h.pool.query(`SELECT count(*)::int n FROM ${q('comment')} WHERE body=$1`,[body])).rows[0].n,comments,stage);
        if(!comments) assert.equal((await h.pool.query(`SELECT last_id FROM ${q('comment_counter')}`)).rows[0].last_id,counter);
      }
      const operation=await h.http('/v1/operations/'+queued.body.operationId,undefined,alphaToken!);assert.equal(operation.body.status,'done');assert.equal((await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key})).status,201);await h.resume();
    });
    await t.test('reaction source provenance is verified and projection applied once',async()=>{
      const fact=(await h.pool.query("SELECT * FROM event_store WHERE action='issus.comment.posted' ORDER BY sequence LIMIT 1")).rows[0];
      const input={sourceEventId:fact.event_id,sourceStreamId:fact.stream_id,sourceSequence:String(fact.sequence),action:fact.action,payload:{ownerId:h.bootstrap.ownerId}};let applied=0;
      for(let i=0;i<2;i++){const result=await h.uow.run(tx=>applyProjection(tx,'p4-test',input,h.bootstrap.ownerId,async()=>{applied++;}));assert.equal(result,i===0);}
      assert.equal(applied,1);await assert.rejects(()=>h.uow.run(tx=>applyProjection(tx,'p4-invalid',{...input,sourceSequence:'999999'},h.bootstrap.ownerId,async()=>{})),(e:unknown)=>e instanceof CoreError&&e.code==='REACTION_SOURCE_INVALID');
    });
    await t.test('session token once, no durable secret, conflict, explicit atomic reissue',async()=>{
      const key=randomUUID();const first=await h.http('/v1/sessions',{alias:'tt-board',sid:'s1'},h.bootstrapToken,{key});assert.equal(first.status,201,JSON.stringify(first.body));
      const retry=await h.http('/v1/sessions',{alias:'tt-board',sid:'s1'},h.bootstrapToken,{key});assert.equal(retry.status,409);assert.equal(retry.body.error.code,'SESSION_TOKEN_NOT_REPLAYABLE');assert.equal(retry.body.error.details.sessionId,first.body.sessionId);assert.equal(JSON.stringify(retry.body).includes(first.body.token),false);
      assert.equal((await h.http('/v1/sessions',{alias:'tt-board',sid:'s2'},h.bootstrapToken,{key})).body.error.code,'IDEMPOTENCY_CONFLICT');
      assert.equal((await h.http('/v1/sessions',{alias:'tt-board',sid:'s2'})).body.error.code,'SESSION_CONFLICT');
      const next=await h.http('/v1/sessions',{alias:'tt-board',sid:'s2',reissueOf:first.body.sessionId});assert.equal(next.status,201);assert.equal((await h.http('/v1/auth/me',undefined,first.body.token)).status,401);assert.equal((await h.http('/v1/auth/me',undefined,next.body.token)).status,200);
      assert.equal((await h.http('/v1/sessions',{alias:'tt-system',sid:'s1'})).status,403);
      const durable=await fingerprint();const scan=JSON.stringify((await h.pool.query(`SELECT response FROM ${q('command_result')}`)).rows)+JSON.stringify((await h.pool.query('SELECT payload FROM event_store')).rows);assert.equal(scan.includes(first.body.token),false);assert.equal(scan.includes(next.body.token),false);assert.equal(await fingerprint(),durable);
      const rollbackKey=randomUUID(),before=await fingerprint();h.setFailAppend(true);
      try{await assert.rejects(()=>h.auth.createSession(h.bootstrap,{alias:'tt-board',sid:'s3',reissueOf:next.body.sessionId},rollbackKey));}finally{h.setFailAppend(false);}
      assert.equal(await fingerprint(),before);assert.equal((await h.http('/v1/auth/me',undefined,next.body.token)).status,200);
      const recovered=await h.auth.createSession(h.bootstrap,{alias:'tt-board',sid:'s3',reissueOf:next.body.sessionId},rollbackKey);assert.equal(recovered.httpStatus,201);assert.equal((await h.http('/v1/auth/me',undefined,next.body.token)).status,401);
    });
    await t.test('COMPACT metadata, packet scope, stale and expiry; publication updates pointer atomically',async()=>{
      const n=await newIssue();await post('tt-1-alpha/s1','ALL','NOTE','summary source','',alphaToken!,n);const p=await packet(n);
      const request={body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:COMPACT SEEN:${p.through}\n## ===== COMPACT #${n} through ${p.through} =====\n요약.\ncompacted-by:tt-1-alpha`,compactPacketToken:p.token,sampledIds:p.samples,compactedBy:'tt-1-alpha'};
      let before=await fingerprint();assert.equal((await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request},alphaToken!)).status,200);assert.equal(await fingerprint(),before);
      await post('tt-1-alpha/s1','ALL','NOTE','concurrent source','',alphaToken!,n);before=await fingerprint();const stale=await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request},alphaToken!);assert.equal(stale.status,409);assert.equal(stale.body.error.code,'COMPACT_STALE');assert.equal(await fingerprint(),before);
      const result=await compact(n);assert.equal(result.body.revision,2);const issue=(await h.http(`${R}/issues/${n}`,undefined,alphaToken!)).body;assert.equal(issue.issue.compactCommentId,result.body.commentId);assert.match(issue.body,new RegExp(`COMPACT:${result.body.commentId}`));
      const next=await packet(n);await h.pool.query(`UPDATE ${q('compact_packet')} SET expires_at='2026-10-20T00:00Z' WHERE token_hash=$1`,[sha256(next.token)]);
      const expired=await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request:{...request,body:request.body.replace(/SEEN:\d+/,`SEEN:${next.through}`).replace(/through \d+/,`through ${next.through}`),compactPacketToken:next.token}},alphaToken!);assert.equal(expired.status,410);
    });
    await t.test('I-07 pending handoff/claim/strong waiting gates, accepted completion, final compact and close',async()=>{
      const source=await newIssue(),target=await newIssue('tt-1-bravo');
      const claim=await post('tt-1-alpha/s1','ALL','CLAIM','자원 점유.','DUE:2026-10-21T04:30:00+00:00 SEEN:0',alphaToken!,source);assert.equal(claim.status,201,JSON.stringify(claim.body));
      const handoff=await post('tt-1-alpha/s1','tt-1-bravo','HANDOFF','책임 이관.',`ACK-BY:2026-10-21T04:05:00+00:00 REPLY-IN:#${target}`,alphaToken!,source,{compactDeferredReason:'긴급 이관'});assert.equal(handoff.status,201,JSON.stringify(handoff.body));
      const report=await post('tt-1-alpha/s1','ALL','REPORT','최종 결과.','STATE:cancelled',alphaToken!,source);assert.equal(report.status,201);
      const blocked=await h.http(`${R}/issues/${source}/close`,{reason:'done',finalReportId:report.body.commentId},alphaToken!,{headers:{'if-match':'1'}});assert.equal(blocked.status,409);assert.equal(blocked.body.error.code,'CLOSE_BLOCKED');assert.ok(blocked.body.error.details.claims.includes(claim.body.commentId));assert.ok(blocked.body.error.details.handoffs.includes(handoff.body.commentId));
      const early=await h.http(`${R}/issues/${source}/handoffs/${handoff.body.commentId}/complete`,{expectedRevision:1},alphaToken!);assert.equal(early.status,409);
      const ack=await post('tt-1-bravo/s1','tt-1-alpha','ACK','이관 수신.',`RE:${handoff.body.commentId}`,bravoToken!,target);assert.equal(ack.status,201);
      assert.equal((await h.pool.query(`SELECT status FROM ${q('handoff')} WHERE comment_id=$1`,[handoff.body.commentId])).rows[0].status,'pending');
      const accepted=await h.http(`${R}/issues/${source}/handoffs/${handoff.body.commentId}/accept`,{ackCommentId:ack.body.commentId},bravoToken!);assert.equal(accepted.status,200);
      const complete=await h.http(`${R}/issues/${source}/handoffs/${handoff.body.commentId}/complete`,{expectedRevision:2},alphaToken!);assert.equal(complete.status,200);assert.match(complete.body.body,/STATE:cancelled/);assert.match(complete.body.body,new RegExp(`REPLY-IN:#${target}`));
      assert.equal((await post('tt-1-alpha/s1','ALL','RELEASE','자원 해제.',`RE:${claim.body.commentId}`,alphaToken!,source)).status,201);
      const final=await post('tt-1-alpha/s1','ALL','REPORT','이관 완료 최종 결과.','STATE:cancelled',alphaToken!,source);assert.equal(final.status,201);const summary=await compact(source);
      const closed=await h.http(`${R}/issues/${source}/close`,{reason:'not planned',finalReportId:final.body.commentId},alphaToken!,{headers:{'if-match':String(summary.body.revision)}});assert.equal(closed.status,200,JSON.stringify(closed.body));
      assert.equal((await post('tt-1-alpha/s1','ALL','NOTE','새 작업.','',alphaToken!,source)).status,409);assert.equal((await h.pool.query(`SELECT count(*)::int n FROM ${q('comment')} WHERE repo_id=$1 AND issue_number=1 AND body LIKE $2`,[repoId,`%완료 공유 #${source}:%`])).rows[0].n,1);
    });
    await t.test('HTTP authentication, CSRF, body cap, unknown metadata and operation scope',async()=>{
      assert.equal((await h.http(`${R}/issues/${issueNumber}`,undefined,'')).status,401);
      assert.equal((await h.http('/v1/repos',{owner:'tester',slug:'forbidden',projectCode:'qq'},alphaToken!)).status,403);
      const browser=await h.http('/v1/auth/browser-session',{},alphaToken!,{headers:{origin:'http://127.0.0.1:18140'}});assert.equal(browser.status,200);const cookie=browser.headers.get('set-cookie')!.split(';')[0];assert.match(browser.headers.get('set-cookie')!,/HttpOnly/);
      const noCsrf=await h.http(`${R}/issues/${issueNumber}/preflight`,{mode:'comment',request:{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\ncsrf'}},'',{headers:{cookie,origin:'http://127.0.0.1:18140'}});assert.equal(noCsrf.status,403);
      const csrf=await h.http(`${R}/issues/${issueNumber}/preflight`,{mode:'comment',request:{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\ncsrf'}},'',{headers:{cookie,origin:'http://127.0.0.1:18140','x-csrf-token':browser.body.csrfToken}});assert.equal(csrf.status,200);
      assert.equal((await h.http(`${R}/issues/${issueNumber}/comments`,{body:'x'.repeat(66000)},alphaToken!)).status,413);
      const key=randomUUID();const first=await h.http('/v1/auth/browser-session',{},alphaToken!,{key,headers:{origin:'http://127.0.0.1:18140'}});const retry=await h.http('/v1/auth/browser-session',{},alphaToken!,{key,headers:{origin:'http://127.0.0.1:18140'}});assert.equal(retry.status,200);assert.deepEqual(retry.body,first.body);assert.equal(retry.headers.get('set-cookie'),first.headers.get('set-cookie'));
      assert.equal((await h.http(`${R}/issues/${issueNumber}/comments`,{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nserver key',repoId},alphaToken!)).status,422);
      assert.equal((await h.http(`${R}/issues/not-a-number`,undefined,alphaToken!)).status,400);
    });
    await t.test('immutable history cursors keep snapshot and reject foreign scope',async()=>{
      const first=await h.http(`${R}/issues/${issueNumber}/comments?limit=1`,undefined,alphaToken!);assert.equal(first.status,200);assert.ok(first.body.nextCursor);const cursor=first.body.nextCursor;
      const before=await h.http(`${R}/issues/${issueNumber}/comments?limit=1&cursor=${cursor}`,undefined,alphaToken!);assert.equal(before.status,200);
      assert.equal((await post('tt-1-alpha/s1','ALL','NOTE','new after snapshot')).status,201);
      const replay=await h.http(`${R}/issues/${issueNumber}/comments?limit=1&cursor=${cursor}`,undefined,alphaToken!);assert.equal(replay.status,200);assert.deepEqual(replay.body.items,before.body.items);assert.deepEqual(replay.body.snapshot,before.body.snapshot);
      assert.equal((await h.http(`${R}/issues/${issueNumber}/comments?limit=1&cursor=${cursor}`,undefined,bravoToken!)).status,409);
    });
    await t.test('same UUID across principals has distinct fact identities; concurrent retry converges',async()=>{
      const key=randomUUID();const open=(p:CorePrincipal,title:string)=>h.intake.execute({principal:p,action:'issus.issue.open',payload:{repoId,title,body:`STATE:running OWNER:tt-1-alpha UPDATED:${stamp}\nGOAL: scoped UUID`},idempotencyKey:key});
      const [one,two]=await Promise.all([open(alpha!,'alpha key'),open(bravo!,'bravo key')]);assert.equal(one.httpStatus,201);assert.equal(two.httpStatus,201);
      const facts=(await h.pool.query("SELECT event_id FROM event_store WHERE action='issus.issue.opened' AND transaction_key=$1",[key])).rows;assert.equal(facts.length,2);assert.notEqual(facts[0].event_id,facts[1].event_id);
      const body='FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nconcurrent identical key';const retryKey=randomUUID();const replies=await Promise.all(Array.from({length:4},()=>h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!,{key:retryKey})));assert.equal(replies.every(r=>r.status===201),true);assert.equal(new Set(replies.map(r=>r.body.commentId)).size,1);
    });
    await t.test('HOLD survives ACK, authorization and legacy pending gates stay distinct',async()=>{
      const n=await newIssue();const hold=await post('tt-1-alpha/s1','tt-1-bravo','HOLD','작업 중단.','ACK-BY:2026-10-21T04:05:00+00:00 SEEN:0',alphaToken!,n);assert.equal(hold.status,201);
      const ack=await post('tt-1-bravo/s1','tt-1-alpha','ACK','수신 확인.',`RE:${hold.body.commentId}`,bravoToken!,n);assert.equal(ack.status,201);
      const blocked=await post('tt-1-bravo/s1','ALL','PLAN','실행 계획.','DUE:2026-10-21T04:30:00+00:00',bravoToken!,n);assert.equal(blocked.status,409);assert.equal(blocked.body.error.code,'ACTIVE_HOLD');
      const wrong=await post('tt-1-bravo/s1','ALL','NOTE','해제 시도.',`SUPERSEDES:${hold.body.commentId}`,bravoToken!,n);assert.equal(wrong.status,403);
      const release=await post('tt-1-alpha/s1','tt-1-bravo','DECISION','해제.',`ACK-BY:2026-10-21T04:05:00+00:00 SUPERSEDES:${hold.body.commentId}`,alphaToken!,n,{compactDeferredReason:'긴급 해제'});assert.equal(release.status,201,JSON.stringify(release.body));
      const pending=await post('tt-1-bravo/s1','ALL','CLAIM','점유.',`DUE:2026-10-21T04:30:00+00:00 SEEN:${release.body.commentId}`,bravoToken!,n);assert.equal(pending.status,409);assert.equal(pending.body.error.code,'PENDING_ACK');
      assert.equal((await post('tt-1-bravo/s1','tt-1-alpha','NOTE','답변으로 legacy만 해소.',`RE:${release.body.commentId}`,bravoToken!,n)).status,201);
      assert.equal((await post('tt-1-bravo/s1','ALL','CLAIM','점유.',`DUE:2026-10-21T04:30:00+00:00 SEEN:${release.body.commentId}`,bravoToken!,n)).status,201);
      const state=(await h.pool.query(`SELECT acked_by_comment_id FROM ${q('directive')} WHERE comment_id=$1`,[release.body.commentId])).rows[0];assert.equal(state.acked_by_comment_id,null);
    });
    await t.test('migration schema lock is repeatable and rejects altered applied SQL',async()=>{
      const baseline=await readFile(new URL('../../../../../../packages/issus_domain/src/server/backend/schema/0001-domain-baseline.sql',import.meta.url),'utf8');
      const options={pool:h.pool,schema:h.schema,queueName:h.queueName,migrations:[{id:'0001-domain-baseline',sql:baseline},runtimeAuthMigration,runtimeHistoryMigration]};
      const results=await Promise.all([runMigrations(options),runMigrations(options)]);assert.deepEqual(results.map(r=>r.applied),[[],[]]);
      await assert.rejects(()=>runMigrations({...options,migrations:[{id:'0001-domain-baseline',sql:baseline+'\n-- changed'},runtimeAuthMigration,runtimeHistoryMigration]}),/checksum mismatch/);
    });
    await t.test('I-P1 threshold/before-* due and auth/closed/unknown context remain read-only',async()=>{
      const n=await newIssue();for(let i=0;i<25;i++) assert.equal((await post('tt-1-alpha/s1','ALL','NOTE',`threshold ${i}`,'',alphaToken!,n)).status,201);
      let before=await fingerprint();const routine=await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request:{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nthreshold diagnostic'}},alphaToken!);assert.equal(routine.status,200);assert.equal(routine.body.compact.count,25);assert.deepEqual(routine.body.compact.reasons,['comments']);assert.equal(await fingerprint(),before);
      const target=await newIssue('tt-1-bravo');
      for(const type of ['DECISION','HANDOFF']) {before=await fingerprint();const body=`FROM:tt-1-alpha/s1 TO:tt-1-bravo TYPE:${type} ACK-BY:2026-10-21T04:05:00+00:00${type==='HANDOFF'?` REPLY-IN:#${target}`:''}\n선행 요약 진단.`;const r=await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request:{body,compactDeferredReason:'긴급 진단'}},alphaToken!);assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.compact.reasons.includes(type==='DECISION'?'before-decision':'before-handoff'));assert.equal(await fingerprint(),before);}
      const cases=[{body:'FROM:tt-1-bravo/s1 TO:ALL TYPE:NOTE\nmismatch',status:403},{body:'FROM:tt-1-alpha/s1 TO:tt-1-nobody TYPE:NOTE\nunknown alias',status:422}];
      for(const c of cases){before=await fingerprint();const r=await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request:{body:c.body}},alphaToken!);assert.equal(r.status,c.status);assert.equal(await fingerprint(),before);}
      const closed=(await h.pool.query(`SELECT number FROM ${q('issue')} WHERE repo_id=$1 AND NOT is_open LIMIT 1`,[repoId])).rows[0];before=await fingerprint();assert.equal((await h.http(`${R}/issues/${closed.number}/preflight`,{mode:'comment',request:{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nclosed diagnostic'}},alphaToken!)).status,409);assert.equal(await fingerprint(),before);
      before=await fingerprint();assert.equal((await h.http(`${R}/issues/${n}/preflight`,{mode:'comment',request:{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nauth diagnostic'}},'')).status,401);assert.equal((await h.http('/v1/repos/stranger/nope/issues/1/preflight',{mode:'comment',request:{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nforeign diagnostic'}},alphaToken!)).status,404);assert.equal(await fingerprint(),before);
    });
    await t.test('alias conflict scope, stable rename/tombstone and OWNER body consistency',async()=>{
      const check=await h.http('/v1/owners/tester/aliases/check',{name:'tt-1-alphx'});assert.equal(check.status,200);assert.equal(check.body.available,false);assert.ok(check.body.collisions.some((c:any)=>c.kind==='edit-distance-1'));
      const aliasCount=await sqlCount('alias');const conflict=await h.http('/v1/owners/tester/aliases',{name:'tt-1-alphx',role:'test',model:'fixture',scope:'core',repos:[repoId],announcementBody:'FROM:tt-1-alphx/by-tt-system TO:ALL TYPE:ALIAS\nreservation'});assert.equal(conflict.status,409);assert.equal(await sqlCount('alias'),aliasCount);
      const rename=await h.http('/v1/aliases/'+(alpha! as {aliasId:string}).aliasId+'/rename',{newName:'tt-1-zephyr',announcementBody:'FROM:tt-1-alpha/s1 TO:ALL TYPE:ALIAS\ntt-1-alpha→tt-1-zephyr | core'},alphaToken!);assert.equal(rename.status,200,JSON.stringify(rename.body));
      const me=await h.http('/v1/auth/me',undefined,alphaToken!);assert.equal(me.body.alias,'tt-1-zephyr');assert.equal(me.body.aliasId,(alpha! as {aliasId:string}).aliasId);
      const issue=await h.http(`${R}/issues/${issueNumber}`,undefined,alphaToken!);assert.match(issue.body.body,/OWNER:tt-1-zephyr /);
      const old=await h.http('/v1/owners/tester/aliases/check',{name:'tt-1-alpha'});assert.equal(old.body.available,false);
      const renamed=await h.http(`${R}/issues/${issueNumber}/comments`,{body:'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\nold alias blocked'},alphaToken!);assert.equal(renamed.status,409);assert.equal(renamed.body.error.code,'ALIAS_RENAMED');
    });
    await t.test('bad fixture HTTP422 reasons exactly equal golden, zero posting/events',async()=>{
      const root=new URL('../../../../../../packages/issus_domain/tests/fixtures/issue-board-v2/',import.meta.url);const golden=JSON.parse(await readFile(new URL('golden-errors.json',root),'utf8')) as Record<string,string[]>;
      for(const [filename,expected] of Object.entries(golden)){const body=await readFile(new URL('bad/'+filename,root),'utf8');const before=await fingerprint();const r=await h.http(`${R}/issues/${issueNumber}/comments`,{body},alphaToken!);assert.equal(r.status,422,filename);assert.deepEqual(r.body.error.reasons.map((x:any)=>x.message),expected,filename);assert.equal(await fingerprint(),before);}
    });
    await t.test('canonical good32 syntax HTTP200 including historical/legacy fixtures',async()=>{
      const root=new URL('../../../../../../packages/issus_domain/tests/fixtures/issue-board-v2/good/',import.meta.url);const files=(await readdir(root)).filter(f=>f.endsWith('.md'));assert.equal(files.length,32);
      for(const file of files){const body=await readFile(new URL(file,root),'utf8');const r=await h.http('/v1/validate',{mode:body.startsWith('STATE:')?'issue-body':'comment',body},'');assert.equal(r.status,200,file+JSON.stringify(r.body));}
    });
    await t.test('every persisted P4 fact/failure passes the unchanged P3 strict wire decoder',async()=>{
      const rows=(await h.pool.query("SELECT action,payload FROM event_store WHERE kind IN ('fact','failure') ORDER BY action,event_id")).rows;assert.ok(rows.length>30);
      for(const row of rows) assert.equal(parseFactPayload(row.action as FactAction,row.payload).ok,true,row.action+JSON.stringify(row.payload));
    });
    assert.deepEqual(h.failures,[]);
  }finally{await h.cleanup();}
});
