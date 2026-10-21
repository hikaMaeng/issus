import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,unlink,writeFile,open,chmod} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {CliError} from '../../output/index.js';

/** Reads strict UTF-8 while preserving a BOM for the canonical validator to reject. */
export async function readUtf8(file:string):Promise<string> {
  try {
    const bytes=await readFile(file);
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  } catch {throw new CliError(2,`cannot read ${file}: UTF-8 파일을 읽을 수 없습니다`);}
}
export async function readJson<T>(file:string,fallback?:T):Promise<T> {
  try {return JSON.parse(await readUtf8(file)) as T;}
  catch(error) {
    try {await readFile(file);} catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT'&&fallback!==undefined) return fallback;}
    if(error instanceof CliError) throw error;
    throw new CliError(2,`invalid JSON file: ${file}`);
  }
}

/** Secret files keep a restrictive DACL on Windows; permission failure never prints the secret. */
async function restrict(file:string):Promise<void> {
  if(process.platform==='win32') {
    const user=process.env.USERNAME,domain=process.env.USERDOMAIN;
    if(!user) throw new CliError(2,'profile 권한을 설정할 사용자 정보가 없습니다');
    try {
      execFileSync('icacls.exe',[file,'/inheritance:r','/grant:r',`${domain?domain+'\\':''}${user}:(F)`,'/q'],{stdio:'ignore',windowsHide:true});
    } catch {throw new CliError(2,'profile 사용자 전용 권한 설정 실패');}
  } else await chmod(file,0o600);
}

/** Same-directory rename is the commit point; all generated text uses UTF-8(no BOM)/LF. */
export async function atomicWrite(file:string,text:string,secret=false):Promise<void> {
  file=resolve(file);await mkdir(dirname(file),{recursive:true});
  const temporary=`${file}.${randomUUID()}.tmp`;
  try {
    const normalized=text.replace(/\r\n/gu,'\n');
    await writeFile(temporary,secret?'':normalized,{encoding:'utf8',mode:0o600,flag:'wx'});
    if(secret) {await restrict(temporary);await writeFile(temporary,normalized,{encoding:'utf8',flag:'w'});}
    await rename(temporary,file);
  } catch(error) {
    await unlink(temporary).catch(()=>undefined);
    if(error instanceof CliError) throw error;
    throw new CliError(2,`cannot write ${file}`);
  }
}

/** Serializes local read/modify/rename operations without overwriting other scopes. */
export async function updateJson<T>(file:string,fallback:T,update:(value:T)=>T|Promise<T>,secret=false):Promise<T> {
  await mkdir(dirname(resolve(file)),{recursive:true});
  const lock=file+'.lock',deadline=Date.now()+5000;
  let handle:Awaited<ReturnType<typeof open>>|undefined;
  while(!handle) {
    try {handle=await open(lock,'wx',0o600);}
    catch(error) {
      if((error as NodeJS.ErrnoException).code!=='EEXIST'||Date.now()>=deadline) throw new CliError(2,`state lock unavailable: ${file}`);
      await new Promise(r=>setTimeout(r,25));
    }
  }
  try {
    const result=await update(await readJson(file,fallback));
    await atomicWrite(file,JSON.stringify(result,null,2)+'\n',secret);return result;
  } finally {await handle.close();await unlink(lock).catch(()=>undefined);}
}
