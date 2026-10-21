import {randomUUID} from 'node:crypto';
import {CoreError,requestHash,reserveCommand,recorded,finishCommand,authorizePrincipal,authorizeRepo,requireDeliverySession,lockDeliveryOwner,aliasChannel,type CorePrincipal,type EventTransaction,type EventUnitOfWork,type InboxService} from 'issus_domain/server';
import type {SubscriptionRequest} from 'issus_domain/common';
import type {EventEnvelope} from 'agent/common';

export interface SubscriptionRow {id:string;owner_id:string;session_id:string;channels:string[];opened_at:Date;closed_at:Date|null;transport:'websocket'|'sse';alias_id:string;sid:string}
/** All channel authorization, including canonical observers, is owner/membership scoped. */
export async function authorizeDeliveryChannel(tx:EventTransaction,p:CorePrincipal,channel:string):Promise<boolean> {
 if(channel.length>128||channel.startsWith('internal:')) return false;
 if(p.kind==='session'&&(channel===aliasChannel(p.ownerId,p.aliasId)||channel===`session:${p.sessionId}`)) return true;
 if(channel===`supervisor:${p.ownerId}`) return p.kind==='bootstrap'||!!(await tx.client.query(`SELECT 1 FROM ${tx.table('owner')} WHERE id=$1 AND supervisor_alias_id=$2`,[p.ownerId,p.aliasId])).rowCount;
 const m=/^(?:repo:([0-9a-f-]{36}):all|issue:([0-9a-f-]{36}):([1-9]\d*))$/i.exec(channel);if(!m) return false;
 try {await authorizeRepo(tx,p,m[1]??m[2]);if(m[2]) return !!(await tx.client.query(`SELECT 1 FROM ${tx.table('issue')} WHERE repo_id=$1 AND number=$2`,[m[2],Number(m[3])])).rowCount;return true;}catch{return false;}
}
/** Connection metadata is distinct from durable delivery obligations and read processing. */
export class SubscriptionService {
 constructor(readonly uow:EventUnitOfWork,readonly inbox:InboxService) {}
 /** Fixed Monitor URL: alias-only lifecycle and a fresh immutable cursor at the last confirmed position. */
 async monitor(p:CorePrincipal,previousId?:string):Promise<{subscriptionId:string;channels:string[];cursor:string}> {
  return this.uow.run(async tx=>{
   await lockDeliveryOwner(tx,p.ownerId);const session=await requireDeliverySession(tx,p),channels=[aliasChannel(p.ownerId,session.aliasId)],stream=`channel:${channels[0]}`;
   const previous=previousId?await this.get(tx,p,previousId,true):undefined;
   const active=(await tx.client.query<SubscriptionRow>(`SELECT b.*,s.alias_id,s.sid FROM ${tx.table('subscription')} b JOIN ${tx.table('session')} s ON s.id=b.session_id WHERE b.owner_id=$1 AND b.session_id=$2 AND b.closed_at IS NULL AND b.transport='websocket' AND $3=ANY(b.channels) ORDER BY b.opened_at DESC,b.id DESC LIMIT 1`,[p.ownerId,p.id,channels[0]])).rows[0];
   const prior=active??previous??(await tx.client.query<SubscriptionRow>(`SELECT b.*,s.alias_id,s.sid FROM ${tx.table('subscription')} b JOIN ${tx.table('session')} s ON s.id=b.session_id WHERE b.owner_id=$1 AND b.session_id=$2 AND b.transport='websocket' AND $3=ANY(b.channels) ORDER BY b.opened_at DESC,b.id DESC LIMIT 1`,[p.ownerId,p.id,channels[0]])).rows[0];
   const saved=prior?(await tx.client.query(`SELECT snapshot FROM ${tx.table('history_snapshot')} WHERE id=$1 AND principal_id=$2`,[prior.id,p.id])).rows[0]?.snapshot:undefined;
   const positions={[stream]:String(saved?.receiptPositions?.[stream]??saved?.positions?.[stream]??'0')};
   const cursor=randomUUID(),id=active?.id??randomUUID(),owner=(await tx.client.query(`SELECT name FROM ${tx.table('owner')} WHERE id=$1`,[p.ownerId])).rows[0];
   await tx.client.query(`INSERT INTO event_subscription_cursor(token,scope,channels,positions,expires_at) VALUES($1,$2,$3,$4,$5)`,[cursor,{principalId:p.id,owner:owner.name,sessionId:session.sessionId},JSON.stringify(channels),positions,new Date(tx.now.getTime()+30*86400000)]);
   if(!active) {
    await tx.client.query(`INSERT INTO ${tx.table('subscription')}(id,owner_id,session_id,channels,transport,opened_at,last_heartbeat_at) VALUES($1,$2,$3,$4,'websocket',$5,$5)`,[id,p.ownerId,p.id,channels,tx.now]);
    const response={subscriptionId:id,channels,cursor,items:[],compact:[],bootstrap:{issues:[]}};
    await tx.client.query(`INSERT INTO ${tx.table('history_snapshot')}(id,principal_id,scope_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5)`,[id,p.id,requestHash('subscription',{id}),{kind:'subscription',query:{from:'now',monitor:true},response,positions,receiptPositions:positions},new Date(tx.now.getTime()+30*86400000)]);
    tx.fact('issus.subscription.opened','internal:subscription',{ownerId:p.ownerId,subscriptionId:id,aliasId:session.aliasId,sid:session.sid,sessionId:session.sessionId,channels,transport:'websocket'},`subscription:${id}`,'worker');
   }
   return {subscriptionId:id,channels,cursor};
  });
 }
 /** Receipt and recovery checkpoint commit together; socket sends never advance this position. */
 async confirmCursor(tx:EventTransaction,p:CorePrincipal,id:string,token:string):Promise<void> {
  const s=await this.get(tx,p,id),session=await requireDeliverySession(tx,p);
  const cursor=(await tx.client.query(`SELECT scope,channels,positions,expires_at FROM event_subscription_cursor WHERE token=$1`,[token])).rows[0];
  if(!cursor||new Date(cursor.expires_at).getTime()<=tx.now.getTime()) throw new CoreError(410,'CURSOR_EXPIRED');
  if(cursor.scope.principalId!==p.id||cursor.scope.sessionId!==session.sessionId||cursor.channels.some((c:string)=>!s.channels.includes(c))) throw new CoreError(409,'CURSOR_SCOPE_MISMATCH');
  const row=(await tx.client.query(`SELECT snapshot FROM ${tx.table('history_snapshot')} WHERE id=$1 AND principal_id=$2 FOR UPDATE`,[id,p.id])).rows[0];
  if(!row) throw new CoreError(410,'CURSOR_EXPIRED');
  const positions={...row.snapshot.positions,...row.snapshot.receiptPositions};
  for(const [stream,position] of Object.entries(cursor.positions as Record<string,string>)) {
   // A receipt for a later notification cannot skip an earlier unconfirmed delivery attempt.
   const gap=(await tx.client.query(`SELECT min(e.sequence)::text AS sequence FROM event_store e WHERE e.stream_id=$1 AND e.sequence<=$2 AND e.sequence>$4 AND e.action IN ('issus.delivery.queued','issus.delivery.redelivered') AND NOT EXISTS(SELECT 1 FROM ${tx.table('delivery_receipt')} r WHERE r.delivery_id::text=e.payload->>'deliveryId' AND r.session_id=$3 AND r.attempt=(e.payload->>'attempt')::int)`,[stream,position,session.sessionId,row.snapshot.positions?.[stream]??'0'])).rows[0]?.sequence;
   const confirmed=gap?(BigInt(gap)-1n).toString():position;
   if(BigInt(confirmed)>BigInt(positions[stream]??'0')) positions[stream]=confirmed;
  }
  await tx.client.query(`UPDATE ${tx.table('history_snapshot')} SET snapshot=$3 WHERE id=$1 AND principal_id=$2`,[id,p.id,{...row.snapshot,receiptPositions:positions}]);
 }
 async channels(tx:EventTransaction,p:CorePrincipal,requested:readonly string[]):Promise<string[]> {
  if(p.kind!=='session') throw new CoreError(403,'SESSION_REQUIRED');
  const channels=[...new Set([aliasChannel(p.ownerId,p.aliasId),`session:${p.sessionId}`,...requested])].sort();
  if(await authorizeDeliveryChannel(tx,p,`supervisor:${p.ownerId}`)) channels.push(`supervisor:${p.ownerId}`);
  const selected=[...new Set(channels)].sort();
  if(selected.length>32||selected.some(c=>c.length>128)) throw new CoreError(403,'CHANNEL_FORBIDDEN');
  for(const c of selected) if(!await authorizeDeliveryChannel(tx,p,c)) throw new CoreError(403,'CHANNEL_FORBIDDEN');
  return selected;
 }
 async open(p:CorePrincipal,input:SubscriptionRequest,key:string,transport:'websocket'|'sse'='websocket') {
  if(!input||Object.keys(input).some(k=>!['channels','from','repo','issues'].includes(k))||!Array.isArray(input.channels)||input.channels.some(c=>typeof c!=='string')||!['since-compact','start','now'].includes(input.from)||typeof input.repo!=='string'||!Array.isArray(input.issues)) throw new CoreError(422,'INVALID_PAYLOAD');
  return this.uow.snapshot(async tx=>{
   const r=await reserveCommand(tx.client,tx.table('command_result'),p.id,key,requestHash('subscription.open',{input,transport}));if(!r.created) return recorded(r.record);
   await lockDeliveryOwner(tx,p.ownerId);const session=await requireDeliverySession(tx,p),channels=await this.channels(tx,p,input.channels),scope=await this.inbox.scope(tx,p,{repo:input.repo,issues:input.issues,sinceCompact:input.from==='start'?'false':'true'});
   const snapshot=await this.inbox.build(tx,p,scope),positions:Record<string,string>={};
   const waters=(await tx.client.query(`SELECT stream_id,max(sequence)::text AS sequence FROM event_store WHERE channel=ANY($1::text[]) AND audience='client' GROUP BY stream_id`,[channels])).rows;
   for(const w of waters) positions[w.stream_id]=w.sequence;
   if(input.from!=='now') {
    // Selected canonical channels replay the segment, while bootstrap is retained for offline/new aliases.
    for(const boundary of snapshot.response.bootstrap.issues) {
     const channel=`issue:${boundary.repoId}:${boundary.issueNumber}`;if(!channels.includes(channel)) continue;
     const source=boundary.compactId?(await tx.client.query(`SELECT sequence FROM event_store WHERE action='issus.comment.posted' AND payload->>'commentId'=$1`,[boundary.compactId])).rows[0]:undefined;
     positions[`channel:${channel}`]=source?(BigInt(source.sequence)-1n).toString():'0';
    }
    for(const d of snapshot.response.items.flatMap(i=>i.delivery?[i.delivery]:[])) {
     const stream=`channel:${aliasChannel(session.ownerId,session.aliasId)}`;
     const event=(await tx.client.query(`SELECT min(sequence)::text AS sequence FROM event_store WHERE channel=$1 AND payload->>'deliveryId'=$2`,[aliasChannel(session.ownerId,session.aliasId),d.id])).rows[0];
     if(event?.sequence) {const start=(BigInt(event.sequence)-1n).toString();if(BigInt(start)<BigInt(positions[stream]??'0')) positions[stream]=start;}
    }
   }
   const id=randomUUID(),cursor=randomUUID(),owner=(await tx.client.query(`SELECT name FROM ${tx.table('owner')} WHERE id=$1`,[p.ownerId])).rows[0];
   await tx.client.query(`INSERT INTO event_subscription_cursor(token,scope,channels,positions,expires_at) VALUES($1,$2,$3,$4,$5)`,[cursor,{principalId:p.id,owner:owner.name,sessionId:session.sessionId},JSON.stringify(channels),positions,new Date(tx.now.getTime()+30*86400000)]);
   await tx.client.query(`INSERT INTO ${tx.table('subscription')}(id,owner_id,session_id,channels,transport,opened_at,last_heartbeat_at) VALUES($1,$2,$3,$4,$5,$6,$6)`,[id,p.ownerId,session.sessionId,channels,transport,tx.now]);
   const response={subscriptionId:id,channels,cursor,bootstrap:{...snapshot.response.bootstrap,complete:true},compact:snapshot.response.compact,pendingLegacy:snapshot.response.pendingLegacy,windowPendingAck:snapshot.response.windowPendingAck,globalPendingAck:snapshot.response.globalPendingAck,ackState:snapshot.response.ackState,items:input.from==='now'?[]:snapshot.response.items,activeHolds:snapshot.response.activeHolds};
   await tx.client.query(`INSERT INTO ${tx.table('history_snapshot')}(id,principal_id,scope_hash,snapshot,expires_at) VALUES($1,$2,$3,$4,$5)`,[id,p.id,requestHash('subscription',{id}),{kind:'subscription',query:input,response,positions},new Date(tx.now.getTime()+30*86400000)]);
   tx.fact('issus.subscription.opened','internal:subscription',{ownerId:p.ownerId,subscriptionId:id,aliasId:session.aliasId,sid:session.sid,sessionId:session.sessionId,channels,transport},`subscription:${id}`,'worker');
   const result={httpStatus:201,response};await finishCommand(tx.client,tx.table('command_result'),r.record,result);return result;
  });
 }
 async get(tx:EventTransaction,p:CorePrincipal,id:string,closed=false):Promise<SubscriptionRow> {
  await authorizePrincipal(tx,p);const s=(await tx.client.query<SubscriptionRow>(`SELECT b.*,s.alias_id,s.sid FROM ${tx.table('subscription')} b JOIN ${tx.table('session')} s ON s.id=b.session_id WHERE b.id=$1 AND b.owner_id=$2 AND b.session_id=$3`,[id,p.ownerId,p.id])).rows[0];
  if(!s||!closed&&s.closed_at) throw new CoreError(403,'SUBSCRIPTION_FORBIDDEN');return s;
 }
 async close(p:CorePrincipal,id:string,key:string,reason='client-close') {
  return this.uow.run(async tx=>{
   const r=await reserveCommand(tx.client,tx.table('command_result'),p.id,key,requestHash('subscription.close',{id}));if(!r.created) return recorded(r.record);
   const s=await this.get(tx,p,id,true);if(!s.closed_at) await this.closeOn(tx,s,reason);
   const result={httpStatus:200,response:{subscriptionId:id,closed:true}};await finishCommand(tx.client,tx.table('command_result'),r.record,result);return result;
  },key,p.id);
 }
 async closeOn(tx:EventTransaction,s:SubscriptionRow,reason:string):Promise<void> {
  const changed=await tx.client.query(`UPDATE ${tx.table('subscription')} SET closed_at=$2 WHERE id=$1 AND closed_at IS NULL RETURNING id`,[s.id,tx.now]);
  if(changed.rowCount) tx.fact('issus.subscription.closed','internal:subscription',{ownerId:s.owner_id,subscriptionId:s.id,aliasId:s.alias_id,sid:s.sid,sessionId:s.session_id,channels:s.channels,transport:s.transport,reason},`subscription-closed:${s.id}`,'worker');
 }
 /** Disconnect/revocation can close metadata even after the session is no longer authorized. */
 async disconnected(id:string,sessionId:string,reason:string):Promise<void> {
  await this.uow.run(async tx=>{const s=(await tx.client.query<SubscriptionRow>(`SELECT b.*,s.alias_id,s.sid FROM ${tx.table('subscription')} b JOIN ${tx.table('session')} s ON s.id=b.session_id WHERE b.id=$1 AND b.session_id=$2`,[id,sessionId])).rows[0];if(s) await this.closeOn(tx,s,reason);},`disconnect:${id}`,'p5-subscriptions');
 }
 async bootstrap(p:CorePrincipal,id:string):Promise<Record<string,unknown>> {
  return this.uow.read(async tx=>{await this.get(tx,p,id);return (await tx.client.query(`SELECT snapshot FROM ${tx.table('history_snapshot')} WHERE id=$1 AND principal_id=$2`,[id,p.id])).rows[0].snapshot.response;});
 }
 /** Original canonical envelopes outside the selected transport channels; alias deliveries replay normally. */
 async bootstrapEvents(p:CorePrincipal,id:string,selected:readonly string[]):Promise<EventEnvelope[]> {
  return this.uow.read(async tx=>{
   await this.get(tx,p,id);
   const saved=(await tx.client.query(`SELECT snapshot FROM ${tx.table('history_snapshot')} WHERE id=$1 AND principal_id=$2`,[id,p.id])).rows[0]?.snapshot;
   if(!saved||saved.query.from==='now') return [];
   const boundaries=saved.response.bootstrap.issues as Array<{repoId:string;issueNumber:number}>;
   for(const b of boundaries) await authorizeRepo(tx,p,b.repoId);
   const ids=new Set<string>((saved.response.items as Array<{sourceEventId:string;delivery?:unknown;priority:string}>).filter(i=>!i.delivery&&i.priority!=='OTHER').map(i=>i.sourceEventId));
   for(const c of saved.response.compact as Array<{comment:{id:string}|null}>) if(c.comment) {
    const e=(await tx.client.query(`SELECT event_id FROM event_store WHERE action='issus.comment.posted' AND kind='fact' AND payload->>'ownerId'=$1 AND payload->>'commentId'=$2`,[p.ownerId,c.comment.id])).rows[0];if(e) ids.add(e.event_id);
   }
   const events:EventEnvelope[]=[];
   for(const id of ids) {
    const r=(await tx.client.query(`SELECT * FROM event_store WHERE event_id=$1 AND audience='client' AND kind='fact' AND action='issus.comment.posted' AND payload->>'ownerId'=$2`,[id,p.ownerId])).rows[0];
    if(!r||selected.includes(r.channel)||!boundaries.some(b=>b.repoId===r.payload.repoId&&b.issueNumber===r.payload.issueNumber)) continue;
    const event:EventEnvelope={eventId:r.event_id,eventVersion:1,kind:r.kind,streamId:r.stream_id,sequence:String(r.sequence),action:r.action,transactionKey:r.transaction_key,channel:r.channel,correlationId:r.correlation_id,source:r.source,audience:r.audience,payload:r.payload,createdAt:new Date(r.created_at).toISOString(),...(r.causation_event_id?{causationEventId:r.causation_event_id}:{}),...(r.source_event_id?{sourceEventId:r.source_event_id,sourceStreamId:r.source_stream_id,sourceSequence:String(r.source_sequence)}:{})};
    events.push(event);
   }
   return events.sort((a,b)=>a.streamId.localeCompare(b.streamId)||(BigInt(a.sequence)<BigInt(b.sequence)?-1:BigInt(a.sequence)>BigInt(b.sequence)?1:0));
  });
 }
}
