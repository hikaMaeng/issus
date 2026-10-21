import test from 'node:test';
import assert from 'node:assert/strict';
import {disabledWakeAdapter,createWebhookAdapter,createCommandAdapter,createClaudeRemoteTriggerAdapter} from './index.js';
const input={deliveryId:'delivery',alias:'p5-1-reader',attempt:1,idempotencyKey:'attempt-1'};
test('disabled and unconfigured RemoteTrigger do not invoke external services',async()=>{
 assert.deepEqual(await disabledWakeAdapter.wake(input,new AbortController().signal),{accepted:false});
 assert.deepEqual(await createClaudeRemoteTriggerAdapter().wake(input,new AbortController().signal),{accepted:false});
});
test('webhook has fixed allowlist, no redirects, bounded signal and idempotency',async()=>{
 assert.throws(()=>createWebhookAdapter({endpoints:{'p5-1-reader':'https://unlisted.invalid/'},allowedOrigins:[]}),/not allowed/);
 let calls=0;
 const adapter=createWebhookAdapter({endpoints:{'p5-1-reader':'https://fixed.invalid/wake'},allowedOrigins:['https://fixed.invalid'],fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://fixed.invalid/wake');assert.equal(options?.redirect,'error');assert.ok(options?.signal);assert.equal((options?.headers as Record<string,string>)['idempotency-key'],input.idempotencyKey);assert.deepEqual(JSON.parse(String(options?.body)),input);return new Response('',{status:202});
 }});
 assert.deepEqual(await adapter.wake(input,new AbortController().signal),{accepted:true});assert.equal(calls,1);
 assert.deepEqual(await adapter.wake({...input,alias:'other'},new AbortController().signal),{accepted:false});assert.equal(calls,1);
});
test('command accepts only absolute administrator executables and unknown aliases stay off',async()=>{
 assert.throws(()=>createCommandAdapter({'p5-1-reader':{executable:'relative.cmd',args:[]}}),/absolute/);
 assert.deepEqual(await createCommandAdapter({}).wake(input,new AbortController().signal),{accepted:false});
});
