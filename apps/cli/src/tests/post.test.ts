import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {checkComment,checkIssueBody,charCount} from 'issus_domain/common';
import {harness,root,id,principal,timestamp,apiError} from './helpers/index.js';

interface Reference {path:string;file:string;mode:string;exitCode:number;stdout:string;stderr:string}
async function pythonResults():Promise<Reference[]> {
  if(process.env.ISSUS_PYTHON_REFERENCE_RESULTS) return JSON.parse(await readFile(process.env.ISSUS_PYTHON_REFERENCE_RESULTS,'utf8')) as Reference[];
  const oracle=spawnSync('python',[join(root,'apps/cli/tests/tools/python-reference.py'),'post'],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'},maxBuffer:1048576,windowsHide:true});
  assert.equal(oracle.error,undefined,String(oracle.error));assert.equal(oracle.status,0,oracle.stderr??'Python reference failed');
  return JSON.parse(oracle.stdout) as Reference[];
}
const references=await pythonResults();
assert.equal(references.length,37);

for(const reference of references) test(`C-01 Python stdout/exit parity: ${reference.path}`,async()=>{
  let preflights=0,writes=0;
  const h=await harness(async(url,init)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/preflight')) {
      preflights++;assert.equal(init?.method,'POST');assert.equal((init?.headers as Record<string,string>)['Idempotency-Key'],undefined);
      const body=JSON.parse(init!.body as string),reasons=body.mode==='issue-body'?checkIssueBody(body.request.body):checkComment(body.request.body);
      assert.deepEqual(reasons,[]);
      if(reference.mode==='issue-body') assert.equal((init?.headers as Record<string,string>)['If-Match'],'"7"');
      return Response.json({valid:true,posted:false,mode:body.mode,chars:charCount(body.request.body),envelope:{},context:{checkedAt:timestamp},compact:{due:false,count:0,chars:0}});
    }
    if(path.endsWith('/issues/1')) return Response.json({revision:7});
    writes++;return apiError(503,'UNEXPECTED_WRITE');
  });
  const args=['post','--repo','hikaMaeng/issus','--issue','1','--body-file',reference.file,'--dry-run'];
  if(reference.mode==='issue-body') args.push('--edit-body');
  const source=await readFile(reference.file,'utf8');
  if(source.startsWith('FROM:')&&source.split('\n')[0].includes('TYPE:COMPACT')&&reference.exitCode===0) {
    const packet=join(h.directory,'packet.md');await writeFile(packet+'.meta.json',JSON.stringify({packetToken:id(99)}));
    args.push('--packet-file',packet,'--sampled','6272300100,6271400900,6272000500','--compacted-by','p4-24-compact');
  }
  assert.equal(await h.run(args),reference.exitCode);
  assert.equal(h.stdout.join(''),reference.stdout.replace(/\r\n/gu,'\n'));
  assert.equal(preflights,reference.exitCode===0?1:0);assert.equal(writes,0);
});

test('I-P1 preflight failure follows server reasons in order and never outputs OK',async()=>{
  const h=await harness(async()=>apiError(422,'VALIDATION_FAILED',['시각 문맥 오류','참조 없음']));
  const file=join(h.directory,'봉투.md');await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\n검사.\n','utf8');
  assert.equal(await h.run(['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--dry-run']),1);
  assert.equal(h.stdout.join(''),`REJECTED (2): ${file}\n  - 시각 문맥 오류\n  - 참조 없음\n`);
});

for(const [status,expected] of [[401,2],[403,2],[404,1],[409,1],[410,1],[412,1],[429,2],[503,2]]) test(`post domain/auth/server HTTP ${status} → ${expected}`,async()=>{
  const h=await harness(async()=>apiError(status,'TEST'));
  const file=join(h.directory,'valid.md');await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\n검사.');
  assert.equal(await h.run(['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--dry-run']),expected);
  assert.doesNotMatch(h.stdout.join(''),/^OK/mu);
});

test('real post persists the same key across connection failure and later invocation',async()=>{
  const keys:string[]=[];let failed=true;
  const h=await harness(async(url,init)=>{
    if(new URL(url).pathname==='/v1/auth/me') return Response.json(principal);
    keys.push((init!.headers as Record<string,string>)['Idempotency-Key']);
    if(failed) throw new Error('connection reset');
    return Response.json({commentId:'1000001',posted:true},{status:201});
  });
  const file=join(h.directory,'valid.md');await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\n게시.');
  const args=['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file];
  assert.equal(await h.run(args),2);failed=false;assert.equal(await h.run(args),0);
  assert.equal(keys.length,3);assert.equal(new Set(keys).size,1);assert.match(h.stdout.join(''),/posted comment id=1000001/u);
  const journal=await readFile(join(h.env.ISSUS_CONFIG_DIR,'requests.json'),'utf8');assert.ok(!journal.includes(h.env.ISSUS_TOKEN));assert.ok(!journal.includes('게시.'));
});

test('queued operation timeout exits 3 and preserves operation key in diagnostics',async()=>{
  const h=await harness(async(url,init)=>new URL(url).pathname==='/v1/auth/me'?Response.json(principal):init?.method==='POST'?Response.json({operationId:id(1),statusUrl:'/v1/operations/'+id(1),status:'queued',posted:null},{status:202}):Response.json({status:'queued',posted:null}));
  const file=join(h.directory,'valid.md');await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\n게시.');
  assert.equal(await h.run(['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--timeout','1ms']),3);
  assert.match(h.stderr.join(''),/pending operation=.* key=/u);
  const journal=JSON.parse(await readFile(join(h.env.ISSUS_CONFIG_DIR,'requests.json'),'utf8'));
  assert.ok(Object.values(journal.requests).some(r=>(r as {operationId?:string}).operationId===id(1)));
});

test('Windows Korean paths, codepoints, raw CRLF and BOM are preserved through validation',async()=>{
  const bodies:string[]=[];
  const h=await harness(async(_url,init)=>{const body=JSON.parse(init!.body as string).request.body;bodies.push(body);return Response.json({valid:true,posted:false,context:{checkedAt:timestamp},compact:{due:false}});});
  const folder=join(h.directory,'공백 폴더'),file=join(folder,'입력 😀.md');await mkdir(folder);
  const body='FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\r\n한글 😀\r\n';await writeFile(file,body,'utf8');
  const args=['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--dry-run'];
  assert.equal(await h.run(args),0);assert.equal(bodies[0],body);assert.match(h.stdout.join(''),new RegExp(`chars=${Array.from(body).length}`));
  await writeFile(file,'\uFEFF'+body,'utf8');assert.equal(await h.run(args),1);assert.match(h.stdout.join(''),/BOM 제거 필요/u);assert.equal(bodies.length,1);
  await writeFile(file,Buffer.from([0xff,0xfe]));assert.equal(await h.run(args),2);
});
