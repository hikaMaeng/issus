import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runMigrations,runtimeAuthMigration,runtimeHistoryMigration,createRuntimePool} from 'issus_runtime/server';
import {sha256} from 'issus_domain/server';
import {QUEUES} from 'issus_domain/common';
import {startCoreHarness} from '../auth/testing.js';

const enabled=!!process.env.ISSUS_TEST_DATABASE_URL;
const stamp='2026-10-21T04:00:00+00:00';
test('Q1/Q2 real DB listening routes, indexed reads and zero mutation',{skip:!enabled},async t=>{
  const h=await startCoreHarness(),R='/v1/repos/tester/reads',A='/v1/owners/tester/aliases';
  t.diagnostic(`Q1/Q2 isolated schema=${h.schema} brokerSchema=${h.brokerSchema} queuePrefix=${h.queueName('')}`);
  const q=(table:string)=>`"${h.schema}"."${table}"`;
  const base=new URL('../../../../../../packages/issus_domain/src/server/backend/schema/',import.meta.url);
  const migrations=[{id:'0001-domain-baseline',sql:await readFile(new URL('0001-domain-baseline.sql',base),'utf8')},runtimeAuthMigration,runtimeHistoryMigration,
    {id:'0004-core-read-indexes',sql:await readFile(new URL('0004-core-read-indexes.sql',base),'utf8')}];
  let repoId:string,alphaToken:string,alphaId:string;
  async function open(owner:string,title:string):Promise<number> {
    const r=await h.http(`${R}/issues`,{title,body:`STATE:running OWNER:${owner} UPDATED:${stamp}\nGOAL: read test`});
    assert.equal(r.status,201,JSON.stringify(r.body));return r.body.number;
  }
  async function post(number:number,to:string,type:string,extra='',content='read fixture') {
    const r=await h.http(`${R}/issues/${number}/comments`,{body:`FROM:tt-1-alpha/s1 TO:${to} TYPE:${type}${extra?' '+extra:''}\n${content}`},alphaToken);
    assert.equal(r.status,201,JSON.stringify(r.body));return r.body.commentId as string;
  }
  async function get(path:string,token=alphaToken) {const r=await h.http(path,undefined,token);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
  async function all(path:string,limit=1) {
    const items:any[]=[],cursors=new Set<string>();let cursor:string|null=null;
    do {const b=await get(`${path}${path.includes('?')?'&':'?'}limit=${limit}${cursor?'&cursor='+encodeURIComponent(cursor):''}`);items.push(...b.items);cursor=b.nextCursor;if(cursor){assert.equal(cursors.has(cursor),false,'cursor progresses');cursors.add(cursor);}}while(cursor);
    return items;
  }
  async function fingerprint() {
    await h.waitForIdle();const data:unknown[]=[];
    for(const schema of [h.schema,h.brokerSchema]) for(const {tablename} of (await h.pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows) {
      data.push([schema,tablename,(await h.pool.query(`SELECT to_jsonb(t) AS r FROM "${schema}"."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows]);
    }
    for(const queue of Object.values(QUEUES)) data.push([queue,(await h.pool.query(`SELECT to_jsonb(t) AS r FROM pgmq."q_${h.queueName(queue)}" t ORDER BY msg_id`)).rows]);
    return sha256(JSON.stringify(data));
  }
  try {
    await t.test('0004 is contiguous, repeatable and indexes existing projection data only',async()=>{
      assert.deepEqual((await runMigrations({pool:h.pool,schema:h.schema,queueName:h.queueName,migrations})).applied,['0004-core-read-indexes']);
      assert.deepEqual((await runMigrations({pool:h.pool,schema:h.schema,queueName:h.queueName,migrations})).applied,[]);
      const indexes=(await h.pool.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1',[h.schema])).rows.map(r=>r.indexname);
      for(const name of ['alias_registry_listing','issue_listing_updated','comment_participating_aliases','claim_alias_open']) assert.ok(indexes.includes(name));
    });
    const repo=await h.http('/v1/repos',{owner:'tester',slug:'reads',projectCode:'tt',autoBoard:true});assert.equal(repo.status,201,JSON.stringify(repo.body));repoId=repo.body.repoId;
    for(const name of ['tt-1-alpha','tt-1-bravo','tt-1-charlie']) {
      const r=await h.http(A,{name,role:'reader',model:'fixture-model',scope:'read-only',repos:[repoId],announcementBody:`FROM:${name}/by-tt-system TO:ALL TYPE:ALIAS\n${name} | reader | fixture-model | read-only | s1`});
      assert.equal(r.status,201,JSON.stringify(r.body));if(name==='tt-1-alpha') alphaId=r.body.aliasId;
    }
    const session=await h.http('/v1/sessions',{alias:'tt-1-alpha',sid:'s1'});assert.equal(session.status,201);alphaToken=session.body.token;
    const one=await open('tt-1-alpha','Needle server'),two=await open('tt-1-bravo','Needle client'),three=await open('tt-1-alpha','Other 100%_'),four=await open('tt-1-bravo','No participation');
    await post(one,'tt-1-bravo','NOTE','CC:tt-1-charlie','first FROM/TO/CC fixture');
    const seenOne=await post(one,'tt-1-bravo','NOTE','','duplicate participation must not duplicate issue');
    const seenTwo=await post(two,'tt-1-charlie','NOTE','','second FROM fixture');
    const released=await post(one,'ALL','CLAIM',`DUE:2026-10-21T05:00:00+00:00 SEEN:${seenOne}`,'released claim');
    await post(one,'ALL','RELEASE',`RE:${released}`,'release exact claim');
    await post(two,'ALL','CLAIM',`DUE:2026-10-21T05:00:00+00:00 SEEN:${seenTwo}`,'open claim');
    // Controlled DB fixtures isolate sort timestamps and the closed axis from the close command workflow.
    await h.waitForIdle();
    await h.pool.query(`UPDATE ${q('issue')} SET is_open=false,state='done' WHERE repo_id=$1 AND number=$2`,[repoId,three]);
    await h.pool.query(`UPDATE ${q('issue')} SET updated_at='2026-10-21T04:00:01.000001Z' WHERE repo_id=$1`,[repoId]);
    await h.pool.query(`UPDATE ${q('issue')} SET updated_at='2026-10-21T04:00:01.000002Z' WHERE repo_id=$1 AND number=$2`,[repoId,one]);
    const unassigned=await h.http('/v1/repos',{owner:'tester',slug:'restricted',projectCode:'zz',autoBoard:true});assert.equal(unassigned.status,201);
    const before=await fingerprint();
    await t.test('Q1 owner-wide session/bootstrap access, foreign owner 403 and missing detail 404',async()=>{
      assert.equal((await get(A)).items.length,7); // Two repos each reserve system/board; three external aliases.
      assert.equal((await get(A,h.bootstrapToken)).items.length,7);
      assert.equal((await h.http(A,undefined,'')).status,401);
      for(const path of ['/v1/owners/stranger/aliases','/v1/owners/stranger/aliases/tt-1-alpha']) assert.equal((await h.http(path,undefined,alphaToken)).status,403);
      assert.equal((await h.http(A+'/tt-1-missing',undefined,alphaToken)).status,404);
      assert.equal((await h.http('/v1/repos/tester/restricted/issues',undefined,alphaToken)).status,403);
    });
    await t.test('Q1 deterministic pages, literal case-insensitive profile search, active sid/null',async()=>{
      const items=await all(A);assert.equal(new Set(items.map(i=>i.id)).size,7);assert.deepEqual(items.map(i=>i.name),[...items.map(i=>i.name)].sort());
      for(const field of ['reader','FIXTURE-MODEL','read-only','TT-1-']) assert.equal((await all(A+'?q='+field)).length,3);
      assert.deepEqual((await get(A+'?q=%25')).items,[]);
      const item=(await get(A+'?q=alpha')).items[0];assert.deepEqual(item,{id:alphaId,name:'tt-1-alpha',role:'reader',model:'fixture-model',scope:'read-only',sid:'s1',repos:[repoId],registeredAt:item.registeredAt,renamedFrom:[],status:'active',renamedTo:null});assert.ok(Number.isFinite(Date.parse(item.registeredAt)));
      assert.equal((await get(A+'/tt-1-charlie')).alias.sid,null);
      const page=await get(A+'?limit=1');assert.equal((await h.http(A+'?q=reader&cursor='+page.nextCursor,undefined,alphaToken)).status,400);
    });
    await t.test('Q1 detail activity uses FROM/TO/CC and counts only unreleased claims',async()=>{
      const detail=await get(A+'/TT-1-ALPHA');assert.equal(detail.alias.id,alphaId);assert.equal(detail.openClaimCount,1);
      assert.deepEqual(detail.recentIssues.map((i:any)=>i.number),[two,one,1]);
      const charlie=await get(A+'/tt-1-charlie');assert.deepEqual(charlie.recentIssues.map((i:any)=>i.number),[two,one,1]);assert.equal(charlie.openClaimCount,0);
      for(const item of detail.recentIssues) {assert.equal(item.repoId,repoId);assert.equal(item.owner,'tester');assert.equal(item.repo,'reads');assert.ok(Number.isFinite(Date.parse(item.lastActivityAt)));assert.match(item.lastCommentId,/^\d+$/);}
    });
    await t.test('Q2 defaults and open/closed/all axis preserve legacy number cursor',async()=>{
      assert.deepEqual((await all(R+'/issues')).map(i=>i.number),[1,one,two,four]);
      assert.deepEqual((await all(R+'/issues?state=closed')).map(i=>i.number),[three]);
      assert.deepEqual((await all(R+'/issues?state=all')).map(i=>i.number),[1,one,two,three,four]);
      const page=await get(R+'/issues?limit=1');assert.equal(page.nextCursor,'1');assert.equal((await get(R+'/issues?cursor=1&limit=1')).items[0].number,one);
    });
    await t.test('Q2 owner, complete FROM/TO/CC matches and AND combinations',async()=>{
      const expected:Record<string,number[]>={
        'owner=TT-1-ALPHA&state=all':[one,three],
        'alias=tt-1-alpha&state=all':[1,one,two],
        'alias=tt-1-bravo&state=all':[1,one],
        'alias=TT-1-CHARLIE&state=all':[1,one,two],
        'alias=tt-1-alph&state=all':[],
        'owner=tt-1-bravo&alias=tt-1-alpha&q=needle&state=open':[two],
        'owner=tt-1-alpha&alias=tt-1-bravo&q=NEEDLE&state=open':[one],
        'owner=tt-1-alpha&alias=tt-1-bravo&state=closed':[],
        'owner=tt-1-unknown&state=all':[],
        'alias=ALL&state=all':[]
      };
      for(const [query,numbers] of Object.entries(expected)) assert.deepEqual((await all(R+'/issues?'+query)).map(i=>i.number),numbers,query);
    });
    await t.test('Q2 literal title search and exact number/#number search',async()=>{
      for(const query of ['q=needle','q=NEEDLE']) assert.deepEqual((await all(R+'/issues?state=all&'+query)).map(i=>i.number),[one,two]);
      assert.deepEqual((await all(R+'/issues?state=all&q=%25_')).map(i=>i.number),[three]);
      for(const text of [String(two),'%23'+two]) assert.deepEqual((await all(R+'/issues?state=all&q='+text)).map(i=>i.number),[two]);
      assert.deepEqual((await get(R+'/issues?q=not-found')).items,[]);
    });
    await t.test('Q2 all sort/order combinations page ties without microsecond loss or duplicate rows',async()=>{
      for(const sort of ['number','created','updated']) for(const order of ['asc','desc']) {
        const rows=await all(`${R}/issues?state=all&sort=${sort}&order=${order}`);
        const asc=sort==='updated'?[1,two,three,four,one]:[1,one,two,three,four];
        assert.deepEqual(rows.map(i=>i.number),order==='asc'?asc:[...asc].reverse(),sort+'/'+order);
        assert.equal(rows.length,new Set(rows.map(i=>i.number)).size);
      }
      const page=await get(`${R}/issues?sort=updated&order=desc&limit=1`);assert.match(page.items[0].updatedAt,/000002Z$/);
      for(const query of ['sort=updated&order=asc','sort=updated&order=desc&q=Needle']) assert.equal((await h.http(`${R}/issues?${query}&cursor=${page.nextCursor}`,undefined,alphaToken)).status,400);
      assert.equal((await h.http(`${R}/issues?sort=updated&order=desc&cursor=${page.nextCursor}`,undefined,h.bootstrapToken)).status,400);
      const position=JSON.parse(Buffer.from(page.nextCursor,'base64url').toString('utf8'));
      for(const updated of ['0000-01-01T00:00:00.000000Z','2026-02-30T00:00:00.000000Z']) {
        const bad=Buffer.from(JSON.stringify({...position,updated})).toString('base64url');
        const r=await h.http(`${R}/issues?sort=updated&order=desc&cursor=${bad}`,undefined,alphaToken);assert.equal(r.status,400);assert.equal(r.body.error.reasons[0].path,'query.cursor');
      }
    });
    await t.test('Q1/Q2 unsupported, duplicate, structured and invalid query values return 400 with reasons',async()=>{
      const cases=[A+'?sort=name',A+'?limit=0',A+'?limit=501',A+'?limit=1.0',A+'?cursor=bad!',A+'?q=a&q=b',A+'?q[x]=a',A+'/tt-1-alpha?limit=1',A+'?q='+'x'.repeat(201),
        ...['state=running','state=','sort=title','order=down','owner=','alias=','limit=1&limit=2','cursor=-1','cursor=1.1','cursor=9999999999999999','sort=updated&cursor=2','workState=done','unknown=true','owner=a&owner=b'].map(q=>R+'/issues?'+q)];
      for(const path of cases) {const r=await h.http(path,undefined,alphaToken);assert.equal(r.status,400,path+JSON.stringify(r.body));assert.ok(r.body.error.reasons.length>0,path);assert.match(r.body.error.reasons[0].path,/^query\./);assert.ok(r.body.error.reasons[0].message.length>0);}
    });
    await t.test('all successful and rejected reads leave complete domain/broker/queue fingerprint unchanged',async()=>{assert.equal(await fingerprint(),before);});
    await t.test('Q1 rename tombstone and immutable historical participation remain readable',async()=>{
      const renamed=await h.http('/v1/aliases/'+alphaId+'/rename',{newName:'tt-1-zephyr',announcementBody:'FROM:tt-1-alpha/s1 TO:ALL TYPE:ALIAS\ntt-1-alpha→tt-1-zephyr'},alphaToken);assert.equal(renamed.status,200,JSON.stringify(renamed.body));
      const snap=await fingerprint(),detail=await get(A+'/tt-1-zephyr');assert.deepEqual(detail.alias.renamedFrom,['tt-1-alpha']);assert.equal(detail.alias.sid,'s1');assert.equal(detail.openClaimCount,1);assert.ok(detail.recentIssues.some((i:any)=>i.number===two));
      const old=await get(A+'/tt-1-alpha');assert.equal(old.alias.status,'renamed');assert.equal(old.alias.renamedTo,'tt-1-zephyr');assert.equal(old.alias.sid,null);
      assert.deepEqual((await all(R+'/issues?owner=tt-1-zephyr&state=all')).map(i=>i.number),[one,three]);
      assert.ok((await all(R+'/issues?alias=tt-1-alpha&state=all')).some(i=>i.number===two));assert.deepEqual((await get(R+'/issues?alias=tt-1-zephyr')).items,[]);
      assert.equal(await fingerprint(),snap);
    });
    await t.test('Q1 recent activity is capped at 20 issues and newest participation wins',async()=>{
      const numbers:number[]=[];
      for(let i=0;i<21;i++) {
        const number=await open('tt-1-bravo',`recent limit ${i}`);numbers.push(number);
        const r=await h.http(`${R}/issues/${number}/comments`,{body:`FROM:tt-1-zephyr/s1 TO:tt-1-charlie TYPE:NOTE\nactivity ${i}`},alphaToken);
        assert.equal(r.status,201,JSON.stringify(r.body));
      }
      const snap=await fingerprint(),detail=await get(A+'/tt-1-zephyr');
      assert.deepEqual(detail.recentIssues.map((i:any)=>i.number),numbers.slice(1).reverse());
      assert.equal(detail.openClaimCount,1);assert.equal(await fingerprint(),snap);
    });
    await t.test('Q1 expired writer sid is null and registry exposes no session credentials',async()=>{
      await h.pool.query(`UPDATE ${q('session')} SET expires_at='2026-10-21T03:00:00Z' WHERE alias_id=$1`,[alphaId]);
      const snap=await fingerprint(),detail=await get(A+'/tt-1-zephyr',h.bootstrapToken);
      assert.equal(detail.alias.sid,null);assert.equal((await h.http(A,undefined,alphaToken)).status,401);
      for(const key of ['token','tokenHash','token_hash','sessionId','session_id','expiresAt','expires_at']) assert.equal(key in detail.alias,false);
      assert.equal(await fingerprint(),snap);
    });
    assert.deepEqual(h.failures,[]);
  }finally{
    await h.cleanup();
    const check=createRuntimePool(process.env.ISSUS_TEST_DATABASE_URL!);
    try {
      assert.equal((await check.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=ANY($1::text[])',[[h.schema,h.brokerSchema]])).rows[0].n,0);
      assert.equal((await check.query('SELECT count(*)::int AS n FROM pgmq.list_queues() WHERE left(queue_name,length($1))=$1',[h.queueName('')])).rows[0].n,0);
      t.diagnostic('Q1/Q2 dedicated schema residual=0; queue residual=0');
    }finally{await check.end();}
  }
});
