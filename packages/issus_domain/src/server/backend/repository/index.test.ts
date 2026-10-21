import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteBody,splitBodyHeader,type IssueRow} from './index.js';
import {checkIssueBody} from '../../../common/index.js';

test('system header updates preserve Python line separators and free body bytes',()=>{
  const tail='\u2028GOAL: 한글 원문\r\n  공백 보존\n';
  const issue={body:'STATE:running\tOWNER:tt-1-alpha  UPDATED:2026-10-21T04:00:00+00:00'+tail} as IssueRow;
  assert.deepEqual(splitBodyHeader(issue.body),{line:'STATE:running\tOWNER:tt-1-alpha  UPDATED:2026-10-21T04:00:00+00:00',tail});
  const updated=rewriteBody(issue,{compact:'1000001'},new Date('2026-10-21T04:30:00Z'));
  assert.equal(splitBodyHeader(updated).tail,tail);assert.match(updated,/UPDATED:2026-10-21T04:30:00\+00:00 COMPACT:1000001/);assert.deepEqual(checkIssueBody(updated),[]);
});
