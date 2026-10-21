import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {InboxItem,InboxResponse,DomainServerFrame} from '../../common/index.js';
import {scopeKey,InboxModel,SseFrameParser,StreamModel,decodeFrame} from './index.js';
import {IssusClient,ClientError,OperationTimeout} from '../client/index.js';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item=(sequence:string,attempt:number,state:'posted'|'delivered'|'acked'='posted'):InboxItem=>({viewKey:'comment:1000001',commentId:'1000001',sourceEventId:id(1),sourceStreamId:'canonical',sourceSequence:'9007199254740993',origin:'merged',priority:'ME',content:{body:'본문'},delivery:{id:id(2),ordinal:'17',state,attempt,aliasEventSequence:sequence}});
const page=(items:InboxItem[],nextCursor:string|null,refreshCursor:string|null):InboxResponse=>({bootstrap:{mode:'snapshot',snapshotId:id(3),meAliases:['issus-1-client'],complete:nextCursor===null,issues:[],inboxThroughOrdinal:'17',inboxThroughEventSequence:'22'},items,compact:[],nextCursor,refreshCursor,processedCursor:null,pendingLegacy:{window:[],global:[]},windowPendingAck:[],globalPendingAck:[],ackState:[],activeHolds:[],claims:[],handoffs:[],footers:[]});

test('scope normalizes repeated aliases/issues/boards; server/session/mode remain isolated',()=>{
  const scope={server:'https://example.com/',owner:'Owner',alias:'ISSUS-1-CLIENT',sid:'s1',repos:[{repo:'owner/repo',issues:[2,1,2],boards:[3,3]}],me:['B','a','B'],sinceCompact:true};
  assert.equal(scopeKey(scope),scopeKey({...scope,server:'https://example.com',owner:'owner',alias:'issus-1-client',repos:[{repo:'owner/repo',issues:[1,2],boards:[3]}],me:['a','b']}));
  assert.notEqual(scopeKey(scope),scopeKey({...scope,sid:'s2'}));
  assert.notEqual(scopeKey(scope),scopeKey({...scope,sinceCompact:false}));
});

test('refresh changes same delivery/ordinal/attempt using alias event sequence, without state regression',()=>{
  const model=new InboxModel();
  assert.equal(model.upsert(item('9007199254740993',0)),true);
  assert.equal(model.upsert(item('9007199254740994',0,'delivered')),true);
  assert.equal(model.upsert(item('9007199254740995',1,'acked')),true);
  assert.equal(model.upsert(item('9007199254740994',0,'delivered')),false);
  assert.equal(model.items.size,1);assert.equal(model.items.get('comment:1000001')?.delivery?.state,'acked');
  assert.equal(model.upsert({...item('0',0),delivery:undefined,origin:'history'}),false);
});

test('refresh cursor commits after all pages, never from a priority-sorted last row',()=>{
  const model=new InboxModel({refreshCursor:id(8),processedCursor:id(9)});
  model.acceptPage(page([item('20',0)],id(4),null));
  assert.equal(model.cursors.refreshCursor,id(8));assert.equal(model.cursors.processedCursor,id(9));
  model.acceptPage(page([item('22',1)],null,id(5)));
  assert.equal(model.cursors.refreshCursor,id(5));assert.equal(model.cursors.paginationCursor,null);assert.equal(model.cursors.processedCursor,null);
});

test('SSE handles UTF-8 split bytes, CRLF split, multiline JSON and heartbeat comments',()=>{
  const parser=new SseFrameParser(),frames:DomainServerFrame[]=[];
  const text=': heartbeat\r\n\r\nevent:frame\r\ndata:{"type":"error",\r\ndata:"code":"TEST","message":"한글 😀","retryable":false}\r\n\r\n';
  for(const byte of new TextEncoder().encode(text)) frames.push(...parser.push(Uint8Array.of(byte)));
  frames.push(...parser.push(new Uint8Array(),true));
  assert.deepEqual(frames,[{type:'error',code:'TEST',message:'한글 😀',retryable:false}]);
  assert.throws(()=>decodeFrame('{"type":"event"}'),/INVALID_SERVER_FRAME/);
});

test('stream dedupes event id and orders sequences per stream independently',()=>{
  const model=new StreamModel();
  const event=(streamId:string,sequence:string,n:number):DomainServerFrame=>({type:'event',cursor:id(n+100),event:{eventId:id(n),eventVersion:1,kind:'fact',streamId,sequence,action:'issus.comment.posted',transactionKey:'k',channel:streamId,correlationId:id(99),source:'worker',audience:'client',payload:{},createdAt:'2026-10-21T00:00:00Z'}});
  assert.equal(model.accept(event('a','9007199254740993',1)),true);assert.equal(model.accept(event('a','9007199254740993',1)),false);
  assert.equal(model.accept(event('b','1',2)),true);assert.throws(()=>model.accept(event('a','5',3)),/STREAM_SEQUENCE_REGRESSION/);
});

test('HTTP transport retries identical key and resolves queued operation domain rejection',async()=>{
  const keys:string[]=[],bodies:(string|undefined)[]=[];let posts=0;
  const client=new IssusClient({server:'https://example.com',token:'test-only',fetch:async(url,init)=>{
    if(init?.method==='POST') {keys.push((init.headers as Record<string,string>)['Idempotency-Key']);bodies.push(init.body as string);if(posts++===0) throw new Error('socket lost');return Response.json({operationId:id(1),status:'queued',statusUrl:'/v1/operations/'+id(1),posted:null},{status:202});}
    return Response.json({status:'failed',posted:false,httpStatus:422,error:{code:'VALIDATION_FAILED',reasons:[{code:'x',path:'body',message:'첫 사유'},{code:'y',path:'body',message:'다음 사유'}]}});
  }});
  await assert.rejects(()=>client.write('/v1/test',{method:'POST',key:id(2),body:{body:'a'}}),(e:unknown)=>e instanceof ClientError&&e.status===422&&e.reasons.join(',')==='첫 사유,다음 사유');
  assert.deepEqual(keys,[id(2),id(2)]);assert.equal(bodies[0],bodies[1]);
});

test('HTTP prevents cross-origin operation URLs and queued timeout retains id/key',async()=>{
  const key=id(2),client=new IssusClient({server:'https://example.com',fetch:async(_url,init)=>init?.method==='POST'?Response.json({operationId:id(1),statusUrl:'/v1/operations/'+id(1)},{status:202}):Response.json({status:'queued',posted:null})});
  await assert.rejects(()=>client.request('https://other.example/path'),(e:unknown)=>e instanceof ClientError&&e.code==='CROSS_ORIGIN_URL');
  await assert.rejects(()=>client.write('/v1/test',{method:'POST',key,body:{}},1),(e:unknown)=>e instanceof OperationTimeout&&e.key===key&&e.operationId===id(1));
});
