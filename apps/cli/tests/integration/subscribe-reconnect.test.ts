import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {IssusClient,subscribe,type StreamCheckpoint,type SocketFactory} from 'issus_domain/front';
import {socketFactory} from '../../src/client/socket/index.js';
import {harness} from '../../src/tests/helpers/index.js';

/** The composition fixture is injected by the integration runner, never imported by CLI runtime. */
const fixture=process.env.ISSUS_DELIVERY_HARNESS;

test('real Postgres/broker WS: disconnect closes old subscription, fresh id inherits confirmed cursor',{timeout:120000},async t=>{
  assert.ok(fixture,'set ISSUS_DELIVERY_HARNESS to the compiled delivery harness file URL');
  const {startDeliveryHarness,seedSessions}=await import(fixture);
  const h=await startDeliveryHarness();
  try {
    const {A,B,I,number}=await seedSessions(h);
    const receipts:any[]=[];
    const client=new IssusClient({server:h.base,token:B.token,fetch:async(input,init)=>{
      if(new URL(input).pathname==='/v1/deliveries/receipts') receipts.push(JSON.parse(String(init?.body)));
      return fetch(input,init);
    }});
    const saved:StreamCheckpoint[]=[],out:string[]=[],sent:any[]=[],keys=new Map<string,string>();
    const controller=new AbortController();
    let connected=0,closeFirst:()=>void=()=>undefined;
    const socket:SocketFactory=async(...args)=>{
      const ws=await socketFactory(...args);connected++;
      if(connected===1) closeFirst=()=>ws.close();
      return {send:async text=>{sent.push(JSON.parse(text));await ws.send(text);},close:()=>ws.close(),[Symbol.asyncIterator]:()=>ws[Symbol.asyncIterator]()};
    };
    const running=subscribe(client,{request:{channels:[],from:'since-compact',repo:'tester/delivery',issues:[number]},transport:'ws',signal:controller.signal,untilMs:30000,socket,reconnectMs:10,
      key:identity=>{const value=JSON.stringify(identity);if(!keys.has(value)) keys.set(value,randomUUID());return keys.get(value)!;},
      onFrame:frame=>{if(frame.type==='event') out.push(frame.event.eventId);},save:s=>{saved.push({...s});}});
    const until=async(predicate:()=>boolean|Promise<boolean>)=>{const end=Date.now()+15000;while(Date.now()<end){if(await predicate()) return;await new Promise(r=>setTimeout(r,10));}throw new Error('client integration condition timeout');};
    try {
      await until(()=>sent.length===1);
      const posted=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\nCLI reconnect live delivery.\nNEXT: receipt.`},A.token);assert.equal(posted.status,201,JSON.stringify(posted));await h.settle();
      await until(async()=>Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery_receipt r JOIN "${h.schema}".delivery d ON d.id=r.delivery_id WHERE d.comment_id=$1 AND d.recipient_alias_id=$2`,[posted.body.commentId,B.aliasId])).rows[0].count)===1);
      await until(()=>saved.some(s=>s.transportCursor!==sent[0].cursor));
      closeFirst();await until(()=>sent.length>=2);
      assert.notEqual(sent[1].subscriptionId,sent[0].subscriptionId);
      const retired=saved.find(s=>s.closed&&s.subscriptionId===sent[0].subscriptionId)!;
      assert.ok(retired);assert.equal(sent[1].cursor,retired.transportCursor);
      assert.ok((await h.pool.query(`SELECT closed_at FROM "${h.schema}".subscription WHERE id=$1`,[sent[0].subscriptionId])).rows[0].closed_at);
      const second=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${B.alias} TYPE:NOTE\nCLI after reconnect.\nNEXT: receipt.`},A.token);assert.equal(second.status,201,JSON.stringify(second));await h.settle();
      await until(async()=>Number((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery_receipt r JOIN "${h.schema}".delivery d ON d.id=r.delivery_id WHERE d.comment_id=$1 AND d.recipient_alias_id=$2`,[second.body.commentId,B.aliasId])).rows[0].count)===1);
      assert.equal(receipts.at(-1).subscriptionId,sent[1].subscriptionId);
      assert.equal(new Set(out).size,out.length);
      assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed`)).rows[0].count,'0');
      assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".comment WHERE envelope->>'TYPE'='ACK'`)).rows[0].count,'0');
      t.diagnostic(JSON.stringify({subscriptions:sent.map(s=>s.subscriptionId),confirmedCursorInherited:true,eventIds:out.length,duplicates:0,implicitProcess:0}));
    } finally {controller.abort();await running;}
  } finally {await h.cleanup();}
});

test('C-02 real HTTP/WS CLI once waits beyond replay, receipts delivery and returns 0; idle until returns 3',{timeout:120000},async()=>{
  assert.ok(fixture);
  const {startDeliveryHarness,seedSessions}=await import(fixture);
  const h=await startDeliveryHarness();
  try {
    const {A,I,number,alias}=await seedSessions(h),cli=await harness();
    const W=await alias('p5-1-waiter');await h.settle();
    cli.env.ISSUS_URL=h.base;cli.env.ISSUS_TOKEN=W.token;
    let completed=false;
    const running=cli.run(['subscribe','--repo','tester/delivery','--issue',String(number),'--once','--until','15000']).then(code=>{completed=true;return code;});
    const end=Date.now()+10000;
    while(!cli.stdout.some(line=>JSON.parse(line).type==='replay')&&Date.now()<end) await new Promise(r=>setTimeout(r,10));
    assert.ok(cli.stdout.some(line=>JSON.parse(line).type==='replay'),JSON.stringify({stderr:cli.stderr,types:cli.stdout.map(line=>JSON.parse(line).type),completed}));
    assert.equal(completed,false,'ready/subscribed/replay must not wake the session');
    const posted=await h.http(`${I}/comments`,{body:`FROM:${A.alias}/s1 TO:${W.alias} TYPE:NOTE\nC-02 once delivery.\nNEXT: receipt.`},A.token);assert.equal(posted.status,201,JSON.stringify(posted));
    assert.equal(await running,0,cli.stderr.join(''));
    assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".delivery_receipt r JOIN "${h.schema}".delivery d ON d.id=r.delivery_id WHERE d.comment_id=$1 AND d.recipient_alias_id=$2`,[posted.body.commentId,W.aliasId])).rows[0].count,'1');
    // A new alias can bootstrap old canonical facts but has no retroactive delivery.
    const C=await alias('p5-1-idle');await h.settle();
    cli.env.ISSUS_TOKEN=C.token;
    assert.equal(await cli.run(['subscribe','--repo','tester/delivery','--issue',String(number),'--once','--until','500']),3,cli.stderr.join(''));
    assert.match(cli.stderr.join(''),/STREAM_WAIT_TIMEOUT/u);
    assert.equal((await h.pool.query(`SELECT count(*) FROM "${h.schema}".processed`)).rows[0].count,'0');
  } finally {await h.cleanup();}
});

