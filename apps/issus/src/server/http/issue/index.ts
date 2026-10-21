import type {Router} from 'express';
import {issueById,issueDiagnostics,readIssueListing} from 'issus_domain/server';
import {parseIssueBodyEnvelope} from 'issus_domain/common';
import {endpoint,object,principal,submit,repoId,param,revision,R,I,type CoreHttpOptions} from '../auth/context.js';

export function installIssueRoutes(router:Router,o:CoreHttpOptions):void {
  router.post(`${R}/issues`,endpoint(async(req,res)=>{const x=object(req.body,['title','body']);await submit(o,req,res,'issus.issue.open',{...x,repoId:await repoId(o,req,res)});}));
  router.get(`${R}/issues`,endpoint(async(req,res)=>{const id=await repoId(o,req,res);res.json(await o.intake.uow.read(tx=>readIssueListing(tx,principal(res),id,req.query)));}));
  router.get(I,endpoint(async(req,res)=>{const id=await repoId(o,req,res),p=principal(res);const data=await o.intake.uow.read(async tx=>{const issue=await issueById(tx,p,id,Number(param(req,'number')));return {issue:{repoId:id,number:issue.number,title:issue.title,state:issue.state,isOpen:issue.is_open,ownerAliasId:issue.owner_alias_id,replyIn:issue.reply_in,compactCommentId:issue.compact_comment_id,isBoard:issue.is_board,revision:issue.revision},body:issue.body,envelope:parseIssueBodyEnvelope(issue.body).envelope,revision:issue.revision,...await issueDiagnostics(tx,issue,p.kind==='session'?[p.alias.toLowerCase()]:[])};});res.setHeader('ETag',`"${data.revision}"`);res.json(data);}));
  router.patch(`${I}/body`,endpoint(async(req,res)=>{const x=object(req.body,['body']);await submit(o,req,res,'issus.issue.body.edit',{...x,repoId:await repoId(o,req,res),issueNumber:Number(param(req,'number')),expectedRevision:revision(req)});}));
  router.post(`${I}/close`,endpoint(async(req,res)=>{const x=object(req.body,['reason','finalReportId']);await submit(o,req,res,'issus.issue.close',{...x,repoId:await repoId(o,req,res),issueNumber:Number(param(req,'number')),expectedRevision:revision(req)});}));
  router.post(`${I}/reopen`,endpoint(async(req,res)=>{const x=object(req.body,['reason','state']);await submit(o,req,res,'issus.issue.reopen',{...x,repoId:await repoId(o,req,res),issueNumber:Number(param(req,'number')),expectedRevision:revision(req)});}));
}
