import type express from 'express';
import {endpoint,principal,idempotency,object,send,type CoreHttpOptions} from '../auth/context.js';
import type {SubscriptionRequest} from 'issus_domain/common';
import type {SubscriptionService} from './service.js';
import {CoreError} from 'issus_domain/server';
export * from './service.js';
/** Lifecycle writes are authenticated by the same P4 router middleware. */
export function installSubscriptionRoutes(router:express.Router,_options:CoreHttpOptions,subscriptions:SubscriptionService):void {
 router.post('/v1/subscriptions',endpoint(async(req,res)=>{
  const input=object(req.body,['channels','from','repo','issues']);
  if(req.query.transport!==undefined&&!['sse','websocket'].includes(String(req.query.transport))) throw new CoreError(400,'INVALID_TRANSPORT');
  send(res,await subscriptions.open(principal(res),input as unknown as SubscriptionRequest,idempotency(req),req.query.transport==='sse'?'sse':'websocket'));
 }));
 router.delete('/v1/subscriptions/:id',endpoint(async(req,res)=>{send(res,await subscriptions.close(principal(res),String(req.params.id),idempotency(req)));}));
}
