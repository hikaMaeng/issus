import type {Router} from 'express';
import {CoreError,issueById,resolveIssueRef} from 'issus_domain/server';
import {endpoint,object,principal,repoId,submit,R,type CoreHttpOptions} from '../auth/context.js';

export function installBoardRoutes(router:Router,o:CoreHttpOptions):void {
  router.get(`${R}/board`,endpoint(async(req,res)=>{const id=await repoId(o,req,res),p=principal(res);res.json(await o.intake.uow.read(async tx=>{const repo=(await tx.client.query(`SELECT board_issue_id FROM ${tx.table('repo')} WHERE id=$1`,[id])).rows[0];if(!repo.board_issue_id) throw new CoreError(404,'BOARD_NOT_FOUND');const board=await issueById(tx,p,id,repo.board_issue_id);const evidence:unknown[]=[{via:'registry',number:board.number}];for(const [key,raw] of [['userBoard',req.query.userBoard],['issue',req.query.issue]] as const) if(raw!==undefined){let n=Number(raw);if(key==='issue'){const source=await issueById(tx,p,id,n);const pointer=/\bBOARD:(\S+)/.exec(source.body.split('\n')[0]);if(!pointer) continue;n=(await resolveIssueRef(tx,p,id,pointer[1])).number;}evidence.push({via:key,number:n});if(n!==board.number) throw new CoreError(409,'BOARD_CONFLICT',undefined,{evidence});}if(!board.is_open) throw new CoreError(409,'BOARD_UNAVAILABLE');return {number:board.number,state:'open',via:'registry',evidence};}));}));
  router.post(`${R}/board/ensure`,endpoint(async(req,res)=>{const x=object(req.body,['boardOwner','body']);await submit(o,req,res,'issus.board.ensure',{...x,repoId:await repoId(o,req,res)});}));
}
