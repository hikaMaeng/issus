import type {CommentView,InboxItem,InboxResponse} from 'issus_domain/common';
import {DIRECTIVE,header} from 'issus_domain/common';
import {abortableDelay,ClientError,InboxModel,compareSequence,issuePath,repoPath} from 'issus_domain/front';
import {Connection,BridgeError} from '../connection/index.js';
import {comment,nativeInbox,packet} from '../tools/schema.js';
import {businessResolved} from '../journal/index.js';
import type {z} from 'zod';

export type DeliveryPacket=z.infer<typeof packet>;
export interface IssueDetail {body:string;revision:number;issue:{repoId:string;number:number;revision:number};envelope?:Record<string,string>}
interface PendingSnapshot {model:InboxModel;cursor?:string;pages:InboxResponse[];seen:Set<string>}

/** Pull wait keeps snapshot-local models separate from durable delivery/business state. */
export class Waiter {
  subscribed=false;waiting=false;lastPollAt:string|null=null;inFlightDeliveryId:string|null=null;
  boards:number[];latest?:InboxResponse;
  readonly items=new Map<string,InboxItem>();
  private pending?:PendingSnapshot;private refreshing?:Promise<void>;
  private readonly returned=new Set<string>();private readonly recovery=new Set<string>();
  private readonly lifetime=new AbortController();private details=new Map<number,IssueDetail>();
  constructor(readonly connection:Connection){this.boards=[...connection.config.boards];}
  private get c(){return this.connection;}
  require():void {if(!this.subscribed)throw new BridgeError('BRIDGE_NOT_SUBSCRIBED');}
  private query(options:{cursor?:string;limit?:number;sinceCompact?:boolean}={}):string {
    const q=new URLSearchParams({repo:this.c.config.repo,issues:this.c.config.issues.join(','),sinceCompact:String(options.sinceCompact??true),limit:String(options.limit??100)});
    q.append('me',this.c.identity!.alias);for(const board of this.boards)q.append('board',String(board));
    if(options.cursor)q.set('cursor',options.cursor);return '/v1/inbox?'+q;
  }
  async detail(issue:number,signal?:AbortSignal):Promise<IssueDetail>{
    const value=await this.c.request<IssueDetail>(issuePath(this.c.config.repo,issue),{signal});
    if(typeof value.body!=='string'||!Number.isSafeInteger(value.revision)||value.revision<1||!value.issue||value.issue.number!==issue)throw new BridgeError('BRIDGE_INVALID_ISSUE_RESPONSE');
    this.details.set(issue,value);return value;
  }
  async show(id:string,repo=this.c.config.repo,signal?:AbortSignal):Promise<CommentView>{
    await this.c.principal(signal);
    if(repo.split('/')[0].toLowerCase()!==this.c.config.repo.split('/')[0].toLowerCase())throw new BridgeError('BRIDGE_OWNER_MISMATCH');
    const value=await this.c.request(`${repoPath(repo)}/comments/${encodeURIComponent(id)}`,{signal});
    const parsed=comment.safeParse(value);if(!parsed.success||parsed.data.id!==id)throw new BridgeError('BRIDGE_INVALID_COMMENT_RESPONSE');
    if(parsed.data.author.ownerId!==this.c.identity!.ownerId)throw new BridgeError('BRIDGE_OWNER_MISMATCH');
    return parsed.data;
  }
  async subscribe(alias:string,sid:string|undefined,signal?:AbortSignal):Promise<unknown>{
    const p=await this.c.principal(signal);
    if(alias.toLowerCase()!==p.alias||sid!==undefined&&sid!==p.sid)throw new BridgeError('BRIDGE_PRINCIPAL_MISMATCH');
    const resumed=this.c.resumed;
    if(!this.subscribed){
      const visited=new Set<number>(),queue=[...this.c.config.issues,...this.boards];
      while(queue.length){const issue=queue.shift()!;if(visited.has(issue))continue;visited.add(issue);
        const detail=await this.detail(issue,signal),board=detail.envelope?.BOARD??/(?:^|\s)BOARD:(\S+)/u.exec(detail.body.split('\n')[0])?.[1];
        if(board){const match=/^(?:(\S+)#|#)?(\d+)$/u.exec(board);if(!match||match[1]&&match[1]!==this.c.config.repo)throw new BridgeError('BRIDGE_BOARD_SCOPE_MISMATCH');
          const n=Number(match[2]);if(!Number.isSafeInteger(n)||n<1)throw new BridgeError('BRIDGE_BOARD_SCOPE_MISMATCH');
          if(!this.boards.includes(n)){this.boards.push(n);queue.push(n);}}
      }
      this.boards.sort((a,b)=>a-b);
      const scope=this.c.scope(this.boards);
      if(this.c.journal.data.scope!==scope)await this.c.journal.update(d=>{d.scope=scope;d.cursors={};d.versions={};});
      for(const r of Object.values(this.c.journal.data.deliveries))if(!r.resolved)this.recovery.add(r.id);
      await this.refresh(signal);this.subscribed=true;
    }
    const {ownerId,aliasId,sessionId}=p;
    return {principal:{alias:p.alias,sid:p.sid,ownerId,aliasId,sessionId},scope:{repo:this.c.config.repo,issues:this.c.config.issues,boards:this.boards,sinceCompact:true},mode:'inbox',connected:true,resumed,
      pendingLegacy:this.latest!.pendingLegacy,ackState:this.latest!.ackState,activeHolds:this.latest!.activeHolds};
  }
  async preview(options:{cursor?:string;limit?:number;sinceCompact?:boolean},signal?:AbortSignal):Promise<InboxResponse>{
    this.require();return this.page(this.query(options),signal);
  }
  private async page(path:string,signal?:AbortSignal):Promise<InboxResponse>{
    const value=await this.c.request(path,{signal}),parsed=nativeInbox.safeParse(value);
    if(!parsed.success)throw new BridgeError('BRIDGE_INVALID_INBOX_RESPONSE');
    return {...parsed.data,items:parsed.data.items.map(({commentId,...item})=>({...item,...(commentId?{commentId}:{})}))};
  }
  async refresh(signal?:AbortSignal):Promise<void>{
    if(this.refreshing){await this.refreshing;if(signal?.aborted)throw signal.reason;return;}
    this.refreshing=this.refreshNow(signal).finally(()=>{this.refreshing=undefined;});return this.refreshing;
  }
  /** Mutation confirmation must not join a snapshot that started before that mutation. */
  async refreshFresh(signal?:AbortSignal):Promise<void>{if(this.refreshing)await this.refreshing;await this.refresh(signal);}
  private async refreshNow(signal?:AbortSignal):Promise<void>{
    let reset=false;
    if(!this.pending)this.pending={model:new InboxModel(this.c.journal.data.cursors,this.c.journal.data.versions),cursor:this.c.journal.data.cursors.refreshCursor??undefined,pages:[],seen:new Set()};
    while(true){
      let page:InboxResponse;
      try{page=await this.page(this.query({cursor:this.pending.cursor}),signal);}
      catch(error){
        if(!reset&&error instanceof ClientError&&(error.status===410||error.code==='CURSOR_SCOPE_MISMATCH')){
          reset=true;this.pending={model:new InboxModel({processedCursor:this.c.journal.data.cursors.processedCursor},this.c.journal.data.versions),pages:[],seen:new Set()};continue;
        }
        throw error;
      }
      this.pending.model.acceptPage(page);this.pending.pages.push(page);
      if(page.nextCursor){
        if(this.pending.seen.has(page.nextCursor))throw new BridgeError('BRIDGE_INBOX_CURSOR_CYCLE');
        this.pending.seen.add(page.nextCursor);this.pending.cursor=page.nextCursor;continue;
      }
      const snapshot=this.pending,all=[...snapshot.model.items.values()];
      await this.c.journal.update(d=>{
        for(const item of all){const delivery=item.delivery;if(!delivery)continue;
          const old=d.deliveries[delivery.id];
          // Same source/stream delivery never becomes a second task, even under late route.
          const same=Object.values(d.deliveries).find(r=>r.source.eventId===item.sourceEventId);
          if(!old&&same)continue;
          const h=header(item.content.body),directive=(DIRECTIVE as readonly string[]).includes(h._type)&&!h._noenv&&h._to.includes(this.c.identity!.alias);
          d.deliveries[delivery.id]={...old,id:delivery.id,repo:this.c.config.repo,commentId:item.commentId??null,viewKey:item.viewKey,ordinal:delivery.ordinal,attempt:delivery.attempt,
            source:{eventId:item.sourceEventId,streamId:item.sourceStreamId,sequence:item.sourceSequence},phase:old?.phase??'STAGED',directive:old?.directive??directive,directiveType:old?.directiveType??(directive?h._type:undefined)};
          delete d.deliveries[delivery.id].blocked;
        }
        for(const r of Object.values(d.deliveries)){
          const handoff=page.handoffs.find(h=>h.commentId===r.commentId);
          if(handoff&&handoff.status!=='pending'){r.handoffAccepted=true;r.resolved=businessResolved(r);}
        }
        d.cursors={...snapshot.model.cursors,processedCursor:d.cursors.processedCursor??snapshot.model.cursors.processedCursor};
        d.versions=snapshot.model.versions;
      });
      for(const item of all){const old=this.items.get(item.viewKey);if(old?.delivery&&item.delivery&&compareSequence(item.delivery.aliasEventSequence,old.delivery.aliasEventSequence)<0)continue;this.items.set(item.viewKey,item);}
      this.latest={...snapshot.pages[0],...page,items:all,compact:snapshot.pages.flatMap(p=>p.compact).filter((v,i,a)=>a.findIndex(x=>x.issueNumber===v.issueNumber&&x.repoId===v.repoId)===i)};
      this.pending=undefined;this.lastPollAt=new Date().toISOString();return;
    }
  }
  private candidates():string[]{
    const records=this.c.journal.data.deliveries;
    return Object.values(records).filter(r=>r.repo===this.c.config.repo&&!r.resolved&&!r.blocked&&!r.hydrationError&&!this.returned.has(r.id)).sort((a,b)=>{
      const rank=(r:typeof a)=>r.commentId&&this.latest?.activeHolds.includes(r.commentId)?0:r.directive?1:2;
      return rank(a)-rank(b)||compareSequence(a.ordinal,b.ordinal);
    }).map(r=>r.id);
  }
  get queueSize():number{return this.c.identity?this.candidates().length:0;}
  get hydrationError():{code:string;httpStatus:number|null;commentId:string|null;viewKey:string}|undefined{
    if(!this.c.identity)return;
    const record=Object.values(this.c.journal.data.deliveries).filter(r=>r.repo===this.c.config.repo&&r.hydrationError).sort((a,b)=>a.hydrationError!.at.localeCompare(b.hydrationError!.at)).at(-1);
    if(record)return {code:record.hydrationError!.code,httpStatus:record.hydrationError!.httpStatus,commentId:record.commentId,viewKey:record.viewKey};
  }
  get recoveryBlocked():boolean{return !!this.c.identity&&Object.values(this.c.journal.data.deliveries).some(r=>r.repo===this.c.config.repo&&r.blocked&&!r.resolved);}
  async hydrate(deliveryId:string,signal?:AbortSignal):Promise<DeliveryPacket|undefined>{
    const record=this.c.journal.data.deliveries[deliveryId];
    if(!record||record.resolved)return;
    let item=[...this.items.values()].find(i=>i.delivery?.id===deliveryId);
    if(!item){
      // Processed entries can disappear from a new inbox snapshot; recover immutable source data.
      if(!record.commentId){await this.c.journal.update(d=>{d.deliveries[deliveryId].blocked={reason:'original control fact is absent from current snapshot',remaining:['source-hydration','processing'],evidenceIds:[]};});throw new BridgeError('BRIDGE_RECOVERY_BLOCKED');}
      const c=await this.show(record.commentId,undefined,signal);
      item={viewKey:record.viewKey,commentId:c.id,sourceEventId:record.source.eventId,sourceStreamId:record.source.streamId,sourceSequence:record.source.sequence,origin:'inbox',priority:'ME',content:{body:c.body,envelope:c.envelope},
        delivery:{id:record.id,ordinal:record.ordinal,state:(this.latest?.ackState.find(s=>s.directiveId===c.id)?.state==='acked'?'acked':'delivered'),attempt:record.attempt,aliasEventSequence:this.c.journal.data.versions[record.id]?.sequence??'0'}};
    }
    const c=item.commentId?await this.show(item.commentId,undefined,signal):undefined;
    if(c&&![...this.c.config.issues,...this.boards].includes(c.issueNumber))throw new BridgeError('BRIDGE_RECOVERY_SCOPE_MISMATCH');
    const body=c?.body??item.content.body,h=header(body);
    if(h._from===this.c.identity!.alias){await this.c.journal.update(d=>{d.deliveries[deliveryId].resolved=true;});this.returned.add(deliveryId);return;}
    const detail=c?await this.detail(c.issueNumber,signal):undefined;
    const compact=c?this.latest?.compact.find(v=>v.repoId===c.repoId&&v.issueNumber===c.issueNumber)?.comment:undefined;
    const ackRequired=!!c&&c.validity==='v2'&&(DIRECTIVE as readonly string[]).includes(h._type)&&h._to.includes(this.c.identity!.alias);
    const native=this.latest?.ackState.find(s=>s.directiveId===c?.id);
    if(native?.ackCommentId)await this.c.journal.update(d=>{d.deliveries[deliveryId].ackId=native.ackCommentId;});
    if(native?.appliedByCommentId){
      const evidence=await this.show(native.appliedByCommentId,undefined,signal),eh=header(evidence.body);
      if(eh._type==='REPORT'&&eh._from===this.c.identity!.alias&&eh._re.includes(c!.id))await this.c.journal.update(d=>{const r=d.deliveries[deliveryId];r.reportId=evidence.id;r.applied=true;r.resolved=businessResolved(r);});
      if(this.c.journal.data.deliveries[deliveryId].resolved)return;
    }
    const nativeEnvelope=c?.envelope??item.content.envelope;
    const raw:DeliveryPacket={schemaVersion:1,deliveryId,attempt:item.delivery!.attempt,commentId:c?.id??null,viewKey:item.viewKey,
      source:{eventId:item.sourceEventId,streamId:item.sourceStreamId,sequence:item.sourceSequence},repo:this.c.config.repo,issue:c?.issueNumber??null,classification:item.priority,action:'bridge.inbox.delivery',ackRequired,ackBy:h.values['ACK-BY']??null,
      body,envelope:nativeEnvelope===undefined?null:Object.fromEntries(Object.entries(nativeEnvelope)),validity:c?.validity==='noenv'||h._noenv?'noenv':'valid',deliveryState:item.delivery!.state,aliasEventSequence:item.delivery!.aliasEventSequence,redacted:false,
      context:{issueBody:detail?.body??null,revision:detail?.revision??null,compact:compact?{id:compact.id,body:compact.body}:null,pendingLegacy:this.latest!.pendingLegacy,ackState:this.latest!.ackState,activeHolds:this.latest!.activeHolds,replyIn:h.values['REPLY-IN']??detail?.envelope?.['REPLY-IN']??null},
      receipt:{confirmed:true,transport:'http'},recovery:this.recovery.has(deliveryId)};
    const safe=this.c.redactor.value(raw);safe.redacted=JSON.stringify(safe)!==JSON.stringify(raw);
    return packet.parse(safe);
  }
  async wait(timeoutMs=60000,signal?:AbortSignal):Promise<unknown>{
    this.require();if(this.waiting)throw new BridgeError('BRIDGE_WAIT_IN_PROGRESS');this.waiting=true;
    const start=Date.now(),deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(new BridgeError('BRIDGE_WAIT_DEADLINE')),timeoutMs);
    const combined=AbortSignal.any([deadline.signal,this.lifetime.signal,...(signal?[signal]:[])]);
    let backoff=250,failed=false;
    const empty=()=>({delivery:null,timedOut:true,waitedMs:Date.now()-start});
    try{
      while(!combined.aborted){
        try{
          await this.refresh(combined);failed=false;backoff=250;
          for(const deliveryId of this.candidates()){
            this.inFlightDeliveryId=deliveryId;
            let value:DeliveryPacket|undefined;
            try{value=await this.hydrate(deliveryId,combined);}
            catch(error){
              // Permanent source-read failures quarantine one entry without business processing.
              if(combined.aborted||!(error instanceof BridgeError&&error.code==='BRIDGE_INVALID_COMMENT_RESPONSE'||error instanceof ClientError&&[404,410,422].includes(error.status)))throw error;
              const {code,httpStatus}=this.c.redactor.value(this.c.error(error));
              await this.c.journal.update(d=>{d.deliveries[deliveryId].hydrationError={code,httpStatus,at:new Date().toISOString()};});
              continue;
            }
            if(!value)continue;
            await this.c.write('/v1/deliveries/receipts',{deliveryIds:[deliveryId],attempts:[value.attempt]},{signal:combined,identity:['receipt',deliveryId,value.attempt]});
            await this.c.journal.update(d=>{d.deliveries[deliveryId].phase='RECEIPTED';});
            if(combined.aborted)break;
            await this.c.journal.update(d=>{d.deliveries[deliveryId].phase='RETURNED';});
            this.returned.add(deliveryId);this.recovery.delete(deliveryId);
            return {delivery:value,timedOut:false,waitedMs:Date.now()-start};
          }
          this.inFlightDeliveryId=null;
          await abortableDelay(Math.min(this.c.config.pollMs,Math.max(1,timeoutMs-(Date.now()-start))),combined);
        }catch(error){
          if(combined.aborted){if(deadline.signal.aborted&&!signal?.aborted&&!this.lifetime.signal.aborted&&!failed)return empty();throw error;}
          if(error instanceof ClientError&&(error.status===0||[429,503].includes(error.status))){
            failed=true;
            if(Date.now()-start+backoff>=timeoutMs)throw error;
            await abortableDelay(backoff,combined);backoff=Math.min(10000,backoff*2);continue;
          }
          throw error;
        }
      }
      if(deadline.signal.aborted&&!signal?.aborted&&!failed)return empty();
      throw new BridgeError('BRIDGE_CANCELLED');
    }finally{clearTimeout(timer);this.waiting=false;this.inFlightDeliveryId=null;}
  }
  close():void {this.lifetime.abort(new BridgeError('BRIDGE_CANCELLED'));}
}
