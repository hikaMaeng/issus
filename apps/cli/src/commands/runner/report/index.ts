import {checkComment} from 'issus_domain/common';
import {mask} from '../redaction/index.js';
import type {Job} from '../state/index.js';
/** Construct the envelope locally, bound child text and retain the complete local result as evidence. */
export function reportBody(alias:string,sid:string,to:string,job:Job,metaPath:string,token?:string):string {
  const summary=Array.from(JSON.stringify(mask(job.result??job.reason??'결과 없음',token))).slice(0,2000).join('');
  const body=`FROM:${alias}/${sid} TO:${to} TYPE:REPORT STATE:${job.outcome??'blocked'} RE:${job.commentId}\n`+
    `runner ${job.outcome??'blocked'} · spawn=${job.spawnCount} · ${job.reason??'CLI terminal 완료'}\n`+
    '소유 path: 관리자 cwd와 배정에 명시된 허용 경계\n'+
    '실시 test: 자식 결과 아래 참조. 별도 호스트 수용 시험은 미실행\n'+
    '미검증/판단: CLI terminal과 실제 작업 수용 기준의 검증은 별개이며 최종 VERIFY 대기\n'+
    'NEXT: 검증 또는 새 DECISION 재배정\n---\n'+
    `근거: ${mask(metaPath.replaceAll('\\','/'),token)} · result.md\n결과 데이터(JSON 발췌): ${summary}`;
  const safeBody=mask(body,token),reasons=checkComment(safeBody);if(reasons.length) throw new Error('RUNNER_REPORT_INVALID: '+reasons.join('; '));return safeBody;
}
