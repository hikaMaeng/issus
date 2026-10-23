import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {IssusClient,issuePath,repoPath} from 'issus_domain/front';
import {root,emitted,fakeCli,sleep,iso} from './runner-fixtures.mjs';
import {createLiveRunner} from './runner-live-session.mjs';
import {liveCommentBody} from './runner-live-body.mjs';

// Host command: compile runner.tsconfig.json, then node apps/cli/tests/tools/runner-live.mjs.
// Existing credential provider supplies only this environment value. Never read or print secret files.
const token=process.env.ISSUS_RUNNER_TEST_BOOTSTRAP_TOKEN;
if(!token) {console.error('BOOTSTRAP_TOKEN_UNAVAILABLE: inject ISSUS_RUNNER_TEST_BOOTSTRAP_TOKEN from the existing credential provider');process.exit(2);}
const server=process.env.ISSUS_RUNNER_TEST_URL??'http://127.0.0.1:18140';
if(new URL(server).origin!=='http://127.0.0.1:18140') throw new Error('LIVE_TARGET_MUST_BE_AUTHORIZED_LOOPBACK');
const {mask}=await import(emitted('redaction/index.js'));
const bootstrap=new IssusClient({server,token});
const owner=process.env.ISSUS_RUNNER_TEST_OWNER??'hikaMaeng';
const stamp=new Date().toISOString().replace(/[^0-9]/gu,'').slice(0,14),code='r'+randomBytes(2).toString('hex'),slug='runner-test-'+stamp+'-'+code;
const evidence=join(root,'.cache/runner-implementation/live-'+stamp),sessions=[],issues=[],checks=[];
await mkdir(evidence,{recursive:true});
const write=(client,path,body,extra={})=>client.write(path,{method:'POST',body,key:randomUUID(),...extra},20000);
let repo,repoId,sender,agent,senderAlias=code+'-1-orch',agentAlias=code+'-4-runner',board,executable;
const log=(name,data)=>{checks.push({name,...data});console.log(name+' '+JSON.stringify(data));};
const createIssue=async(title,ownerAlias=senderAlias)=>{
 const r=await write(sender,repoPath(repo)+'/issues',{title,body:`STATE:running OWNER:${ownerAlias} UPDATED:${iso(0)} BOARD:#${board}\nGOAL: isolated runner fake CLI integration\nNEXT: tests and cleanup`});issues.push({number:r.number,owner:ownerAlias});return r.number;
};
const post=(client,n,body)=>write(client,issuePath(repo,n)+'/comments',{body:liveCommentBody(body)});
const runner=async(n,opts={})=>{
 const o={me:agentAlias,exec:'codex',model:'gpt-6.1-sol',effort:'high',cwd:root,sandbox:'workspace-write',repo,issue:n,boards:[board],allowedSenders:[senderAlias],allowedTypes:['ASK','HOLD','DECISION','HANDOFF'],once:true,untilMs:20000,timeoutMs:30000,recordInfo:true,evidenceRoot:join(root,'.cache/runner'),executable,...opts};
 const h=await createLiveRunner({client:agent,sessions,alias:agentAlias,options:o,dependencies:{env:process.env,pollMs:100,onEvent:s=>console.log(s)}});
 log('AUTH_BOUND',{alias:h.d.principal.alias,sid:h.d.principal.sid,sessionId:h.d.principal.sessionId});return h;
};
const comments=async(n)=>(await sender.request(issuePath(repo,n)+'/comments?sinceCompact=false&limit=500')).data.items;
async function cleanIssue(entry) {
 const client=entry.owner===agentAlias?agent:sender;
 let detail=(await client.request(issuePath(repo,entry.number))).data;
 if(!detail.issue.isOpen) return;
 const oldOwner=entry.owner;
 const report=await post(client,entry.number,`FROM:${oldOwner}/s1 TO:ALL TYPE:REPORT STATE:done\n격리 runner 시험 종료. 실제 모델 호출 없음.\nNEXT: 시험 이력 보존, 세션 revoke.\n---\n근거: ${evidence.replaceAll('\\','/')}`);
 detail=(await client.request(issuePath(repo,entry.number))).data;
 const body=detail.body.replace(/^STATE:\S+/u,'STATE:done').replace(/UPDATED:\S+/u,'UPDATED:'+iso(0));
 await write(client,issuePath(repo,entry.number)+'/body',{body},{method:'PATCH',revision:detail.revision});
 const packet=(await client.request(issuePath(repo,entry.number)+'/compact/packet?format=json')).data;
 const compact=`FROM:${oldOwner}/s1 TO:ALL TYPE:COMPACT SEEN:${packet.throughId}\n## ===== COMPACT #${entry.number} through ${packet.throughId} =====\nrunner fake CLI 시험 종료. 결과는 최종 REPORT ${report.commentId}. 미점유 자원 없음.\ncompacted-by:${oldOwner}`;
 await write(client,issuePath(repo,entry.number)+'/comments',{body:liveCommentBody(compact),compactPacketToken:packet.packetToken,sampledIds:packet.comments.slice(0,3).map(c=>c.id),compactedBy:oldOwner});
 detail=(await client.request(issuePath(repo,entry.number))).data;
 await write(client,issuePath(repo,entry.number)+'/close',{reason:'completed',finalReportId:report.commentId},{revision:detail.revision});
 log('CLEAN_ISSUE',{number:entry.number,closed:true});
}
let failed;
try {
 const created=await write(bootstrap,'/v1/repos',{owner,slug,projectCode:code,autoBoard:true});repo=owner+'/'+slug;repoId=created.repoId;board=created.board.number;log('CREATE_REPO',{repo,repoId,board});
 for(const alias of [senderAlias,agentAlias]) {
  await write(bootstrap,`/v1/owners/${encodeURIComponent(owner)}/aliases`,{name:alias,role:'test',model:'fake',scope:'isolated runner integration',repos:[repoId],announcementBody:`FROM:${alias}/by-${code}-system TO:ALL TYPE:ALIAS\n${alias} | runner test | fake | isolated | s1`});
  const session=await write(bootstrap,'/v1/sessions',{alias,sid:'s1'});sessions.push(session);
  log('SESSION_ISSUED',{alias:session.alias,sid:session.sid,sessionId:session.sessionId,fields:Object.keys(session).sort()});
 }
 sender=new IssusClient({server,token:sessions.find(x=>x.alias===senderAlias).token});agent=new IssusClient({server,token:sessions.find(x=>x.alias===agentAlias).token});
 executable=await fakeCli(join(evidence,'fixture'));
 const n=await createIssue('R01 runner fake echo'),nonce=randomUUID(),h=await runner(n),running=h.run();
 await sleep(200);const ask=await post(sender,n,`FROM:${senderAlias}/s1 TO:${agentAlias} TYPE:ASK ACK-BY:${iso(120000)}\nASK @${agentAlias}: fake echo nonce=${nonce}`);
 assert.equal(await running,0);
 const job=Object.values(h.store.data.jobs).find(x=>x.commentId===ask.commentId);assert.ok(job);assert.equal(job.spawnCount,1);assert.equal(job.phase,'PROCESSED');assert.equal(job.outcome,'done');
 const rows=await comments(n);assert.equal(rows.filter(c=>c.body.split('\n')[0].includes('TYPE:REPORT')&&c.body.includes('RE:'+ask.commentId)).length,1);
 assert.ok(rows.some(c=>c.body.includes('TYPE:ACK RE:'+ask.commentId)));assert.ok(rows.some(c=>c.body.includes(nonce)&&c.body.includes('TYPE:REPORT')));
 const inbox=(await agent.request('/v1/inbox?'+new URLSearchParams({repo,issues:String(n),me:agentAlias,sinceCompact:'true',limit:'500'}))).data;
 assert.equal(inbox.ackState.find(x=>x.directiveId===ask.commentId)?.state,'applied');assert.ok(inbox.processedCursor);
 log('R01_PASS',{issue:n,ask:ask.commentId,delivery:job.id,ack:job.ackId,report:job.reportId,spawn:job.spawnCount,phase:job.phase,processedCursor:inbox.processedCursor});
 const restart=await runner(n,{untilMs:500});assert.equal(await restart.run(),3);assert.equal(restart.store.data.jobs[job.id].spawnCount,1);log('R02_RESTART_PASS',{spawn:1,report:1});

 const source=await createIssue('R HANDOFF source'),target=await createIssue('R HANDOFF target',agentAlias),hh=await runner(source),hr=hh.run();await sleep(100);
 const handoff=await post(sender,source,`FROM:${senderAlias}/s1 TO:${agentAlias} TYPE:HANDOFF ACK-BY:${iso(120000)} REPLY-IN:#${target}\n수용 후 fake echo nonce=${randomUUID()}`);
 assert.equal(await hr,0);
 const handoffInbox=(await agent.request('/v1/inbox?'+new URLSearchParams({repo,issues:String(source),me:agentAlias,sinceCompact:'true',limit:'500'}))).data;
 assert.equal(handoffInbox.handoffs.find(x=>x.commentId===handoff.commentId)?.status,'accepted');
 const targetRows=await comments(target);assert.ok(targetRows.some(x=>x.body.includes('TYPE:ACK RE:'+handoff.commentId)));assert.ok(targetRows.some(x=>x.body.includes('TYPE:REPORT')&&x.body.includes('RE:'+handoff.commentId)));
 const detail=(await sender.request(issuePath(repo,source))).data;const complete=await write(sender,issuePath(repo,source)+`/handoffs/${handoff.commentId}/complete`,{expectedRevision:detail.revision});assert.equal(complete.status,'completed');
 log('HANDOFF_PASS',{source,target,handoff:handoff.commentId,accepted:true,originalOwnerComplete:true});
} catch(error) {failed=error;console.error(mask('LIVE_FAIL '+(error?.code??error?.message??'unknown'),token));}
finally {
 if(sender&&agent) for(const entry of issues) {try {await cleanIssue(entry);} catch(e) {log('CLEANUP_INCOMPLETE',{issue:entry.number,code:e.code??e.message});failed??=e;}}
 for(const session of sessions) {try {await write(bootstrap,'/v1/sessions/'+session.sessionId,undefined,{method:'DELETE'});log('SESSION_REVOKED',{sessionId:session.sessionId});} catch(e) {log('REVOKE_FAILED',{sessionId:session.sessionId,code:e.code??e.message});failed??=e;}}
 await writeFile(join(evidence,'result.json'),JSON.stringify({at:new Date().toISOString(),server,repo,repoId,checks,ok:!failed,immutableTestHistoryRetained:true},null,2)+'\n','utf8');
}
if(failed) process.exitCode=1;
