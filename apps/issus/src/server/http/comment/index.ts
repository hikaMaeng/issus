import type {Router} from 'express';
import {CoreError,authorizeRepo,readIssueHistory,commentById,commentView} from 'issus_domain/server';
import {endpoint,object,principal,submit,repoId,param,page,R,I,type CoreHttpOptions} from '../auth/context.js';

export function installCommentRoutes(router:Router,o:CoreHttpOptions):void {
  router.post(`${I}/comments`,endpoint(async(req,res)=>{const x=object(req.body,['body','compactPacketToken','sampledIds','compactedBy','compactDeferredReason']);await submit(o,req,res,'issus.comment.post',{...x,repoId:await repoId(o,req,res),issueNumber:Number(param(req,'number'))});}));
  router.get(`${I}/comments`,endpoint(async(req,res)=>{const id=await repoId(o,req,res),p=principal(res),n=Number(param(req,'number'));
    res.json(await o.intake.uow.snapshot(tx=>(o.historyReader??readIssueHistory)(tx,p,id,n,req.query as Record<string,unknown>)));
  }));
  router.get(`${R}/comments/:id`,endpoint(async(req,res)=>{const id=await repoId(o,req,res),p=principal(res);res.json(await o.intake.uow.read(async tx=>{await authorizeRepo(tx,p,id);let c;try{c=await commentById(tx,p,param(req,'id'));}catch(error){if(error instanceof CoreError) throw new CoreError(404,'NOT_FOUND');throw error;}if(c.repo_id!==id) throw new CoreError(404,'NOT_FOUND');return commentView(c);}));}));
}
