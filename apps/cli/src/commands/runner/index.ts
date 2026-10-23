import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {open,mkdir,unlink,readFile} from 'node:fs/promises';
import {header,checkComment,aliasOk,type InboxItem,type SessionPrincipal,type DomainServerFrame} from 'issus_domain/common';
import {ClientError,OperationTimeout,abortableDelay,issuePath,scopeKey,subscribe,type IssusClient,type SocketFactory} from 'issus_domain/front';
import {CommandContext} from '../../client/index.js';
import {socketFactory} from '../../client/socket/index.js';
import {CliError} from '../../output/index.js';
import {profileDirectory} from '../../profiles/index.js';
import {runnerOptions,type RunnerOptions} from './options/index.js';
import {atLeast,advance,RunnerStore,identityHash,validId,durableWrite,type Job,type Effect} from './state/index.js';
import {deliveryPolicy,refreshInbox,loadComment,loadIssue,type Comment,type Snapshot} from './delivery/index.js';
import {assemblePrompt} from './prompt/index.js';
import {reportBody} from './report/index.js';
import {gitSnapshot,startChild,probeVersion,type RunningChild,type ProcessResult} from './process/index.js';
import {mask,safeData} from './redaction/index.js';

export interface RunnerDependencies {client:IssusClient;principal:SessionPrincipal;options:RunnerOptions;env?:NodeJS.ProcessEnv;token?:string;signal?:AbortSignal;socket?:SocketFactory;pollMs?:number;json?:boolean;onEvent?:(s:string)=>void|Promise<void>;onDiagnostic?:(s:string)=>void|Promise<void>;snapshotGit?:typeof gitSnapshot;start?:typeof startChild;versionProbe?:typeof probeVersion}

/** Single-host serial executor. Transport callbacks stage bytes only; control handling never awaits the LLM. */
export class HostRunner {
  readonly store:RunnerStore;private readonly o:RunnerOptions;private readonly p:SessionPrincipal;
  private readonly abort=new AbortController();private running?:{job:Job;child:RunningChild};private queue=new Set<string>();private controls=new Set<string>();
  private staged:string[]=[];private serial:Promise<void>=Promise.resolve();private controlSerial:Promise<void>=Promise.resolve();private fatal:unknown;
  private snapshot?:Snapshot;private serverHolds=new Set<string>();private accepted=0;private exit=0;private finished=false;private bootstrap=true;
  private startedAny=false;
  private acknowledgements=new Map<string,Promise<void>>();
  private version?:Awaited<ReturnType<typeof probeVersion>>;
  constructor(readonly d:RunnerDependencies) {
    this.o=d.options;this.p=d.principal;
    if(this.o.me!==this.p.alias.toLowerCase()||(this.o.sid&&this.o.sid!==this.p.sid)) throw new CliError(2,'runner --me must match session token');
    const identity=identityHash([d.client.server,this.p.ownerId,this.p.aliasId]);
    const scope=scopeKey({server:d.client.server,owner:this.o.repo.split('/')[0],alias:this.p.alias,sid:this.p.sid,repos:[{repo:this.o.repo,issues:[this.o.issue],boards:this.o.boards}],me:[this.p.alias],sinceCompact:true});
    this.store=new RunnerStore(this.o.evidenceRoot,this.p.alias,identity,scope,this.p.sid,d.token,join(profileDirectory(d.env??process.env),'runner-locks'));
  }
  private async event(text:string):Promise<void> {await this.d.onEvent?.(mask(text,this.d.token));}
  private async progress(event:string,data:Record<string,unknown>={}):Promise<void> {
    const safe=safeData(data,this.d.token) as Record<string,unknown>;
    await this.event(this.d.json?JSON.stringify({event,...safe}):event.toUpperCase()+' '+Object.entries(safe).map(([key,value])=>key+'='+JSON.stringify(value)).join(' '));
  }
  private async effect(id:string,name:string,path:string,body:unknown):Promise<any> {
    const all=await this.store.effects(id);const e:Effect=all[name]??await this.store.effect(id,name,path,body,this.p.sessionId);
    if(e.done) return e.result;
    if(e.sessionId&&e.sessionId!==this.p.sessionId) throw new CliError(3,'RUNNER_OUTBOX_SESSION_CHANGED: unresolved old-session effect preserved; explicit recovery required');
    const result=await this.d.client.write(e.path,{method:'POST',body:e.body,key:e.key,onAccepted:async op=>{await this.store.updateEffect(id,name,{operationId:op.operationId});}},10000);
    await this.store.updateEffect(id,name,{done:true,result});
    if(name==='process') await this.progress('process',{commentId:this.store.data.jobs[id]?.commentId??null,deliveryId:id,disposition:(e.body as Record<string,unknown>).disposition});
    return result;
  }
  private async post(job:Job,name:string,issue:number,body:string):Promise<string> {
    const old=(await this.store.effects(job.id))[name];
    const path=old?.path??issuePath(this.o.repo,issue)+'/comments',request=old?.body??{body};
    if(!old) {
      const {data}=await this.d.client.request<{valid:boolean;posted:false}>(issuePath(this.o.repo,issue)+'/preflight',{method:'POST',body:{mode:'comment',request}});
      if(data.valid!==true||data.posted!==false) throw new Error('RUNNER_PREFLIGHT_INVALID');
    }
    const result=await this.effect(job.id,name,path,request);if(!/^\d+$/u.test(result.commentId)) throw new Error('RUNNER_COMMENT_RESPONSE_INVALID');return result.commentId;
  }
  private async acknowledge(job:Job,c:Comment,reason:string,state?:'hold'|'blocked'):Promise<void> {
    let task=this.acknowledgements.get(c.id);
    if(!task) {task=this.postAcknowledgement(job,c,reason,state);this.acknowledgements.set(c.id,task);}
    await task;
  }
  private async postAcknowledgement(job:Job,c:Comment,reason:string,state?:'hold'|'blocked'):Promise<void> {
    const h=header(c.body),to=h._from;if(!to) return;
    if(h._type==='HANDOFF'&&h.values.TO?.toLowerCase()===this.p.alias.toLowerCase()) {
      const target=this.handoffTarget(h.values['REPLY-IN']);
      if(target!==undefined) await this.store.change(()=>{job.replyIssue=target;});
    }
    if(!job.ackId) {
      const body=mask(`FROM:${this.p.alias}/${this.p.sid} TO:${to} TYPE:ACK RE:${c.id}${state?` STATE:${state}`:''}\n${reason}\n근거: ${this.store.path(job.id,'meta.json').replaceAll('\\','/')} · 산출물 보존.`,this.d.token);
      const id=await this.post(job,'ack',job.replyIssue??c.issueNumber,body);
      await this.store.change(d=>{
        // A queued frame can replace the virtual obligation while its ACK request is in flight.
        const current=d.jobs[d.sourceIndex['comment:'+c.id]]??job;
        for(const target of new Set([job,current])) {target.ackId=id;if(!atLeast(target,'ACK_POSTED')) advance(target,'ACK_POSTED');}
      });
      await this.store.evidence(job.id,'meta.json',{commentId:c.id,ackCommentId:id,state:'ACK_POSTED'});
      await this.progress('ack_posted',{commentId:c.id,deliveryId:job.item.delivery?.id??null,ackId:id});
    }
    if(h._type==='HANDOFF'&&job.replyIssue!==undefined&&job.replyIssue!==c.issueNumber) {
      await this.post(job,'handoff-source-link',c.issueNumber,`FROM:${this.p.alias}/${this.p.sid} TO:${to} TYPE:NOTE RE:${c.id} REPLY-IN:#${job.replyIssue}\nHANDOFF 수신 ACK ${job.ackId}는 REPLY-IN target에 게시됨. 수용은 별도 accept 결과를 따른다.`);
    }
    await this.store.change(async d=>{
      const current=d.jobs[d.sourceIndex['comment:'+c.id]]??job;
      if(current.id===job.id) return;
      const old=await this.store.effects(job.id),effects=await this.store.effects(current.id);
      for(const name of ['ack','handoff-source-link']) if(old[name]) {
        if(effects[name]&&effects[name].key!==old[name].key) throw new Error('RUNNER_ACK_EFFECT_CONFLICT');
        effects[name]=old[name];
      }
      await this.store.evidence(current.id,'outbox.json',effects);
    });
  }
  private handoffTarget(ref:string|undefined):number|undefined {
    if(!ref) return undefined;
    const match=/^#(\d+)$/u.exec(ref)??new RegExp('^'+this.o.repo.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'#(\\d+)$','u').exec(ref);
    return match&&Number.isSafeInteger(Number(match[1]))&&Number(match[1])>0?Number(match[1]):undefined;
  }
  private async receipt(job:Job):Promise<void> {
    const attempt=job.item.delivery!.attempt;
    await this.effect(job.id,'receipt-'+attempt,'/v1/deliveries/receipts',{deliveryIds:[job.id],attempts:[attempt]});
    await this.store.change(()=>{if(!atLeast(job,'RECEIPTED')) advance(job,'RECEIPTED');if(job.ackId&&!atLeast(job,'ACK_POSTED')) advance(job,'ACK_POSTED');});
  }
  private async requestRepost(job:Job,c:Comment):Promise<void> {
    await this.store.change(()=>{job.outcome='blocked';job.reason='NOENV_OR_INVALID';});
    if(!c.author?.alias||!aliasOk(c.author.alias)) return;
    await this.post(job,'noenv',c.issueNumber,`FROM:${this.p.alias}/${this.p.sid} TO:${c.author.alias} TYPE:ASK RE:${c.id} ACK-BY:${new Date(Date.now()+3600000).toISOString().replace(/\.\d{3}Z$/u,'+00:00')}\nASK @${c.author.alias}: 봉투 붙여 재게시\nNEXT: 유효 봉투 수신 전 실행 보류.`);
  }
  private async stage(item:InboxItem,receipted:boolean):Promise<void> {
    if(!item.delivery) return;
    const previous=this.store.data.sourceIndex[item.sourceEventId]??(item.commentId?this.store.data.sourceIndex['comment:'+item.commentId]:undefined);
    const job=await this.store.stage(item);
    if(!previous||previous!==job.id) await this.progress('delivery_accepted',{commentId:job.commentId,deliveryId:job.id,attempt:item.delivery.attempt});
    if(this.o.recordInfo||['ASK','HOLD','DECISION','HANDOFF'].includes(header(item.content.body)._type)) await this.store.evidence(job.id,'delivery.json',item);
    if(receipted) {await this.receipt(job);await this.enqueue(job);} else this.staged.push(job.id);
  }
  private async frame(frame:DomainServerFrame):Promise<void> {
    if(frame.type==='subscribed') {await this.progress('subscribed',{subscriptionId:frame.subscriptionId});return;}
    // Lifecycle facts are observed through authoritative inbox refresh, never new work.
    if(frame.type!=='event'||!['issus.delivery.queued','issus.delivery.redelivered','issus.delivery.escalated'].includes(frame.event.action)) return;
    const q=frame.event.payload as Record<string,any>;
    if(typeof q.deliveryId!=='string'||!validId(q.deliveryId)||(q.commentId!=null&&(typeof q.commentId!=='string'||!/^\d+$/u.test(q.commentId)))||!Number.isSafeInteger(q.attempt)||q.attempt<0||typeof q.content?.body!=='string'||typeof q.sourceEventId!=='string'||!validId(q.sourceEventId)||typeof q.sourceStreamId!=='string'||!q.sourceStreamId||typeof q.sourceSequence!=='string'||!/^\d+$/u.test(q.sourceSequence)) throw new Error('RUNNER_INVALID_DELIVERY_FRAME');
    const item:InboxItem={viewKey:q.commentId?'comment:'+q.commentId:'delivery:'+q.deliveryId,sourceEventId:q.sourceEventId,sourceStreamId:q.sourceStreamId,sourceSequence:q.sourceSequence,commentId:q.commentId??undefined,origin:'inbox',priority:q.classification??q.priority??'ME',content:q.content,
      delivery:{id:q.deliveryId,ordinal:q.ordinal??'0',state:'posted',attempt:q.attempt,aliasEventSequence:frame.event.sequence}};
    await this.stage(item,false);
  }
  private async receiveFrame(frame:DomainServerFrame):Promise<void> {
    try {await this.frame(frame);}
    catch(error) {
      // subscribe wraps callback errors as OUTPUT_FAILED; retain the original before that boundary.
      this.fatal??=error;
      const event=frame.type==='event'?frame.event:undefined,q=event?.payload as Record<string,unknown>|undefined;
      const raw=error instanceof Error?String((error as Error & {code?:string}).code??error.message):'';
      const diagnostic={code:/^[A-Z][A-Z0-9_]{0,119}$/u.test(raw)?raw:'RUNNER_FRAME_FAILED',
        action:event&&/^issus\.[a-z.]{1,80}$/u.test(event.action)?event.action:null,
        deliveryId:typeof q?.deliveryId==='string'&&validId(q.deliveryId)?q.deliveryId:null,
        sequence:event&&/^\d+$/u.test(event.sequence)?event.sequence:null};
      await durableWrite(join(this.store.directory,'frame-error.json'),JSON.stringify(diagnostic,null,2)+'\n',this.d.token).catch(()=>undefined);
      const output=mask('RUNNER_FRAME_ERROR '+JSON.stringify(diagnostic),this.d.token);
      await Promise.resolve().then(()=>this.d.onDiagnostic?this.d.onDiagnostic(output):this.d.onEvent?.(output)).catch(()=>undefined);
      throw error;
    }
  }
  private async enqueue(job:Job):Promise<void> {
    if(job.phase==='PROCESSED'||this.queue.has(job.id)||this.controls.has(job.id)) return;
    if(job.item.delivery?.state==='superseded'&&!job.spawnIntent) {await this.effect(job.id,'process','/v1/inbox/process',{deliveryIds:[job.id],disposition:'ignored',reason:'SOURCE_SUPERSEDED'});await this.store.change(()=>advance(job,'PROCESSED'));return;}
    if(!job.commentId) {await this.effect(job.id,'process','/v1/inbox/process',{deliveryIds:[job.id],disposition:'ignored',reason:'NON_COMMENT_FACT'});await this.store.change(()=>advance(job,'PROCESSED'));return;}
    if(atLeast(job,'REPORT_POSTED')) {this.queue.add(job.id);if(!this.bootstrap) this.drain();return;}
    const c=await loadComment(this.d.client,this.o.repo,job.commentId),issue=await loadIssue(this.d.client,this.o.repo,c.issueNumber),policy=deliveryPolicy(c,issue,this.o,this.p);
    if(policy.control) {
      this.controls.add(job.id);
      if(policy.type==='HOLD') {this.serverHolds.add(c.id);await this.store.change(d=>{d.holds=[...new Set([...d.holds,c.id])];});void this.running?.child.stop('HOLD').catch(e=>{this.fatal=e;});}
      this.controlSerial=this.controlSerial.then(()=>this.control(job,c)).catch(e=>{this.fatal=e;});return;
    }
    this.queue.add(job.id);
    if(!this.bootstrap) this.drain();
  }
  private drain():void {
    this.serial=this.serial.then(async()=>{
      for(const id of [...this.queue]) {
        if(this.finished||this.fatal||this.abort.signal.aborted||this.store.data.holds.length||this.bootstrap) break;
        const job=this.store.data.jobs[id];await this.execute(job);if(job.phase==='PROCESSED') this.queue.delete(id);
      }
    }).catch(e=>{this.fatal=e;});
  }
  private async control(job:Job,c:Comment):Promise<void> {
    const h=header(c.body);
    if(h._type==='HOLD') {
      const active=this.running;
      try {if(active) {await active.child.stop('HOLD');const result=await active.child.result;if(!result.stopped) throw new Error('HOLD_TREE_NOT_STOPPED');}}
      catch(e) {
        await this.acknowledge(job,c,'중단 실패. 소유 프로세스 확인 또는 종료가 불명확하여 새 spawn 차단.','blocked');
        await this.store.change(()=>{job.outcome='failed';job.reason='HOLD_TERMINATION_FAILED';advance(job,'RESULT_READY');});await this.finalize(job,c);throw e;
      }
      const stoppedAt=new Date().toISOString();await this.store.evidence(job.id,'meta.json',{state:'HELD',stoppedAt,ownedPid:active?.job.pid??null,treeStopped:true});
      await this.acknowledge(job,c,`수용. 중단 시각 ${stoppedAt}, 소유 PID ${active?.job.pid??0} 트리 종료 확인 또는 실행 중 자식 0. 산출물 보존.`,'hold');
      await this.store.change(()=>{job.outcome='failed';job.reason='HOLD';job.result='HOLD 수신. 새 실행 중단.';advance(job,'RESULT_READY');});
      await this.finalize(job,c);await this.progress('held',{commentId:c.id});
    } else {
      const supersedes=(h.values.SUPERSEDES??'').split(',');
      const fresh=await refreshInbox(this.d.client,this.o);
      this.serverHolds=new Set(fresh.page.activeHolds);
      const cleared=this.store.data.holds.filter(id=>supersedes.includes(id)&&!this.serverHolds.has(id));
      if(!cleared.length) {await this.acknowledge(job,c,'부분수용. 서버 active HOLD가 해제되지 않아 재개하지 않음.','blocked');await this.store.change(()=>{job.outcome='blocked';job.reason='HOLD_NOT_RELEASED';advance(job,'RESULT_READY');});await this.finalize(job,c);}
      else {
        await this.acknowledge(job,c,'수용. 권한 있는 DECISION과 서버 HOLD 해제를 대조함. 이전 실패 작업은 재실행하지 않음.');
        await this.store.change(d=>{d.holds=d.holds.filter(id=>!cleared.includes(id));});
        // A new explicitly addressed main-issue DECISION may carry a new assignment.
        const issue=await loadIssue(this.d.client,this.o.repo,c.issueNumber),p=deliveryPolicy(c,issue,this.o,this.p);
        if(p.direct&&this.o.allowedSenders.includes(p.from)&&this.o.allowedTypes.includes('DECISION')&&c.issueNumber===this.o.issue) {await this.store.change(()=>{job.resumeAuthorized=true;});this.controls.delete(job.id);this.queue.add(job.id);this.drain();return;}
        await this.store.change(()=>{job.outcome='blocked';job.reason='CONTROL_ONLY';advance(job,'RESULT_READY');});await this.finalize(job,c);
      }
    }
    this.controls.delete(job.id);this.drain();
  }
  private async barrier():Promise<void> {
    const snapshot=await refreshInbox(this.d.client,this.o,this.store.data.cursors,this.store.data.versions);this.snapshot=snapshot;
    this.serverHolds=new Set(snapshot.page.activeHolds);
    if(this.serverHolds.size) {await this.store.change(d=>{d.holds=[...new Set([...d.holds,...this.serverHolds])];});if(this.running) void this.running.child.stop('HOLD').catch(e=>{this.fatal=e;});}
    for(const item of snapshot.items) await this.stage(item,true);
    // Restore global obligations, including mention-only recipients that have no direct delivery.
    const pending=[...new Set(snapshot.page.pendingLegacy.global)];
    for(const id of pending) {
      const c=await loadComment(this.d.client,this.o.repo,id),h=header(c.body);
      const existing=Object.values(this.store.data.jobs).find(j=>j.commentId===id);
      if(h._noenv||checkComment(c.body).length) {await this.requestRepost(existing??await this.virtualJob(c),c);continue;}
      if(!['ASK','DECISION','HANDOFF','HOLD'].includes(h._type)||h._from===this.p.alias) continue;
      if(existing) {
        const issue=await loadIssue(this.d.client,this.o.repo,c.issueNumber),p=deliveryPolicy(c,issue,this.o,this.p);
        if(p.reason==='AUTHOR_PROVENANCE_MISMATCH') continue;
        if(!p.control&&!(p.type==='HANDOFF'&&p.execute)) await this.acknowledge(existing,c,p.execute?'수용. 수신 확인. 직렬 실행 전 정책·HOLD·pending 장벽을 다시 확인함.':`부분수용. 수신·장벽 확인만 수행. 실행하지 않음: ${p.reason}`);
      } else {
        const virtual=await this.virtualJob(c);
        const originIssue=await loadIssue(this.d.client,this.o.repo,c.issueNumber),policy=deliveryPolicy(c,originIssue,this.o,this.p);
        if(['AUTHOR_PROVENANCE_MISMATCH','NOENV_OR_INVALID'].includes(policy.reason)) {await this.store.change(()=>{virtual.reason=policy.reason;virtual.outcome='blocked';});continue;}
        await this.acknowledge(virtual,c,policy.direct&&policy.execute?'수용. 수신 확인. 실제 delivery와 receipt를 기다리며 업무는 미종결로 보존.':'부분수용. 보조 독자/범위 밖 지시 수신을 확인함. actual TO delivery ACK·실행 권한을 주장하지 않음.');
        await this.store.change(d=>{if(d.sourceIndex['comment:'+c.id]!==virtual.id) return;virtual.reason=policy.direct&&policy.execute?'WAITING_DELIVERY':'PENDING_LEGACY_AUXILIARY_ACK';if(!(policy.direct&&policy.execute)) {virtual.outcome='blocked';advance(virtual,'PROCESSED');}});
      }
    }
    await this.store.change(d=>{d.cursors=snapshot.cursors;d.versions=snapshot.versions;});
  }
  private async virtualJob(c:Comment):Promise<Job> {
    const old=Object.values(this.store.data.jobs).find(j=>j.commentId===c.id);if(old) return old;
    const id=randomUUID(),item:InboxItem={viewKey:'comment:'+c.id,commentId:c.id,sourceEventId:id,sourceStreamId:'legacy',sourceSequence:'0',origin:'history',priority:'ME',content:{body:''}};
    const job:Job={id,commentId:c.id,sourceEventId:id,item,phase:'RECEIPTED',spawnCount:0,bootId:this.store.bootId};
    await this.store.change(d=>{d.jobs[id]=job;d.sourceIndex['comment:'+c.id]=id;});return job;
  }
  private async execute(job:Job):Promise<void> {
    if(job.phase==='PROCESSED') return;
    const c=await loadComment(this.d.client,this.o.repo,job.commentId),issue=await loadIssue(this.d.client,this.o.repo,c.issueNumber),h=header(c.body),policy=deliveryPolicy(c,issue,this.o,this.p);
    if(job.resumeAuthorized&&policy.control&&policy.type==='DECISION'&&policy.direct&&this.o.allowedSenders.includes(policy.from)) policy.execute=true;
    if(atLeast(job,'REPORT_POSTED')) {await this.finalize(job,c);if(policy.direct&&h._type!=='HOLD') this.completeOnce(job.outcome==='done');return;}
    if(!policy.execute) {
      if(policy.direct&&['ASK','DECISION','HANDOFF','HOLD'].includes(policy.type)&&!['AUTHOR_PROVENANCE_MISMATCH','NOENV_OR_INVALID'].includes(policy.reason)) {
        await this.acknowledge(job,c,`반론. 정책 거부: ${policy.reason}. CLI 실행 없음.`);
        await this.store.change(()=>{job.outcome='blocked';job.reason=policy.reason;advance(job,'RESULT_READY');});await this.finalize(job,c);this.completeOnce(false);
      } else {
        if(policy.reason==='NOENV_OR_INVALID') await this.requestRepost(job,c);
        if(policy.mention&&['ASK','DECISION','HANDOFF','HOLD'].includes(policy.type)&&policy.reason!=='AUTHOR_PROVENANCE_MISMATCH') await this.acknowledge(job,c,'부분수용. 보조 독자 수신 확인만 수행. actual TO delivery ACK 효력·실행 없음.');
        await this.effect(job.id,'process','/v1/inbox/process',{deliveryIds:[job.id],disposition:'ignored',reason:policy.reason});
        await this.store.change(()=>advance(job,'PROCESSED'));
      }
      return;
    }
    // Recheck global pending and active holds immediately before reserving a child.
    const check=await refreshInbox(this.d.client,this.o);
    await this.acknowledgements.get(c.id);
    const observed=check.page.ackState.find(state=>state.directiveId===c.id);
    const unownedAck=!job.ackId&&!!(observed?.ackCommentId||['acked','applied'].includes(job.item.delivery?.state??''));
    if(!job.ackId&&observed?.ackCommentId) await this.store.change(()=>{job.ackId=observed.ackCommentId;if(!atLeast(job,'ACK_POSTED')) advance(job,'ACK_POSTED');});
    if(observed?.state==='superseded') {
      await this.effect(job.id,'process','/v1/inbox/process',{deliveryIds:[job.id],disposition:'ignored',reason:'SOURCE_SUPERSEDED'});await this.store.change(()=>advance(job,'PROCESSED'));return;
    }
    if(!job.spawnIntent&&observed?.state==='applied'&&observed.appliedByCommentId) {
      await this.store.change(()=>{job.reportId=observed.appliedByCommentId;job.outcome='done';job.reason='RECOVERED_API_APPLICATION';advance(job,'APPLICATION_RECORDED');});
      await this.finalize(job,c);this.completeOnce(true);return;
    }
    if(check.page.activeHolds.length||this.store.data.holds.length) {await this.store.change(d=>{d.holds=[...new Set([...d.holds,...check.page.activeHolds])];});return;}
    if(check.page.pendingLegacy.global.some(id=>id!==c.id)) return;
    this.startedAny=true;
    if(h._type==='HANDOFF'&&this.handoffTarget(h.values['REPLY-IN'])===undefined) {
      await this.acknowledge(job,c,'반론. REPLY-IN target이 허용 repo 범위 밖이므로 이관을 수용하지 않음.');
      await this.store.change(()=>{job.outcome='blocked';job.reason='HANDOFF_TARGET_OUTSIDE_REPO';advance(job,'RESULT_READY');});await this.finalize(job,c);this.completeOnce(false);return;
    }
    if(h._type==='HANDOFF'&&!job.acceptedHandoff) {
      const target=await loadIssue(this.d.client,this.o.repo,this.handoffTarget(h.values['REPLY-IN'])!);
      if(!target.issue.isOpen||target.activeHolds?.length||check.page.claims.some(claim=>!claim.releasedByCommentId)) {
        await this.acknowledge(job,c,'부분수용. target 닫힘/HOLD 또는 미반납 CLAIM이 있어 이관 수용·실행을 보류함.','blocked');
        await this.store.change(()=>{job.outcome='blocked';job.reason='HANDOFF_CONDITIONS_PENDING';advance(job,'RESULT_READY');});await this.finalize(job,c);this.completeOnce(false);return;
      }
    }
    await this.acknowledge(job,c,'수용. 허용 sender·actual TO·업무 범위·읽기 장벽을 확인함.');
    if(h._type==='HANDOFF') {
      await this.store.change(()=>{job.replyIssue=this.handoffTarget(h.values['REPLY-IN']);});
      if(!job.acceptedHandoff) {
        const current=check.page.handoffs.find(x=>x.commentId===c.id);
        if(current?.status!=='accepted'&&current?.status!=='completed') {
          const accepted=await this.effect(job.id,'handoff',issuePath(this.o.repo,c.issueNumber)+`/handoffs/${c.id}/accept`,{ackCommentId:job.ackId});
          if(accepted.status!=='accepted') throw new Error('RUNNER_HANDOFF_NOT_ACCEPTED');
        }
        await this.store.change(()=>{job.acceptedHandoff=true;});
      }
    }
    if(!atLeast(job,'RESULT_READY')) {
      if((job.recovery||unownedAck)&&atLeast(job,'ACK_POSTED')) {
        await this.store.change(()=>{job.outcome='blocked';job.reason=job.spawnIntent?'UNCERTAIN_SPAWN_RECOVERY':'ACKED_WORK_INCOMPLETE_RECOVERY';job.result='자식 실행 여부/업무 종결 불명확. 자동 재spawn하지 않음. 새 DECISION 필요.';advance(job,'RESULT_READY');});
      } else {
        const dir=join(this.store.directory,job.id);await this.store.evidence(job.id,'empty-mcp.json',{mcpServers:{}});
        await this.store.evidence(job.id,'runner-permissions.json',{permissions:{deny:['Bash','PowerShell','Agent','Skill']}});
        await this.store.change(()=>advance(job,'RESERVED'));
        this.version??=await (this.d.versionProbe??probeVersion)(this.o.executable,this.d.env??process.env);
        const before=await (this.d.snapshotGit??gitSnapshot)(this.o.cwd);
        const context={repo:this.o.repo,issue,handoffTarget:job.replyIssue?await loadIssue(this.d.client,this.o.repo,job.replyIssue):undefined,compact:check.page.compact,pendingLegacy:check.page.pendingLegacy,ackState:check.page.ackState,activeHolds:check.page.activeHolds,gates:h.values.GATE,replyIn:h.values['REPLY-IN'],references:await Promise.all((h.values.RE??'').split(',').filter(Boolean).map(id=>loadComment(this.d.client,this.o.repo,id)))};
        await this.store.evidence(job.id,'context.json',context);
        const prompt=mask(assemblePrompt(safeData({alias:this.p.alias,sid:this.p.sid,delivery:{...job.item.delivery,commentId:c.id,sourceEventId:job.sourceEventId,receivedAt:new Date().toISOString()},comment:c,context,allowedCwd:this.o.cwd,evidence:dir},this.d.token)),this.d.token);
        await this.store.evidence(job.id,'prompt.md',prompt);
        await this.store.change(()=>advance(job,'CONTEXT_READY'));
        await this.store.change(()=>{advance(job,'SPAWN_INTENT');job.spawnIntent=new Date().toISOString();job.spawnCount++;});
        // startChild also checks a stop requested during asynchronous executable lookup.
        if(this.store.data.holds.length||this.abort.signal.aborted) {await this.store.change(()=>{job.outcome='failed';job.reason='HOLD_OR_CANCEL_BEFORE_SPAWN';advance(job,'RESULT_READY');});}
        else {
          const child=(this.d.start??startChild)(this.o,dir,prompt,this.d.env??process.env,this.d.token,async p=>{await this.store.change(()=>{job.pid=p.pid;job.creationTime=p.creationTime;if(!atLeast(job,'RUNNING')) advance(job,'RUNNING');});},async pid=>{await this.progress('spawn',{commentId:c.id,deliveryId:job.id,pid});});
          this.running={job,child};let result:ProcessResult;
          try {result=await child.result;} finally {this.running=undefined;}
          await this.progress('child_exit',{commentId:c.id,deliveryId:job.id,pid:result.identity?.pid??job.pid??null,exit:result.exit,reason:result.reason??null});
          const after=await (this.d.snapshotGit??gitSnapshot)(this.o.cwd);
          await this.store.evidence(job.id,'meta.json',{...result,text:undefined,before,after,cliVersion:this.version,modelRequested:this.o.model,modelActual:result.model??null,spawnIntent:job.spawnIntent,spawnCount:job.spawnCount});
          await this.store.change(()=>{job.outcome=result.ok?'done':'failed';job.reason=result.reason?mask(result.reason,this.d.token):undefined;job.result=mask(result.text,this.d.token);advance(job,'RESULT_READY');});
          if(!result.stopped) {await this.finalize(job,c);throw new CliError(1,'RUNNER_TREE_STOP_FAILED: new spawn blocked');}
        }
      }
    }
    await this.finalize(job,c);this.completeOnce(job.outcome==='done');
    if(job.reason==='UNCERTAIN_SPAWN_RECOVERY') {this.finished=true;this.exit=1;}
  }
  private completeOnce(ok:boolean):void {this.accepted++;if(this.o.once) {this.exit=ok?0:1;this.finished=true;}}
  private async finalize(job:Job,c:Comment):Promise<void> {
    if(!job.reportId) {
      if(!job.result) {try {job.result=await readFile(this.store.path(job.id,'result.md'),'utf8');} catch {job.result=job.reason??'복구: 저장된 결과 없음';}}
      await this.store.evidence(job.id,'result.md',job.result);
      const body=reportBody(this.p.alias,this.p.sid,header(c.body)._from,job,this.store.path(job.id,'meta.json'),this.d.token);await this.store.evidence(job.id,'report.md',body);
      const id=await this.post(job,'report',job.replyIssue??c.issueNumber,body);
      await this.store.change(()=>{job.reportId=id;advance(job,'REPORT_POSTED');});
      await this.progress('report_posted',{commentId:c.id,deliveryId:job.id,reportId:id,outcome:job.outcome});
    }
    if(job.item.delivery&&header(c.body).values.TO?.toLowerCase()===this.p.alias.toLowerCase()) {
      if(!atLeast(job,'APPLICATION_RECORDED')) {await this.effect(job.id,'apply',`/v1/deliveries/${job.id}/application`,{evidenceCommentId:job.reportId,outcome:job.outcome==='done'?'applied':'not-applied',...(job.outcome==='done'?{}:{reason:job.reason??'runner failure'})});await this.store.change(()=>advance(job,'APPLICATION_RECORDED'));}
      await this.effect(job.id,'process','/v1/inbox/process',{deliveryIds:[job.id],disposition:'replied',evidenceCommentId:job.reportId});
    } else if(job.item.delivery) await this.effect(job.id,'process','/v1/inbox/process',{deliveryIds:[job.id],disposition:'ignored',reason:'AUXILIARY_CONTROL_NO_DIRECT_APPLICATION'});
    await this.store.change(()=>advance(job,'PROCESSED'));
    let meta:Record<string,unknown>={};try {meta=JSON.parse(await readFile(this.store.path(job.id,'meta.json'),'utf8'));} catch {}
    const effects=await this.store.effects(job.id);
    await this.store.evidence(job.id,'meta.json',{...meta,deliveryId:job.id,commentId:job.commentId,phase:job.phase,outcome:job.outcome,reason:job.reason,ackCommentId:job.ackId,reportCommentId:job.reportId,operations:Object.fromEntries(Object.entries(effects).map(([name,e])=>[name,{key:e.key,operationId:e.operationId,done:e.done}]))});
    await this.store.evidence(job.id,'completion.json',{ackId:job.ackId,reportId:job.reportId,outcome:job.outcome,phase:job.phase});
    await this.progress('processed',{commentId:job.commentId,deliveryId:job.id,phase:job.phase,outcome:job.outcome,reason:job.reason??null});
  }
  async run():Promise<number> {
    await this.store.acquire();let stream:Promise<void>|undefined;const started=Date.now();
    let cwdLock:Awaited<ReturnType<typeof open>>|undefined;const cwdLockPath=join(this.o.cwd,'.cache','runner','cwd-'+identityHash([this.o.cwd.toLowerCase()])+'.lock');
    const cancel=()=>{this.abort.abort();void this.running?.child.stop('CANCEL').catch(e=>{this.fatal=e;});};
    this.d.signal?.addEventListener('abort',cancel,{once:true});
    try {
      await mkdir(join(this.o.cwd,'.cache','runner'),{recursive:true});
      try {cwdLock=await open(cwdLockPath,'wx',0o600);await cwdLock.writeFile(JSON.stringify({alias:this.p.alias,pid:process.pid}));await cwdLock.sync();} catch {throw new CliError(2,'RUNNER_CWD_LOCKED');}
      await (this.d.snapshotGit??gitSnapshot)(this.o.cwd);
      for(const job of Object.values(this.store.data.jobs)) if(job.phase!=='PROCESSED') {job.recovery=true;if(job.item.delivery) this.queue.add(job.id);else if(atLeast(job,'ACK_POSTED')) {job.outcome='blocked';job.reason='ACKED_WORK_INCOMPLETE_RECOVERY';}}
      await this.store.save();await this.barrier();this.bootstrap=false;
      stream=subscribe(this.d.client,{request:{channels:[],from:'since-compact',repo:this.o.repo,issues:[this.o.issue,...this.o.boards]},transport:'ws',signal:this.abort.signal,socket:this.d.socket??socketFactory,checkpoint:this.store.data.stream,
        key:async identity=>{const id=identityHash([JSON.stringify(identity)]);const e=await this.store.effect('00000000-0000-4000-8000-000000000000',id,'stream',identity);return e.key;},
        onFrame:frame=>this.receiveFrame(frame),save:async cp=>{await this.store.change(d=>{d.stream=cp;});const staged=this.staged.splice(0);for(const id of staged) {const job=this.store.data.jobs[id];await this.store.change(()=>{if(!atLeast(job,'RECEIPTED')) advance(job,'RECEIPTED');if(job.ackId&&!atLeast(job,'ACK_POSTED')) advance(job,'ACK_POSTED');});await this.enqueue(job);}},maxReconnects:8
      }).catch(e=>{if(!this.abort.signal.aborted) this.fatal??=e;});
      this.drain();
      while(!this.finished&&!this.fatal&&!this.abort.signal.aborted) {
        await abortableDelay(this.d.pollMs??1000,this.abort.signal).catch(()=>undefined);
        if(this.finished||this.fatal||this.abort.signal.aborted) break;
        await this.barrier();this.drain();
        if(this.o.untilMs!==undefined&&!this.startedAny&&!this.running&&Date.now()-started>=this.o.untilMs) {this.exit=3;this.finished=true;}
      }
      await this.serial;await this.controlSerial;
      if(this.fatal) throw this.fatal;
      return this.exit;
    } catch(e) {
      if(e instanceof OperationTimeout||(e instanceof ClientError&&(e.status===0||e.status===429||e.status===503))) {await this.progress('outbox_pending',{reason:'same key retained'});return 3;}
      throw e;
    } finally {
      this.abort.abort();if(this.running) await this.running.child.stop('CANCEL').catch(()=>undefined);
      await stream;await this.serial;await this.controlSerial;
      this.d.signal?.removeEventListener('abort',cancel);if(cwdLock) {await cwdLock.close();await unlink(cwdLockPath);}await this.store.close();
    }
  }
}

/** CLI facade: authenticate once and bind administrative policy before subscribing or spawning. */
export async function runnerCommand(ctx:CommandContext):Promise<number> {
  const o=await runnerOptions(ctx.args,ctx.cwd,ctx.env);
  if(o.profile&&!ctx.args.values.profile) ctx.args.values.profile=[o.profile];
  // CommandContext profile options are constructed earlier; use an explicit context for config.profile.
  const selected=o.profile&&!ctx.profileOptions.profile?new CommandContext(ctx.args,{...ctx.options,env:ctx.env,cwd:ctx.cwd,out:ctx.out}):ctx;
  const {client,profile}=await selected.connection(),p=await selected.principal();
  if(p.kind!=='session') throw new CliError(2,'runner requires a session token');
  return new HostRunner({client,principal:p,options:o,token:profile.token,env:ctx.env,signal:ctx.options.signal,json:ctx.out.json,onEvent:s=>ctx.out.line(s),onDiagnostic:s=>ctx.out.error(s)}).run();
}
