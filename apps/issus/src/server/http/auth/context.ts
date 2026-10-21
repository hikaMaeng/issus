import type {Request,Response,RequestHandler} from 'express';
import type {CommandAction} from 'issus_domain/common';
import {CoreError,requireIdempotencyKey,type CorePrincipal,type IntakeService,type HttpResult,type EventTransaction} from 'issus_domain/server';
import type {RuntimeAuth,createHealth} from 'issus_runtime/server';

export interface CoreHttpOptions {intake:IntakeService;auth:RuntimeAuth;origin:string;health?:ReturnType<typeof createHealth>;historyReader?:(tx:EventTransaction,p:CorePrincipal,repoId:string,number:number,query:Record<string,unknown>)=>Promise<Record<string,unknown>>}
export const principal=(res:Response):CorePrincipal=>res.locals.corePrincipal as CorePrincipal;
export const param=(req:Request,name:string):string=>{const value=String(req.params[name]);if(name==='number'&&(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))) throw new CoreError(400,'INVALID_PARAMETER');return value;};
export function object(input:unknown,keys:readonly string[]):Record<string,any> {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new CoreError(400,'INVALID_SHAPE');const value=input as Record<string,unknown>;
  const unknown=Object.keys(value).filter(k=>!keys.includes(k));if(unknown.length) throw new CoreError(422,'VALIDATION_FAILED',unknown.map(k=>({code:'UNKNOWN_KEY',path:k,message:`허용하지 않는 요청 키 ${k}`})));return value;
}
export function revision(req:Request):number {
  const raw=req.header('if-match');if(!raw) throw new CoreError(428,'IF_MATCH_REQUIRED');
  if(!/^(?:"[1-9]\d*"|[1-9]\d*)$/.test(raw)) throw new CoreError(400,'INVALID_IF_MATCH');return Number(raw.replace(/"/g,''));
}
export const idempotency=(req:Request):string=>requireIdempotencyKey(req.header('idempotency-key'));
export const endpoint=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
export function page(req:Request):{limit:number;cursor:number} {
  const limit=req.query.limit===undefined?100:Number(req.query.limit),cursor=req.query.cursor===undefined?0:Number(req.query.cursor);
  if(!Number.isSafeInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(cursor)||cursor<0) throw new CoreError(400,'INVALID_PAGINATION');return {limit,cursor};
}
export async function lookupRepo(tx:EventTransaction,p:CorePrincipal,req:Request):Promise<Record<string,any>> {
  const row=(await tx.client.query(`SELECT r.*,o.name AS owner FROM ${tx.table('repo')} r JOIN ${tx.table('owner')} o ON o.id=r.owner_id WHERE lower(o.name)=lower($1) AND r.slug=$2 AND r.owner_id=$3`,[param(req,'owner'),param(req,'repo'),p.ownerId])).rows[0];if(!row) throw new CoreError(404,'NOT_FOUND');return row;
}
export async function repoId(options:CoreHttpOptions,req:Request,res:Response):Promise<string> {return options.intake.uow.read(async tx=>(await lookupRepo(tx,principal(res),req)).id);}
/** Alias writes complete in the request transaction; queued actions retain the §7 Prefer/operation contract. */
export async function submit(options:CoreHttpOptions,req:Request,res:Response,action:CommandAction,payload:Record<string,unknown>):Promise<void> {
  const command={principal:principal(res),action,payload,idempotencyKey:idempotency(req)};
  let result=await (action==='issus.alias.register'||action==='issus.alias.rename'?options.intake.execute(command):options.intake.submit(command));
  if(result.httpStatus===202&&/(?:^|[,;\s])wait=5(?:$|[,;\s])/.test(req.header('prefer')??'')) {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      const operation=await options.intake.operation(principal(res),String(result.response.operationId));
      if(typeof operation.httpStatus==='number') {result={httpStatus:operation.httpStatus,response:operation.response as Record<string,unknown>};break;}
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }
  send(res,result);
}
export function send(res:Response,result:HttpResult):void {res.status(result.httpStatus).json(result.response);}
export const R='/v1/repos/:owner/:repo',I=`${R}/issues/:number`;
