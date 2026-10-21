import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRuntimeConfig} from './index.js';

const required={DATABASE_URL:'postgresql://issus@127.0.0.1:15440/issus',ISSUS_OWNER:'tester',ISSUS_BOOTSTRAP_TOKEN_FILE:'C:/runtime/bootstrap',ISSUS_ORIGIN:'http://127.0.0.1:18140',PORT:'18140'};
test('DATABASE_URL and listener bounds are mandatory',()=>{
  const {DATABASE_URL:_,...missing}=required;assert.throws(()=>parseRuntimeConfig(missing));assert.throws(()=>parseRuntimeConfig({...required,PORT:9999}));
  const config=parseRuntimeConfig(required);assert.equal(config.PORT,18140);assert.equal(config.ISSUS_SESSION_TTL_SECONDS,86400);
});
