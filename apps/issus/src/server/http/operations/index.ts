import type {Router} from 'express';
import {endpoint,principal,param,type CoreHttpOptions} from '../auth/context.js';
export function installOperationRoutes(router:Router,o:CoreHttpOptions):void {router.get('/v1/operations/:id',endpoint(async(req,res)=>{res.json(await o.intake.operation(principal(res),param(req,'id')));}));}
