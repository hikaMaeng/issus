import express from 'express';
import type {InboxService,DeliveryCommandService} from 'issus_domain/server';
import {coreAuthentication,coreHttpError} from '../auth/index.js';
import {endpoint,principal,object,submit,type CoreHttpOptions} from '../auth/context.js';
import {deliveryHttpOptions,installReceiptRoutes} from '../deliveries/receipts/index.js';
import {installApplicationRoutes} from '../deliveries/application/index.js';
import {installSubscriptionRoutes,type SubscriptionService} from '../subscriptions/index.js';

export interface DeliveryHttpServices {inbox:InboxService;deliveries:DeliveryCommandService;subscriptions:SubscriptionService}
/** Separate mount keeps P4-owned routes intact; install beside the core router in P1 entry. */
export function createDeliveryHttpRouter(o:CoreHttpOptions,s:DeliveryHttpServices):express.Router {
 const router=express.Router();router.use(express.json({limit:'64kb',strict:true}));router.use(['/v1/inbox','/v1/subscriptions','/v1/deliveries'],coreAuthentication(o));
 router.get('/v1/inbox',endpoint(async(req,res)=>{res.json(await s.inbox.read(principal(res),req.query));}));
 router.post('/v1/inbox/process',endpoint(async(req,res)=>{const x=object(req.body,['deliveryIds','disposition','evidenceCommentId','reason']);await submit(deliveryHttpOptions(o,s.deliveries),req,res,'issus.inbox.process',x);}));
 installSubscriptionRoutes(router,o,s.subscriptions);installReceiptRoutes(router,o,s.deliveries);installApplicationRoutes(router,o,s.deliveries);router.use(coreHttpError);return router;
}
export const createInboxHistoryReader=(inbox:InboxService):NonNullable<CoreHttpOptions['historyReader']>=>inbox.history.bind(inbox);
