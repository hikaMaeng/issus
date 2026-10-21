import {randomUUID} from 'node:crypto';
import type {IngressEvent} from 'agent/common';
import {parseCommandPayload,parseCommentRequest,checkComment,checkIssueBody,parseEnvelope,splitlines,charCount,QUEUES,type CommandAction,type Actor} from '../../common/index.js';
import {CoreError,validation,requestHash,requireIdempotencyKey,reserveCommand,recorded,accepted,finishCommand,actorOf,authorizePrincipal,authorizeRepo,requireBootstrap,issueById,issueDiagnostics,sha256,type CommandRecord,type EventTransaction,type CorePrincipal,type EventUnitOfWork,type HttpResult} from '../backend/index.js';
import {createRepo} from './repo/index.js';
import {openIssue,editIssueBody,checkBodyContext} from './issue/index.js';
import {postComment,checkCommentContext,type CompactPublication} from './comment/index.js';
import {registerAlias,renameAlias} from './alias/index.js';
import {ensureBoard} from './board/index.js';
import {acceptHandoff,completeHandoff} from './handoff/index.js';
import {closeIssue,reopenIssue} from './closing/index.js';
export * from './comment/index.js';
export * from './issue/index.js';
export * from './alias/index.js';
export * from './closing/index.js';

export interface CoreCommand {principal:CorePrincipal;action:CommandAction;payload:Record<string,unknown>;idempotencyKey:string}
export interface IntakeOptions {uow:EventUnitOfWork;publication?:CompactPublication;onAccepted?:(event:IngressEvent)=>void;resolvePrincipal?:(actor:Actor)=>Promise<CorePrincipal>}
const CORE_ACTIONS=new Set(['issus.repo.create','issus.issue.open','issus.issue.body.edit','issus.comment.post','issus.alias.register','issus.alias.rename','issus.board.ensure','issus.handoff.accept','issus.handoff.complete','issus.issue.close','issus.issue.reopen']);
/** Durable admission and worker finalization. P5 delivery commands use the same backend primitives. */
export class IntakeService {
  readonly uow:EventUnitOfWork;
  constructor(readonly options:IntakeOptions) {this.uow=options.uow;}
  decode(action:CommandAction,payload:Record<string,unknown>):void {
    if(!CORE_ACTIONS.has(action)) throw new CoreError(422,'UNKNOWN_ACTION');
    if(action==='issus.comment.post') {if(typeof payload.body==='string') validation(checkComment(payload.body));const {repoId:_,issueNumber:__,...request}=payload;const parsed=parseCommentRequest(request);if(!parsed.ok) validation(parsed.reasons);}
    if(['issus.issue.open','issus.issue.body.edit'].includes(action)&&typeof payload.body==='string') validation(checkIssueBody(payload.body));
    const parsed=parseCommandPayload(action,payload);if(!parsed.ok) throw new CoreError(422,parsed.code,[{code:parsed.code,path:'request',message:'요청 키/타입/필수 값 불일치'}]);
  }
  async check(tx:EventTransaction,command:CoreCommand):Promise<void> {
    const {principal:p,action,payload:x}=command;this.decode(action,x);await authorizePrincipal(tx,p);
    if(['issus.repo.create','issus.alias.register','issus.board.ensure'].includes(action)) requireBootstrap(p);
    if(typeof x.repoId==='string') await authorizeRepo(tx,p,x.repoId);
    if(action==='issus.comment.post') {const issue=await issueById(tx,p,String(x.repoId),Number(x.issueNumber));const {repoId:_,issueNumber:__,...request}=x;await checkCommentContext(tx,p,issue,request);}
    if(action==='issus.issue.body.edit') {const issue=await issueById(tx,p,String(x.repoId),Number(x.issueNumber));await checkBodyContext(tx,p,issue.repo_id,String(x.body),issue,Number(x.expectedRevision));}
    if(action==='issus.issue.open') await checkBodyContext(tx,p,String(x.repoId),String(x.body));
  }
  /** Same key always observes the original operation before duplicate/context checks. */
  async submit(command:CoreCommand):Promise<HttpResult> {
    const key=requireIdempotencyKey(command.idempotencyKey),hash=requestHash(command.action,command.payload);command={...command,idempotencyKey:key};
    const previous=await this.uow.read(async tx=>{await authorizePrincipal(tx,command.principal);const r=(await tx.client.query<CommandRecord>(`SELECT * FROM ${tx.table('command_result')} WHERE principal_id=$1 AND idempotency_key=$2`,[command.principal.id,key])).rows[0];if(r){if(r.request_hash!==hash) throw new CoreError(409,'IDEMPOTENCY_CONFLICT');return recorded(r);}await this.check(tx,command);return undefined;});
    if(previous) return previous;
    let queued:IngressEvent|undefined;
    const result=await this.uow.run(async tx=>{
      const reserved=await reserveCommand(tx.client,tx.table('command_result'),command.principal.id,key,hash);if(!reserved.created) return recorded(reserved.record);
      await authorizePrincipal(tx,command.principal);
      queued={eventId:randomUUID(),action:command.action,transactionKey:key,channel:'internal:intake',replyChannel:`session:${command.principal.id}`,sessionId:command.principal.id,correlationId:reserved.record.operation_id,audience:'worker',createdAt:tx.now.toISOString(),payload:{...command.payload,ownerId:command.principal.ownerId,actor:actorOf(command.principal),idempotencyKey:key}};
      tx.enqueue(QUEUES.intake,queued);await tx.client.query(`UPDATE ${tx.table('command_result')} SET status='queued' WHERE operation_id=$1`,[reserved.record.operation_id]);return accepted(reserved.record);
    },key,command.principal.id);
    if(queued) this.options.onAccepted?.(queued);return result;
  }
  /** Queue adapter consumes only server-issued payload and re-verifies session state in execute(). */
  async executeIngress(event:IngressEvent,fence?:()=>Promise<void>):Promise<HttpResult> {
    const {ownerId,actor,idempotencyKey,...payload}=event.payload;const a=actor as Actor;
    if(!a||a.ownerId!==ownerId||idempotencyKey!==event.transactionKey) throw new CoreError(422,'INVALID_COMMAND_CONTEXT');
    const principal=this.options.resolvePrincipal?await this.options.resolvePrincipal(a):await this.uow.read(async tx=>{
      if(a.alias==='bootstrap') return {kind:'bootstrap' as const,id:a.sessionId,ownerId:String(ownerId),capabilities:['bootstrap']};
      const row=(await tx.client.query(`SELECT s.*,a.name FROM ${tx.table('session')} s JOIN ${tx.table('alias')} a ON a.id=s.alias_id WHERE s.id=$1`,[a.sessionId])).rows[0];if(!row) throw new CoreError(401,'UNAUTHENTICATED');
      return {kind:'session' as const,id:row.id,ownerId:row.owner_id,aliasId:row.alias_id,alias:row.name,sid:row.sid,sessionId:row.id,capabilities:[]};
    });
    return this.execute({principal,action:event.action as CommandAction,payload,idempotencyKey:String(idempotencyKey)},fence);
  }
  async execute(command:CoreCommand,fence?:()=>Promise<void>):Promise<HttpResult> {
    await fence?.();const key=requireIdempotencyKey(command.idempotencyKey);
    return this.uow.run(async tx=>{
      const {record}=await reserveCommand(tx.client,tx.table('command_result'),command.principal.id,key,requestHash(command.action,command.payload));
      if(record.http_status!==null) return recorded(record);
      // All P4 commands serialize at owner before repo/issue/counter locks. This also covers alias collisions.
      await tx.client.query(`SELECT id FROM ${tx.table('owner')} WHERE id=$1 FOR UPDATE`,[command.principal.ownerId]);
      if(typeof command.payload.repoId==='string') await tx.client.query(`SELECT id FROM ${tx.table('repo')} WHERE id=$1 FOR UPDATE`,[command.payload.repoId]);
      if(typeof command.payload.repoId==='string') await tx.client.query(`SELECT number FROM ${tx.table('issue')} WHERE repo_id=$1 ORDER BY number FOR UPDATE`,[command.payload.repoId]);
      await tx.client.query('SAVEPOINT domain_command');const draftCount=tx.drafts.length,pendingCount=tx.pending.length;
      let result:HttpResult;
      try {await this.check(tx,command);const response=await this.dispatch(tx,command);await fence?.();result={httpStatus:command.action==='issus.repo.create'||command.action==='issus.issue.open'||command.action==='issus.comment.post'||command.action==='issus.alias.register'||command.action==='issus.board.ensure'&&response.created===true?201:200,response};}
      catch(error) {
        if(!(error instanceof CoreError)) throw error;
        await tx.client.query('ROLLBACK TO SAVEPOINT domain_command');tx.drafts.splice(draftCount);tx.pending.splice(pendingCount);
        result={httpStatus:error.status,response:error.response(record.operation_id)};
        if(command.action==='issus.comment.post') tx.fact('issus.comment.rejected','internal:audit',{ownerId:command.principal.ownerId,requestId:record.operation_id,actorAliasId:actorOf(command.principal).aliasId,...(typeof command.payload.repoId==='string'&&typeof command.payload.issueNumber==='number'?{issue:{repoId:command.payload.repoId,issueNumber:command.payload.issueNumber}}:{}),errorCodes:error.reasons?.map(r=>r.code)??[error.code],bodySha256:sha256(String(command.payload.body??'')),charCount:charCount(String(command.payload.body??''))},'rejected','worker','failure');
      }
      await finishCommand(tx.client,tx.table('command_result'),record,result);return result;
    },key,command.principal.id);
  }
  private async dispatch(tx:EventTransaction,{principal:p,action,payload:x}:CoreCommand):Promise<Record<string,unknown>> {
    const typed=x as any;
    switch(action) {
      case 'issus.repo.create':return createRepo(tx,p,typed);
      case 'issus.issue.open':return openIssue(tx,p,typed);
      case 'issus.issue.body.edit':return editIssueBody(tx,p,await issueById(tx,p,typed.repoId,typed.issueNumber,true),typed);
      case 'issus.comment.post':{const {repoId,issueNumber,...request}=x;return postComment(tx,p,await issueById(tx,p,String(repoId),Number(issueNumber),true),request,this.options.publication);}
      case 'issus.alias.register':return registerAlias(tx,p,typed);
      case 'issus.alias.rename':return renameAlias(tx,p,typed);
      case 'issus.board.ensure':{const board=await ensureBoard(tx,p,typed);return {...board,posted:true};}
      case 'issus.handoff.accept':return acceptHandoff(tx,p,typed);
      case 'issus.handoff.complete':return completeHandoff(tx,p,typed);
      case 'issus.issue.close':return closeIssue(tx,p,await issueById(tx,p,typed.repoId,typed.issueNumber,true),typed);
      case 'issus.issue.reopen':return reopenIssue(tx,p,await issueById(tx,p,typed.repoId,typed.issueNumber,true),typed);
      default:throw new CoreError(422,'UNKNOWN_ACTION');
    }
  }
  async preflight(p:CorePrincipal,repoId:string,number:number,input:unknown,expectedRevision?:number):Promise<Record<string,unknown>> {
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new CoreError(400,'INVALID_SHAPE');const obj=input as Record<string,unknown>;
    const unknown=Object.keys(obj).filter(k=>!['mode','request'].includes(k));if(unknown.length) validation(unknown.map(k=>({code:'UNKNOWN_KEY',path:k,message:`허용하지 않는 요청 키 ${k}`})));
    if(!['comment','issue-body'].includes(String(obj.mode))) throw new CoreError(400,'INVALID_SHAPE');
    return this.uow.read(async tx=>{
      await authorizePrincipal(tx,p);const issue=await issueById(tx,p,repoId,number);let envelope:Record<string,string>,body:string;
      if(obj.mode==='comment') {const checked=await checkCommentContext(tx,p,issue,obj.request);envelope=checked.envelope;body=checked.request.body;}
      else {const request=obj.request as Record<string,unknown>;if(!request||typeof request.body!=='string') throw new CoreError(400,'INVALID_SHAPE');validation(Object.keys(request).filter(k=>k!=='body').map(k=>({code:'UNKNOWN_KEY',path:k,message:`허용하지 않는 요청 키 ${k}`})));body=request.body;envelope=await checkBodyContext(tx,p,repoId,body,issue,expectedRevision);}
      const purpose=envelope.TYPE==='DECISION'?'before-decision':envelope.TYPE==='HANDOFF'?'before-handoff':'routine';
      const diagnostics=await issueDiagnostics(tx,issue,p.kind==='session'?[p.alias.toLowerCase()]:[],purpose);
      return {valid:true,posted:false,mode:obj.mode,chars:charCount(body),envelope,context:{repoId,issueNumber:number,revision:issue.revision,checkedAt:tx.now.toISOString()},compact:diagnostics.compact};
    });
  }
  async operation(p:CorePrincipal,id:string):Promise<Record<string,unknown>> {
    return this.uow.read(async tx=>{await authorizePrincipal(tx,p);const r=(await tx.client.query<CommandRecord>(`SELECT * FROM ${tx.table('command_result')} WHERE operation_id=$1 AND principal_id=$2`,[id,p.id])).rows[0];if(!r) throw new CoreError(404,'NOT_FOUND');return {operationId:id,status:r.status,posted:r.response?.posted??(r.http_status!==null?false:null),...(r.http_status!==null?{httpStatus:r.http_status,response:r.response,...(r.response?.error?{error:r.response.error}:{})}:{})};});
  }
}
