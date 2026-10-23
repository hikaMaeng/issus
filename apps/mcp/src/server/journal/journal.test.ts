import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Journal,digest,businessResolved,type DeliveryRecord} from './index.js';
import {Redactor} from '../redaction/index.js';

const identity={server:'http://127.0.0.1:18140',ownerId:randomUUID(),aliasId:randomUUID(),sessionId:randomUUID(),scope:'scope-a'};
async function setup(t:test.TestContext){
  const directory=await mkdtemp(join(tmpdir(),'issus-mcp-journal-')),journal=new Journal(directory);await journal.bind(identity);
  t.after(async()=>{await journal.close();const path=resolve(directory),base=resolve(tmpdir())+sep;if(!path.startsWith(base)||!path.slice(base.length).startsWith('issus-mcp-journal-'))throw new Error('cleanup scope');await rm(path,{recursive:true,force:true});});
  return {directory,journal};
}
test('durable write key is reused under concurrent callers; journal omits request body',async t=>{
  const {directory,journal}=await setup(t),body='private body-'+randomUUID(),hash=digest({body});
  const records=await Promise.all(Array.from({length:20},()=>journal.request('same-request','/v1/path',hash,7)));
  assert.equal(new Set(records.map(r=>r.key)).size,1);assert.equal(records[0].revision,7);
  await journal.writeState(records[0].key,{operationId:randomUUID()});
  for(const name of await readdir(directory)){const bytes=await readFile(join(directory,name));assert.equal(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf,false);assert.equal(bytes.includes(Buffer.from(body)),false);assert.equal(bytes.includes(Buffer.from('\r\n')),false);}
});
test('failed state mutation never replaces durable or in-memory prior state',async t=>{
  const {directory,journal}=await setup(t),before=structuredClone(journal.data);
  await assert.rejects(journal.update(d=>{d.scope='changed';throw new Error('injected disk preparation failure');}));
  assert.deepEqual(journal.data,before);
  const file=(await readdir(directory)).find(n=>n.endsWith('.json'))!;assert.deepEqual(JSON.parse(await readFile(join(directory,file),'utf8')),before);
});
test('new session retains alias work while dropping old cursors and versions',async t=>{
  const {directory,journal}=await setup(t),id=randomUUID();
  const record:DeliveryRecord={id,repo:'sample/test',commentId:'1000001',viewKey:'comment:1000001',ordinal:'1',attempt:0,source:{eventId:randomUUID(),streamId:'stream',sequence:'1'},phase:'RETURNED',directive:true,ackId:'1000002'};
  await journal.update(d=>{d.cursors={refreshCursor:randomUUID(),processedCursor:randomUUID()};d.versions={[id]:{id,sequence:'9',attempt:0,state:'acked'}};d.deliveries[id]=record;});await journal.close();
  const next=new Journal(directory);assert.equal(await next.bind({...identity,scope:'scope-b',sessionId:randomUUID()}),true);
  assert.deepEqual(next.data.cursors,{});assert.deepEqual(next.data.versions,{});assert.deepEqual(next.data.deliveries[id],record);
  await next.close();
});
test('ACK, process, REPORT and application do not accept a pending HANDOFF implicitly',()=>{
  const r:DeliveryRecord={id:randomUUID(),repo:'sample/test',commentId:'1000001',viewKey:'comment:1000001',ordinal:'1',attempt:0,source:{eventId:randomUUID(),streamId:'stream',sequence:'1'},phase:'RETURNED',directive:true,directiveType:'HANDOFF',ackId:'1000002'};
  assert.equal(businessResolved(r),false);r.processed=true;assert.equal(businessResolved(r),false);r.reportId='1000003';r.applied=true;assert.equal(businessResolved(r),false);r.handoffAccepted=true;assert.equal(businessResolved(r),true);
});
test('redaction masks known credentials and protocol bearer without logging profile data',()=>{
  const canary=['credential',randomUUID()].join('-'),r=new Redactor(canary),raw={body:'hello '+canary+' issus.bearer.'+canary,error:['first '+canary,'second']};
  const safe=r.value(raw);assert.equal(JSON.stringify(safe).includes(canary),false);assert.equal(JSON.stringify(safe).includes('issus.bearer.'),false);assert.equal(safe.error[1],'second');assert.equal(raw.body.includes(canary),true);
});
