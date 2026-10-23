import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {loadConfig,parseOptions} from './index.js';

async function setup(t:test.TestContext){
  const dir=await mkdtemp(join(tmpdir(),'issus-mcp-config-'));
  t.after(async()=>{const p=resolve(dir),base=resolve(tmpdir())+sep;if(!p.startsWith(base)||!p.slice(base.length).startsWith('issus-mcp-config-'))throw new Error('cleanup scope');await rm(p,{recursive:true,force:true});});
  const token=['config-canary',randomUUID()].join('-');
  return {dir,token,env:{ISSUS_CONFIG_DIR:dir,ISSUS_URL:'https://example.invalid/',ISSUS_TOKEN:token,ISSUS_REPO:'sample/test',ISSUS_ISSUES:'4,5,4',ISSUS_BOARDS:'2,2'}};
}
test('config validates and normalizes env without creating any credential files',async t=>{
  const {dir,token,env}=await setup(t),c=await loadConfig(env);
  assert.equal(c.server,'https://example.invalid');assert.equal(c.token,token);assert.deepEqual(c.issues,[4,5]);assert.deepEqual(c.boards,[2]);assert.equal(c.pollMs,1000);assert.deepEqual(await readdir(dir),[]);
});
test('config startup flags reject duplicates, unknown flags and relative state/profile paths',()=>{
  assert.throws(()=>parseOptions(['--token','not-an-option']),/BRIDGE_INVALID_OPTION/u);
  assert.throws(()=>parseOptions(['--profile','a','--profile','b']),/BRIDGE_INVALID_OPTION/u);
  assert.throws(()=>parseOptions(['--state-dir','relative']),/BRIDGE_ABSOLUTE_PATH_REQUIRED/u);
  assert.throws(()=>parseOptions(['--profiles-file','relative']),/BRIDGE_ABSOLUTE_PATH_REQUIRED/u);
});
test('config binds stored credentials to exact normalized server; env token explicitly overrides',async t=>{
  const {dir,token,env}=await setup(t),file=join(dir,'profiles.json');
  await writeFile(file,JSON.stringify({version:1,active:'test',profiles:{test:{server:'https://old.invalid/',token}}})+'\n','utf8');
  const {ISSUS_TOKEN:omit,...withoutToken}=env;
  await assert.rejects(loadConfig({...withoutToken,ISSUS_PROFILES_FILE:file}),error=>error instanceof Error&&error.message==='BRIDGE_PROFILE_SERVER_MISMATCH'&&!error.message.includes(token));
  assert.equal((await loadConfig({...env,ISSUS_PROFILES_FILE:file})).token,token);
  assert.equal((await loadConfig({...withoutToken,ISSUS_URL:'https://old.invalid',ISSUS_PROFILES_FILE:file})).token,token);
});
test('config rejects invalid scope, newline token, credential URL and poll bounds',async t=>{
  const {env}=await setup(t);
  for(const [key,value] of [['ISSUS_ISSUES',''],['ISSUS_ISSUES','0'],['ISSUS_ISSUES','4,'],['ISSUS_ISSUES','9007199254740992'],['ISSUS_TOKEN','line\nbreak'],['ISSUS_URL','https://user:pass@example.invalid'],['ISSUS_REPO','missing-slash'],['ISSUS_POLL_MS','249'],['ISSUS_POLL_MS','10001'],['ISSUS_POLL_MS','NaN'],['ISSUS_BRIDGE_STATE_DIR','relative']])await assert.rejects(loadConfig({...env,[key]:value}));
});
test('config honors explicit profile file and compatibility server environment',async t=>{
  const {dir,token,env}=await setup(t),file=join(dir,'alternate.json');
  await writeFile(file,JSON.stringify({version:1,active:'unused',profiles:{chosen:{server:'https://example.invalid/',token}}}),'utf8');
  const c=await loadConfig({ISSUS_CONFIG_DIR:dir,ISSUS_SERVER_URL:'https://example.invalid',ISSUS_REPO:'sample/test',ISSUS_ISSUES:'4'},{profile:'chosen',profilesFile:file,stateDir:dir});
  assert.equal(c.token,token);assert.equal(c.stateDir,dir);assert.equal(c.server,env.ISSUS_URL.slice(0,-1));
});
