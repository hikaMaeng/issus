import test from 'node:test';
import assert from 'node:assert/strict';
import type {Request,Response} from 'express';
import {CoreError} from 'issus_domain/server';
import {coreAuthentication,coreHttpError,type CoreHttpOptions} from './index.js';

test('authentication keeps invalid credentials 401 and logs redacted dependency causes for 503',async()=>{
  const token='one-use-fixture-credential',credential='postgresql://user:password@localhost/db';
  const logs:string[]=[],original=console.error;
  console.error=(value:unknown)=>{logs.push(String(value));};
  const invoke=(error:unknown)=>new Promise<unknown>(resolve=>{
    const options={auth:{verify:async()=>{throw error;}}} as unknown as CoreHttpOptions;
    const req={query:{},method:'GET',header:(name:string)=>name==='authorization'?`Bearer ${token}`:undefined} as Request;
    coreAuthentication(options)(req,{locals:{}} as Response,resolve);
  });
  try {
    const invalid=new CoreError(401,'UNAUTHENTICATED');assert.equal(await invoke(invalid),invalid);assert.equal(logs.length,0);
    const cause=Object.assign(new Error(`relation "isolated.bootstrap_auth" does not exist; ${token}; ${credential}`),{code:'42P01',detail:'must not log SQL detail',query:'must not log SQL query'});
    const unavailable=await invoke(cause);assert.ok(unavailable instanceof CoreError);assert.equal(unavailable.status,503);
    assert.equal(logs.length,1);const diagnostic=JSON.parse(logs[0]);
    assert.equal(diagnostic.event,'auth.verify.failed');assert.equal(diagnostic.code,'42P01');
    assert.match(diagnostic.message,/relation "isolated.bootstrap_auth" does not exist/);
    assert.ok(!logs[0].includes(token));assert.ok(!logs[0].includes(credential));assert.ok(!logs[0].includes('password'));
    assert.ok(!logs[0].includes('must not log'));assert.equal(diagnostic.stack,undefined);
    assert.equal(JSON.stringify(unavailable.response()).includes('isolated'),false);
    assert.equal((await invoke(null) as CoreError).status,503);
    let status=0,body:unknown;
    const req={header:(name:string)=>name==='authorization'?`Bearer ${token}`:undefined} as Request;
    const res={status:(value:number)=>{status=value;return res;},json:(value:unknown)=>{body=value;return res;}} as Response;
    coreHttpError(cause,req,res,()=>{});
    assert.equal(status,503);assert.equal(JSON.parse(logs.at(-1)!).event,'core.http.failed');
    assert.ok(!JSON.stringify(body).includes('isolated'));assert.ok(!logs.at(-1)!.includes(token));
  } finally {console.error=original;}
});
