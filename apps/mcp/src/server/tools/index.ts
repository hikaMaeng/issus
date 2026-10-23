import {checkComment,checkIssueBody,parseCommentRequest,header,type CommentView} from 'issus_domain/common';
import {ClientError,issuePath} from 'issus_domain/front';
import {z} from 'zod';
import {Connection,BridgeError} from '../connection/index.js';
import {businessResolved} from '../journal/index.js';
import {Waiter} from '../wait/index.js';
import {input,data,output,preflight,id,decimal,positive,type ToolName,type Args} from './schema.js';

const postedComment=z.object({posted:z.literal(true),commentId:decimal,eventId:id,revision:positive});
const processResult=z.object({posted:z.literal(true),processedCursor:id.nullable(),ordinal:decimal,lastSeenCommentId:decimal.nullable()});
const applicationResult=z.object({posted:z.literal(true),deliveryId:id,outcome:z.enum(['applied','not-applied'])});

/** All tool effects use the shared client, native validator and a metadata-only durable journal. */
export class BridgeTools {
  readonly waiter:Waiter;lastError:{code:string;httpStatus:number|null}|null=null;
  private readonly lifetime=new AbortController();private readonly active=new Set<Promise<unknown>>();
  constructor(readonly connection:Connection){this.waiter=new Waiter(connection);}
  private get c(){return this.connection;}
  call(name:string,args:unknown,signal?:AbortSignal){
    const job=this.callNow(name,args,AbortSignal.any([this.lifetime.signal,...(signal?[signal]:[])]));
    this.active.add(job);void job.finally(()=>this.active.delete(job));return job;
  }
  private async callNow(name:string,args:unknown,signal?:AbortSignal):Promise<{content:{type:'text';text:string}[];structuredContent:Record<string,unknown>;isError?:boolean}>{
    let result:Record<string,unknown>;
    try{
      if(!Object.hasOwn(input,name))throw new BridgeError('BRIDGE_UNKNOWN_TOOL');
      const tool=name as ToolName,parsed=input[tool].safeParse(args??{});
      if(!parsed.success)throw new BridgeError('BRIDGE_INVALID_ARGUMENTS',parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`));
      const raw=await this.dispatch(tool,parsed.data,signal),value=data[tool].safeParse(raw);
      if(!value.success)throw new BridgeError('BRIDGE_INVALID_OUTPUT');
      result={ok:true,data:value.data};this.lastError=null;
    }catch(error){const mapped=this.c.error(error);this.lastError={code:mapped.code,httpStatus:mapped.httpStatus};result={ok:false,error:mapped};}
    let safe=this.c.redactor.value(result);
    if(Object.hasOwn(output,name)&&!output[name as ToolName].safeParse(safe).success)safe=this.c.redactor.value({ok:false,error:{code:'BRIDGE_REDACTED_OUTPUT_INVALID',httpStatus:null,reasons:[],retryable:false,posted:false}});
    // The same sanitized object is used for both protocol representations.
    return {content:[{type:'text',text:JSON.stringify(safe)}],structuredContent:safe,...(safe.ok===false?{isError:true}:{})};
  }
  private async dispatch(name:ToolName,args:unknown,signal?:AbortSignal):Promise<unknown>{
    switch(name){
      case 'issus_subscribe':{const a=args as Args<'issus_subscribe'>;return this.waiter.subscribe(a.alias,a.sid,signal);}
      case 'issus_wait':return this.waiter.wait((args as Args<'issus_wait'>).timeoutMs,signal);
      case 'issus_inbox':return this.waiter.preview(args as Args<'issus_inbox'>,signal);
      case 'issus_show':{const a=args as Args<'issus_show'>,raw=await this.waiter.show(a.commentId,a.repo,signal),safe=this.c.redactor.value(raw);return {...safe,redacted:JSON.stringify(raw)!==JSON.stringify(safe)};}
      case 'issus_post':return this.post(args as Args<'issus_post'>,signal);
      case 'issus_ack':return this.ack(args as Args<'issus_ack'>,signal);
      case 'issus_handoff_accept':return this.handoff(args as Args<'issus_handoff_accept'>,signal);
      case 'issus_process':return this.process(args as Args<'issus_process'>,signal);
      case 'issus_apply':return this.apply(args as Args<'issus_apply'>,signal);
      case 'issus_status':return this.status();
    }
  }
  private assertRepo(repo:string):void{if(repo.split('/')[0].toLowerCase()!==this.c.config.repo.split('/')[0].toLowerCase())throw new BridgeError('BRIDGE_OWNER_MISMATCH');}
  private async afterEffect<T>(fn:()=>Promise<T>):Promise<T>{
    try{return await fn();}catch(error){
      if(error instanceof ClientError)throw new BridgeError(error.code,error.reasons,null,undefined,error.status||null);
      if(error instanceof BridgeError)throw new BridgeError(error.code,error.reasons,null,error.operationId,error.httpStatus);
      throw new BridgeError('BRIDGE_POST_EFFECT_UNCONFIRMED',[],null);
    }
  }
  private async post(a:Args<'issus_post'>,signal?:AbortSignal):Promise<unknown>{
    this.assertRepo(a.repo);const p=await this.c.principal(signal),edit=!!a.editBody;
    const reasons=edit?checkIssueBody(a.body):checkComment(a.body);
    if(reasons.length)throw new ClientError(422,'VALIDATION_FAILED',reasons);
    const h=header(a.body);
    if(!edit&&h.values.FROM!==`${p.alias}/${p.sid}`)throw new BridgeError('BRIDGE_FROM_MISMATCH');
    const request:Record<string,unknown>={body:a.body};
    for(const k of ['compactPacketToken','sampledIds','compactedBy','compactDeferredReason'] as const)if(a[k]!==undefined){
      if(edit)throw new BridgeError('BRIDGE_ISSUE_BODY_METADATA_FORBIDDEN');request[k]=a[k];
    }
    if(a.compactPacketToken)this.c.redactor.add(a.compactPacketToken);
    if(Buffer.byteLength(JSON.stringify(request),'utf8')>65536)throw new BridgeError('BRIDGE_BODY_TOO_LARGE');
    if(!edit){const checked=parseCommentRequest(request);if(!checked.ok)throw new ClientError(422,'VALIDATION_FAILED',checked.reasons.map(r=>r.message));}
    const path=issuePath(a.repo,a.issue);
    let revision:number|undefined;
    if(edit){const d=await this.c.request<{revision:number}>(path,{signal});if(!Number.isSafeInteger(d.revision)||d.revision<1)throw new BridgeError('BRIDGE_INVALID_REVISION');revision=d.revision;}
    const checked=preflight.safeParse(await this.c.request(path+'/preflight',{method:'POST',body:{mode:edit?'issue-body':'comment',request},revision,signal}));
    if(!checked.success)throw new BridgeError('BRIDGE_INVALID_PREFLIGHT_RESPONSE');
    if(a.dryRun)return {kind:'preflight',posted:false,valid:true,context:checked.data.context,compact:checked.data.compact};
    const raw=await this.c.write(path+(edit?'/body':'/comments'),request,{method:edit?'PATCH':'POST',revision,signal});
    return this.afterEffect(async()=>{
    if(edit){const r=z.object({posted:z.literal(true),revision:positive}).safeParse(raw);if(!r.success)throw new BridgeError('BRIDGE_INVALID_WRITE_RESPONSE');return {kind:'issue-body',posted:true,revision:r.data.revision};}
    const result=postedComment.safeParse(raw);if(!result.success)throw new BridgeError('BRIDGE_INVALID_WRITE_RESPONSE');
    // The immutable posted comment is independently checked for evidence, not inferred from a body string.
    const posted=await this.waiter.show(result.data.commentId,a.repo,signal);
    if(posted.body!==a.body||posted.issueNumber!==a.issue||posted.author.aliasId!==p.aliasId||posted.author.sessionId!==p.sessionId)throw new BridgeError('BRIDGE_POSTED_COMMENT_MISMATCH');
    await this.recordComment(posted);
    return {kind:'comment',posted:true,commentId:result.data.commentId,eventId:result.data.eventId,revision:result.data.revision};
    });
  }
  private async recordComment(comment:CommentView):Promise<void>{
    const h=header(comment.body);
    if(comment.author.aliasId!==this.c.identity!.aliasId)return;
    await this.c.journal.update(d=>{for(const r of Object.values(d.deliveries)){
      if(r.commentId&&!h._re.includes(r.commentId))continue;if(!r.commentId)continue;
      if(h._type==='ACK')r.ackId=comment.id;
      if(h._type==='REPORT')r.reportId=comment.id;
      r.resolved=businessResolved(r);
    }});
  }
  private async ack(a:Args<'issus_ack'>,signal?:AbortSignal):Promise<unknown>{
    this.waiter.require();let commentId=a.commentId,deliveryId=a.deliveryId??null;
    if(a.deliveryId){const record=this.c.journal.data.deliveries[a.deliveryId];if(!record?.commentId)throw new BridgeError('BRIDGE_DELIVERY_NOT_FOUND');commentId=record.commentId;}
    const original=await this.waiter.show(commentId!,undefined,signal),h=header(a.body),p=this.c.identity!;
    if(h._type!=='ACK'||h.values.FROM!==`${p.alias}/${p.sid}`||!h._re.includes(commentId!))throw new BridgeError('BRIDGE_ACK_ENVELOPE_MISMATCH');
    const result=await this.post({repo:this.c.config.repo,issue:original.issueNumber,body:a.body},signal) as {commentId:string};
    await this.afterEffect(()=>this.waiter.refreshFresh(signal));
    const native=this.waiter.latest!.ackState.find(s=>s.directiveId===commentId);
    const acked=!!native&&native.state!=='waiting'&&native.ackCommentId===result.commentId;
    return {posted:true,commentId:result.commentId,directiveCommentId:commentId,deliveryId,acked};
  }
  private async handoff(a:Args<'issus_handoff_accept'>,signal?:AbortSignal):Promise<unknown>{
    this.waiter.require();this.assertRepo(a.repo);
    const original=await this.waiter.show(a.handoffId,a.repo,signal),h=header(original.body);
    if(original.validity!=='v2'||h._noenv||original.issueNumber!==a.issue||h._type!=='HANDOFF')throw new BridgeError('BRIDGE_HANDOFF_SOURCE_MISMATCH');
    // Target must be open; the server owns recipient, ACK and acceptance authorization.
    const match=/^(?:(.+)#|#)(\d+)$/u.exec(h.values['REPLY-IN']??'');
    if(!match||!Number.isSafeInteger(Number(match[2]))||Number(match[2])<1)throw new BridgeError('BRIDGE_HANDOFF_REPLY_IN_INVALID');
    const targetRepo=match[1]??a.repo;this.assertRepo(targetRepo);
    const target=await this.c.request<{issue:{isOpen:boolean}}>(issuePath(targetRepo,Number(match[2])),{signal});
    if(target.issue?.isOpen!==true)throw new BridgeError('BRIDGE_HANDOFF_TARGET_CLOSED');
    const value=await this.c.write(`${issuePath(a.repo,a.issue)}/handoffs/${a.handoffId}/accept`,{ackCommentId:a.ackCommentId},{signal});
    return this.afterEffect(async()=>{
    const parsed=data.issus_handoff_accept.safeParse(value);
    if(!parsed.success||parsed.data.handoffId!==a.handoffId)throw new BridgeError('BRIDGE_INVALID_HANDOFF_RESPONSE');
    await this.c.journal.update(d=>{for(const r of Object.values(d.deliveries))if(r.commentId===a.handoffId){r.handoffAccepted=true;r.resolved=businessResolved(r);}});
    await this.waiter.refreshFresh(signal);return parsed.data;
    });
  }
  private async process(a:Args<'issus_process'>,signal?:AbortSignal):Promise<unknown>{
    this.waiter.require();
    const raw=await this.c.write('/v1/inbox/process',a,{signal});
    return this.afterEffect(async()=>{
    const value=processResult.safeParse(raw);
    if(!value.success)throw new BridgeError('BRIDGE_INVALID_PROCESS_RESPONSE');
    await this.c.journal.update(d=>{d.cursors.processedCursor=value.data.processedCursor;for(const id of a.deliveryIds){const r=d.deliveries[id];if(r){r.processed=true;r.resolved=businessResolved(r);}}});
    return {processedCursor:value.data.processedCursor,lastSeenCommentId:value.data.lastSeenCommentId};
    });
  }
  private async apply(a:Args<'issus_apply'>,signal?:AbortSignal):Promise<unknown>{
    this.waiter.require();
    const raw=await this.c.write(`/v1/deliveries/${a.deliveryId}/application`,{evidenceCommentId:a.evidenceCommentId,outcome:a.outcome,...(a.reason?{reason:a.reason}:{})},{signal});
    return this.afterEffect(async()=>{
    const value=applicationResult.safeParse(raw);
    if(!value.success||value.data.deliveryId!==a.deliveryId||value.data.outcome!==a.outcome)throw new BridgeError('BRIDGE_INVALID_APPLICATION_RESPONSE');
    const evidence=await this.waiter.show(a.evidenceCommentId,undefined,signal);await this.recordComment(evidence);
    await this.c.journal.update(d=>{const r=d.deliveries[a.deliveryId];if(r){r.applied=true;r.resolved=businessResolved(r);}});
    return {recorded:true,deliveryId:a.deliveryId,outcome:a.outcome,evidenceCommentId:a.evidenceCommentId};
    });
  }
  private status():unknown{
    const p=this.c.identity,cursors=p?this.c.journal.data.cursors:{};
    return {subscribed:this.waiter.subscribed,mode:'inbox',principal:p?{alias:p.alias,sid:p.sid}:null,scope:{repo:this.c.config.repo,issues:this.c.config.issues,boards:this.waiter.boards},waiting:this.waiter.waiting,queueSize:this.waiter.queueSize,inFlightDeliveryId:this.waiter.inFlightDeliveryId,lastPollAt:this.waiter.lastPollAt,lastError:this.lastError??this.waiter.hydrationError??(this.waiter.recoveryBlocked?{code:'BRIDGE_RECOVERY_BLOCKED',httpStatus:null}:null),
      cursors:{paginationCursor:cursors.paginationCursor??null,refreshCursor:cursors.refreshCursor??null,processedCursor:cursors.processedCursor??null},activeHolds:this.waiter.latest?.activeHolds??[]};
  }
  async close():Promise<void>{this.lifetime.abort(new BridgeError('BRIDGE_CANCELLED'));this.waiter.close();await Promise.allSettled([...this.active]);await this.c.close();}
}
