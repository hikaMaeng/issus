import test from 'node:test';
import assert from 'node:assert/strict';
import {checkComment} from 'issus_domain/common';
import {liveCommentBody} from './runner-live-body.mjs';

test('live repeated fixture comments have unique bodies at the same clock tick',()=>{
 const body='FROM:issus-4-test/s1 TO:ALL TYPE:REPORT STATE:done\n시험 종료';
 const comments=Array.from({length:100},()=>liveCommentBody(body));
 assert.equal(new Set(comments).size,100);
 assert.ok(comments.every(c=>checkComment(c).length===0&&c.startsWith(body+'\n시험 nonce=')));
});

test('live COMPACT nonce leaves the fixed marker and compacted-by footer intact',()=>{
 const body='FROM:issus-4-test/s1 TO:ALL TYPE:COMPACT SEEN:10\n## ===== COMPACT #4 through 10 =====\n시험 종료\ncompacted-by:issus-4-test';
 const result=liveCommentBody(body);
 assert.equal(result.split('\n')[1],body.split('\n')[1]);
 assert.equal(result.split('\n').at(-1),'compacted-by:issus-4-test');
 assert.match(result,/시험 nonce=[0-9a-f-]+ at=\d{4}-/u);assert.deepEqual(checkComment(result),[]);
});
