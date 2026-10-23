import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {root,emitted,fakeCli,sleep} from './runner-fixtures.mjs';
const {startChild,processIdentity,nativeInvocation}=await import(emitted('process/index.js'));
const stamp=new Date().toISOString().replace(/[^0-9]/gu,'').slice(0,14),dir=join(root,'.cache/runner-implementation/host-'+stamp);await mkdir(dir,{recursive:true});
const executable=await fakeCli(join(dir,'fixture'));
const o={exec:'codex',executable,cwd:root,model:'gpt-6.1-sol',effort:'high',sandbox:'workspace-write',timeoutMs:10000};
const checks=[];
try {
 const echoDir=join(dir,'echo');await mkdir(echoDir,{recursive:true});const child=startChild(o,echoDir,'nonce=echo',process.env,'canary-token',async()=>undefined),echo=await child.result;
 checks.push({name:'native-echo',ok:echo.ok,exit:echo.exit,reason:echo.reason});assert.equal(echo.ok,true);
 const holdDir=join(dir,'hold');await mkdir(holdDir,{recursive:true});let identity;
 const long=startChild({...o,timeoutMs:30000},holdDir,'HOLD_TEST',process.env,undefined,async p=>{identity=p;});
 for(let i=0;i<100;i++) {if(identity&&((await readFile(join(holdDir,'transcript.log'),'utf8').catch(()=>''))).includes('GRANDCHILD_PID=')) break;await sleep(50);}
 assert.ok(identity,'native creation time captured');const transcript=await readFile(join(holdDir,'transcript.log'),'utf8'),grandchild=Number(/GRANDCHILD_PID=(\d+)/u.exec(transcript)?.[1]);assert.ok(grandchild);
 await long.stop('HOLD');const result=await long.result;assert.equal(result.held,true);assert.equal(result.stopped,true);assert.equal(await processIdentity(identity.pid,identity.executable,root),undefined);assert.equal(await processIdentity(grandchild,'node',root),undefined);
 checks.push({name:'HOLD-tree',ok:true,parent:identity.pid,grandchild,residual:0});
 const timeoutDir=join(dir,'timeout');await mkdir(timeoutDir,{recursive:true});const timeout=await startChild({...o,timeoutMs:1000},timeoutDir,'HOLD_TEST',process.env,undefined,async()=>undefined).result;assert.equal(timeout.timedOut,true);assert.equal(timeout.ok,false);checks.push({name:'timeout',ok:true});
 console.log(JSON.stringify({ok:true,checks,evidence:dir}));
} catch(e) {checks.push({name:'host-failure',ok:false,reason:e.code??e.message});console.error(JSON.stringify({ok:false,checks,evidence:dir}));process.exitCode=1;}
await writeFile(join(dir,'result.json'),JSON.stringify({checks},null,2)+'\n','utf8');
