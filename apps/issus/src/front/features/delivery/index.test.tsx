import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {IssusClient, ClientError} from 'issus_domain/front';
import type {InboxItem} from 'issus_domain/common';
import {Delivery, DeliveryWrite, deliveryIssue, issueNumbers, orderDeliveries, mergeInboxSnapshot} from './index.js';

const client=new IssusClient({server:'http://test.invalid'}), principal={alias:'tt-1-reader',sid:'s2'};
const item=(id:string,type='ASK',priority:InboxItem['priority']='ME',sequence='9007199254740993',state:NonNullable<InboxItem['delivery']>['state']='posted'):InboxItem=>({viewKey:`comment:${id}`,commentId:id,sourceEventId:`event-${id}`,sourceStreamId:'channel:issue:00000000-0000-4000-8000-000000000001:3',sourceSequence:id,origin:'merged',priority,content:{body:`FROM:tt-1-author/s1 TO:tt-1-reader TYPE:${type} ACK-BY:2026-10-21T20:00+09:00\nASK @tt-1-reader: 내용 <script>unsafe()</script>`},delivery:{id:`delivery-${id}`,ordinal:id,state,attempt:0,aliasEventSequence:sequence}});

test('U3 inbox order prioritizes active HOLD and legacy pending before ME; deadlines then exact bigint ordinal',()=>{
  const values=[item('9007199254740995'),item('9007199254740994'),item('1000004','ASK','OTHER'),item('1000005','HOLD','ALL')];
  assert.deepEqual(orderDeliveries(values,{activeHolds:['1000005'],windowPendingAck:['1000004'],globalPendingAck:[]}).map(value=>value.commentId),['1000005','1000004','9007199254740994','9007199254740995']);
  assert.deepEqual(values.map(value=>value.commentId),['9007199254740995','9007199254740994','1000004','1000005']);
});
test('U3 inbox snapshot merges canonical/delivery once and refuses older E or lower same-E attempt',()=>{
  const newer=item('1000001','ASK','ME','9007199254740994','acked'), old=item('1000001');
  const canonical={...old,origin:'history' as const,delivery:undefined};
  assert.equal(mergeInboxSnapshot([newer],[old,canonical]).length,1);
  assert.equal(mergeInboxSnapshot([newer],[old])[0]!.delivery!.state,'acked');
  const retry={...newer,delivery:{...newer.delivery!,attempt:2}};
  assert.equal(mergeInboxSnapshot([retry],[newer])[0]!.delivery!.attempt,2);
  assert.equal(mergeInboxSnapshot([old],[newer])[0]!.delivery!.state,'acked');
});
test('U3 scope numbers are finite positive integers and canonical coordinates resolve without invented ids',()=>{
  assert.deepEqual(issueNumbers('1,1,2,0,-1,x,Infinity,1.5'),[1,2]);assert.equal(deliveryIssue(item('1000001')),3);assert.equal(deliveryIssue({...item('1000001'),sourceStreamId:'canonical'}),undefined);
});
test('U3 display never compares unrelated stream sequences for facts without a canonical id/ordinal',()=>{
  const first={...item('1000001'),viewKey:'fact:a',commentId:undefined,delivery:undefined,sourceStreamId:'one',sourceSequence:'9007199254740995'};
  const second={...first,viewKey:'fact:b',sourceStreamId:'two',sourceSequence:'1'};
  assert.deepEqual(orderDeliveries([second,first],{activeHolds:[],windowPendingAck:[],globalPendingAck:[]}).map(value=>value.viewKey),['fact:a','fact:b']);
});
test('U3 delivery SSR preserves semantic IDs, raw states, escaped content and information ACK',()=>{
  const html=renderToStaticMarkup(<Delivery item={item('1000001','NOTE')} client={client} principal={principal} repo="o/r" onChanged={()=>{}} now={Date.parse('2026-10-21T20:00:03+09:00')}/>);
  assert.match(html,/data-testid="delivery" data-delivery-id="delivery-1000001"/);assert.match(html,/data-testid="delivery-state" data-state="posted"/);
  assert.match(html,/ACK-BY 경과/);assert.match(html,/기한 경과 예상 3초/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));
  assert.match(html,/aria-label="반영 근거 기록"/);assert.match(html,/aria-label="수신 확인 미리보기"/);assert.match(html,/>수신 확인 작성<\/button>/);
});
test('U3 OTHER defaults folded; shared HOLD/DECISION stay fully visible, canonical never receives a fake delivery id',()=>{
  const render=(value:InboxItem)=>renderToStaticMarkup(<Delivery item={value} client={client} principal={principal} repo="o/r" onChanged={()=>{}}/>);
  assert.match(render(item('1000001','NOTE','OTHER')),/<details><summary role="button">OTHER 댓글 1000001 전문 보기/);
  assert.ok(!render(item('1000001','HOLD','OTHER')).includes('<details>'));assert.ok(!render(item('1000001','DECISION','OTHER')).includes('<details>'));
  const canonical={...item('1000001'),delivery:undefined};assert.ok(!render(canonical).includes('data-delivery-id='));
});

test('U3 uncertain writes freeze the original request across edits/503 and reuse one key; definite 422 releases it',async()=>{
  const calls:{path:string;body:unknown;key:string|null}[]=[];let status=503;
  const api=new IssusClient({server:'http://test.invalid',fetch:async(url,init)=>{calls.push({path:new URL(url).pathname,body:JSON.parse(String(init?.body)),key:new Headers(init?.headers).get('Idempotency-Key')});return Response.json(status===201?{commentId:'1000001'}:{error:{code:'SERVER_TEST'}},{status});}});
  const writer=new DeliveryWrite(),body={body:'original'};
  await assert.rejects(()=>writer.run(api,'/v1/comments',body,()=>{}),error=>error instanceof ClientError&&error.status===503);body.body='edited';assert.ok(writer.pending);
  status=201;assert.deepEqual(await writer.run(api,'/different',{body:'different'},()=>{}),{commentId:'1000001'});assert.equal(calls[0]!.key,calls[1]!.key);assert.equal(calls[1]!.path,'/v1/comments');assert.deepEqual(calls[1]!.body,{body:'original'});assert.equal(writer.pending,undefined);
  status=422;await assert.rejects(()=>writer.run(api,'/v1/comments',{body:'invalid'},()=>{}));assert.equal(writer.pending,undefined);status=201;await writer.run(api,'/v1/comments',{body:'fixed'},()=>{});assert.notEqual(calls[2]!.key,calls[3]!.key);
});
