import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {writeFile,rename} from 'node:fs/promises';

/** Separate test Clock only: public production UoW/worker injection, no endpoint or TTL change. */
export function p9FixtureClock(file) {
  const value=()=>{const current=JSON.parse(readFileSync(file,'utf8'));assert.ok([0,60000,86401000].includes(current.offsetMs));return current;};
  return {
    now(){return new Date(Date.now()+value().offsetMs);},
    onAccepted(event){
      const current=value();
      if(current.advanceOnAcceptedMs&&typeof event.payload.body==='string'&&event.payload.body.includes('P9-22-worker-deadline')){
        assert.equal(event.action,'issus.comment.post');assert.equal(current.advanceOnAcceptedMs,60000);
        writeFileSync(file,'{"offsetMs":60000}\n','utf8');
      }
    },
  };
}

/** Atomic replacement prevents a reader from observing a partially written Clock fixture. */
export async function setP9Clock(file,value) {
  assert.ok(file,'p9-host.mjs separate Clock fixture required');assert.ok([0,60000,86401000].includes(value.offsetMs));
  const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value)+'\n','utf8');await rename(temporary,file);
}
