import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {CoreError} from 'issus_domain/server';
import {corePrincipal} from 'issus_runtime/server';
import {endpoint,object,principal,idempotency,type CoreHttpOptions} from './context.js';
import {installRepoRoutes} from '../repo/index.js';
import {installIssueRoutes} from '../issue/index.js';
import {installCommentRoutes} from '../comment/index.js';
import {installSyntaxRoutes,installPreflightRoutes} from '../validate/index.js';
import {installAliasRoutes} from '../alias/index.js';
import {installSessionRoutes} from '../session/index.js';
import {installBoardRoutes} from '../board/index.js';
import {installHandoffRoutes} from '../handoff/index.js';
import {installOperationRoutes} from '../operations/index.js';
export * from './context.js';

const cookie=(header:string|undefined):string|undefined=>{const value=header?.split(';').map(s=>s.trim()).find(s=>s.startsWith('issus_session='))?.slice('issus_session='.length);if(!value) return undefined;try{return decodeURIComponent(value);}catch{return undefined;}};
const logDependencyFailure=(event:string,error:unknown,token?:string):void=>{
  const cause=(error&&typeof error==='object'?error:{message:typeof error==='string'?error:undefined}) as {name?:string;code?:string;message?:string;routine?:string};
  const raw=String(cause.message??'dependency failed');
  const message=(token?raw.split(token).join('[REDACTED]'):raw).replace(/(?:postgres(?:ql)?:\/\/|Bearer\s+)\S+/gi,'[REDACTED]').replace(/\b[A-Za-z0-9_-]{40,}\b/g,'[REDACTED]').slice(0,300);
  console.error(JSON.stringify({event,name:cause.name,code:cause.code,message,routine:cause.routine}));
};
/** Read-only authentication. Cookie writes additionally require exact origin and a per-cookie CSRF proof. */
export function coreAuthentication(o:CoreHttpOptions):RequestHandler {
  return (req,res,next)=>{(async()=>{
    if(req.query.token||req.query.access_token) throw new CoreError(400,'QUERY_TOKEN_FORBIDDEN');
    const bearer=req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1],browser=cookie(req.header('cookie')),token=bearer??browser;
    if(!token) throw new CoreError(401,'UNAUTHENTICATED');
    let verified;try{verified=await o.auth.verify(token);}catch(error){if(error instanceof CoreError&&error.status===401) throw error;
      logDependencyFailure('auth.verify.failed',error,token);
      throw new CoreError(503,'SERVICE_UNAVAILABLE');}
    if(!bearer&&browser&&!['GET','HEAD','OPTIONS'].includes(req.method)) {if(req.header('origin')!==o.origin) throw new CoreError(403,'ORIGIN_FORBIDDEN');await o.auth.verifyCsrf(browser,req.header('x-csrf-token')??'',o.origin);}
    res.locals.corePrincipal=corePrincipal(verified);res.locals.runtimePrincipal=verified;
  })().then(()=>next()).catch(next);};
}
/** Install before static fallback via createEventBroker.extendHttp. Entry composition stays with P1. */
export function createCoreHttpRouter(o:CoreHttpOptions):express.Router {
  const router=express.Router();router.use(express.json({limit:'64kb',strict:true}));
  router.get('/health',(_req,res)=>res.json(o.health?.live()??{ok:true,service:'issus'}));
  router.get('/ready',endpoint(async(_req,res)=>{const ready=await o.health?.ready()??{ok:false,checks:{initialized:false}};res.status(ready.ok?200:503).json(ready);}));
  installSyntaxRoutes(router);
  router.use('/v1',coreAuthentication(o));
  router.get('/v1/auth/me',(req,res)=>res.json({...res.locals.runtimePrincipal}));
  router.post('/v1/auth/browser-session',endpoint(async(req,res)=>{
    object(req.body??{},[]);
    if(req.header('origin')!==o.origin) throw new CoreError(403,'ORIGIN_FORBIDDEN');
    const url=new URL(o.origin);if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new CoreError(403,'INSECURE_COOKIE_ORIGIN');
    const bearer=req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!bearer) throw new CoreError(401,'SESSION_BEARER_REQUIRED');
    const result=await o.auth.browserSession(principal(res),o.origin,idempotency(req),bearer);
    const now=o.intake.uow.options.clock?.now()??new Date();
    if(result.cookieToken) res.cookie('issus_session',result.cookieToken,{httpOnly:true,sameSite:'strict',secure:url.protocol==='https:',path:'/',expires:new Date(now.getTime()+86400000)});res.status(result.httpStatus).json(result.response);
  }));
  installRepoRoutes(router,o);installIssueRoutes(router,o);installCommentRoutes(router,o);installPreflightRoutes(router,o);installAliasRoutes(router,o);installSessionRoutes(router,o);installBoardRoutes(router,o);installHandoffRoutes(router,o);installOperationRoutes(router,o);
  router.use(coreHttpError);return router;
}
export const coreHttpError:ErrorRequestHandler=(error,req,res,_next)=>{
  if(error instanceof CoreError) {res.status(error.status).json(error.response());return;}
  const kind=error as {type?:string;code?:string};const status=kind.type==='entity.too.large'?413:kind.type==='entity.parse.failed'||['22P02','22003'].includes(kind.code??'')?400:503;
  if(status===503) logDependencyFailure('core.http.failed',error,req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1]??cookie(req.header('cookie')));
  res.status(status).json(new CoreError(status,status===413?'BODY_TOO_LARGE':status===400?'INVALID_JSON':'SERVICE_UNAVAILABLE').response());
};
/** A real listening Express target for P4 tests, independent of the P1 production entry. */
export function createCoreTestApp(o:CoreHttpOptions):express.Express {const app=express();app.disable('x-powered-by');app.use(createCoreHttpRouter(o));return app;}
