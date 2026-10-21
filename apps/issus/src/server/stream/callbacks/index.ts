import type {IncomingMessage} from 'node:http';
import {createSocketPolicy,cursorScope,CursorError,type Principal as BrokerPrincipal,type GatewaySocketPolicy,type EventStore,type GatewayBootstrapFrame} from 'agent/broker';
import type {ChannelSubscribeFrame,ChannelReceiptFrame,EventEnvelope} from 'agent/common';
import {CoreError,aliasChannel,receiveDeliveries,lockDeliveryOwner,type CorePrincipal} from 'issus_domain/server';
import {corePrincipal,type RuntimeAuth,type RuntimePrincipal} from 'issus_runtime/server';
import {authorizeDeliveryChannel,type SubscriptionService,type SubscriptionRow} from '../../http/subscriptions/index.js';

export interface StreamOptions {auth:RuntimeAuth;subscriptions:SubscriptionService;store:EventStore;origin:string}
const domain=(p:BrokerPrincipal):CorePrincipal=>corePrincipal(p as RuntimePrincipal);
export const streamProtocols=(req:IncomingMessage):string[]=>String(req.headers['sec-websocket-protocol']??'').split(',').map(s=>s.trim()).filter(Boolean);
/** Only the public version is negotiated back; credentials are never an echoed protocol. */
export const selectStreamProtocol=(protocols:ReadonlySet<string>):string|false=>protocols.has('issus.v1')?'issus.v1':false;
/** Same bearer/cookie identity as HTTP; long-lived query tokens are rejected. */
export function readStreamToken(req:IncomingMessage):string|undefined {
 const url=new URL(req.url??'/','http://localhost');if(url.searchParams.has('token')||url.searchParams.has('access_token')) return undefined;
 const protocols=streamProtocols(req),credentials=protocols.filter(p=>p.startsWith('issus.bearer.'));
 if(credentials.length>1||credentials.length&&!protocols.includes('issus.v1')) return undefined;
 const protocolToken=credentials[0]?.slice('issus.bearer.'.length);
 if(credentials.length&&!protocolToken) return undefined;
 const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
 if(bearer&&protocolToken&&bearer!==protocolToken) return undefined;
 if(bearer||protocolToken) return bearer??protocolToken;
 const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('issus_session='))?.slice(14);
 if(!raw) return undefined;try{return decodeURIComponent(raw);}catch{return undefined;}
}
/** P1 passes this policy and callbacks to the vendored agent transport, with allowedActions=[]. */
export function createStreamCallbacks(o:StreamOptions) {
 const revocations=new Map<string,Set<()=>void>>();
 const watchRevocation=(p:BrokerPrincipal,close:()=>void):(()=>void)=>{
  const listeners=revocations.get(p.sessionId)??new Set<()=>void>();listeners.add(close);revocations.set(p.sessionId,listeners);
  return ()=>{listeners.delete(close);if(!listeners.size) revocations.delete(p.sessionId);};
 };
 const onSessionRevoked=async(sessionId:string):Promise<void>=>{
  for(const close of [...revocations.get(sessionId)??[]]) close();
  await o.subscriptions.uow.run(async tx=>{
   const rows=(await tx.client.query<SubscriptionRow>(`SELECT b.*,s.alias_id,s.sid FROM ${tx.table('subscription')} b JOIN ${tx.table('session')} s ON s.id=b.session_id WHERE b.session_id=$1 AND b.closed_at IS NULL`,[sessionId])).rows;
   for(const s of rows) await o.subscriptions.closeOn(tx,s,'session-revoked');
  },`revoked:${sessionId}`,'p5-subscriptions');
 };
 const authorizeChannel=(channel:string,p:BrokerPrincipal)=>o.subscriptions.uow.read(async tx=>authorizeDeliveryChannel(tx,domain(p),channel));
 const readyChannels=(p:BrokerPrincipal):string[]=>{const d=domain(p);return d.kind==='session'?[aliasChannel(d.ownerId,d.aliasId),`session:${d.sessionId}`]:[`supervisor:${d.ownerId}`];};
 const onSubscribe=async(frame:ChannelSubscribeFrame,p:BrokerPrincipal):Promise<readonly GatewayBootstrapFrame[]>=>{
  if(!frame.subscriptionId||!frame.cursor) throw new CoreError(403,'SUBSCRIPTION_REQUIRED');
  await o.subscriptions.uow.read(async tx=>{
   const s=await o.subscriptions.get(tx,domain(p),frame.subscriptionId!);
   const d=domain(p),aliasOnly=d.kind==='session'&&frame.channels.length===1&&frame.channels[0]===aliasChannel(d.ownerId,d.aliasId);
   if(!aliasOnly&&JSON.stringify([...new Set(frame.channels)].sort())!==JSON.stringify([...s.channels].sort())) throw new CoreError(409,'CURSOR_SCOPE_MISMATCH');
  });
  await o.store.openChannelCursor(frame.channels,frame.cursor,cursorScope(p));
  return (await o.subscriptions.bootstrapEvents(domain(p),frame.subscriptionId,frame.channels)).map(event=>({type:'event',event}));
 };
 const onReceipt=async(frame:ChannelReceiptFrame,p:BrokerPrincipal):Promise<void>=>{
  await o.subscriptions.uow.run(async tx=>{
   const d=domain(p);await lockDeliveryOwner(tx,d.ownerId);await o.subscriptions.get(tx,d,frame.subscriptionId);
   await receiveDeliveries(tx,d,{deliveryIds:frame.deliveryIds,attempts:frame.attempts,subscriptionId:frame.subscriptionId},'websocket');
  });
 };
 const onDisconnect=(subscriptionId:string,p:BrokerPrincipal,reason='disconnect')=>o.subscriptions.disconnected(subscriptionId,p.sessionId,reason);
 const initialSubscribe=async(req:IncomingMessage,p:BrokerPrincipal):Promise<ChannelSubscribeFrame|undefined>=>{
  const url=new URL(req.url??'/ws','http://localhost'),id=url.searchParams.get('subscription');if(!id) return undefined;
  const d=domain(p);if(d.kind!=='session') throw new CoreError(403,'SESSION_REQUIRED');
  const s=await o.subscriptions.uow.read(tx=>o.subscriptions.get(tx,d,id)),channels=[aliasChannel(d.ownerId,d.aliasId)];
  const stored=await o.subscriptions.bootstrap(d,id),requested=url.searchParams.get('cursor')??String(stored.cursor);
  let loaded;
  try {loaded=await o.store.openChannelCursor(channels,requested,cursorScope(p));}
  catch(e){if(!(e instanceof CursorError)||e.code!=='CURSOR_SCOPE_MISMATCH') throw e;loaded=await o.store.openChannelCursor(s.channels,requested,cursorScope(p));}
  const stream=`channel:${channels[0]}`,snapshot=await o.store.snapshotChannelCursor(channels,{[stream]:loaded.positions[stream]??'0'},cursorScope(p));
  return {type:'subscribe',subscriptionId:id,channels,cursor:snapshot.token};
 };
 const base=createSocketPolicy({verifier:o.auth,allowedActions:[],authorizeChannel,readToken:readStreamToken,readyChannels,onSubscribe,onReceipt});
 const socketPolicy:GatewaySocketPolicy={...base,async verifyUpgrade(req){if(req.headers.origin&&req.headers.origin!==o.origin) return null;if(streamProtocols(req).length&&!streamProtocols(req).includes('issus.v1')) return null;return base.verifyUpgrade(req);}};
 Object.assign(socketPolicy,{onDisconnect,watchRevocation,selectProtocol:selectStreamProtocol,initialSubscribe});
 return {authorizeChannel,readyChannels,onSubscribe,onReceipt,onDisconnect,watchRevocation,onSessionRevoked,selectProtocol:selectStreamProtocol,initialSubscribe,socketPolicy,readSocketToken:readStreamToken};
}
