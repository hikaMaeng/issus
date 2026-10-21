import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {get,type Server} from 'node:http';
import express from 'express';
import {InboxService,DeliveryCommandService} from 'issus_domain/server';
import {startCoreHarness} from '../auth/testing.js';
import {createDeliveryHttpRouter} from '../inbox/index.js';
import {SubscriptionService} from '../subscriptions/index.js';

/** Browser-style conditional requests without fetch's implicit Cache-Control:no-cache. */
async function read(base:string,path:string,token:string,headers:Record<string,string>={}) {
  return new Promise<{status:number;body:any;text:string;etag:string;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{
    get(base+path,{headers:{...(token?{authorization:`Bearer ${token}`} :{}),...headers}},res=>{
      const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      res.once('end',()=>{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode!,text,body:text?JSON.parse(text):null,etag:String(res.headers.etag??''),headers:res.headers});});
    }).once('error',reject);
  });
}

test('conditional GET real DB: representation ETag covers diagnostics, listing and inbox',{skip:!process.env.ISSUS_TEST_DATABASE_URL},async t=>{
  const h=await startCoreHarness(),R='/v1/repos/tester/etag';
  let inboxServer:Server|undefined;
  t.diagnostic(`isolated schema=${h.schema} brokerSchema=${h.brokerSchema} queuePrefix=${h.queueName('')}`);
  try {
    const repo=await h.http('/v1/repos',{owner:'tester',slug:'etag',projectCode:'eg',autoBoard:true});assert.equal(repo.status,201);
    const tokens:Record<string,string>={};
    for(const name of ['eg-1-author','eg-1-reader']) {
      const alias=await h.http('/v1/owners/tester/aliases',{name,role:'test',model:'fixture',scope:'ETag 회귀',repos:[repo.body.repoId],announcementBody:`FROM:${name}/by-eg-system TO:ALL TYPE:ALIAS\n${name} | test | fixture | ETag 회귀 | s1`});
      assert.equal(alias.status,201,JSON.stringify(alias.body));
      const session=await h.http('/v1/sessions',{alias:name,sid:'s1'});assert.equal(session.status,201);tokens[name]=session.body.token;
    }
    const author=tokens['eg-1-author']!,reader=tokens['eg-1-reader']!;
    const opened=await h.http(R+'/issues',{title:'ETag 진단',body:'STATE:running OWNER:eg-1-author UPDATED:2026-10-21T04:00:00+00:00\nGOAL: conditional GET'},author);
    assert.equal(opened.status,201);const I=R+'/issues/'+opened.body.number;
    const post=async(from:string,to:string,type:string,extra='',metadata:Record<string,unknown>={})=>{
      const result=await h.http(I+'/comments',{body:`FROM:${from}/s1 TO:${to} TYPE:${type}${extra?' '+extra:''}\nETag regression ${type}`, ...metadata},tokens[from]);
      assert.equal(result.status,201,JSON.stringify(result.body));return result.body.commentId as string;
    };
    const cached=(etag:string,token=reader,path=I)=>read(h.base,path,token,{'if-none-match':etag});
    function exact(result:Awaited<ReturnType<typeof read>>) {
      assert.equal(result.status,200);
      assert.equal(result.etag,`"sha256-${createHash('sha256').update(result.text).digest('hex')}"`);
      assert.equal(result.headers['cache-control'],'private, no-cache');
      assert.equal(result.headers['last-modified'],undefined);
      assert.match(String(result.headers.vary),/Authorization/i);assert.match(String(result.headers.vary),/Cookie/i);
    }
    async function unchanged(result:Awaited<ReturnType<typeof read>>,path=I) {
      const same=await cached(result.etag,reader,path);assert.equal(same.status,304);assert.equal(same.text,'');assert.equal(same.etag,result.etag);
      assert.equal(same.headers['cache-control'],'private, no-cache');
    }
    const seed=await post('eg-1-author','ALL','NOTE');
    let current=await read(h.base,I,reader),hold:string,claim:string;
    await t.test('unchanged representation 304, weak/list/star validators and auth before freshness',async()=>{
      exact(current);assert.equal(current.body.revision,1);await unchanged(current);
      for(const tag of ['W/'+current.etag,'"other", W/'+current.etag,'*']) assert.equal((await cached(tag)).status,304);
      assert.equal((await cached('"other"')).status,200);
      assert.equal((await read(h.base,I,'',{'if-none-match':'*'})).status,401);
      assert.equal((await cached(current.etag,'invalid')).status,401);
      assert.equal((await read(h.base,I,reader,{'if-modified-since':'Wed, 21 Oct 2037 00:00:00 GMT'})).status,200);
    });
    const inbox=new InboxService(h.uow),deliveries=new DeliveryCommandService({uow:h.uow,resolvePrincipal:a=>h.auth.resolveActor(a)});
    const app=express();app.use(createDeliveryHttpRouter({intake:h.intake,auth:h.auth,origin:'http://127.0.0.1:18140'},{inbox,deliveries,subscriptions:new SubscriptionService(h.uow,inbox)}));
    inboxServer=await new Promise<Server>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
    const address=inboxServer.address();assert.ok(address&&typeof address!=='string');const inboxBase=`http://127.0.0.1:${address.port}`;
    const inboxPath='/v1/inbox?repo=tester/etag&issues='+opened.body.number;
    const initialInbox=await read(inboxBase,inboxPath,reader);exact(initialInbox);assert.deepEqual(initialInbox.body.activeHolds,[]);
    await t.test('HOLD changes ETag without body revision; old conditional request returns current 200',async()=>{
      hold=await post('eg-1-author','eg-1-reader','HOLD',`ACK-BY:2026-10-21T04:05:00+00:00 SEEN:${seed}`);
      const changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);
      assert.equal(changed.body.revision,current.body.revision);assert.equal(changed.body.body,current.body.body);
      assert.deepEqual(changed.body.activeHolds,[hold]);assert.deepEqual(changed.body.globalPendingAck,[hold]);assert.equal(changed.body.ackState[0].state,'waiting');
      t.diagnostic(`HOLD before=${current.etag} after=${changed.etag} revision=${changed.body.revision} conditional=${changed.status}`);
      current=changed;await unchanged(current);
    });
    await t.test('inbox uses full snapshot/cursor representation and sees HOLD on conditional read',async()=>{
      const changed=await read(inboxBase,inboxPath,reader,{'if-none-match':initialInbox.etag});exact(changed);
      assert.notEqual(changed.etag,initialInbox.etag);assert.deepEqual(changed.body.activeHolds,[hold!]);assert.deepEqual(changed.body.globalPendingAck,[hold!]);
      const again=await read(inboxBase,inboxPath,reader,{'if-none-match':changed.etag});exact(again);
      assert.notEqual(again.body.bootstrap.snapshotId,changed.body.bootstrap.snapshotId);assert.notEqual(again.body.refreshCursor,changed.body.refreshCursor);
      assert.notEqual(again.etag,changed.etag); // Fresh opaque snapshot/cursor is a changed response, even without domain writes.
      assert.equal((await read(inboxBase,inboxPath,'',{'if-none-match':'*'})).status,401);
    });
    await t.test('recipient ACK and HOLD release invalidate derived state at the same revision',async()=>{
      const ack=await post('eg-1-reader','eg-1-author','ACK',`RE:${hold!}`);
      let changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);
      assert.deepEqual(changed.body.globalPendingAck,[]);assert.equal(changed.body.ackState[0].state,'acked');assert.equal(changed.body.ackState[0].ackCommentId,ack);
      assert.deepEqual(changed.body.activeHolds,[hold!]);assert.equal(changed.body.revision,1);current=changed;await unchanged(current);
      // An asynchronous projection update must invalidate even with identical comment stats/body/revision.
      await h.pool.query(`UPDATE "${h.schema}"."directive" SET applied_by_comment_id=$1 WHERE comment_id=$2`,[ack,hold!]);
      changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);assert.deepEqual(changed.body.stats,current.body.stats);assert.equal(changed.body.revision,current.body.revision);assert.equal(changed.body.ackState[0].state,'applied');current=changed;await unchanged(current);
      await post('eg-1-author','eg-1-reader','DECISION',`ACK-BY:2026-10-21T04:05:00+00:00 SUPERSEDES:${hold!}`,{compactDeferredReason:'ETag 회귀 시험 해제'});
      changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);assert.deepEqual(changed.body.activeHolds,[]);assert.equal(changed.body.revision,1);current=changed;await unchanged(current);
    });
    await t.test('CLAIM and RELEASE invalidate claims while numeric body revision stays unchanged',async()=>{
      claim=await post('eg-1-author','ALL','CLAIM',`DUE:2026-10-21T05:00:00+00:00 SEEN:${hold!}`);
      let changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);assert.deepEqual(changed.body.claims,[claim]);assert.equal(changed.body.revision,1);current=changed;await unchanged(current);
      await post('eg-1-author','ALL','RELEASE',`RE:${claim}`);
      changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);assert.deepEqual(changed.body.claims,[]);assert.equal(changed.body.revision,1);current=changed;await unchanged(current);
    });
    await t.test('compact count/chars threshold invalidates ETag without revision change',async()=>{
      assert.equal(current.body.compact.due,false);
      for(let index=current.body.stats.count;index<25;index++) {
        const result=await h.http(I+'/comments',{body:`FROM:eg-1-author/s1 TO:ALL TYPE:NOTE\ncompact count fixture ${index}`},author);assert.equal(result.status,201,JSON.stringify(result.body));
      }
      const changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);assert.equal(changed.body.stats.count,25);assert.equal(changed.body.compact.due,true);assert.equal(changed.body.revision,1);current=changed;await unchanged(current);
    });
    await t.test('listing unchanged 304 and participant-filter membership change 200',async()=>{
      const path=R+'/issues?alias=eg-1-reader';let listing=await read(h.base,path,reader);exact(listing);await unchanged(listing,path);
      const another=await h.http(R+'/issues',{title:'participation',body:'STATE:running OWNER:eg-1-author UPDATED:2026-10-21T04:00:00+00:00\nGOAL: listing ETag'},author);assert.equal(another.status,201);
      const before=await cached(listing.etag,reader,path);assert.equal(before.status,304);
      const comment=await h.http(`${R}/issues/${another.body.number}/comments`,{body:'FROM:eg-1-author/s1 TO:eg-1-reader TYPE:NOTE\nlisting participation'},author);assert.equal(comment.status,201);
      const changed=await cached(listing.etag,reader,path);exact(changed);assert.notEqual(changed.etag,listing.etag);assert.ok(changed.body.items.some((i:any)=>i.number===another.body.number));listing=changed;await unchanged(listing,path);
    });
    await t.test('GET ETag is separate from numeric If-Match; successful edit and stale revision 412',async()=>{
      const body=current.body.body.split('\n')[0]+'\nGOAL: edited with numeric revision';
      const edited=await h.http(I+'/body',{body},author,{method:'PATCH',headers:{'if-match':String(current.body.revision)}});assert.equal(edited.status,200,JSON.stringify(edited.body));
      const changed=await cached(current.etag);exact(changed);assert.notEqual(changed.etag,current.etag);assert.equal(changed.body.revision,2);assert.equal(changed.body.body,body);await unchanged(changed);
      const stale=await h.http(I+'/body',{body},author,{method:'PATCH',headers:{'if-match':'1'}});assert.equal(stale.status,412);
      const opaque=await h.http(I+'/body',{body},author,{method:'PATCH',headers:{'if-match':changed.etag}});assert.equal(opaque.status,400);assert.equal(opaque.body.error.code,'INVALID_IF_MATCH');
    });
    await h.waitForIdle();assert.deepEqual(h.failures,[]);
  } finally {
    inboxServer?.closeAllConnections();if(inboxServer) await new Promise<void>(resolve=>inboxServer!.close(()=>resolve()));
    await h.cleanup();
    t.diagnostic('owned harness schemas/queues and both listeners cleaned');
  }
});
