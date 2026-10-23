import {header,checkComment,type Actor,type InboxItem,type InboxResponse,type SessionPrincipal} from 'issus_domain/common';
import {ClientError,InboxModel,issuePath,repoPath,type IssusClient,type ClientCursors,type DeliveryVersion} from 'issus_domain/front';
import type {RunnerOptions} from '../options/index.js';
export interface Comment {id:string;repoId:string;issueNumber:number;body:string;author:Actor;postedByAliasId?:string;createdAt:string;validity?:string}
export interface IssueDetail {issue:{repoId:string;number:number;isOpen:boolean;state:string;ownerAliasId?:string};body:string;revision:number;activeHolds?:string[];pendingLegacy?:unknown;ackState?:unknown}
export interface Snapshot {page:InboxResponse;items:InboxItem[];cursors:ClientCursors;versions:Record<string,DeliveryVersion>}

/** A new InboxModel per completed snapshot; carry versions/cursors, never a previous snapshotId. */
export async function refreshInbox(client:IssusClient,o:RunnerOptions,cursors:ClientCursors={},versions:Record<string,DeliveryVersion>={}):Promise<Snapshot> {
  let model=new InboxModel(cursors,versions),cursor=cursors.refreshCursor??undefined,recovered=false,first:InboxResponse|undefined;
  const seen=new Set<string>();
  while(true) {
    const query=new URLSearchParams({repo:o.repo,issues:String(o.issue),me:o.me,sinceCompact:'true',limit:'100'});for(const n of o.boards) query.append('board',String(n));if(cursor) query.set('cursor',cursor);
    let page:InboxResponse;
    try {page=(await client.request<InboxResponse>('/v1/inbox?'+query)).data;}
    catch(e) {if(!recovered&&e instanceof ClientError&&(e.status===410||e.code==='CURSOR_SCOPE_MISMATCH')) {recovered=true;cursor=undefined;model=new InboxModel({},versions);seen.clear();first=undefined;continue;}throw e;}
    first??=page;model.acceptPage(page);
    // Dynamic obligations are supplied on each page; last page is the complete snapshot's current view.
    first={...first,pendingLegacy:page.pendingLegacy,globalPendingAck:page.globalPendingAck,windowPendingAck:page.windowPendingAck,activeHolds:page.activeHolds,ackState:page.ackState,handoffs:page.handoffs};
    if(page.nextCursor===null) break;
    if(seen.has(page.nextCursor)) throw new Error('INBOX_CURSOR_CYCLE');seen.add(page.nextCursor);cursor=page.nextCursor;
  }
  return {page:first!,items:[...model.items.values()],cursors:model.cursors,versions:model.versions};
}
export const loadComment=async(client:IssusClient,repo:string,id:string):Promise<Comment>=>(await client.request<Comment>(`${repoPath(repo)}/comments/${encodeURIComponent(id)}`)).data;
export const loadIssue=async(client:IssusClient,repo:string,n:number):Promise<IssueDetail>=>(await client.request<IssueDetail>(issuePath(repo,n))).data;
export const ownerFromBody=(body:string):string=>/(?:^|\s)OWNER:(\S+)/u.exec(body.split(/\r?\n/u)[0])?.[1]??'';
export interface Policy {direct:boolean;execute:boolean;control:boolean;mention:boolean;reason:string;from:string;type:string}
/** Server author/provenance must match FROM, independently of the body and sender allowlist. */
export function deliveryPolicy(c:Comment,issue:IssueDetail,o:RunnerOptions,p:SessionPrincipal):Policy {
  const h=header(c.body),from=h._from,type=h._type;
  const direct=h.values.TO?.toLowerCase()===p.alias.toLowerCase();
  const mention=new RegExp('@'+p.alias.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'(?![a-z0-9-])','iu').test(c.body);
  const result=(reason:string,execute=false,control=false):Policy=>({direct,execute,control,mention,reason,from,type});
  if(h._noenv||checkComment(c.body).length) return result('NOENV_OR_INVALID');
  const fromParts=(h.values.FROM??'').split('/');
  if(!c.author||c.author.ownerId!==p.ownerId||c.author.alias.toLowerCase()!==from||c.postedByAliasId!==c.author.aliasId||fromParts[1]?.startsWith('by-')||(fromParts[1]&&fromParts[1]!==c.author.sid)) return result('AUTHOR_PROVENANCE_MISMATCH');
  if(from===p.alias.toLowerCase()) return result('OWN_FROM');
  if(!['ASK','HOLD','DECISION','HANDOFF'].includes(type)) return result('INFORMATION');
  const owner=ownerFromBody(issue.body).toLowerCase();
  const trusted=o.allowedSenders.includes(from),authority=trusted||from===owner;
  if(type==='HOLD'&&authority) return result('HOLD',false,true);
  if(type==='DECISION'&&authority&&h.values.SUPERSEDES) return result('RESUME_CANDIDATE',false,true);
  if(!direct) return result(mention?'MENTION_ONLY':'NOT_ACTUAL_TO');
  if(!trusted) return result('SENDER_NOT_ALLOWED');
  if(!o.allowedTypes.includes(type)) return result('TYPE_NOT_ALLOWED');
  if(!issue.issue.isOpen) return result('ISSUE_CLOSED');
  if(c.issueNumber!==o.issue) return result('OUTSIDE_MAIN_ISSUE');
  return result('ACCEPT',true);
}
