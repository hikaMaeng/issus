import type {Router} from 'express';
import type {SessionCreateRequest} from 'issus_domain/common';
import {endpoint,object,principal,param,idempotency,send,type CoreHttpOptions} from '../auth/context.js';

export function installSessionRoutes(router:Router,o:CoreHttpOptions):void {
  router.post('/v1/sessions',endpoint(async(req,res)=>{const x=object(req.body,['alias','sid','resumeFrom','reissueOf']);send(res,await o.auth.createSession(principal(res),x as SessionCreateRequest,idempotency(req)));}));
  router.delete('/v1/sessions/:id',endpoint(async(req,res)=>{send(res,await o.auth.revoke(principal(res),param(req,'id'),idempotency(req)));}));
}
