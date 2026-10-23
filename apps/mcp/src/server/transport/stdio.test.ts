import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {fixture,worker,repo,authToken} from '../../testing/fixture/index.js';
import {createMcpServer} from './index.js';

test('M01/M03 stdio JSON-RPC initialize → list → subscribe → wait → ACK/REPORT/application/process',async t=>{
  const f=await fixture();t.after(()=>f.stop());const source=f.ask('stdio nonce');
  const stdin=new PassThrough(),stdout=new PassThrough(),server=createMcpServer(f.bridge),transport=new StdioServerTransport(stdin,stdout);
  const frames:Record<string,any>[]=[],pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let buffer='',next=0;
  stdout.setEncoding('utf8');stdout.on('data',(chunk:string)=>{
    buffer+=chunk;let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line)continue;
      const frame=JSON.parse(line);frames.push(frame);if(typeof frame.id==='number'){const waiting=pending.get(frame.id);if(waiting){pending.delete(frame.id);clearTimeout(waiting.timer);waiting.resolve(frame);}}
    }
  });
  await server.connect(transport);t.after(async()=>{await server.close();stdin.destroy();stdout.destroy();});
  const rpc=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('RPC_TIMEOUT '+method));},5000);pending.set(id,{resolve,reject,timer});stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'issus-test',version:'1'}});assert.ok(init.result.serverInfo);
  stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const list=await rpc('tools/list');assert.equal(list.result.tools.length,10);
  const call=async(name:string,args:unknown={})=>{const r=await rpc('tools/call',{name,arguments:args});assert.equal(r.error,undefined);const result=r.result;assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);return result.structuredContent;};
  assert.equal((await call('issus_wait',{timeoutMs:1500001})).error.code,'BRIDGE_INVALID_ARGUMENTS');
  assert.equal((await call('issus_subscribe',{alias:worker})).ok,true);
  const packet=(await call('issus_wait',{timeoutMs:1000})).data.delivery;assert.equal(packet.commentId,source.comment.id);
  assert.equal((await call('issus_ack',{deliveryId:packet.deliveryId,body:f.ackBody(source.comment.id)})).data.acked,true);
  const report=await call('issus_post',{repo,issue:4,body:f.reportBody(source.comment.id)});
  assert.equal((await call('issus_apply',{deliveryId:packet.deliveryId,evidenceCommentId:report.data.commentId,outcome:'applied'})).ok,true);
  assert.equal((await call('issus_process',{deliveryIds:[packet.deliveryId],disposition:'replied',evidenceCommentId:report.data.commentId})).ok,true);
  const waiting=rpc('tools/call',{name:'issus_wait',arguments:{timeoutMs:10000}}),waitingId=next;
  await new Promise(r=>setTimeout(r,10));assert.equal((await call('issus_status')).data.waiting,true);
  stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:waitingId,reason:'fixture cancel'}})+'\n');
  // SDK suppresses the response to a cancelled JSON-RPC request.
  const cancelled=pending.get(waitingId);if(cancelled){pending.delete(waitingId);clearTimeout(cancelled.timer);cancelled.resolve(undefined);}await waiting;
  for(let i=0;i<20&&f.bridge.waiter.waiting;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.bridge.waiter.waiting,false);
  assert.equal(JSON.stringify(frames).includes(authToken),false);assert.equal(buffer,'');assert.ok(frames.every(frame=>frame.jsonrpc==='2.0'));
});
