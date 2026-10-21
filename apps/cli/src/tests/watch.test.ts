import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {header,classify,pendingLegacy,type InboxResponse,type InboxItem} from 'issus_domain/common';
import {harness,id,principal,readFixture,apiError} from './helpers/index.js';

interface Fixture {repo:string;issues:Record<string,{body:string;state:string;number:number;title:string;comments:{id:number;body:string;created_at:string;updated_at:string}[]}>}
const fixture=JSON.parse(await readFixture('watch.json')) as Fixture;
const python=await readFixture('watch-python.txt'),native=await readFixture('watch-native.txt');
const comments=Object.values(fixture.issues).flatMap(x=>x.comments.map(c=>({...c,id:String(c.id),issueNumber:x.number})));
const me=['issus-1-client','issus-1-old'];
function response(next=false):InboxResponse {
  const window=comments.filter(c=>BigInt(c.id)>=1000002n),pending=pendingLegacy(window,me).map(c=>c.id),global=pendingLegacy(comments,me).map(c=>c.id);
  return {bootstrap:{mode:'snapshot',snapshotId:id(50),meAliases:me,complete:!next,issues:[1,2].map(n=>({repoId:id(10),issueNumber:n,compactId:n===1?'1000002':null,throughCommentId:n===1?'1000010':'1000011',eventHighWater:{}})),inboxThroughOrdinal:'1',inboxThroughEventSequence:'1'},
    compact:[{repoId:id(10),issueNumber:1,comment:{id:'1000002',body:comments.find(c=>c.id==='1000002')!.body,envelope:{}}},{repoId:id(10),issueNumber:2,comment:null}],
    items:window.filter(c=>c.id!=='1000002').map(c=>({viewKey:'comment:'+c.id,commentId:c.id,sourceEventId:id(Number(c.id)-1000000),sourceStreamId:'canonical',sourceSequence:c.id,origin:'history',priority:classify(header(c.body),c.body,me),content:{body:classify(header(c.body),c.body,me)==='OTHER'?header(c.body)._first:c.body}})),
    nextCursor:next?id(51):null,refreshCursor:next?null:id(52),processedCursor:null,pendingLegacy:{window:pending,global},windowPendingAck:pending,globalPendingAck:global,ackState:[],activeHolds:['1000001'],claims:[],handoffs:[],footers:python.split('\n').filter(l=>l.startsWith('--- hikaMaeng/'))};
}
async function setup(options:{pages?:boolean;failSecond?:boolean;delivery?:boolean}={}) {
  const requests:string[]=[],mutations:string[]=[];
  const h=await harness(async(url,init)=>{
    const u=new URL(url);requests.push(u.pathname+u.search);
    if(init?.method&&init.method!=='GET') {mutations.push(u.pathname);if(u.pathname==='/v1/inbox/process') return Response.json({processedCursor:id(90)});return apiError(503,'UNEXPECTED_MUTATION');}
    if(u.pathname==='/v1/auth/me') return Response.json(principal);
    const issue=/\/issues\/(\d+)$/u.exec(u.pathname);
    if(issue) {const f=fixture.issues[issue[1]];return Response.json({issue:{number:f.number,repoId:id(10),isOpen:true,state:'running',revision:1,title:f.title},body:f.body,revision:1});}
    const comment=/\/comments\/(\d+)$/u.exec(u.pathname);
    if(comment) {const c=comments.find(c=>c.id===comment[1])!;return Response.json({...c,repoId:id(10),createdAt:c.created_at});}
    if(u.pathname==='/v1/inbox') {
      assert.deepEqual(u.searchParams.getAll('me'),me);assert.deepEqual(u.searchParams.getAll('board'),['2']);assert.equal(u.searchParams.get('sinceCompact'),'true');
      const second=!!u.searchParams.get('cursor');if(second&&options.failSecond) return apiError(503,'SERVICE_UNAVAILABLE');
      const data=response(options.pages&&!second);
      if(options.pages) data.items=second?data.items.slice(3):data.items.slice(0,3);
      if(options.delivery) data.items[0].delivery={id:id(70),ordinal:'1',state:'delivered',attempt:0,aliasEventSequence:'2'};
      return Response.json(data);
    }
    return apiError(404,'NOT_FOUND');
  });
  const args=['watch','--repo',fixture.repo,'--me','ISSUS-1-CLIENT','--mine','작성: issus-1-old / s2 | legacy','--board','2','--board','hikaMaeng/issus#2','--since-compact','1'];
  return {...h,requests,mutations,args};
}

test('C-01 watch native priority/global golden, canonical classification rows/footer bytes unchanged',async()=>{
  const h=await setup();assert.equal(await h.run([...h.args,'--peek']),0);
  assert.equal(h.stdout.join(''),native);assert.deepEqual(h.mutations,[]);
  assert.equal(h.requests.filter(s=>s.endsWith('/issues/2')).length,1);
  await assert.rejects(()=>stat(join(h.directory,'issue_watch.state.json')),{code:'ENOENT'});
  const bodyRows=(s:string)=>s.slice(s.indexOf('=== ['),s.indexOf('--- hikaMaeng/'));
  assert.equal(bodyRows(h.stdout.join('')),bodyRows(python));
});

test('watch --full recovers immutable OTHER body from single comment API, limit is codepoints',async()=>{
  const h=await setup();assert.equal(await h.run([...h.args,'--peek','--full','--limit','55']),0);
  assert.match(h.stdout.join(''),/truncated; --show ID/u);assert.match(h.stdout.join(''),/=== \[OTHER\]/u);
  assert.equal(await h.run(['watch','--repo',fixture.repo,'--show','1000006']),0);assert.equal(h.stdout.join(''),comments.find(c=>c.id==='1000006')!.body+'\n');
});

test('all pages consumed before refresh commit; nonTTY outstanding delivery exits 3 without processing',async()=>{
  const h=await setup({pages:true,delivery:true});assert.equal(await h.run(h.args),3);
  const saved=JSON.parse(await readFile(join(h.directory,'issue_watch.state.json'),'utf8'));
  assert.equal(Object.values(saved.scopes).length,1);
  const scope=Object.values(saved.scopes)[0] as {cursors:{refreshCursor:string;paginationCursor:null;processedCursor:null}};
  assert.equal(scope.cursors.refreshCursor,id(52));assert.equal(scope.cursors.paginationCursor,null);assert.equal(scope.cursors.processedCursor,null);assert.deepEqual(h.mutations,[]);
});

test('failure on a later page preserves existing state bytes',async()=>{
  const h=await setup({pages:true,failSecond:true}),file=join(h.directory,'issue_watch.state.json'),old='{"old-python-timestamp":"2026-10-20"}\n';await writeFile(file,old);
  assert.equal(await h.run(h.args),2);assert.equal(await readFile(file,'utf8'),old);
});

test('processed evidence is explicit; peek never invokes process and leaves state unchanged',async()=>{
  const h=await setup(),file=join(h.directory,'evidence.json');await writeFile(file,JSON.stringify({deliveryIds:[id(70)],disposition:'replied',evidenceCommentId:'1000008'}));
  assert.equal(await h.run([...h.args,'--processed-file',file,'--peek']),2);assert.deepEqual(h.mutations,[]);assert.equal(h.requests.length,0);
  assert.equal(await h.run([...h.args,'--processed-file',file]),0);assert.deepEqual(h.mutations,['/v1/inbox/process']);
  const saved=JSON.parse(await readFile(join(h.directory,'issue_watch.state.json'),'utf8'));
  assert.equal((Object.values(saved.scopes)[0] as {cursors:{processedCursor:string}}).cursors.processedCursor,id(90));
});
