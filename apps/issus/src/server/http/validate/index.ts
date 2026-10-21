import type {Router} from 'express';
import {charCount,checkComment,checkIssueBody,parseEnvelope,splitlines,parseIssueBodyEnvelope} from 'issus_domain/common';
import {CoreError,validation} from 'issus_domain/server';
import {endpoint,object,principal,repoId,param,revision,I,type CoreHttpOptions} from '../auth/context.js';

/** Syntax endpoint never consults a database, principal or clock. */
export function installSyntaxRoutes(router:Router):void {
  router.post('/v1/validate',endpoint(async(req,res)=>{const x=object(req.body,['mode','body']);if(!['comment','issue-body'].includes(x.mode)||typeof x.body!=='string') throw new CoreError(400,'INVALID_SHAPE');validation(x.mode==='comment'?checkComment(x.body):checkIssueBody(x.body));res.json({valid:true,chars:charCount(x.body),envelope:x.mode==='comment'?parseEnvelope(splitlines(x.body)[0]):parseIssueBodyEnvelope(x.body).envelope});}));
}
export function installPreflightRoutes(router:Router,o:CoreHttpOptions):void {
  router.post(`${I}/preflight`,endpoint(async(req,res)=>{const x=object(req.body,['mode','request']);res.json(await o.intake.preflight(principal(res),await repoId(o,req,res),Number(param(req,'number')),x,x.mode==='issue-body'?revision(req):undefined));}));
}
