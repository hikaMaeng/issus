import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

type HttpResult={status:number;body:any};

/** Observe only §7 queue-backed POST commands; synchronous APIs must complete immediately. */
export async function completeQueuedWrite(path:string,method:string,accepted:HttpResult,
 read:(statusUrl:string,signal:AbortSignal)=>Promise<HttpResult>,timeoutMs=15000):Promise<HttpResult> {
 if(accepted.status!==202) return accepted;
 const parts=path.split('/');
 const issue=parts.length===8&&parts[1]==='v1'&&parts[2]==='repos'&&parts[5]==='issues';
 const allowed=method==='POST'&&(path==='/v1/repos'
  ||(parts.length===6&&parts[1]==='v1'&&parts[2]==='repos'&&parts[5]==='issues')
  ||(issue&&['comments','close','reopen'].includes(parts[7]!))
  ||path==='/v1/deliveries/receipts'
  ||(parts.length===5&&parts[1]==='v1'&&parts[2]==='deliveries'&&parts[4]==='application'));
 assert.ok(allowed,`design §7 requires synchronous completion: ${method} ${path} returned 202`);
 const {operationId,status,statusUrl,posted}=accepted.body;
 assert.match(operationId,/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
 assert.equal(status,'queued');assert.equal(posted,null);
 assert.equal(statusUrl,`/v1/operations/${operationId}`);
 const deadline=performance.now()+Math.min(timeoutMs,15000);
 for(;;) {
  const remaining=deadline-performance.now();
  assert.ok(remaining>0,`queued command timed out: ${method} ${path} operation ${operationId}`);
  const signal=AbortSignal.timeout(Math.max(1,Math.ceil(remaining)));
  let operation:HttpResult;
  try {operation=await read(statusUrl,signal);}catch(error) {
   if(signal.aborted) throw new Error(`queued command timed out: ${method} ${path} operation ${operationId}`,{cause:error});
   throw error;
  }
  assert.equal(operation.status,200,`operation read failed: ${statusUrl}`);
  assert.equal(operation.body.operationId,operationId);
  if(typeof operation.body.httpStatus==='number') {
   assert.notEqual(operation.body.httpStatus,202,'operation must contain a final domain status');
   return {status:operation.body.httpStatus,body:operation.body.response};
  }
  await delay(Math.max(0,Math.min(20,deadline-performance.now())));
 }
}
