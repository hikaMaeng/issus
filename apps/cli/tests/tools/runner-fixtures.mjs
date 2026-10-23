import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const root=resolve(fileURLToPath(new URL('../../../..',import.meta.url)));
export const emitted=relative=>pathToFileURL(join(root,'.cache/runner-implementation/emitted/commands/runner',relative));
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const iso=ms=>new Date(Date.now()+ms).toISOString().replace(/\.\d{3}Z$/u,'+00:00');

/** Deterministic native echo fixture. No LLM invocation or inherited bridge credentials. */
export async function fakeCli(directory) {
 await mkdir(directory,{recursive:true});
 const script=join(directory,'fake-cli.mjs');
 await writeFile(script,`import {writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const args=process.argv.slice(2);
if(args.includes('--version')) {console.log('runner-fake-cli 1.0.0');process.exit(0);}
let prompt='';for await(const chunk of process.stdin) prompt+=chunk;
if(args.includes('--prompt-file')) prompt=await readFile(args[args.indexOf('--prompt-file')+1],'utf8');
console.error('fake-cli argv '+JSON.stringify(args));
if(prompt.includes('HOLD_TEST')) {const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.error('GRANDCHILD_PID='+child.pid);await new Promise(r=>setTimeout(r,60000));}
const dataLine=prompt.split('BEGIN_UNTRUSTED_JSON_DATA\\n')[1]?.split('\\nEND_UNTRUSTED_JSON_DATA')[0];
const data=dataLine?JSON.parse(dataLine):{};
const text='fake echo 완료 nonce='+String(data.comment?.body?.match(/nonce=([a-z0-9-]+)/)?.[1]??'none');
const output=args.includes('-o')?args[args.indexOf('-o')+1]:undefined;
if(output) await writeFile(output,text,'utf8');
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));
console.log(JSON.stringify({type:'turn.completed'}));
`,'utf8');
 const shim=join(directory,process.platform==='win32'?'fake-cli.cmd':'fake-cli');
 await writeFile(shim,process.platform==='win32'?`@echo off\n"${process.execPath}" "${script}" %*\n`:`#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,{encoding:'utf8',mode:0o700});
 return shim;
}
