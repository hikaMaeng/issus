import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_ACTIONS,FACT_ACTIONS,parseCommandPayload,parseFactPayload,parseDomainClientFrame,parseDomainServerFrame,parseReactionInput,type CommandPayloadMap,type FactPayloadMap} from './index.js';
import {parseCommentRequest} from '../../validation/comment/request.js';
import {aliasChannel,canonicalStream,issueChannel,repoChannel,sessionChannel,supervisorChannel,internalChannel} from '../envelope/index.js';
const ownerId='10000000-0000-4000-8000-000000000001',aliasId='10000000-0000-4000-8000-000000000002',sessionId='10000000-0000-4000-8000-000000000003',repoId='10000000-0000-4000-8000-000000000004',eventId='10000000-0000-4000-8000-000000000005';
const actor={ownerId,aliasId,alias:'aa-reader',sid:'s1',sessionId};
const own={ownerId},repo={...own,repoId},iss={...repo,issueNumber:1,revision:1};
const issue={repoId,issueNumber:1};
const source={sourceEventId:eventId,sourceStreamId:canonicalStream(issueChannel(repoId,1)),sourceSequence:'9007199254740993'};
const body='FROM:aa-reader/s1 TO:ALL TYPE:NOTE\n내용';
const envelope={FROM:'aa-reader/s1',TO:'ALL',TYPE:'NOTE' as const};
const metadata={compactPacketId:eventId,packetHash:'a'.repeat(64),throughId:'1000000',snapshotRevision:1,sampledIds:['1000000'],compactedBy:'aa-reader'};
const commands={
 'issus.repo.create':{owner:'sample',slug:'repo',projectCode:'aa',autoBoard:true},
 'issus.issue.open':{repoId,title:'title',body},
 'issus.issue.body.edit':{...issue,body,expectedRevision:1},
 'issus.issue.close':{...issue,reason:'done',finalReportId:'1000000',expectedRevision:1},
 'issus.issue.reopen':{...issue,reason:'resume',state:'running',expectedRevision:1},
 'issus.comment.post':{...issue,body},
 'issus.alias.register':{owner:'sample',name:'aa-reader',role:'role',model:'model',scope:'scope',repos:[repoId],announcementBody:body},
 'issus.alias.rename':{aliasId,newName:'aa-keeper',announcementBody:body},
 'issus.board.ensure':{repoId,boardOwner:'aa-board'},
 'issus.handoff.accept':{handoffId:'1000000',ackCommentId:'1000001'},
 'issus.handoff.complete':{handoffId:'1000000',expectedRevision:1},
 'issus.delivery.receive':{deliveryIds:[eventId],attempts:[0]},
 'issus.delivery.apply':{deliveryId:eventId,evidenceCommentId:'1000001',outcome:'applied'},
 'issus.inbox.process':{deliveryIds:[eventId],disposition:'replied',evidenceCommentId:'1000001'},
 'issus.clock.tick':{slot:'2026-10-21T05:00:00Z'}
} satisfies {[K in keyof CommandPayloadMap]:CommandPayloadMap[K]};
const closed={...iss,reason:'done',body,actor};
const aliased={...repo,aliasId,name:'aa-reader',repos:[repoId],role:'reader',scope:'repo',actor};
const subscription={...own,subscriptionId:eventId,aliasId,sid:'s1',sessionId,channels:[aliasChannel(ownerId,aliasId)],transport:'websocket' as const};
const session={...own,sessionId,aliasId,sid:'s1'};
const facts={
 'issus.repo.created':{...repo,slug:'repo',projectCode:'aa',autoBoard:true,actor,version:1},
 'issus.issue.opened':{...iss,number:1,title:'title',body,state:'running',ownerAliasId:aliasId,isBoard:false,actor},
 'issus.issue.body.edited':{...iss,body,previousRevision:1,reason:'edit',actor},
 'issus.comment.posted':{...iss,commentId:'1000000',body,envelope,metadata:{},charCount:Array.from(body).length,author:actor,validity:'v2'},
 'issus.comment.rejected':{...own,requestId:eventId,actorAliasId:aliasId,errorCodes:['INVALID_PAYLOAD'],bodySha256:'a'.repeat(64),charCount:1},
 'issus.delivery.queued':{...own,...source,deliveryId:eventId,aliasId,ordinal:'9007199254740993',classification:'ME',ackRequired:true,commentId:'1000000',ackBy:'2026-10-21T18:00+09:00',attempt:0,content:{body,envelope}},
 'issus.delivery.delivered':{...own,deliveryId:eventId,sessionId,transport:'ack-evidence',attempt:0,receivedAt:'2026-10-21T05:00:00Z'},
 'issus.delivery.acked':{...own,deliveryId:eventId,directiveId:'1000000',ackCommentId:'1000001',ackAliasId:aliasId},
 'issus.delivery.applied':{...own,deliveryId:eventId,directiveId:'1000000',evidenceCommentId:'1000002',outcome:'applied',actor},
 'issus.delivery.overdue':{...own,deliveryId:eventId,directiveId:'1000000',ackBy:'2026-10-21T18:00+09:00',attempt:0,overdueAt:'2026-10-21T09:01:00Z'},
 'issus.delivery.redelivered':{...own,...source,deliveryId:eventId,commentId:'1000000',attempt:1,content:{body},nextAttemptAt:'2026-10-21T09:02:00Z'},
 'issus.delivery.escalated':{...own,deliveryId:eventId,directiveId:'1000000',recipient:aliasId,ownerAliasId:aliasId,attempt:1,reason:'overdue'},
 'issus.delivery.superseded':{...own,deliveryId:eventId,byCommentId:'1000002',reason:'correction'},
 'issus.compact.due':{...own,issue,ownerAliasId:aliasId,count:25,chars:40000,reasons:['comments'],generation:1},
 'issus.compact.posted':{...iss,compactId:'1000001',throughId:'1000000',packetHash:'a'.repeat(64),count:1,chars:100,bodyRevision:2,metadata},
 'issus.issue.closed':closed,
 'issus.issue.reopened':closed,
 'issus.handoff.accepted':{...iss,handoffId:'1000000',ackCommentId:'1000001',targetIssue:issue,newOwnerAliasId:aliasId},
 'issus.issue.handed-off':{...iss,handoffId:'1000000',ackCommentId:'1000001',sourceIssue:issue,targetIssue:issue,oldOwner:aliasId,newOwner:aliasId,body},
 'issus.alias.registered':aliased,
 'issus.alias.renamed':{...aliased,oldName:'aa-old'},
 'issus.board.created':{...repo,issueNumber:1,ownerAliasId:aliasId,title:'board',body},
 'issus.subscription.opened':subscription,
 'issus.subscription.closed':subscription,
 'issus.session.opened':session,
 'issus.session.revoked':session,
 'issus.inbox.processed':{...own,aliasId,deliveryId:eventId,disposition:'replied',evidenceCommentId:'1000000'},
 'issus.application.rejected':{...own,deliveryId:eventId,evidenceCommentId:'1000000',reason:'not applied'}
} satisfies {[K in keyof FactPayloadMap]:FactPayloadMap[K]};
for (const action of COMMAND_ACTIONS) test(`command payload ${action}: lossless/unknown/server-only rejected`,()=>{
 const payload=commands[action];
 const result=parseCommandPayload(action,JSON.parse(JSON.stringify(payload)));
 assert.deepEqual(result,{ok:true,value:payload});
 for(const extra of [{unknown:1},{actor},{sourceEventId:eventId},{metadata:{}}])assert.equal(parseCommandPayload(action,{...payload,...extra}).ok,false);
 assert.equal(parseCommandPayload(action,[]).ok,false);
});
for (const action of FACT_ACTIONS) test(`fact payload ${action}: lossless/no raw secrets/unknown rejected`,()=>{
 const payload=facts[action];
 assert.deepEqual(parseFactPayload(action,JSON.parse(JSON.stringify(payload))),{ok:true,value:payload});
 assert.equal(parseFactPayload(action,{...payload,unknown:1}).ok,false);
 assert.equal(parseFactPayload(action,{...payload,token:'test-only'}).ok,false);
});
test('comment request metadata survives HTTP→command and never accepts wrapper or wrong TYPE',()=>{
 const compactBody='FROM:aa-reader/s1 TO:ALL TYPE:COMPACT SEEN:1000000\n## ===== COMPACT #1 through 1000000 =====\ncompacted-by:aa-reader';
 const input={body:compactBody,compactPacketToken:'opaque',sampledIds:['1000000'],compactedBy:'aa-reader'};
 assert.deepEqual(parseCommentRequest(input),{ok:true,value:input});
 assert.deepEqual(parseCommandPayload('issus.comment.post',{...issue,...input}),{ok:true,value:{...issue,...input}});
 for(const bad of [{...input,metadata:{}},{...input,sampledIds:['1000000','1000000']},{...input,compactedBy:'aa-other'},{body:compactBody},{...input,body},{body,compactDeferredReason:'reason'},{body:'FROM:aa-reader TO:aa-other TYPE:DECISION\n내용',compactDeferredReason:' '.repeat(2)}])assert.equal(parseCommentRequest(bad).ok,false);
 const deferred={body:'FROM:aa-reader TO:aa-other TYPE:DECISION\n내용',compactDeferredReason:'긴급'};
 assert.deepEqual(parseCommentRequest(deferred),{ok:true,value:deferred});
 assert.equal(parseFactPayload('issus.compact.posted',{...facts['issus.compact.posted'],metadata:{}}).ok,false);
 assert.equal(parseFactPayload('issus.compact.posted',{...facts['issus.compact.posted'],metadata:{...metadata,compactPacketToken:'opaque'}}).ok,false);
});
test('domain stream frames keep immutable cursor/provenance and forbid WS mutations',()=>{
 const cursor=eventId;
 const subscribe={type:'subscribe',subscriptionId:sessionId,channels:[aliasChannel(ownerId,aliasId)],cursor};
 assert.deepEqual(parseDomainClientFrame(subscribe),subscribe);
 assert.equal(parseDomainClientFrame({...subscribe,channels:Array(33).fill('a')}),undefined);
 assert.equal(parseDomainClientFrame({...subscribe,channels:['a'.repeat(129)]}),undefined);
 assert.equal(parseDomainClientFrame({...subscribe,audience:'client'}),undefined);
 assert.equal(parseDomainClientFrame({type:'event',action:'issus.comment.post',payload:{body}}),undefined);
 const receipt={type:'receipt',subscriptionId:sessionId,deliveryIds:[eventId],attempts:[0],cursor};
 assert.deepEqual(parseDomainClientFrame(receipt),receipt);
 assert.equal(parseDomainClientFrame({...receipt,attempts:[]}),undefined);
 assert.equal(parseDomainClientFrame({...receipt,deliveryIds:Array(101).fill(eventId),attempts:Array(101).fill(0)}),undefined);
 const event={eventId,eventVersion:1,kind:'fact',streamId:canonicalStream(aliasChannel(ownerId,aliasId)),sequence:'9007199254740994',action:'issus.delivery.queued',transactionKey:eventId,channel:aliasChannel(ownerId,aliasId),correlationId:eventId,source:'worker',audience:'client',payload:facts['issus.delivery.queued'],createdAt:'2026-10-21T05:00:00Z',...source};
 const frame={type:'event',event,cursor};
 assert.deepEqual(parseDomainServerFrame(frame),frame);
 assert.deepEqual(parseReactionInput(event),event);
 const {sourceSequence:_,...missing}=event;
 assert.equal(parseReactionInput(missing),undefined);
 assert.equal(parseReactionInput({...source,action:event.action,payload:event.payload}),undefined);
 assert.equal(parseDomainServerFrame({...frame,event:{...event,payload:[]}}),undefined);
});
test('channel factories never include a session in a canonical issue/repo stream',()=>{
 assert.equal(repoChannel(repoId),`repo:${repoId}:all`);
 assert.equal(canonicalStream(issueChannel(repoId,1)),`channel:issue:${repoId}:1`);
 assert.equal(sessionChannel(sessionId),`session:${sessionId}`);
 assert.equal(supervisorChannel(ownerId),`supervisor:${ownerId}`);
 assert.equal(internalChannel('intake'),'internal:intake');
});
