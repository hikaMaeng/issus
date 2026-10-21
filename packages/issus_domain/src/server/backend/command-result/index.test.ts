import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,requestHash,requireIdempotencyKey,CoreError} from './index.js';

test('canonical payload fingerprints preserve bytes and all metadata',()=>{
  assert.equal(canonicalJson({z:{b:1,a:2},a:[2,1]}),'{"a":[2,1],"z":{"a":2,"b":1}}');
  assert.equal(requestHash('post',{body:'한글\r\n',sampledIds:['2','1']}),requestHash('post',{sampledIds:['2','1'],body:'한글\r\n'}));
  assert.notEqual(requestHash('post',{body:'한글\r\n'}),requestHash('post',{body:'한글\n'}));
  assert.notEqual(requestHash('post',{body:'a',compactedBy:'tt-1-alpha'}),requestHash('post',{body:'a',compactedBy:'tt-1-bravo'}));
});
test('write key must be a UUID and wire errors contain no stack',()=>{
  assert.throws(()=>requireIdempotencyKey('arbitrary'),(e:unknown)=>e instanceof CoreError&&e.status===400);
  const response=new CoreError(409,'IDEMPOTENCY_CONFLICT').response('r');assert.deepEqual(response,{error:{code:'IDEMPOTENCY_CONFLICT'},posted:false,requestId:'r'});
});
