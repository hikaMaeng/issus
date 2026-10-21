import {classify,header,normalizeMe,splitlines,strip,type InboxItem,type InboxResponse,type ReadHeader,type Principal} from 'issus_domain/common';
import {ClientError,InboxModel,repoPath,issuePath,scopeKey,type DeliveryVersion,type ClientCursors} from 'issus_domain/front';
import type {CommandContext} from '../../client/index.js';
import {numberOption,parseIssue,parseRepo,required,value,type IssueReference} from '../../entry/arguments/index.js';
import {chars,CliError,codepoints} from '../../output/index.js';
import {readJson,StateStore} from '../../state/index.js';

interface Comment {id:string;body:string;createdAt:string;issueNumber?:number;repoId?:string}
interface Row {key:string;comment:Comment;h:ReadHeader;delivery?:InboxItem['delivery'];boundary?:boolean}
interface IssueDetail {issue:{number:number;repoId:string;isOpen:boolean;state:string;revision:number};body:string;revision:number}
interface Evidence {deliveryIds:string[];disposition:'acked'|'replied'|'ignored';evidenceCommentId?:string;reason?:string}

const bodyLine=(body:string):Record<string,string>=>{
  const first=splitlines(strip(body.replace(/^\uFEFF+/u,'')))[0]??'',h:Record<string,string>={STATE:'-',OWNER:'-','REPLY-IN':'-',COMPACT:'-',BOARD:'-'};
  for(const k of Object.keys(h)) {const m=new RegExp(`(?:^|\\s)${k}:(\\S+)`,'u').exec(first);if(m) h[k]=m[1];}return h;
};
const stamp=(s:string):string=>s.replace(/\.000Z$/u,'Z');
const byId=(a:string,b:string):number=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;

/** Native watch uses the v2 priority order while retaining canonical row/footer/unread wording. */
export async function watch(ctx:CommandContext):Promise<number> {
  const a=ctx.args,repo=value(a,'repo'),show=value(a,'show');
  if(a.flags.has('peek')&&value(a,'processed-file')) throw new CliError(2,'--peek cannot process evidence');
  if(repo) parseRepo(repo);
  if(show) {
    if(!/^\d+$/u.test(show)) throw new CliError(2,'--show needs numeric comment ID');
    const {client}=await ctx.connection(),{data}=await client.request<Comment>(`${repoPath(parseRepo(required(a,'repo')))}/comments/${show}`,{signal:ctx.options.signal});
    await ctx.result(ctx.out.json?data:data.body,data.body);return 0;
  }
  if(!a.positionals.length) throw new CliError(2,'give at least one ISSUE');
  const limit=numberOption(a,'limit',4000),pageSize=numberOption(a,'page-size',100,500),peek=a.flags.has('peek'),sinceCompact=!a.flags.has('all-history');
  const {client}=await ctx.connection(),principal=await ctx.principal();
  if(principal.kind!=='session') throw new CliError(2,'watch needs a session token');
  const me=[...new Set(normalizeMe(a.values.me??[],a.values.mine??[]))];
  if(!me.length) me.push(principal.alias.toLowerCase());
  if(!me.includes(principal.alias.toLowerCase())) throw new CliError(2,'--me/--mine 집합에는 token alias가 필요합니다');
  const state=new StateStore(ctx.path(value(a,'state','issue_watch.state.json')!));
  const work:{ref:IssueReference;board:boolean}[]=[...a.positionals.map(t=>({ref:parseIssue(t,repo,client.server),board:false})),...(a.values.board??[]).map(t=>({ref:parseIssue(t,repo,client.server),board:true}))];
  const details=new Map<string,IssueDetail>(),boardKeys=new Set<string>();
  for(let i=0;i<work.length;i++) {
    const {ref,board}=work[i],key=`${ref.repo}#${ref.number}`;
    if(board) boardKeys.add(key);
    if(details.has(key)) continue;
    const {data}=await client.request<IssueDetail>(issuePath(ref.repo,ref.number),{signal:ctx.options.signal});details.set(key,data);
    const pointer=bodyLine(data.body).BOARD;
    if(pointer!=='-') {
      const normalized=pointer.startsWith('#')?pointer.slice(1):pointer;
      work.push({ref:parseIssue(normalized,ref.repo,client.server),board:true});
    }
  }
  const groups=new Map<string,{issues:number[];boards:number[]}>();
  for(const {ref,board} of work) {const g=groups.get(ref.repo)??{issues:[],boards:[]};g[board?'boards':'issues'].push(ref.number);groups.set(ref.repo,g);}
  const rows:Row[]=[],pending=new Map<string,Row>(),global=new Map<string,Row>(),footers:string[]=[],states:{key:string;cursors:ClientCursors;versions:Record<string,DeliveryVersion>}[]=[];
  let unprocessed=false;
  const seenComments=new Set<string>();
  for(const [groupRepo,g] of groups) {
    g.issues=[...new Set(g.issues)].sort((a,b)=>a-b);g.boards=[...new Set(g.boards)].sort((a,b)=>a-b);
    const key=scopeKey({server:client.server,owner:groupRepo.split('/')[0],alias:principal.alias,sid:principal.sid,repos:[{repo:groupRepo,...g}],me,sinceCompact});
    const old=await state.scope(key);
    let model=new InboxModel(old?.cursors,old?.versions),cursor=old?.cursors.refreshCursor??undefined,recovered=false;
    const pages:InboxResponse[]=[];
    const visited=new Set<string>();
    while(true) {
      const query=new URLSearchParams({repo:groupRepo,issues:g.issues.join(','),sinceCompact:String(sinceCompact),limit:String(pageSize)});
      for(const m of me) query.append('me',m);
      for(const b of g.boards) query.append('board',String(b));
      if(cursor) query.set('cursor',cursor);
      let page:InboxResponse;
      try {page=(await client.request<InboxResponse>('/v1/inbox?'+query,{signal:ctx.options.signal})).data;}
      catch(error) {
        if(!recovered&&error instanceof ClientError&&(error.status===410||error.code==='CURSOR_SCOPE_MISMATCH')) {cursor=undefined;recovered=true;model=new InboxModel({},old?.versions);pages.length=0;visited.clear();continue;}
        throw error;
      }
      model.acceptPage(page);pages.push(page);
      if(page.nextCursor===null) break;
      if(visited.has(page.nextCursor)) throw new ClientError(0,'INBOX_CURSOR_CYCLE');
      visited.add(page.nextCursor);cursor=page.nextCursor;
    }
    const cache=new Map<string,Comment>();
    const hydrate=async(id:string):Promise<Comment>=>{
      if(cache.has(id)) return cache.get(id)!;
      const {data}=await client.request<Comment>(`${repoPath(groupRepo)}/comments/${encodeURIComponent(id)}`,{signal:ctx.options.signal});
      if(data.id!==id||typeof data.body!=='string'||typeof data.createdAt!=='string') throw new ClientError(0,'INVALID_COMMENT_RESPONSE');
      cache.set(id,data);return data;
    };
    const rowFor=async(id:string,body?:string,delivery?:InboxItem['delivery']):Promise<Row>=>{
      const comment=await hydrate(id),number=comment.issueNumber??pages[0].bootstrap.issues.find(x=>x.repoId===comment.repoId)?.issueNumber??g.issues[0]??g.boards[0];
      // /comments/:id is immutable; use its full original even when the inbox folded OTHER content.
      const c=comment;return {key:`${groupRepo}#${number}`,comment:c,h:header(c.body),delivery};
    };
    for(const item of model.items.values()) {
      if(item.delivery&&!['applied','superseded'].includes(item.delivery.state)) unprocessed=true;
      if(item.commentId) {
        if(seenComments.has(item.commentId)) continue;
        seenComments.add(item.commentId);rows.push(await rowFor(item.commentId,item.content.body,item.delivery));
      } else {
        // Non-comment facts keep their source id, never pretend to be a comment SEEN id.
        const h=header(item.content.body);
        rows.push({key:`${groupRepo}#${g.issues[0]??g.boards[0]}`,comment:{id:item.sourceEventId,body:item.content.body,createdAt:'-'},h,delivery:item.delivery});
      }
    }
    for(const boundary of pages[0].compact) {
      if(boundary.comment&&!seenComments.has(boundary.comment.id)) {seenComments.add(boundary.comment.id);rows.push({...await rowFor(boundary.comment.id,boundary.comment.body),boundary:true});}
    }
    const windowIds=[...new Set(pages.flatMap(p=>p.windowPendingAck))],globalIds=[...new Set(pages.flatMap(p=>p.globalPendingAck))];
    for(const id of windowIds) pending.set(id,await rowFor(id));
    for(const id of globalIds) if(!windowIds.includes(id)) global.set(id,await rowFor(id));
    const supplied=pages[0].footers;
    if(supplied?.length) {
      for(const f of supplied) if(a.flags.has('compact-due')||!f.startsWith('COMPACT-DUE ')) footers.push(f);
    } else {
      // The protocol supplies footer text; this fallback uses only the completed snapshot, never current tail.
      for(const boundary of pages[0].bootstrap.issues) {
        const issueNumber=boundary.issueNumber,issueKey=`${groupRepo}#${issueNumber}`,detail=details.get(issueKey);
        if(!detail) continue;
        const h=bodyLine(detail.body),c=pages[0].compact.find(c=>c.issueNumber===issueNumber)?.comment;
        const comments=[...cache.values()].filter(c=>c.issueNumber===issueNumber),tail=comments.filter(x=>!c||byId(x.id,c.id)>0),count=tail.length,total=tail.reduce((n,c)=>n+chars(c.body),0);
        footers.push(`--- ${issueKey} state=${detail.issue.isOpen?'open':'closed'} body-STATE:${h.STATE} reply-in=${h['REPLY-IN']} last-id=${boundary.throughCommentId==='0'?'-':boundary.throughCommentId} comments=${comments.length}${sinceCompact?'(since-compact)':''} compact=${c?.id??'-'} since-compact=${count}c/${total}자 board=${h.BOARD}`);
        const dueCount=boardKeys.has(issueKey)?30:25;
        if(a.flags.has('compact-due')&&(count>=dueCount||total>=40000)) footers.push(`COMPACT-DUE ${issueKey}${boardKeys.has(issueKey)?' (board)':''}: ${count} comments / ${total}자 since COMPACT ${c?.id??'(none)'} (>= ${dueCount}c or >= 40000자) — OWNER: compact_prepare.py → 위임 → COMPACT 게시`);
      }
    }
    states.push({key,cursors:model.cursors,versions:model.versions});
  }
  const issueOrder=[...details.keys()];
  rows.sort((a,b)=>issueOrder.indexOf(a.key)-issueOrder.indexOf(b.key)||(/^\d+$/u.test(a.comment.id)&&/^\d+$/u.test(b.comment.id)?byId(a.comment.id,b.comment.id):0));
  if(ctx.out.json) await ctx.result({items:rows.filter(r=>r.boundary||!me.includes(r.h._from)).map(r=>({issue:r.key,...r.comment,delivery:r.delivery,priority:classify(r.h,r.comment.body,me)})),windowPendingAck:[...pending.keys()],globalPendingAck:[...pending.keys(),...global.keys()],footers});
  else {
    const printPending=async(title:string,items:Map<string,Row>):Promise<void>=>{
      if(!items.size) return;await ctx.out.line(title);
      for(const row of items.values()) {const h=row.h;await ctx.out.line(`  ${row.key} ${row.comment.id} ${h._type} FROM:${h.values.FROM??'?'} ACK-BY:${h.values['ACK-BY']??'-'}${h._noenv?' [NOENV]':''} | ${codepoints(h._first,160)}`);}
    };
    await printPending('PENDING-ACK (내게 온 지시, 내 ACK RE 없음):',pending);
    await printPending('PENDING-ACK-GLOBAL (COMPACT 구간 밖 미해소 지시):',global);
    const classified={ME:[] as Row[],CC:[] as Row[],ALL:[] as Row[],OTHER:[] as Row[]};
    for(const row of rows) if(row.boundary||!me.includes(row.h._from)) classified[classify(row.h,row.comment.body,me)].push(row);
    let noenv=0;
    for(const group of ['ME','CC','ALL','OTHER'] as const) {
      for(const row of classified[group]) {
        const h=row.h,c=row.comment;noenv+=Number(h._noenv);
        await ctx.out.line(`=== [${group}]${h._noenv?' [NOENV]':''} ${row.key} ${c.id} ${stamp(c.createdAt)} TYPE:${h._type||'-'} FROM:${h.values.FROM??'?'} TO:${h.values.TO??'-'}${h.values.CC?` CC:${h.values.CC}`:''}`);
        await ctx.out.line((group==='OTHER'&&!a.flags.has('full')?codepoints(h._first,300):codepoints(c.body,limit)+(chars(c.body)>limit?' …(truncated; --show ID)':''))+'\n');
      }
    }
    for(const f of [...new Set(footers)]) await ctx.out.line(f);
    await ctx.out.line(`--- unread: ME=${classified.ME.length} CC=${classified.CC.length} ALL=${classified.ALL.length} OTHER=${classified.OTHER.length} noenv=${noenv} pending-ack=${pending.size}${peek?' (peek: state not advanced)':''}`);
  }
  const evidenceFile=value(a,'processed-file');
  if(evidenceFile&&peek) throw new CliError(2,'--peek cannot process evidence');
  if(evidenceFile) {
    const raw=await readJson<unknown>(ctx.path(evidenceFile)),entries=Array.isArray(raw)?raw:[raw];
    for(const entry of entries) {
      const e=entry as Evidence;
      if(!e||!Array.isArray(e.deliveryIds)||!e.deliveryIds.length||!e.deliveryIds.every(x=>typeof x==='string')||!['acked','replied','ignored'].includes(e.disposition)||Object.keys(e).some(k=>!['deliveryIds','disposition','evidenceCommentId','reason'].includes(k))) throw new CliError(2,'invalid processed-file: deliveryIds/disposition/evidenceCommentId/reason 필요');
      const result=await ctx.write<{processedCursor:string}>('/v1/inbox/process',e);
      // The processed cursor is alias-wide and is assigned only from the process response.
      for(const state of states) state.cursors.processedCursor=result.processedCursor;
    }
  }
  if(!peek) for(const s of states) await state.saveScope(s.key,{cursors:s.cursors,versions:s.versions});
  return !peek&&!ctx.out.tty&&!evidenceFile&&(unprocessed||pending.size>0||global.size>0)?3:0;
}
