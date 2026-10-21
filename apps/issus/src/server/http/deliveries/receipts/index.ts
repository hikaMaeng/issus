import type express from 'express';
import type {DeliveryCommandService,IntakeService} from 'issus_domain/server';
import {endpoint,object,submit,type CoreHttpOptions} from '../../auth/context.js';
/** Reuse P4 authentication/submission/wait/result handling with the delivery admission implementation. */
export function deliveryHttpOptions(o:CoreHttpOptions,deliveries:DeliveryCommandService):CoreHttpOptions {
 const facade=Object.create(o.intake) as IntakeService;facade.submit=deliveries.submit.bind(deliveries);return {...o,intake:facade};
}
export function installReceiptRoutes(router:express.Router,o:CoreHttpOptions,deliveries:DeliveryCommandService):void {
 router.post('/v1/deliveries/receipts',endpoint(async(req,res)=>{const x=object(req.body,['deliveryIds','attempts','subscriptionId']);await submit(deliveryHttpOptions(o,deliveries),req,res,'issus.delivery.receive',x);}));
}
