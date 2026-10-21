import type {Router} from 'express';
import {commentById,CoreError} from 'issus_domain/server';
import {endpoint,object,principal,param,repoId,submit,I,type CoreHttpOptions} from '../auth/context.js';

export function installHandoffRoutes(router:Router,o:CoreHttpOptions):void {
  for(const phase of ['accept','complete'] as const) router.post(`${I}/handoffs/:commentId/${phase}`,endpoint(async(req,res)=>{
    const id=await repoId(o,req,res),commentId=param(req,'commentId');await o.intake.uow.read(async tx=>{const c=await commentById(tx,principal(res),commentId);if(c.repo_id!==id||c.issue_number!==Number(param(req,'number'))) throw new CoreError(404,'NOT_FOUND');});
    const x=object(req.body,phase==='accept'?['ackCommentId']:['expectedRevision']);await submit(o,req,res,phase==='accept'?'issus.handoff.accept':'issus.handoff.complete',{...x,handoffId:commentId});
  }));
}
