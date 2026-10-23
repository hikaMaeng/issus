import {createServer,type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {header,classify,checkComment,type InboxItem,type InboxResponse,type CommentView,type SessionPrincipal} from 'issus_domain/common';
import {Connection} from '../../server/connection/index.js';
import {BridgeTools} from '../../server/tools/index.js';

export const worker='mc-4-worker',sender='mc-4-orch',repo='sample/test';
export const ids={owner:randomUUID(),alias:randomUUID(),session:randomUUID(),repo:randomUUID(),sender:randomUUID()};
export const authToken=['fixture','credential','canary',randomUUID()].join('-');
export const principal:SessionPrincipal={kind:'session',id:ids.session,ownerId:ids.owner,aliasId:ids.alias,alias:worker,sid:'s1',sessionId:ids.session,capabilities:[]};
type Fault={status:number;code:string;reasons?:string[];times?:number};

/** Isolated HTTP fake preserves the public API shape; it is never reported as a deployed DB test. */
export class Fixture {
  server?:Server;url='';directory='';bridge!:BridgeTools;connection!:Connection;
  readonly comments=new Map<string,CommentView>();readonly items:InboxItem[]=[];
  readonly requests:{method:string;path:string;key?:string;body:Record<string,unknown>}[]=[];
  readonly faults=new Map<string,Fault>();readonly results=new Map<string,unknown>();
  readonly snapshots=new Map<string,{page:InboxResponse;offset:number;limit:number}>();
  readonly refreshTokens=new Set<string>();
  readonly pending=new Set<string>();readonly states=new Map<string,{directiveId:string;state:'waiting'|'acked'|'applied'|'superseded';ackCommentId?:string;appliedByCommentId?:string}>();
  readonly processed=new Set<string>();readonly handoffs=new Map<string,'pending'|'accepted'|'completed'>();
  compact:InboxResponse['compact']=[];activeHolds:string[]=[];faultPrincipal:unknown=principal;queueNext=false;pendingKey?:string;delayPaginationMs=0;
  next=1000000;sequence=0;pageSize=100;revision=1;expireNext=false;hideProcessed=false;operationPending=false;operationId=randomUUID();receiptCount=0;postCount=0;acceptCount=0;
  body='STATE:running OWNER:mc-4-worker UPDATED:2026-10-23T17:00+09:00';
  async start():Promise<this>{
    this.directory=await mkdtemp(join(tmpdir(),'issus-mcp-'));
    this.server=createServer((req,res)=>{void this.handle(req,res).catch(()=>{res.statusCode=500;res.end(JSON.stringify({error:{code:'FIXTURE_INTERNAL'}}));});});
    await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',()=>resolve());});
    const address=this.server.address();if(!address||typeof address==='string')throw new Error('fixture address');
    this.url=`http://127.0.0.1:${address.port}`;this.reopen();return this;
  }
  reopen():void{
    this.connection=new Connection({server:this.url,token:authToken,repo,issues:[4],boards:[],stateDir:this.directory,pollMs:250});this.bridge=new BridgeTools(this.connection);
  }
  async stop():Promise<void>{
    await this.bridge?.close();
    if(this.server){this.server.closeAllConnections();await new Promise<void>(r=>this.server!.close(()=>r()));}
    const absolute=resolve(this.directory),base=resolve(tmpdir())+sep;
    if(!absolute.startsWith(base)||!absolute.slice(base.length).startsWith('issus-mcp-'))throw new Error('fixture cleanup scope');
    await rm(absolute,{recursive:true,force:true});
  }
  async call(name:string,args:unknown={}):Promise<any>{return (await this.bridge.call(name,args)).structuredContent;}
  async subscribe():Promise<any>{return this.call('issus_subscribe',{alias:worker,sid:'s1'});}
  add(body:string,options:{delivery?:boolean;issue?:number;validity?:'v2'|'noenv';attempt?:number}={}):{comment:CommentView;item:InboxItem}{
    const h=header(body),id=String(++this.next),isWorker=h._from===worker;
    const comment:CommentView={id,repoId:ids.repo,issueNumber:options.issue??4,body,envelope:h.values,metadata:{},author:{ownerId:ids.owner,aliasId:isWorker?ids.alias:ids.sender,alias:h._from||sender,sid:'s1',sessionId:isWorker?ids.session:ids.sender},postedByAliasId:isWorker?ids.alias:ids.sender,createdAt:new Date().toISOString(),charCount:Array.from(body).length,validity:options.validity??'v2'};
    this.comments.set(id,comment);
    const item:InboxItem={sourceEventId:randomUUID(),sourceStreamId:'issue:test:4',sourceSequence:String(++this.sequence),viewKey:'comment:'+id,commentId:id,origin:options.delivery===false?'history':'inbox',priority:classify(h,body,[worker]),content:{body,envelope:h.values}};
    if(options.delivery!==false)item.delivery={id:randomUUID(),ordinal:String(this.items.filter(i=>i.delivery).length+1),state:'posted',attempt:options.attempt??0,aliasEventSequence:String(this.sequence)};
    this.items.push(item);
    if(['ASK','HOLD','DECISION','HANDOFF'].includes(h._type)){
      if(h._to.includes(worker)||body.includes('@'+worker))this.pending.add(id);
      this.states.set(id,{directiveId:id,state:'waiting'});
      if(h._type==='HOLD')this.activeHolds.push(id);
      if(h._type==='HANDOFF')this.handoffs.set(id,'pending');
    }
    if(isWorker)for(const ref of h._re){const original=this.comments.get(ref);
      if(original?.issueNumber===comment.issueNumber)this.pending.delete(ref);
      if(h._type==='ACK'&&original&&header(original.body)._to.includes(worker)){
        this.states.set(ref,{directiveId:ref,state:'acked',ackCommentId:id});
        const target=this.items.find(i=>i.commentId===ref);if(target?.delivery){target.delivery.state='acked';target.delivery.aliasEventSequence=String(++this.sequence);}
      }
    }
    return {comment,item};
  }
  ask(text='receive nonce',options:Parameters<Fixture['add']>[1]={}){return this.add(`FROM:${sender}/s1 TO:${worker} TYPE:ASK ACK-BY:2026-10-24T17:00+09:00\nASK @${worker}: ${text}`,options);}
  ackBody(source:string,text='수용. 남은 작업을 수행한다.') {return `FROM:${worker}/s1 TO:${sender} TYPE:ACK RE:${source}\n${text}`;}
  reportBody(source:string){return `FROM:${worker}/s1 TO:${sender} TYPE:REPORT STATE:done RE:${source}\n완료. nonce 확인.`;}
  private full():InboxResponse{
    const snapshotId=randomUUID(),refreshCursor=randomUUID();this.refreshTokens.add(refreshCursor);
    const items=structuredClone(this.items.filter(i=>!this.hideProcessed||!i.delivery||!this.processed.has(i.delivery.id)));
    return {bootstrap:{mode:'snapshot',snapshotId,meAliases:[worker],complete:true,issues:[{repoId:ids.repo,issueNumber:4,compactId:this.compact[0]?.comment?.id??null,throughCommentId:String(this.next),eventHighWater:{'issue:test:4':String(this.sequence)}}],inboxThroughOrdinal:String(this.items.filter(i=>i.delivery).length),inboxThroughEventSequence:String(this.sequence)},
      compact:structuredClone(this.compact),items,nextCursor:null,refreshCursor,processedCursor:null,pendingLegacy:{window:[...this.pending],global:[...this.pending]},windowPendingAck:[...this.pending],globalPendingAck:[...this.pending],ackState:[...this.states.values()],activeHolds:[...this.activeHolds],claims:[],handoffs:[...this.handoffs].map(([commentId,status])=>({commentId,status,sourceIssue:{repoId:ids.repo,issueNumber:4},targetIssue:{repoId:ids.repo,issueNumber:5},recipientAliasId:ids.alias})),footers:['fixture snapshot']};
  }
  private page(page:InboxResponse,offset:number,limit:number):InboxResponse{
    const result=structuredClone(page);result.items=page.items.slice(offset,offset+limit);const more=offset+limit<page.items.length;
    if(more){const cursor=randomUUID();this.snapshots.set(cursor,{page,offset:offset+limit,limit});result.nextCursor=cursor;result.bootstrap.complete=false;result.refreshCursor=null;}
    return result;
  }
  private async handle(req:IncomingMessage,res:ServerResponse):Promise<void>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{},url=new URL(req.url!,this.url),path=url.pathname,key=req.headers['idempotency-key'] as string|undefined,method=req.method!;
    this.requests.push({method,path,key,body});
    const send=(value:unknown,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
    const fail=(status:number,code:string,reasons:string[]=[])=>send({error:{code,reasons:reasons.map(message=>({code,path:'body',message}))},posted:false,requestId:randomUUID()},status);
    const fault=this.faults.get(path);if(fault&&(fault.times??1)>0){fault.times=(fault.times??1)-1;fail(fault.status,fault.code,fault.reasons);return;}
    if(path==='/v1/auth/me'){send(this.faultPrincipal);return;}
    if(path==='/v1/repos/'+repo){send({id:ids.repo,owner_id:ids.owner,slug:'test'});return;}
    if(path.startsWith('/v1/operations/')){if(this.operationPending)send({status:'running',posted:null});else send({status:'done',posted:true,httpStatus:201,response:this.results.get('operation')});return;}
    if(path==='/v1/inbox'){
      const cursor=url.searchParams.get('cursor');
      if(this.expireNext&&cursor){this.expireNext=false;fail(410,'CURSOR_EXPIRED');return;}
      if(cursor&&this.snapshots.has(cursor)){const p=this.snapshots.get(cursor)!;if(this.delayPaginationMs)await new Promise(r=>setTimeout(r,this.delayPaginationMs));send(this.page(p.page,p.offset,p.limit));return;}
      send(this.page(this.full(),0,Math.min(this.pageSize,Number(url.searchParams.get('limit')??100))));return;
    }
    if(method==='GET'&&/\/comments\/\d+$/u.test(path)){
      const c=this.comments.get(path.split('/').at(-1)!);if(!c){fail(404,'NOT_FOUND');return;}send(c);return;
    }
    if(method==='GET'&&/\/issues\/\d+$/u.test(path)){const issue=Number(path.split('/').at(-1));send({issue:{repoId:ids.repo,number:issue,revision:this.revision,isOpen:true},body:this.body,revision:this.revision,envelope:{STATE:'running',OWNER:worker,UPDATED:'2026-10-23T17:00+09:00'}});return;}
    if(path.endsWith('/preflight')){
      const reasons=body.mode==='comment'?checkComment(body.request.body):[];
      if(reasons.length){fail(422,'VALIDATION_FAILED',reasons);return;}
      if(body.mode==='comment'&&['CLAIM','DECISION'].includes(header(body.request.body)._type)&&this.pending.size){fail(409,'PENDING_ACK');return;}
      send({valid:true,posted:false,mode:body.mode,chars:Array.from(body.request.body).length,envelope:header(body.request.body).values,context:{repoId:ids.repo,issueNumber:Number(path.split('/').at(-2)),revision:this.revision,checkedAt:new Date().toISOString()},compact:{due:false,reasons:[],count:this.comments.size,chars:0,previousCompactId:null}});return;
    }
    if(key&&key===this.pendingKey){send({operationId:this.operationId,status:'queued',statusUrl:'/v1/operations/'+this.operationId,posted:null},202);return;}
    if(key&&this.results.has(key)){send(this.results.get(key));return;}
    let value:unknown;
    if(path.endsWith('/comments')&&method==='POST'){
      this.postCount++;const {comment}=this.add(body.body,{delivery:false,issue:Number(path.split('/').at(-2))});value={commentId:comment.id,eventId:randomUUID(),revision:this.revision,posted:true};
    }else if(path.endsWith('/body')&&method==='PATCH'){
      if(req.headers['if-match']!==`"${this.revision}"`){fail(412,'REVISION_MISMATCH');return;}
      this.body=body.body;value={posted:true,revision:++this.revision};
    }else if(path==='/v1/deliveries/receipts'){
      this.receiptCount++;for(const id of body.deliveryIds){const d=this.items.find(i=>i.delivery?.id===id)?.delivery;if(d&&d.state==='posted')d.state='delivered';}value={posted:true,receiptIds:[randomUUID()]};
    }else if(path==='/v1/inbox/process'){
      for(const id of body.deliveryIds){const item=this.items.find(i=>i.delivery?.id===id),state=this.states.get(item?.commentId??'');
        if(state?.state==='waiting'&&item&&header(item.content.body)._to.includes(worker)){fail(409,'ACK_REQUIRED');return;}
        this.processed.add(id);
      }
      value={posted:true,processedCursor:randomUUID(),ordinal:String(this.processed.size),lastSeenCommentId:body.evidenceCommentId??null};
    }else if(path.endsWith('/application')){
      const id=path.split('/').at(-2),item=this.items.find(i=>i.delivery?.id===id),state=this.states.get(item?.commentId??'');
      if(state?.state==='waiting'){fail(409,'ACK_REQUIRED');return;}
      if(body.outcome==='applied'&&item?.delivery){item.delivery.state='applied';item.delivery.aliasEventSequence=String(++this.sequence);if(state)this.states.set(state.directiveId,{...state,state:'applied',appliedByCommentId:body.evidenceCommentId});}
      value={posted:true,deliveryId:id,outcome:body.outcome};
    }else if(/\/handoffs\/\d+\/accept$/u.test(path)){
      const source=path.split('/').at(-2)!,ack=this.comments.get(body.ackCommentId);
      if(!ack||header(ack.body)._type!=='ACK'||!header(ack.body)._re.includes(source)){fail(422,'HANDOFF_ACK_INVALID');return;}
      this.acceptCount++;this.handoffs.set(source,'accepted');value={posted:true,handoffId:source,status:'accepted',revision:++this.revision};
    }else{fail(404,'NOT_FOUND');return;}
    if(key)this.results.set(key,value);
    if(this.queueNext){this.queueNext=false;this.pendingKey=key;this.results.set('operation',value);send({operationId:this.operationId,status:'queued',statusUrl:'/v1/operations/'+this.operationId,posted:null},202);return;}
    send(value);
  }
}

export async function fixture():Promise<Fixture>{return new Fixture().start();}
