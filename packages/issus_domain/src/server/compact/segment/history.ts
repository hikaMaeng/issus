import {readIssueHistory,commentById,commentView,type CorePrincipal,type EventTransaction} from '../../backend/index.js';

/** P4 snapshot pagination, with its native COMPACT boundary kept separate from compact statistics. */
export async function readCompactHistory(tx:EventTransaction,p:CorePrincipal,repoId:string,number:number,query:Record<string,unknown>):Promise<Record<string,unknown>> {
  const result=await readIssueHistory(tx,p,repoId,number,query);
  const status=result.compact as {previousCompactId?:string|null}|undefined;
  const boundary=status?.previousCompactId;
  return {...result,compactStatus:result.compact,compact:boundary?commentView(await commentById(tx,p,boundary)):null};
}
