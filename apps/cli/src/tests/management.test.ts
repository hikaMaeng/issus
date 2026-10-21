import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {harness,id,principal,apiError} from './helpers/index.js';

test('compact shorthand exports masked packet with canonical status/envelope and metadata sidecar',async()=>{
  const packet={count:2,chars:99,markdown:'# 패킷\n[MASKED:api-key]\n',maskedCount:1,suggestedEnvelope:'FROM:issus-1-orch/<sid> TO:ALL TYPE:COMPACT SEEN:1000002',throughId:'1000002',previousCompactId:null,snapshotRevision:7,packetHash:'a'.repeat(64),packetToken:id(99),comments:[{id:'1000001'},{id:'1000002'}]};
  const paths:string[]=[];const h=await harness(async url=>{paths.push(String(url));return Response.json(packet);});
  assert.equal(await h.run(['compact','--repo','hikaMaeng/issus','--issue','1']),0);
  const file='compact_packet_hikaMaeng_issus_1_1000002.md';assert.equal(await readFile(join(h.directory,file),'utf8'),packet.markdown);
  assert.equal(JSON.parse(await readFile(join(h.directory,file+'.meta.json'),'utf8')).packetToken,id(99));
  assert.match(h.stdout.join(''),new RegExp(`^packet=${file} comments=2 chars=99 packet-chars=${Array.from(packet.markdown).length} masked=1 prev-compact=-`));
  assert.match(h.stdout.join(''),/envelope: FROM:issus-1-orch/u);assert.ok(paths[0].includes('compact/packet?format=json'));
});

test('compact empty 204 returns 1 with canonical nothing-to-compact wording',async()=>{
  const h=await harness(async url=>String(url).includes('/packet')?new Response(null,{status:204}):Response.json({previousCompactId:'1000002'}));
  assert.equal(await h.run(['compact','prepare','--repo','hikaMaeng/issus','--issue','1']),1);assert.equal(h.stdout.join(''),'nothing to compact: 0 comments after COMPACT 1000002\n');
});

test('COMPACT post sends only documented metadata and sampled ids are deduped',async()=>{
  let posted:Record<string,unknown>|undefined;
  const h=await harness(async(url,init)=>{
    if(String(url).endsWith('/auth/me')) return Response.json(principal);
    posted=JSON.parse(init!.body as string);return Response.json({commentId:'1000002',posted:true},{status:201});
  });
  const file=join(h.directory,'compact.md'),packet=join(h.directory,'packet.md');
  await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:COMPACT SEEN:1000001\n## ===== COMPACT #1 through 1000001 =====\n요약.');
  await writeFile(packet+'.meta.json',JSON.stringify({packetToken:id(99)}));
  assert.equal(await h.run(['compact','post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--packet-file',packet,'--sampled','1000001,1000001','--compacted-by','issus-1-client']),0);
  assert.deepEqual(Object.keys(posted!).sort(),['body','compactPacketToken','compactedBy','sampledIds'].sort());assert.deepEqual(posted!.sampledIds,['1000001']);assert.equal(posted!.compactPacketToken,id(99));
});

test('alias registry conflict remains owner-wide when evidence is filtered',async()=>{
  const bodies:any[]=[];const h=await harness(async(_url,init)=>{bodies.push(JSON.parse(init!.body as string));return Response.json({available:false,collisions:[{kind:'edit-distance-1',alias:'issus-1-clienx',evidence:['other/repo#2']}]});});
  assert.equal(await h.run(['alias','--owner','hikaMaeng','--repos','hikaMaeng/issus,hikaMaeng/issus','--deep','issus-1-client']),1);
  assert.deepEqual(bodies,[{name:'issus-1-client',deep:true}]);assert.match(h.stdout.join(''),/CONFLICT:/u);assert.match(h.stdout.join(''),/owner registry; evidence filter 밖/u);
});

test('alias invalid grammar rejects without a server call and available prints OK',async()=>{
  let calls=0;const h=await harness(async()=>{calls++;return Response.json({available:true,collisions:[]});});
  assert.equal(await h.run(['alias','--owner','hikaMaeng','--repos','hikaMaeng/issus','BAD']),1);assert.equal(calls,0);
  assert.equal(await h.run(['alias','check','--owner','hikaMaeng','--repos','hikaMaeng/issus','issus-1-client']),0);assert.match(h.stdout.join(''),/^alias=.*\nOK:/u);
});

for(const [status,code,expected] of [[404,'BOARD_NOT_FOUND',1],[409,'BOARD_UNAVAILABLE',3],[409,'BOARD_CONFLICT',1]] as const) test(`board ${code} preserves exit ${expected}`,async()=>{
  const h=await harness(async()=>apiError(status,code));assert.equal(await h.run(['board','--repo','hikaMaeng/issus']),expected);
  if(expected===1&&status===404) assert.match(h.stdout.join(''),/^NONE:/u);
});

test('board found prints BOARD shape with server registry provenance',async()=>{
  const h=await harness(async url=>String(url).includes('/board')?Response.json({number:2,state:'open',via:'registry',evidence:[]}):Response.json({issue:{title:'[공통 게시판]'},stats:{count:8}}));
  assert.equal(await h.run(['board','find','--repo','hikaMaeng/issus','--issue','1','--user-board','2']),0);
  assert.match(h.stdout.join(''),/^BOARD hikaMaeng\/issus#2 state=open comments=8 via=registry title=\[공통 게시판\]/u);
});

test('session lost-token 409 prints explicit reissue recovery and persists stable/new keys',async()=>{
  const requests:{key:string;body:any}[]=[];
  const h=await harness(async(url,init)=>{
    if(String(url).endsWith('/auth/me')) return Response.json({kind:'bootstrap',id:'bootstrap',ownerId:id(2),capabilities:[]});
    requests.push({key:(init!.headers as Record<string,string>)['Idempotency-Key'],body:JSON.parse(init!.body as string)});
    return apiError(409,'SESSION_TOKEN_NOT_REPLAYABLE',[],{sessionId:id(80),alias:'issus-1-client',sid:'s1',reissueRequired:true});
  });
  const args=['session','open','--alias','issus-1-client','--sid','s1'];
  assert.equal(await h.run(args),1);assert.match(h.stderr.join(''),new RegExp(`--reissue-of ${id(80)}`));assert.doesNotMatch(h.stdout.join(''),/token/u);
  assert.equal(await h.run(args),1);assert.equal(requests[0].key,requests[1].key);
  assert.equal(await h.run(['session','open','--alias','issus-1-client','--sid','s2','--reissue-of',id(80)]),1);assert.notEqual(requests[1].key,requests[2].key);assert.equal(requests[2].body.reissueOf,id(80));
});

test('auth set saves restricted UTF-8 profile and never echoes its test-only token',async()=>{
  const h=await harness(),token='dummy-profile-value-for-test';
  await mkdir(h.env.ISSUS_CONFIG_DIR,{recursive:true});
  await writeFile(join(h.env.ISSUS_CONFIG_DIR,'profiles.json'),JSON.stringify({version:1,active:'work',profiles:{}}));
  assert.equal(await h.run(['auth','set','--server','https://example.com','--token-stdin'],{stdin:async()=>token+'\n'}),0,h.stderr.join(''));
  const file=join(h.env.ISSUS_CONFIG_DIR,'profiles.json'),raw=await readFile(file,'utf8');assert.equal(JSON.parse(raw).profiles.work.token,token);assert.equal(JSON.parse(raw).active,'work');
  assert.ok(!h.stdout.join('').includes(token));assert.ok(!h.stderr.join('').includes(token));assert.ok(!raw.startsWith('\uFEFF'));assert.ok(!raw.includes('\r'));
  if(process.platform!=='win32') assert.equal((await stat(file)).mode&0o777,0o600);
});

test('session success saves token before output and public result excludes token',async()=>{
  const token='dummy-session-value-for-test';
  const h=await harness(async url=>String(url).endsWith('/auth/me')?Response.json({kind:'bootstrap',id:'bootstrap',ownerId:id(2),capabilities:[]}):Response.json({sessionId:id(80),token,expiresAt:'2026-10-22T07:00:00Z',alias:'issus-1-client',sid:'s1'},{status:201}));
  assert.equal(await h.run(['session','open','--alias','issus-1-client','--sid','s1','--json']),0,h.stderr.join(''));
  assert.equal(JSON.parse(h.stdout.join('')).saved,true);assert.ok(!h.stdout.join('').includes(token));assert.ok(!h.stderr.join('').includes(token));
  assert.equal(JSON.parse(await readFile(join(h.env.ISSUS_CONFIG_DIR,'profiles.json'),'utf8')).profiles.default.token,token);
});

test('issue/handoff/admin mutations preserve documented fields and revision headers',async()=>{
  const requests:{path:string;method:string;body:any;revision:string|undefined}[]=[];
  const h=await harness(async(url,init)=>{
    if(String(url).endsWith('/auth/me')) return Response.json(principal);
    requests.push({path:new URL(url).pathname,method:init!.method!,body:JSON.parse(init!.body as string),revision:(init!.headers as Record<string,string>)['If-Match']});return Response.json({ok:true});
  });
  assert.equal(await h.run(['issue','close','--repo','hikaMaeng/issus','--issue','1','--revision','7','--reason','완료','--final-report-id','1000001']),0);
  assert.deepEqual(requests.at(-1),{path:'/v1/repos/hikaMaeng/issus/issues/1/close',method:'POST',body:{reason:'완료',finalReportId:'1000001'},revision:'"7"'});
  assert.equal(await h.run(['handoff','complete','--repo','hikaMaeng/issus','--issue','1','--id','1000001','--revision','7']),0);assert.deepEqual(requests.at(-1)?.body,{expectedRevision:7});
  assert.equal(await h.run(['admin','repo','--owner','hikaMaeng','--slug','test','--project-code','test','--auto-board','--board-owner','issus-board']),0);assert.deepEqual(requests.at(-1)?.body,{owner:'hikaMaeng',slug:'test',projectCode:'test',autoBoard:true,boardOwner:'issus-board'});
});

test('server diagnostics cannot echo the bearer through stdout or stderr',async()=>{
  const h=await harness(async()=>apiError(422,'VALIDATION_FAILED',['unexpected test-only-session']));
  const file=join(h.directory,'valid.md');await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\n검사.');
  assert.equal(await h.run(['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--dry-run']),1);
  assert.doesNotMatch(h.stdout.join('')+h.stderr.join(''),/test-only-session/u);assert.match(h.stdout.join(''),/REDACTED/u);
});
