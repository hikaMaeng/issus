import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadProfile} from '../profiles/index.js';
import {harness,principal,apiError} from './helpers/index.js';

test('profile selection, URL/token env precedence and explicit bearer file',async()=>{
  const h=await harness(),file=join(h.directory,'profiles.json');
  await writeFile(file,JSON.stringify({version:1,active:'one',profiles:{one:{server:'https://one.example',token:'dummy-one'},two:{server:'https://two.example',token:'dummy-two'}}}));
  assert.equal((await loadProfile({profilesFile:file},{})).token,'dummy-one');
  assert.equal((await loadProfile({profilesFile:file,profile:'two'},{})).token,'dummy-two');
  await assert.rejects(()=>loadProfile({profilesFile:file},{ISSUS_URL:'https://other.example'}),/다른 서버/u);
  assert.equal((await loadProfile({profilesFile:file},{ISSUS_URL:'https://other.example',ISSUS_TOKEN:'dummy-env'})).token,'dummy-env');
  const bearer=join(h.directory,'explicit-dummy.txt');await writeFile(bearer,'dummy-explicit\n');
  assert.equal((await loadProfile({profilesFile:file,tokenFile:bearer},{ISSUS_TOKEN:'dummy-env'})).token,'dummy-explicit');
  await assert.rejects(()=>loadProfile({profilesFile:file},{ISSUS_TOKEN:'bad\nmultiline'}),/invalid token/u);
});

test('profile permission failure never writes secret contents or stdout fallback',async()=>{
  const h=await harness(),directory=join(h.directory,'a-directory');await mkdir(directory);
  // A directory as the destination is an unconditional file commit error on every supported OS.
  const secret='dummy-failed-save-value';
  const exit=await h.run(['auth','set','--server','https://example.com','--profiles-file',directory,'--token-stdin'],{stdin:async()=>secret});
  assert.equal(exit,2);assert.ok(!(h.stdout.join('')+h.stderr.join('')).includes(secret));
  const names=await readdir(h.directory);assert.ok(names.every(n=>!n.endsWith('.tmp')));
});

test('invalid JSON server response is a server error exit 2',async()=>{
  const h=await harness(async()=>new Response('not-json',{status:200})),file=join(h.directory,'valid.md');
  await writeFile(file,'FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\n검사.');
  assert.equal(await h.run(['post','--repo','hikaMaeng/issus','--issue','1','--body-file',file,'--dry-run']),2);assert.match(h.stderr.join(''),/INVALID_JSON_RESPONSE/u);
});
