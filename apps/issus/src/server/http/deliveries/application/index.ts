import type express from 'express';
import type {DeliveryCommandService} from 'issus_domain/server';
import {endpoint,object,submit,type CoreHttpOptions} from '../../auth/context.js';
import {deliveryHttpOptions} from '../receipts/index.js';
/** Application evidence is validated again by the delivery worker transaction. */
export function installApplicationRoutes(router:express.Router,o:CoreHttpOptions,deliveries:DeliveryCommandService):void {
 router.post('/v1/deliveries/:id/application',endpoint(async(req,res)=>{const x=object(req.body,['evidenceCommentId','outcome','reason']);await submit(deliveryHttpOptions(o,deliveries),req,res,'issus.delivery.apply',{...x,deliveryId:String(req.params.id)});}));
}
