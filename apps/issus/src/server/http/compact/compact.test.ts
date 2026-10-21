import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import {compactPublication,readCompactHistory} from 'issus_domain/server';
import {createCoreHttpRouter,coreHttpError} from '../auth/index.js';
import {startCoreHarness} from '../auth/testing.js';
import {installCompactRoutes} from './index.js';

test('P6 compact HTTP + P4 auth/submitter + real DB',{timeout:60000},async t=>{
  const h=await startCoreHarness();h.intake.options.publication=compactPublication;
  t.diagnostic(`schema=${h.schema} brokerSchema=${h.brokerSchema}`);
  const options={intake:h.intake,auth:h.auth,origin:'http://127.0.0.1:18140',historyReader:readCompactHistory};
  const app=express(),router=createCoreHttpRouter(options);installCompactRoutes(router,options);app.use(router);app.use(coreHttpError);
  const server:Server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const a=server.address();assert.ok(a&&typeof a!=='string');const base=`http://127.0.0.1:${a.port}`;
  async function http(path:string,body?:unknown,token=h.bootstrapToken,headers:Record<string,string>={}) {
    const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'idempotency-key':randomUUID(),prefer:'wait=5'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await res.text();return {status:res.status,body:res.headers.get('content-type')?.includes('application/json')&&text?JSON.parse(text):text,headers:res.headers};
  }
  const R='/v1/repos/tester/compact';let alpha='',bravo='',n=0;
  try {
    const repo=await http('/v1/repos',{owner:'tester',slug:'compact',projectCode:'tt',autoBoard:true});assert.equal(repo.status,201);const repoId=repo.body.repoId;
    for(const name of ['tt-1-alpha','tt-1-bravo']) {
      const alias=await http('/v1/owners/tester/aliases',{name,role:'test',model:'fixture',scope:'compact',repos:[repoId],announcementBody:`FROM:${name}/by-tt-system TO:ALL TYPE:ALIAS\n${name} | test | fixture | compact | s1`});assert.equal(alias.status,201);
      const session=await http('/v1/sessions',{alias:name,sid:'s1'});assert.equal(session.status,201);if(name.endsWith('alpha')) alpha=session.body.token;else bravo=session.body.token;
    }
    const issue=await http(`${R}/issues`,{title:'P6 HTTP',body:'STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T04:00+00:00\nGOAL: compact'});assert.equal(issue.status,201);n=issue.body.number;
    const I=`${R}/issues/${n}`;
    await t.test('status is read only; empty packet204; auth and format rejection',async()=>{
      const status=await http(`${I}/compact/status`,undefined,alpha);assert.equal(status.status,200);assert.deepEqual(status.body,{count:0,chars:0,due:false,reasons:[],previousCompactId:null,owner:'tt-1-alpha'});assert.equal(status.headers.get('cache-control'),'no-store');
      assert.equal((await http(`${I}/compact/packet`,undefined,alpha)).status,204);assert.equal((await http(`${I}/compact/status`,undefined,'')).status,401);assert.equal((await http(`${I}/compact/packet`,undefined,bravo)).status,403);assert.equal((await http(`${I}/compact/packet?format=html`,undefined,alpha)).status,400);
    });
    const ids:string[]=[];
    for(let i=0;i<3;i++){const r=await http(`${I}/comments`,{body:`FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\n원문 ${i}`},alpha);assert.equal(r.status,201);ids.push(r.body.commentId);}
    let packet:any;
    await t.test('packet JSON/markdown evidence and prepare idempotency preserve metadata without token persistence',async()=>{
      const r=await http(`${I}/compact/packet`,undefined,alpha);assert.equal(r.status,200);packet=r.body;assert.equal(packet.count,3);assert.equal(packet.throughId,ids[2]);assert.equal(packet.comments[0].id,ids[0]);assert.equal(packet.packetToken.length>20,true);
      const md=await http(`${I}/compact/packet?format=markdown`,undefined,alpha);assert.equal(md.status,200);assert.ok(md.headers.get('x-compact-packet-token'));assert.equal(md.headers.get('x-compact-through-id'),ids[2]);assert.match(md.body,/# COMPACT INPUT PACKET/);
      const key=randomUUID(),prepare=await http(`${I}/compact/prepare`,{purpose:'before-handoff'},alpha,{'idempotency-key':key});assert.equal(prepare.status,201);assert.deepEqual(prepare.body.status.reasons,['before-handoff']);
      assert.deepEqual((await http(`${I}/compact/prepare`,{purpose:'before-handoff'},alpha,{'idempotency-key':key})).body,prepare.body);
      assert.equal((await http(`${I}/compact/prepare`,{purpose:'before-close'},alpha,{'idempotency-key':key})).status,409);assert.equal((await http(`${I}/compact/prepare`,{purpose:'routine',metadata:{}},alpha)).status,422);
      const due=(await h.pool.query(`SELECT payload FROM event_store WHERE action='issus.compact.due' AND payload->'issue'->>'issueNumber'=$1`,[String(n)])).rows;assert.equal(due.length,1);assert.equal(due[0].payload.ownerAliasId,(await h.auth.verify(alpha)).aliasId);
    });
    await t.test('COMPACT uses P4 comments route, preserves submitted metadata and atomically publishes pointer',async()=>{
      const body=`FROM:tt-1-alpha/s1 TO:ALL TYPE:COMPACT SEEN:${packet.throughId}\n## ===== COMPACT #${n} through ${packet.throughId} =====\nHTTP 실DB 요약.\ncompacted-by:tt-1-bravo`;
      const request={body,compactPacketToken:packet.packetToken,sampledIds:ids,compactedBy:'tt-1-bravo'};
      assert.equal((await http(`${I}/comments`,{...request,metadata:{}},alpha)).status,422);
      const r=await http(`${I}/comments`,request,alpha);assert.equal(r.status,201);const id=r.body.commentId;
      const issue=await http(I,undefined,alpha);assert.equal(issue.body.issue.compactCommentId,id);assert.equal(issue.body.revision,2);assert.match(issue.body.body,new RegExp(`COMPACT:${id}`));
      const saved=await http(`${R}/comments/${id}`,undefined,alpha);assert.deepEqual(saved.body.metadata.sampledIds,ids);assert.equal(saved.body.metadata.compactedBy,'tt-1-bravo');assert.ok(!JSON.stringify(saved.body).includes(packet.packetToken));
      const history=await http(`${I}/comments`,undefined,alpha);assert.equal(history.body.compact.id,id);assert.equal(history.body.items.length,0);assert.equal((await http(`${I}/compact/packet`,undefined,alpha)).status,204);
    });
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));server.closeAllConnections();await h.cleanup();t.diagnostic('P6 HTTP dedicated schemas and queues cleaned');}
});
