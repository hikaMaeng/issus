import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {WebSocketServer,type WebSocket} from 'ws';
import {IssusClient,subscribe,FrameError,StreamTimeout,type StreamCheckpoint,type SocketConnection} from 'issus_domain/front';
import {harness,id,principal,timestamp} from './helpers/index.js';

const subscriptionId=id(20),cursor0=id(30),cursor1=id(31),cursor2=id(32),deliveryId=id(40),channels=[`alias:${id(2)}:${id(3)}`,`session:${id(4)}`];
const initial={subscriptionId,channels,cursor:cursor0,bootstrap:{mode:'snapshot',snapshotId:id(50),meAliases:[principal.alias],complete:true,issues:[],inboxThroughOrdinal:'0',inboxThroughEventSequence:'0'},compact:[],pendingLegacy:{window:[],global:[]},windowPendingAck:[],globalPendingAck:[],ackState:[]};
const event=(n:number)=>({type:'event',cursor:n===1?cursor1:cursor2,event:{eventId:id(n+60),eventVersion:1,kind:'fact',action:n===1?'issus.delivery.queued':'issus.delivery.redelivered',streamId:'alias-stream',sequence:String(n),transactionKey:'react-'+n,channel:channels[0],correlationId:id(70),source:'worker',audience:'client',createdAt:timestamp,payload:{ownerId:id(2),aliasId:id(3),deliveryId,sourceEventId:id(71),sourceStreamId:'canonical',sourceSequence:'9',commentId:'1000001',ordinal:'17',classification:'ME',ackRequired:true,attempt:n-1,content:{body:'FROM:issus-1-orch/s1 TO:issus-1-client TYPE:NOTE\n안녕하세요 😀'}}}});
async function listen(server:Server):Promise<string> {await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
const body=async(req:IncomingMessage):Promise<any>=>{let text='';for await(const chunk of req) text+=chunk;return text?JSON.parse(text):undefined;};
const json=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};

test('contract WS server: new subscriptions on reconnect, receipt cursor, dedupe and restart --once',async()=>{
  const receipts:{body:any;key:string|undefined}[]=[],subscribes:any[]=[],mutations:string[]=[],keys:string[]=[];
  let sockets=0,current:WebSocket|undefined;const controller=new AbortController();
  const server=createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,'Bearer test-only-session');assert.doesNotMatch(req.url!,/test-only-session/u);
    if(req.method!=='GET') mutations.push(req.url!);
    if(req.url==='/v1/auth/me') return json(res,principal);
    if(req.url==='/v1/subscriptions'&&req.method==='POST') {await body(req);keys.push(String(req.headers['idempotency-key']));return json(res,{...initial,subscriptionId:id(20+keys.length)},201);}
    if(req.url==='/v1/deliveries/receipts') {
      receipts.push({body:await body(req),key:req.headers['idempotency-key'] as string|undefined});json(res,{received:true});
      if(receipts.length===1) setTimeout(()=>current?.close(1001),30);
      if(receipts.length===3) setTimeout(()=>controller.abort(),30);return;
    }
    if(req.method==='DELETE') return json(res,{closed:true});
    return json(res,{error:{code:'NOT_FOUND'},posted:false},404);
  });
  const wss=new WebSocketServer({noServer:true});
  server.on('upgrade',(req,socket,head)=>{
    assert.equal(req.headers.authorization,'Bearer test-only-session');
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    current=ws;sockets++;
    ws.once('message',raw=>{
      const frame=JSON.parse(raw.toString());subscribes.push(frame);assert.equal(frame.type,'subscribe');
      ws.send(JSON.stringify({type:'ready',channels}));
      if(sockets>=3) {ws.send(JSON.stringify({type:'subscribed',subscriptionId:frame.subscriptionId,channels,cursor:frame.cursor,replayComplete:true}));setTimeout(()=>ws.send(JSON.stringify(event(2))),20);return;}
      ws.send(JSON.stringify({type:'subscribed',subscriptionId:frame.subscriptionId,channels,cursor:frame.cursor,replayComplete:false}));
      ws.send(JSON.stringify(event(1)));
      if(sockets===2) {ws.send(JSON.stringify(event(2)));ws.send(JSON.stringify({type:'replay',cursor:cursor2,replayComplete:true}));}
    });
  });
  const url=await listen(server),h=await harness();h.env.ISSUS_URL=url;
  const args=['subscribe','--repo','hikaMaeng/issus','--issue','1','--me','issus-1-client/s1','--cursor',join(h.directory,'stream.json')];
  try {
    assert.equal(await h.run(args,{signal:controller.signal}),0,h.stderr.join(''));
    const lines=h.stdout.map(s=>JSON.parse(s));assert.equal(lines.filter(l=>l.type==='event').length,2);
    assert.equal(subscribes[0].cursor,cursor0);assert.equal(subscribes[1].cursor,cursor1);assert.equal(receipts.length,3);
    assert.deepEqual(receipts.map(r=>r.body.attempts),[[0],[0],[1]]);assert.notEqual(receipts[0].key,receipts[1].key);
    assert.notEqual(subscribes[0].subscriptionId,subscribes[1].subscriptionId);
    assert.deepEqual(receipts.map(r=>r.body.subscriptionId),[id(21),id(22),id(22)]);assert.ok(mutations.every(p=>!p.includes('process')&&!p.includes('comments')&&!p.includes('application')));
    const saved=JSON.parse(await readFile(join(h.directory,'stream.json'),'utf8')),scope=Object.values(saved.scopes)[0] as {stream:StreamCheckpoint};
    assert.equal(scope.stream.transportCursor,cursor2);assert.equal(scope.stream.closed,true);assert.ok(!JSON.stringify(saved).includes(h.env.ISSUS_TOKEN));
    assert.equal(await h.run([...args,'--once','--until','2000']),0,h.stderr.join(''));assert.equal(subscribes[2].cursor,cursor2);assert.equal(new Set(keys).size,3);
    assert.equal(receipts.length,4);assert.equal(receipts[3].body.subscriptionId,id(23));
  } finally {for(const ws of wss.clients) ws.terminate();wss.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('contract SSE server: chunked UTF-8, Last-Event-ID resume, automatic HTTP receipts, JSON Lines',async()=>{
  const cursors:(string|string[]|undefined)[]=[],receipts:any[]=[];let streams=0,first:ServerResponse|undefined;const controller=new AbortController();
  const server=createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,'Bearer test-only-session');
    if(req.url==='/v1/auth/me') return json(res,principal);
    if(req.url==='/v1/subscriptions'&&req.method==='POST') {await body(req);return json(res,initial,201);}
    if(req.url==='/v1/deliveries/receipts') {receipts.push(await body(req));json(res,{received:true});if(receipts.length===1) setTimeout(()=>first?.end(),15);if(receipts.length===2) setTimeout(()=>controller.abort(),15);return;}
    if(req.method==='DELETE') return json(res,{closed:true});
    if(req.url?.startsWith('/v1/stream?')) {
      streams++;cursors.push(req.headers['last-event-id']);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      const e=event(streams===1?1:2),bytes=Buffer.from(`: heartbeat\n\nevent:frame\nid:${e.cursor}\ndata:${JSON.stringify(e)}\n\n`,'utf8');
      for(let i=0;i<bytes.length;i+=7) res.write(bytes.subarray(i,i+7));
      if(streams===1) first=res;
      else res.end(`event:frame\nid:${cursor2}\ndata:${JSON.stringify({type:'replay',cursor:cursor2,replayComplete:true})}\n\n`);
      return;
    }
    json(res,{error:{code:'NOT_FOUND'},posted:false},404);
  });
  const h=await harness();h.env.ISSUS_URL=await listen(server);
  try {
    assert.equal(await h.run(['subscribe','--repo','hikaMaeng/issus','--issue','1','--transport','sse'],{signal:controller.signal}),0,h.stderr.join(''));
    assert.deepEqual(cursors,[cursor0,cursor1]);assert.deepEqual(receipts.map(r=>r.attempts),[[0],[1]]);
    assert.equal(h.stdout.map(s=>JSON.parse(s)).filter(s=>s.type==='event').length,2);assert.match(h.stdout.join(''),/안녕하세요 😀/u);
  } finally {first?.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('failed receipt never advances transport cursor; replay emits once and retries receipt',async()=>{
  let receipts=0,connections=0,keys=0;const saved:StreamCheckpoint[]=[],emitted:string[]=[];
  const client=new IssusClient({server:'https://example.com',fetch:async(url,init)=>{
    if(new URL(url).pathname==='/v1/subscriptions') return Response.json(initial,{status:201});
    if(new URL(url).pathname==='/v1/deliveries/receipts') {if(receipts++===0) return Response.json({error:{code:'SERVICE_UNAVAILABLE'},posted:false},{status:503});return Response.json({ok:true});}
    return Response.json({closed:true});
  }});
  const socket=async():Promise<SocketConnection>=>({send:async()=>undefined,close:()=>undefined,[Symbol.asyncIterator]:async function*(){connections++;yield JSON.stringify(event(1));if(connections===2) yield JSON.stringify({type:'replay',cursor:cursor1,replayComplete:true});}});
  await subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},transport:'ws',once:true,socket,key:()=>id(++keys),onFrame:f=>{if(f.type==='event') emitted.push(f.event.eventId);},save:s=>{saved.push({...s});},reconnectMs:1,maxReconnects:2});
  assert.equal(receipts,2);assert.equal(emitted.length,1);assert.equal(saved[0].transportCursor,cursor0);assert.equal(saved.at(-1)?.transportCursor,cursor1);
});

test('output failure terminates and does not acknowledge or advance the event cursor',async()=>{
  let receipts=0;const saved:StreamCheckpoint[]=[];
  const client=new IssusClient({server:'https://example.com',fetch:async(url)=>{if(new URL(url).pathname==='/v1/subscriptions') return Response.json(initial,{status:201});if(new URL(url).pathname==='/v1/deliveries/receipts') receipts++;return Response.json({ok:true});}});
  const socket=async():Promise<SocketConnection>=>({send:async()=>undefined,close:()=>undefined,[Symbol.asyncIterator]:async function*(){yield JSON.stringify(event(1));}});
  await assert.rejects(()=>subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},transport:'ws',once:true,socket,key:()=>id(99),onFrame:()=>{throw new Error('broken pipe');},save:s=>{saved.push({...s});}}),(e:unknown)=>e instanceof FrameError&&e.code==='OUTPUT_FAILED');
  assert.equal(receipts,0);assert.ok(saved.every(s=>s.transportCursor===cursor0));
});

test('expired cursor creates a new snapshot and does not reuse the expired transport position',async()=>{
  const controller=new AbortController();
  let creates=0,connections=0;const subscribed:any[]=[],saved:StreamCheckpoint[]=[],emitted:string[]=[];
  const client=new IssusClient({server:'https://example.com',fetch:async(url)=>{
    if(new URL(url).pathname==='/v1/subscriptions') {creates++;return Response.json({...initial,subscriptionId:id(20+creates),cursor:creates===1?cursor0:id(33)},{status:201});}
    return Response.json({ok:true});
  }});
  const socket=async():Promise<SocketConnection>=>({send:async text=>{subscribed.push(JSON.parse(text));},close:()=>undefined,[Symbol.asyncIterator]:async function*(){
    connections++;
    if(connections===1) {yield JSON.stringify(event(1));yield JSON.stringify({type:'error',code:'CURSOR_EXPIRED',message:'expired',retryable:false});}
    else {
      // A new bootstrap can replay an earlier source sequence with an event not seen in the old window.
      const e=event(1);e.event.eventId=id(98);yield JSON.stringify(e);yield JSON.stringify({type:'replay',cursor:cursor1,replayComplete:true});controller.abort();
    }
  }});
  await subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},transport:'ws',signal:controller.signal,socket,key:()=>id(99),onFrame:f=>{if(f.type==='event') emitted.push(f.event.eventId);},save:s=>{saved.push({...s});},reconnectMs:1,maxReconnects:2});
  assert.equal(creates,2);assert.equal(subscribed[1].cursor,id(33));assert.equal(emitted.length,2);assert.equal(saved.at(-1)?.generation,1);
});

test('nonretryable auth frame terminates without resubscription',async()=>{
  let creates=0;
  const client=new IssusClient({server:'https://example.com',fetch:async(url)=>{if(new URL(url).pathname==='/v1/subscriptions') {creates++;return Response.json(initial,{status:201});}return Response.json({ok:true});}});
  const socket=async():Promise<SocketConnection>=>({send:async()=>undefined,close:()=>undefined,[Symbol.asyncIterator]:async function*(){yield JSON.stringify({type:'error',code:'FORBIDDEN',message:'no',retryable:false});}});
  await assert.rejects(()=>subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},transport:'ws',socket,key:()=>id(99),onFrame:()=>undefined,save:()=>undefined,reconnectMs:1,maxReconnects:2}),/FORBIDDEN/u);
  assert.equal(creates,1);
});

test('Ctrl-C signal closes subscription without ACK, process, application or token revocation',async()=>{
  const paths:string[]=[],controller=new AbortController();const saved:StreamCheckpoint[]=[];
  const client=new IssusClient({server:'https://example.com',fetch:async(url)=>{paths.push(new URL(url).pathname);return new URL(url).pathname==='/v1/subscriptions'?Response.json(initial,{status:201}):Response.json({ok:true});}});
  const socket=async():Promise<SocketConnection>=>({send:async()=>undefined,close:()=>undefined,[Symbol.asyncIterator]:async function*(){yield JSON.stringify(event(1));}});
  await subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},transport:'ws',socket,key:()=>id(99),signal:controller.signal,onFrame:()=>controller.abort(new Error('SIGINT')),save:s=>{saved.push({...s});}});
  assert.ok(paths.includes('/v1/subscriptions/'+subscriptionId));
  assert.ok(paths.every(p=>p.startsWith('/v1/subscriptions')));assert.ok(saved.every(s=>s.transportCursor===cursor0));
});

for(const sameChannels of [true,false]) test(`saved open checkpoint always gets a fresh subscription; same channel scope=${sameChannels}`,async()=>{
  const old={subscriptionId:id(90),channels:sameChannels?channels:[`alias:${id(2)}:${id(99)}`],transportCursor:id(91),generation:4};
  const sent:any[]=[],saved:StreamCheckpoint[]=[];
  let creates=0;
  const client=new IssusClient({server:'https://example.com',fetch:async url=>{
    if(new URL(url).pathname==='/v1/subscriptions') {creates++;return Response.json(initial,{status:201});}
    return Response.json({received:true});
  }});
  const socket=async():Promise<SocketConnection>=>({send:async text=>{sent.push(JSON.parse(text));},close:()=>undefined,[Symbol.asyncIterator]:async function*(){yield JSON.stringify(event(1));}});
  await subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},checkpoint:old,transport:'ws',once:true,socket,key:()=>id(99),onFrame:()=>undefined,save:s=>{saved.push({...s});}});
  assert.equal(creates,1);assert.equal(sent[0].subscriptionId,subscriptionId);
  assert.equal(sent[0].cursor,sameChannels?old.transportCursor:cursor0);
  assert.equal(saved[0].generation,5);assert.equal(saved.at(-1)?.closed,true);
});

test('--until also interrupts reconnect backoff and retains the last confirmed checkpoint',async()=>{
  const saved:StreamCheckpoint[]=[];
  const client=new IssusClient({server:'https://example.com',fetch:async url=>new URL(url).pathname==='/v1/subscriptions'?Response.json(initial,{status:201}):Response.json({closed:true})});
  const socket=async():Promise<SocketConnection>=>({send:async()=>undefined,close:()=>undefined,[Symbol.asyncIterator]:async function*(){}});
  await assert.rejects(()=>subscribe(client,{request:{channels:[],from:'since-compact',repo:'o/r',issues:[1]},transport:'ws',once:true,untilMs:50,socket,reconnectMs:1000,key:()=>id(99),onFrame:()=>undefined,save:s=>{saved.push({...s});}}),StreamTimeout);
  assert.equal(saved.at(-1)?.closed,true);assert.ok(saved.every(s=>s.transportCursor===cursor0));
});
