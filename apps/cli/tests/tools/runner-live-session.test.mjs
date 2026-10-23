import test from 'node:test';
import assert from 'node:assert/strict';
import {IssusClient} from 'issus_domain/front';
import {createLiveRunner} from './runner-live-session.mjs';
import {emitted,root} from './runner-fixtures.mjs';

const alias='rr-4-runner',sessionId='00000000-0000-4000-8000-000000000001';
const principal={kind:'session',id:sessionId,sessionId,ownerId:'00000000-0000-4000-8000-000000000002',aliasId:'00000000-0000-4000-8000-000000000003',alias,sid:'s1',capabilities:[]};
const session={sessionId,token:'runner-regression-canary',expiresAt:'2099-01-01T00:00:00Z',alias,sid:'s1'};
const options={me:alias,exec:'codex',model:'gpt-6.1-sol',effort:'high',cwd:root,sandbox:'workspace-write',repo:'owner/test',issue:4,boards:[],allowedSenders:['rr-1-orch'],allowedTypes:['ASK'],once:true,evidenceRoot:root+'/.cache/runner-s2/auth-regression'};
function fixture(response,sessions=[session]) {
 const calls=[];
 const client=new IssusClient({server:'http://127.0.0.1:18140',token:session.token,fetch:async(input,init)=>{
  calls.push({path:new URL(input).pathname,method:init.method});
  assert.equal(init.headers.Authorization,'Bearer '+session.token);
  assert.equal(new URL(input).pathname,'/v1/auth/me');
  return Response.json(response);
 }});
 return {input:{client,sessions,alias,options},calls};
}

test('original live expression reproduces undefined alias with the server flat principal',async()=>{
 const {HostRunner}=await import(emitted('index.js'));
 const {input}=fixture(principal),oldPrincipal=(await input.client.request('/v1/auth/me')).data.principal;
 assert.equal(oldPrincipal,undefined);
 assert.throws(()=>new HostRunner({client:input.client,principal:oldPrincipal,options,token:session.token}),/reading 'alias'/u);
});
for(const [name,response] of [['flat',principal],['wrapped',{principal}]]) {
 test(name+' auth response constructs the real HostRunner with the issued identity',async()=>{
  const {input,calls}=fixture(response),runner=await createLiveRunner(input);
  const {HostRunner}=await import(emitted('index.js'));
  assert.ok(runner instanceof HostRunner);
  assert.deepEqual(runner.d.principal,principal);
  assert.equal(runner.d.token,session.token);
  assert.deepEqual(calls,[{path:'/v1/auth/me',method:'GET'}]);
 });
}
test('missing session fails before any authenticated request',async()=>{
 const {input,calls}=fixture(principal,[]);
 await assert.rejects(()=>createLiveRunner(input),/^Error: LIVE_SESSION_NOT_FOUND$/u);
 assert.equal(calls.length,0);
});
test('incomplete issued session fails without printing the token',async()=>{
 for(const field of ['sessionId','token','sid']) {
  const {input,calls}=fixture(principal,[{...session,[field]:undefined}]);
  await assert.rejects(()=>createLiveRunner(input),/^Error: LIVE_SESSION_RESPONSE_INVALID$/u);
  assert.equal(calls.length,0);
 }
});
test('bootstrap, empty, and malformed principals fail before the runner can start',async()=>{
 for(const response of [{kind:'bootstrap'},null,{}, {principal:null},{...principal,aliasId:undefined}]) {
  const {input}=fixture(response);
  await assert.rejects(()=>createLiveRunner(input),/^Error: LIVE_AUTH_PRINCIPAL_INVALID$/u);
 }
});
test('wrong alias, sid, sessionId or id cannot bind a different writer',async()=>{
 for(const field of ['alias','sid','sessionId','id']) {
  const {input}=fixture({...principal,[field]:'other'});
  await assert.rejects(()=>createLiveRunner(input),/^Error: LIVE_AUTH_SESSION_MISMATCH$/u);
 }
});
