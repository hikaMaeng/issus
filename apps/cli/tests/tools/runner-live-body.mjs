import {randomUUID} from 'node:crypto';

/** Unique fixture comments preserve the COMPACT footer and never alter runner outbox bodies. */
export function liveCommentBody(body) {
 const nonce=`시험 nonce=${randomUUID()} at=${new Date().toISOString()}`;
 const lines=body.split('\n');
 if(lines.at(-1)?.startsWith('compacted-by:')) lines.splice(lines.length-1,0,nonce);
 else lines.push(nonce);
 return lines.join('\n');
}
