import type {EventTransaction} from '../event-uow/index.js';
import {authorizeRepo,type CorePrincipal} from '../authorization/index.js';
import {CoreError,requestHash} from '../command-result/index.js';

type Query=Record<string,unknown>;
interface Page<T> {items:T[];nextCursor:string|null}
export interface AliasRegistryItem {
  id:string;name:string;role:string;model:string;scope:string;sid:string|null;repos:string[];
  registeredAt:Date;renamedFrom:string[];status:'active'|'renamed';renamedTo:string|null;
}
interface ListingOptions {limit:number;cursor?:string;q:string}
interface IssueOptions extends ListingOptions {owner?:string;alias?:string;state:'open'|'closed'|'all';sort:'number'|'created'|'updated';order:'asc'|'desc'}

/** Strict query parsing keeps unsupported filters visible instead of silently ignoring them. */
function textQuery(query:Query,allowed:readonly string[]):Record<string,string> {
  const result:Record<string,string>={};
  for(const [key,value] of Object.entries(query)) {
    if(!allowed.includes(key)) invalid(key,`허용하지 않는 조회 키 ${key}`,'UNKNOWN_QUERY');
    if(typeof value!=='string') invalid(key,`조회 키 ${key}는 단일 문자열이어야 합니다`);
    result[key]=value as string;
  }
  return result;
}
function invalid(path:string,message:string,code='INVALID_QUERY'):never {
  throw new CoreError(400,code,[{code,path:`query.${path}`,message}]);
}
function listing(query:Record<string,string>):ListingOptions {
  if(query.limit!==undefined&&(!/^[1-9]\d*$/.test(query.limit)||Number(query.limit)>500)) invalid('limit','limit은 1–500 정수여야 합니다');
  if(query.cursor!==undefined&&(!query.cursor||query.cursor.length>2048)) invalid('cursor','cursor 형식이 올바르지 않습니다');
  if((query.q?.length??0)>200) invalid('q','q는 200자 이하여야 합니다');
  return {limit:query.limit===undefined?100:Number(query.limit),cursor:query.cursor,q:query.q??''};
}
function issueOptions(query:Query):IssueOptions {
  const raw=textQuery(query,['limit','cursor','q','owner','alias','state','sort','order']),base=listing(raw);
  if(raw.state!==undefined&&!['open','closed','all'].includes(raw.state)) invalid('state','state는 open, closed, all 중 하나여야 합니다');
  if(raw.sort!==undefined&&!['number','created','updated'].includes(raw.sort)) invalid('sort','sort는 updated, created, number 중 하나여야 합니다');
  if(raw.order!==undefined&&!['asc','desc'].includes(raw.order)) invalid('order','order는 asc, desc 중 하나여야 합니다');
  for(const key of ['owner','alias']) if(raw[key]!==undefined&&(!raw[key]||raw[key].length>24)) invalid(key,`${key}는 1–24자 별칭이어야 합니다`);
  return {...base,owner:raw.owner?.toLowerCase(),alias:raw.alias?.toLowerCase(),state:(raw.state??'open') as IssueOptions['state'],sort:(raw.sort??'number') as IssueOptions['sort'],order:(raw.order??'asc') as IssueOptions['order']};
}
/** Stateless keyset cursors do not create history_snapshot rows or any other projection writes. */
function encodeCursor(scope:string,position:Record<string,unknown>):string {return Buffer.from(JSON.stringify({v:1,scope,...position})).toString('base64url');}
function decodeCursor(token:string,scope:string):Record<string,unknown> {
  try {
    if(!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const value:unknown=JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error();
    const cursor=value as Record<string,unknown>;
    if(cursor.v!==1||cursor.scope!==scope) throw new Error();
    return cursor;
  }catch {return invalid('cursor','cursor가 조회 조건 또는 principal과 일치하지 않습니다');}
}
/** One owner-wide registry scope; the caller already passed the shared session authentication. */
async function authorizeAliasOwner(tx:EventTransaction,p:CorePrincipal,owner:string):Promise<void> {
  const row=(await tx.client.query(`SELECT name FROM ${tx.table('owner')} WHERE id=$1`,[p.ownerId])).rows[0];
  if(!row||row.name.toLowerCase()!==owner.toLowerCase()) throw new CoreError(403,'FORBIDDEN');
}
function aliasColumns(tx:EventTransaction):string {
  return `a.id,a.name,a.role,a.model,a.scope,a.registered_at,a.status,
    (SELECT s.sid FROM ${tx.table('session')} s WHERE s.alias_id=a.id AND s.revoked_at IS NULL AND s.expires_at>$2 LIMIT 1) AS sid,
    ARRAY(SELECT ar.repo_id::text FROM ${tx.table('alias_repo')} ar WHERE ar.alias_id=a.id ORDER BY ar.repo_id) AS repos,
    ARRAY(SELECT old.name FROM ${tx.table('alias')} old WHERE old.renamed_to=a.id ORDER BY old.folded_name COLLATE "C") AS renamed_from,
    (SELECT target.name FROM ${tx.table('alias')} target WHERE target.id=a.renamed_to) AS renamed_to`;
}
function aliasView(row:Record<string,any>):AliasRegistryItem {
  return {id:row.id,name:row.name,role:row.role,model:row.model,scope:row.scope,sid:row.sid??null,repos:row.repos,
    registeredAt:row.registered_at,renamedFrom:row.renamed_from,status:row.status,renamedTo:row.renamed_to??null};
}
/** FROM ignores /sid; TO/CC match complete case-insensitive envelope names, including historical names. */
function participants(comment='c'):string {
  return `(ARRAY[lower(split_part(${comment}.envelope->>'FROM','/',1)),nullif(lower(${comment}.envelope->>'TO'),'all')] || string_to_array(lower(coalesce(${comment}.envelope->>'CC','')),','))`;
}
/** Registry includes rename tombstones; q searches literal name/role/model/scope text. */
export async function readAliasRegistry(tx:EventTransaction,p:CorePrincipal,owner:string,query:Query):Promise<Page<AliasRegistryItem>> {
  await authorizeAliasOwner(tx,p,owner);
  const options=listing(textQuery(query,['limit','cursor','q']));
  const scope=requestHash('alias-registry',{principalId:p.id,ownerId:p.ownerId,q:options.q});
  let after='';
  if(options.cursor!==undefined&&options.cursor!=='0') {
    const cursor=decodeCursor(options.cursor,scope);
    if(typeof cursor.name!=='string'||!cursor.name||cursor.name.length>24) invalid('cursor','cursor의 별칭 위치가 올바르지 않습니다');
    after=cursor.name as string;
  }
  const rows=(await tx.client.query(`SELECT ${aliasColumns(tx)} FROM ${tx.table('alias')} a
    WHERE a.owner_id=$1 AND a.folded_name COLLATE "C">$3 COLLATE "C"
    AND ($4='' OR strpos(lower(a.name||' '||a.role||' '||a.model||' '||a.scope),lower($4))>0)
    ORDER BY a.folded_name COLLATE "C" LIMIT $5`,[p.ownerId,tx.now,after,options.q,options.limit+1])).rows;
  const items=rows.slice(0,options.limit).map(aliasView);
  return {items,nextCursor:rows.length>options.limit?encodeCursor(scope,{name:items.at(-1)!.name.toLowerCase()}):null};
}
/** Detail is owner-wide, like the registry; recentIssues is the latest 20 FROM/TO/CC participating issues. */
export async function readAliasDetail(tx:EventTransaction,p:CorePrincipal,owner:string,name:string,query:Query):Promise<Record<string,unknown>> {
  await authorizeAliasOwner(tx,p,owner);textQuery(query,[]);
  const row=(await tx.client.query(`SELECT ${aliasColumns(tx)} FROM ${tx.table('alias')} a WHERE a.owner_id=$1 AND a.folded_name=lower($3)`,[p.ownerId,tx.now,name])).rows[0];
  if(!row) throw new CoreError(404,'NOT_FOUND');
  const alias=aliasView(row),names=[alias.name,...alias.renamedFrom].map(n=>n.toLowerCase());
  const recentIssues=(await tx.client.query(`SELECT r.id AS repo_id,r.slug,i.number,i.title,i.state,i.is_open,max(c.created_at) AS last_activity_at,max(c.id)::text AS last_comment_id
    FROM ${tx.table('comment')} c JOIN ${tx.table('issue')} i ON i.repo_id=c.repo_id AND i.number=c.issue_number JOIN ${tx.table('repo')} r ON r.id=i.repo_id
    WHERE c.owner_id=$1 AND c.validity='v2' AND ${participants()} && $2::text[]
    GROUP BY r.id,r.slug,i.number,i.title,i.state,i.is_open
    ORDER BY max(c.created_at) DESC,max(c.id) DESC,r.id,i.number DESC LIMIT 20`,[p.ownerId,names])).rows.map(r=>({repoId:r.repo_id,owner,repo:r.slug,number:r.number,title:r.title,state:r.state,isOpen:r.is_open,lastActivityAt:r.last_activity_at,lastCommentId:r.last_comment_id}));
  const openClaimCount=(await tx.client.query(`SELECT count(*)::int AS n FROM ${tx.table('claim')} WHERE owner_id=$1 AND alias_id=$2 AND released_by_comment_id IS NULL`,[p.ownerId,alias.id])).rows[0].n;
  return {alias,recentIssues,openClaimCount};
}
/** AND-combined issue filters over existing projections, with deterministic keyset pagination. */
export async function readIssueListing(tx:EventTransaction,p:CorePrincipal,repoId:string,query:Query):Promise<Page<Record<string,unknown>>> {
  await authorizeRepo(tx,p,repoId);
  const options=issueOptions(query),{limit,cursor,q,owner,alias,state,sort,order}=options;
  const scope=requestHash('issue-listing',{principalId:p.id,repoId,q,owner,alias,state,sort,order});
  let afterNumber:number|null=null,afterUpdated:string|null=null;
  if(cursor!==undefined&&cursor!=='0') {
    if(/^[1-9]\d*$/.test(cursor)&&sort!=='updated') afterNumber=Number(cursor);
    else {
      const position=decodeCursor(cursor,scope);
      afterNumber=position.number as number;
      if(sort==='updated') {
        if(typeof position.updated!=='string'||!/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(position.updated)||!Number.isFinite(Date.parse(position.updated))) invalid('cursor','cursor의 갱신 시각이 올바르지 않습니다');
        afterUpdated=position.updated as string;
        if(new Date(afterUpdated).toISOString().slice(0,23)!==afterUpdated.slice(0,23)) invalid('cursor','cursor의 갱신 시각이 올바르지 않습니다');
      }
    }
    if(typeof afterNumber!=='number'||!Number.isSafeInteger(afterNumber)||afterNumber<1||afterNumber>2147483647) invalid('cursor','cursor의 이슈 번호가 올바르지 않습니다');
  }
  const direction=order==='asc'?'ASC':'DESC',compare=order==='asc'?'>':'<';
  // Repo issue numbers are allocated under its row lock: created order equals number order.
  const key=sort==='updated'?'i.updated_at,i.number':'i.number';
  const after=sort==='updated'?`($7::integer IS NULL OR (i.updated_at,i.number) ${compare} ($8::timestamptz,$7))`:`($7::integer IS NULL OR i.number ${compare} $7) AND $8::timestamptz IS NULL`;
  const numberQuery=/^#?([1-9]\d*)$/.exec(q)?.[1]??null;
  const rows=(await tx.client.query(`SELECT i.*,a.name AS owner_alias,
    to_char(i.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_updated
    FROM ${tx.table('issue')} i JOIN ${tx.table('alias')} a ON a.id=i.owner_alias_id
    WHERE i.repo_id=$1 AND ($2::boolean IS NULL OR i.is_open=$2)
    AND ($3::text IS NULL OR a.folded_name=$3)
    AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM ${tx.table('comment')} c WHERE c.repo_id=i.repo_id AND c.issue_number=i.number AND c.validity='v2' AND ${participants()} @> ARRAY[$4]::text[]))
    AND ($5='' OR strpos(lower(i.title),lower($5))>0 OR i.number::text=$6)
    AND ${after}
    ORDER BY ${key.split(',').map(k=>`${k} ${direction}`).join(',')} LIMIT $9`,
    [repoId,state==='all'?null:state==='open',owner??null,alias??null,q,numberQuery,afterNumber,afterUpdated,limit+1])).rows;
  const items=rows.slice(0,limit).map(r=>({number:r.number,title:r.title,state:r.state,isOpen:r.is_open,ownerAliasId:r.owner_alias_id,ownerAlias:r.owner_alias,compact:r.compact_comment_id,isBoard:r.is_board,revision:r.revision,updatedAt:r.sort_updated}));
  const last=rows[Math.min(rows.length,limit)-1];
  return {items,nextCursor:rows.length>limit?(sort==='number'&&order==='asc'&&!q&&!owner&&!alias?String(last.number):encodeCursor(scope,{number:last.number,...(sort==='updated'?{updated:last.sort_updated}:{})})):null};
}
