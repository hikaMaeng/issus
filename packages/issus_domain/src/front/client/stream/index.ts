import type {DomainServerFrame,SubscriptionRequest,SubscriptionResponse} from '../../../common/protocol/subscription/index.js';
import {decodeFrame,FrameError,SseFrameParser,StreamModel} from '../../model/stream/index.js';
import {abortableDelay,ClientError,IssusClient} from '../http/index.js';

export interface SocketConnection extends AsyncIterable<string> {send(text:string):Promise<void>; close():void}
export type SocketFactory=(url:string,headers:Record<string,string>,signal?:AbortSignal)=>Promise<SocketConnection>;
export interface StreamCheckpoint {subscriptionId:string;channels:string[];transportCursor?:string;closed?:boolean;generation?:number}
export interface SubscribeOptions {
  request:SubscriptionRequest; transport:'ws'|'sse'; once?:boolean; signal?:AbortSignal;
  checkpoint?:StreamCheckpoint; socket?:SocketFactory;
  key:(identity:unknown)=>string|Promise<string>;
  onFrame:(frame:DomainServerFrame)=>void|Promise<void>;
  onSubscription?:(subscription:SubscriptionResponse)=>void|Promise<void>;
  save:(checkpoint:StreamCheckpoint)=>void|Promise<void>;
  reconnectMs?:number; maxReconnects?:number;
  onAccepted?:(operation:{operationId:string;statusUrl:string;key:string})=>void|Promise<void>;
}

export class StreamClosed extends Error {
  constructor(readonly code:number) {super(`STREAM_CLOSED_${code}`);this.name='StreamClosed';}
}

/** Reconnects from receipt-confirmed immutable cursor; Ctrl-C closes only its subscription. */
export async function subscribe(client:IssusClient,options:SubscribeOptions):Promise<void> {
  let checkpoint=options.checkpoint, reconnects=0, socket:SocketConnection|undefined;
  let generation=checkpoint?.generation??0;
  const previous=checkpoint;
  let allowPreviousResume=!!previous?.closed;
  if(checkpoint?.closed) {generation++;checkpoint=undefined;}
  const model=new StreamModel();
  const save=async(value:StreamCheckpoint):Promise<void>=>{try {await options.save(value);} catch {throw new FrameError('CHECKPOINT_WRITE_FAILED');}};
  const output=async(frame:DomainServerFrame):Promise<void>=>{try {await options.onFrame(frame);} catch {throw new FrameError('OUTPUT_FAILED');}};
  const receive=async(frame:DomainServerFrame):Promise<boolean>=>{
    if(frame.type==='error') {
      await output(frame);
      if(['CURSOR_EXPIRED','CURSOR_SCOPE_MISMATCH','CURSOR_NOT_FOUND'].includes(frame.code)) throw new ClientError(410,frame.code);
      throw new ClientError(frame.retryable?503:403,frame.code);
    }
    const accepted=model.accept(frame);
    if(accepted) await output(frame);
    if(frame.type==='event') {
      const payload=frame.event.payload as Record<string,unknown>;
      if(['issus.delivery.queued','issus.delivery.redelivered','issus.delivery.escalated'].includes(frame.event.action)&&typeof payload.deliveryId==='string'&&Number.isInteger(payload.attempt)) {
        const body={subscriptionId:checkpoint!.subscriptionId,deliveryIds:[payload.deliveryId],attempts:[payload.attempt]};
        await client.write('/v1/deliveries/receipts',{method:'POST',key:await options.key({action:'receipt',body}),body,signal:options.signal,onAccepted:options.onAccepted});
      }
    }
    if('cursor' in frame && frame.cursor) {
      checkpoint={...checkpoint!,transportCursor:frame.cursor};
      await save(checkpoint);
    }
    return !!options.once && (frame.type==='subscribed'||frame.type==='replay') && frame.replayComplete;
  };
  try {
    while(!options.signal?.aborted) {
      try {
        if(!checkpoint) {
          const response=await client.write<SubscriptionResponse>('/v1/subscriptions',{method:'POST',key:await options.key({action:'subscribe',generation,body:options.request}),body:options.request,signal:options.signal,onAccepted:options.onAccepted});
          const resumable=allowPreviousResume&&previous?.transportCursor&&JSON.stringify([...previous.channels].sort())===JSON.stringify([...response.channels].sort());
          checkpoint={subscriptionId:response.subscriptionId,channels:response.channels,transportCursor:resumable?previous!.transportCursor:response.cursor,generation};
          try {await options.onSubscription?.(response);} catch {throw new FrameError('OUTPUT_FAILED');}
          await save(checkpoint);
        }
        if(options.transport==='ws') {
          if(!options.socket) throw new ClientError(0,'WEBSOCKET_FACTORY_REQUIRED');
          const url=client.url('/ws');url.protocol=url.protocol==='https:'?'wss:':'ws:';
          socket=await options.socket(url.href,client.headers(),options.signal);
          await socket.send(JSON.stringify({type:'subscribe',subscriptionId:checkpoint.subscriptionId,channels:checkpoint.channels,...(checkpoint.transportCursor?{cursor:checkpoint.transportCursor}:{})}));
          for await(const text of socket) {if(await receive(decodeFrame(text))) return;}
          throw new StreamClosed(1001);
        } else {
          const url=client.url('/v1/stream');url.searchParams.set('subscription',checkpoint.subscriptionId);
          if(checkpoint.transportCursor) url.searchParams.set('cursor',checkpoint.transportCursor);
          const response=await client.fetch(url,{headers:{...client.headers(),Accept:'text/event-stream',...(checkpoint.transportCursor?{'Last-Event-ID':checkpoint.transportCursor}:{})},signal:options.signal,redirect:'error'});
          if(!response.ok) throw new ClientError(response.status,`HTTP_${response.status}`);
          if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream')) throw new ClientError(0,'INVALID_SSE_RESPONSE');
          const reader=response.body.getReader(),parser=new SseFrameParser();
          try {
            while(true) {
              const {value,done}=await reader.read();
              if(done) break;
              for(const frame of parser.push(value)) if(await receive(frame)) return;
            }
            for(const frame of parser.push(new Uint8Array(),true)) if(await receive(frame)) return;
          } finally {await reader.cancel().catch(()=>undefined);reader.releaseLock();}
          throw new StreamClosed(1001);
        }
      } catch(error) {
        socket?.close();socket=undefined;
        if(options.signal?.aborted) return;
        if(error instanceof FrameError) throw error;
        if(error instanceof StreamClosed && [1008,4001,4401,4403].includes(error.code)) throw new ClientError(403,'STREAM_AUTH_REJECTED');
        if(error instanceof ClientError) {
          if(error.status===410||error.code==='CURSOR_SCOPE_MISMATCH') {
            if(checkpoint) await client.write(`/v1/subscriptions/${encodeURIComponent(checkpoint.subscriptionId)}`,{method:'DELETE',key:await options.key({action:'close',subscriptionId:checkpoint.subscriptionId}),onAccepted:options.onAccepted}).catch(()=>undefined);
            checkpoint=undefined;generation++;allowPreviousResume=false;model.resetOrdering();
          } else if(error.status>=400&&error.status<500&&error.status!==429) throw error;
        }
        reconnects++;
        if(options.maxReconnects!==undefined&&reconnects>options.maxReconnects) throw error;
        await abortableDelay(Math.min((options.reconnectMs??250)*2**Math.min(reconnects-1,6),10000),options.signal);
      }
    }
  } finally {
    socket?.close();
    if(checkpoint) {
      await client.write(`/v1/subscriptions/${encodeURIComponent(checkpoint.subscriptionId)}`,{method:'DELETE',key:await options.key({action:'close',subscriptionId:checkpoint.subscriptionId}),onAccepted:options.onAccepted},5000).catch(()=>undefined);
      await save({...checkpoint,closed:true});
    }
  }
}
