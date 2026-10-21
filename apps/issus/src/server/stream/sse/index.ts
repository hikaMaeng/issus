import express,{type Response} from 'express';
import {EventStore,EventStreamHub,MetricsRegistry,startEventLogTail,ConnectionMailbox,ReplayBuffer,cursorScope,CursorError,type Principal as BrokerPrincipal} from 'agent/broker';
import type {ChannelServerFrame} from 'agent/common';
import type {Pool} from 'pg';
import {CoreError,type CorePrincipal} from 'issus_domain/server';
import type {RuntimePrincipal} from 'issus_runtime/server';
import {coreAuthentication,coreHttpError} from '../../http/auth/index.js';
import {endpoint,principal,type CoreHttpOptions} from '../../http/auth/context.js';
import {authorizeDeliveryChannel,type SubscriptionService} from '../../http/subscriptions/index.js';
import type {createStreamCallbacks} from '../callbacks/index.js';

export interface SseRuntime {store:EventStore;hub:EventStreamHub;registerClose?:(close:()=>Promise<void>)=>(()=>void);stop():Promise<void>}
/** SSE shares the agent hub/replay implementation, with a separately owned log reader when needed. */
export function createSseRuntime(pool:Pool):SseRuntime {
 const store=new EventStore(pool),hub=new EventStreamHub(),metrics=new MetricsRegistry(),tail=startEventLogTail({eventStore:store,hub,metrics,pollMs:1000,batchSize:256});
 const connections=new Set<()=>Promise<void>>();let stopping=false,stopped:Promise<void>|undefined;
 hub.watchChannels(()=>tail.wake());return {store,hub,registerClose(close){if(stopping) throw new CoreError(503,'STREAM_DRAINING');connections.add(close);return ()=>connections.delete(close);},stop(){
  if(!stopped) {stopping=true;stopped=(async()=>{try{await Promise.all([...connections].map(close=>close()));}finally{tail.stop();await tail.done;}})();}return stopped;
 }};
}
const frame=(res:Response,value:ChannelServerFrame):void=>{const cursor='cursor' in value?value.cursor:undefined;res.write(`${cursor?`id:${cursor}\n`:''}event:frame\ndata:${JSON.stringify(value)}\n\n`);};
/** SSE sends no implicit ACK/processed mutation. Receipts use the authenticated HTTP endpoint. */
export function createSseRouter(o:CoreHttpOptions,subscriptions:SubscriptionService,runtime:SseRuntime,signals?:Pick<ReturnType<typeof createStreamCallbacks>,'watchRevocation'>):express.Router {
 const router=express.Router();router.use('/v1/stream',coreAuthentication(o));
 router.get('/v1/stream',endpoint(async(req,res)=>{
  const p=principal(res),id=String(req.query.subscription??''),broker=res.locals.runtimePrincipal as RuntimePrincipal;
  const s=await subscriptions.uow.read(async tx=>{
   const s=await subscriptions.get(tx,p,id);for(const c of s.channels) if(!await authorizeDeliveryChannel(tx,p,c)) throw new CoreError(403,'CHANNEL_FORBIDDEN');return s;
  });
  const supplied=req.header('last-event-id')??(req.query.cursor===undefined?undefined:String(req.query.cursor));
  let loaded;
  try{loaded=await runtime.store.openChannelCursor(s.channels,supplied??String((await subscriptions.bootstrap(p,id)).cursor),cursorScope(broker));}catch(e){if(e instanceof CursorError) throw new CoreError(e.status,e.code);throw e;}
  let closed=false,replaying=true,positions=loaded.positions,token=loaded.token,closeReason='sse-disconnect';
  let unwatchRevocation=()=>{};
  let unregister=()=>{},closing:Promise<void>|undefined;
  const buffer=new ReplayBuffer(256);let unsubscribe=()=>{};
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  const close=(endResponse=true):Promise<void>=>{
   if(closed) return closing??Promise.resolve();closed=true;if(heartbeat) clearInterval(heartbeat);unsubscribe();unwatchRevocation();unregister();mailbox.dispose();if(endResponse) res.end();closing=subscriptions.disconnected(id,p.id,closeReason);void closing.catch(()=>{});return closing;
  };
  const mailbox=new ConnectionMailbox(256,(event,done)=>{
   if(closed) {done();return;}if(res.writableLength>1048576) {close();done();return;}
   if(BigInt(event.sequence)<=BigInt(positions[event.streamId]??'0')) {done();return;}
   const next={...positions,[event.streamId]:event.sequence};
   void runtime.store.snapshotChannelCursor(s.channels,next,cursorScope(broker)).then(snapshot=>{
    if(closed) {done();return;}positions=next;token=snapshot.token;
    frame(res,{type:'event',event,cursor:token});if(res.writableLength>1048576) close();done();
   }).catch(()=>{close();done();});
  },close);
  unregister=runtime.registerClose?.(close)??(()=>{});
  try {
  req.on('close',()=>{void close();});res.on('error',()=>{void close();});
  unwatchRevocation=signals?.watchRevocation(broker,()=>{closeReason='session-revoked';close();})??(()=>{});
  unsubscribe=runtime.hub.subscribe(s.channels,event=>{if(closed) return;if(replaying){if(buffer.push(event)==='overflow') close();}else mailbox.enqueue(event);});
  await runtime.hub.prepareChannels();const water=await runtime.store.channelHighWater(s.channels);
  const replay=await runtime.store.replayChannels(s.channels,positions,water,256);
  if(closed) return;
  res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  frame(res,{type:'ready',channels:s.channels});frame(res,{type:'subscribed',subscriptionId:id,channels:s.channels,cursor:token,replayComplete:replay.complete});
  for(const event of await subscriptions.bootstrapEvents(p,id,s.channels)) {
   if(closed) return;if(res.writableLength>1048576){close();return;}const snapshot=await runtime.store.snapshotChannelCursor(s.channels,positions,cursorScope(broker));token=snapshot.token;frame(res,{type:'event',event,cursor:token});
  }
  if(!replay.complete) unsubscribe();
  for(const event of replay.events) mailbox.enqueue(event);
  if(replay.complete) {for(const event of buffer.drain().filter(e=>BigInt(e.sequence)>BigInt(water[e.streamId]??'0')).sort((a,b)=>a.streamId.localeCompare(b.streamId)||(BigInt(a.sequence)<BigInt(b.sequence)?-1:1))) mailbox.enqueue(event);replaying=false;}
  mailbox.onIdle(()=>{if(!closed) frame(res,{type:'replay',cursor:token,replayComplete:replay.complete});});
  heartbeat=setInterval(()=>{void subscriptions.uow.read(async tx=>{
   await subscriptions.get(tx,p,id);for(const c of s.channels) if(!await authorizeDeliveryChannel(tx,p,c)) throw new CoreError(403,'CHANNEL_FORBIDDEN');
  }).then(()=>{if(!closed) res.write(': heartbeat\n\n');}).catch(()=>{void close();});},15000);
  }catch(error) {
   const started=res.headersSent;closeReason='sse-initialization-failed';await close(started);
   if(!started) throw error;
  }
 }));router.use(coreHttpError);return router;
}
