import WebSocket from 'ws';
import {ClientError,StreamClosed,type SocketFactory,type SocketConnection} from 'issus_domain/front';

/** Node adapter injects Authorization headers; the shared domain model has no Node/ws dependency. */
export const socketFactory:SocketFactory=(url,headers,signal)=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(url,{headers,handshakeTimeout:15000,maxPayload:1048576,followRedirects:false});
  let opened=false,done=false,failure:unknown,bytes=0;
  const queued:string[]=[];
  let waiting:{resolve:(value:IteratorResult<string>)=>void;reject:(error:unknown)=>void}|undefined;
  const finish=(error?:unknown):void=>{
    if(done) return;done=true;failure=error;signal?.removeEventListener('abort',abort);
    if(!opened) {reject(error??new StreamClosed(1001));return;}
    if(waiting) {const next=waiting;waiting=undefined;if(error) next.reject(error);else next.resolve({value:undefined,done:true});}
  };
  const abort=()=>{ws.close(1000);finish();};
  if(signal?.aborted) {ws.terminate();reject(signal.reason);return;}
  signal?.addEventListener('abort',abort,{once:true});
  ws.on('unexpected-response',(_request,response)=>{response.resume();finish(new ClientError(response.statusCode??0,`WS_HTTP_${response.statusCode??0}`));ws.terminate();});
  ws.on('error',()=>finish(new ClientError(0,'WEBSOCKET_CONNECTION_FAILED')));
  ws.on('close',code=>finish(signal?.aborted?undefined:new StreamClosed(code)));
  ws.on('message',(data,isBinary)=>{
    if(done) return;
    if(isBinary) {finish(new ClientError(0,'BINARY_FRAME_FORBIDDEN'));ws.close(1008);return;}
    const text=data.toString();
    if(waiting) {const next=waiting;waiting=undefined;next.resolve({value:text,done:false});}
    else {
      bytes+=Buffer.byteLength(text);
      if(queued.length>=256||bytes>1048576) {finish(new StreamClosed(1013));ws.close(1013);return;}
      queued.push(text);
    }
  });
  ws.once('open',()=>{
    opened=true;
    const connection:SocketConnection={
      send:text=>new Promise<void>((ok,no)=>ws.send(text,error=>error?no(new ClientError(0,'WEBSOCKET_SEND_FAILED')):ok())),
      close:()=>{ws.close(1000);finish();},
      [Symbol.asyncIterator]:()=>({
        next:async()=>{
          if(queued.length) {const text=queued.shift()!;bytes-=Buffer.byteLength(text);return {value:text,done:false};}
          if(done) {if(failure) throw failure;return {value:undefined,done:true};}
          return new Promise<IteratorResult<string>>((resolve,reject)=>{waiting={resolve,reject};});
        },
        return:async()=>{ws.close(1000);finish();return {value:undefined,done:true};}
      })
    };
    resolve(connection);
  });
});
