import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {WebSocketServer} from 'ws';
import {harness,id,principal,timestamp} from './helpers/index.js';

const channels=[`alias:${id(2)}:${id(3)}`,`session:${id(4)}`],subscriptionId=id(20),cursor=id(30);
const initial={subscriptionId,channels,cursor,bootstrap:{mode:'snapshot',snapshotId:id(50),meAliases:[principal.alias],complete:true,issues:[],inboxThroughOrdinal:'0',inboxThroughEventSequence:'0'},compact:[],pendingLegacy:{window:[],global:[]},windowPendingAck:[],globalPendingAck:[],ackState:[]};
const frames=[{type:'ready',channels},{type:'subscribed',subscriptionId,channels,cursor,replayComplete:true},{type:'replay',cursor,replayComplete:true}];
const delivery={type:'event',cursor:id(31),event:{eventId:id(60),eventVersion:1,kind:'fact',action:'issus.delivery.queued',streamId:'alias-stream',sequence:'1',transactionKey:'react-1',channel:channels[0],correlationId:id(70),source:'worker',audience:'client',createdAt:timestamp,payload:{ownerId:id(2),aliasId:id(3),deliveryId:id(40),attempt:0}}};
const json=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};

for(const transport of ['ws','sse']) for(const mode of ['delivery','deadline','receipt-pending','continuous-deadline']) {
  test(`C-02 ${transport} ${mode}: controls never finish once; receipt success=0, deadline=3`,{timeout:10000},async()=>{
    const paths:string[]=[],timers:ReturnType<typeof setTimeout>[]=[],streams:ServerResponse[]=[];
    let receipts=0,receiptCompleted=false,controls=false,delivered=false,settled=false;
    const later=(fn:()=>void,ms:number)=>{timers.push(setTimeout(fn,ms));};
    const stream=(send:(frame:unknown)=>void)=>{
      for(const f of frames) send(f);controls=true;
      send({...delivery,event:{...delivery.event,eventId:id(61),action:'issus.delivery.delivered',streamId:'state-stream'}});
      later(()=>{
        assert.equal(settled,false,'control-only stream exited early');
        if(mode==='delivery'||mode==='receipt-pending') {send(delivery);delivered=true;}
      },80);
    };
    const server=createServer(async(req,res)=>{
      paths.push(`${req.method} ${new URL(req.url!,'http://local').pathname}`);
      for await(const _chunk of req) { /* consume body */ }
      if(req.url==='/v1/auth/me') return json(res,principal);
      if(req.url==='/v1/subscriptions'&&req.method==='POST') return json(res,initial,201);
      if(req.method==='DELETE') return json(res,{closed:true});
      if(req.url==='/v1/deliveries/receipts') {
        receipts++;later(()=>{receiptCompleted=true;json(res,{received:true});},mode==='receipt-pending'?2000:80);return;
      }
      if(req.url?.startsWith('/v1/stream?')) {
        streams.push(res);res.writeHead(200,{'Content-Type':'text/event-stream'});
        stream(f=>res.write(`event:frame\ndata:${JSON.stringify(f)}\n\n`));return;
      }
      json(res,{},404);
    });
    const wss=new WebSocketServer({server,path:'/ws'});
    wss.on('connection',ws=>ws.once('message',()=>stream(f=>ws.send(JSON.stringify(f)))));
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const h=await harness();h.env.ISSUS_URL=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    try {
      const code=await h.run(['subscribe','--repo','hikaMaeng/issus','--issue','1','--transport',transport,...(mode==='continuous-deadline'?[]:['--once']),'--until',mode==='delivery'?'3000':'600']);settled=true;
      assert.equal(code,mode==='delivery'?0:3,h.stderr.join(''));
      assert.equal(controls,true);assert.equal(delivered,mode==='delivery'||mode==='receipt-pending');
      assert.equal(receipts,mode==='delivery'||mode==='receipt-pending'?1:0);
      assert.equal(receiptCompleted,mode==='delivery');
      assert.ok(paths.includes(`DELETE /v1/subscriptions/${subscriptionId}`));
      assert.ok(paths.every(p=>!p.includes('comments')&&!p.includes('process')&&!p.includes('application')));
      assert.ok(h.stdout.every(line=>JSON.parse(line)));
    } finally {for(const timer of timers) clearTimeout(timer);for(const res of streams) res.end();for(const ws of wss.clients) ws.terminate();wss.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}

test('--until accepts only positive integer milliseconds within the Node timer range',async()=>{
  const h=await harness(async()=>{throw new Error('must validate before HTTP');});
  for(const raw of ['0','-1','1.5','2s','NaN','2147483648']) {
    assert.equal(await h.run(['subscribe','--repo','o/r','--issue','1','--until',raw]),2);
    assert.match(h.stderr.join(''),/--until/u);
  }
  assert.equal(await h.run(['subscribe','--repo','o/r','--issue','1','--until','5','--until','10']),2);
});
