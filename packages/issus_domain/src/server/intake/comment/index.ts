import type {Actor,CommentPostRequest,CommentEnvelope,CommentMetadata,CompactCommentMetadata} from '../../../common/index.js';
import {checkComment,parseEnvelope,parseCommentRequest,charCount,splitlines,DIRECTIVE,pendingLegacy} from '../../../common/index.js';
import {CoreError,validation,sha256,type EventTransaction,type CorePrincipal,actorOf,requireOwner,isBootstrap,aliasByName,issueById,commentById,commentsFor,refs,resolveIssueRef,issueChannel,rewriteBody,type IssueRow,type CommentRow,type CompactPublication,noCompactPublication} from '../../backend/index.js';
export type {CompactPublication,CompactPublicationInput} from '../../backend/index.js';

export interface CheckedComment {request:CommentPostRequest;envelope:Record<string,string>;actor:Actor;authorId:string;metadata:Record<string,unknown>;packet?:Record<string,unknown>;target?:IssueRow}
const contextReason=(code:string,path:string,message:string):never=>{throw new CoreError(422,'VALIDATION_FAILED',[{code,path,message}]);};

/** Shared by live admission, worker final validation and read-only preflight. */
export async function checkCommentContext(tx:EventTransaction,p:CorePrincipal,issue:IssueRow,input:unknown):Promise<CheckedComment> {
  if(input&&typeof input==='object'&&typeof (input as {body?:unknown}).body==='string') validation(checkComment((input as {body:string}).body));
  const parsed=parseCommentRequest(input);if(!parsed.ok) validation(parsed.reasons);
  const request=(parsed as {ok:true;value:CommentPostRequest}).value;
  validation(checkComment(request.body));
  const e=parseEnvelope(splitlines(request.body)[0]);
  const [from,sid]=e.FROM.split('/');const author=await aliasByName(tx,p.ownerId,from);
  let actor=actorOf(p);
  const proxy=sid.startsWith('by-');
  if(p.kind==='session') {
    if(proxy) {if(!p.capabilities.includes('post:proxy')||sid!==`by-${p.alias}`) throw new CoreError(403,'FROM_MISMATCH');}
    else if(author.id!==p.aliasId||sid!==p.sid) throw new CoreError(403,'FROM_MISMATCH');
  } else {
    const repo=(await tx.client.query(`SELECT project_code FROM ${tx.table('repo')} WHERE id=$1`,[issue.repo_id])).rows[0];
    const system=await aliasByName(tx,p.ownerId,`${repo.project_code}-system`);
    if(!proxy||sid!==`by-${system.name}`) throw new CoreError(403,'FROM_MISMATCH');
    const s=(await tx.client.query(`SELECT id FROM ${tx.table('session')} WHERE alias_id=$1 AND kind='service' AND revoked_at IS NULL`,[system.id])).rows[0];
    if(!s) throw new CoreError(503,'SERVICE_SESSION_UNAVAILABLE');
    actor={ownerId:p.ownerId,aliasId:system.id,alias:system.name,sid:'srv',sessionId:s.id};
  }
  if(!issue.is_open&&!(e.TYPE==='NOTE'&&(isBootstrap(p)||author.id===issue.owner_alias_id)&&e['REPLY-IN'])) throw new CoreError(409,'ISSUE_CLOSED',undefined,{replyIn:issue.reply_in});
  if(issue.is_board&&(!['NOTE','ACK','ALIAS','COMPACT'].includes(e.TYPE)||(e.TYPE==='NOTE'&&charCount(request.body)>1500))) contextReason('BOARD_COMMENT','body','게시판에는 NOTE(1500자 이하)/ACK/ALIAS/COMPACT만 허용');
  const recipients=new Map<string,string>();
  for(const name of [e.TO,...(e.CC??'').split(',').filter(Boolean)]) if(name.toUpperCase()!=='ALL') recipients.set(name,(await aliasByName(tx,p.ownerId,name)).id);
  const referenced=new Map<string,CommentRow>();
  for(const id of [...refs(e.RE),...refs(e.SUPERSEDES)]) if(!referenced.has(id)) referenced.set(id,await commentById(tx,p,id));
  if(e['ACK-BY']) {
    const deadline=new Date(e['ACK-BY']).getTime();
    if(deadline<=tx.now.getTime()) contextReason('ACK_BY_PAST','envelope.ACK-BY','ACK-BY는 서버 접수시각 이후여야 함');
    if(e.TYPE==='HOLD'&&deadline>tx.now.getTime()+600000) contextReason('HOLD_ACK_BY','envelope.ACK-BY','HOLD ACK-BY는 서버 접수시각 10분 이내여야 함');
  }
  if(e.TYPE==='HOLD'&&!e.SEEN) contextReason('HOLD_SEEN','envelope.SEEN','HOLD SEEN 필수');
  if(e.DUE&&['PLAN','CLAIM'].includes(e.TYPE)&&new Date(e.DUE).getTime()<=tx.now.getTime()) contextReason('DUE_PAST','envelope.DUE','DUE는 서버 접수시각 이후여야 함');
  if(e.SEEN) {
    if(['CLAIM','COMPACT'].includes(e.TYPE)&&refs(e.SEEN).length!==1) contextReason('SEEN_RANGE','envelope.SEEN','live CLAIM/COMPACT SEEN은 단일 댓글 id');
    const history=await commentsFor(tx,issue.repo_id,issue.number);
    for(const id of refs(e.SEEN)) if(!(id==='0'&&history.length===0)&&!history.some(c=>c.id===id)) contextReason('SEEN_RANGE','envelope.SEEN',`SEEN이 현재 이슈 댓글 범위 밖 ${id}`);
  }
  for(const id of refs(e.SUPERSEDES)) {
    const old=referenced.get(id)!;
    if(old.author_alias_id!==author.id) await requireOwner(tx,p,(await issueById(tx,p,old.repo_id,old.issue_number)).owner_alias_id);
    if(old.envelope.TYPE==='HOLD'&&e.TYPE!=='DECISION') contextReason('HOLD_RELEASE','envelope.SUPERSEDES','HOLD 해제는 DECISION만 허용');
  }
  if(e.TYPE==='RELEASE') for(const id of refs(e.RE)) {const c=referenced.get(id)!;if(c.envelope.TYPE!=='CLAIM'||c.author_alias_id!==author.id) contextReason('RELEASE_CLAIM','envelope.RE','RELEASE는 본인의 CLAIM만 참조');}
  if(['PLAN','CLAIM'].includes(e.TYPE)) {
    const holds=await tx.client.query(`SELECT d.comment_id FROM ${tx.table('directive')} d JOIN ${tx.table('comment')} c ON c.id=d.comment_id WHERE d.type='HOLD' AND d.hold_released_by IS NULL AND (d.recipient_alias_id=$1 OR (c.repo_id=$2 AND c.issue_number=$3))`,[author.id,issue.repo_id,issue.number]);
    if(holds.rowCount) throw new CoreError(409,'ACTIVE_HOLD',undefined,{ids:holds.rows.map(r=>r.comment_id)});
  }
  if(['CLAIM','DECISION'].includes(e.TYPE)) {
    const history=await commentsFor(tx,issue.repo_id,issue.number);
    const pending=pendingLegacy(history,[author.name.toLowerCase()]);
    if(pending.length) throw new CoreError(409,'PENDING_ACK',undefined,{ids:pending.map(c=>c.id)});
  }
  const duplicate=(await tx.client.query(`SELECT id FROM ${tx.table('comment')} WHERE repo_id=$1 AND issue_number=$2 AND author_alias_id=$3 AND md5(body)=md5($4) AND body=$4 ORDER BY id LIMIT 1`,[issue.repo_id,issue.number,author.id,request.body])).rows[0];
  if(duplicate) throw new CoreError(409,'DUPLICATE_COMMENT',undefined,{commentId:duplicate.id});
  const metadata:Record<string,unknown>={};let packet:Record<string,unknown>|undefined;
  if(['DECISION','HANDOFF'].includes(e.TYPE)) {
    const tail=await commentsFor(tx,issue.repo_id,issue.number);const latest=tail.at(-1)?.id??null,summary=tail.find(c=>c.id===issue.compact_comment_id);
    const control=summary?Number(summary.metadata.snapshotRevision)+1!==issue.revision:issue.revision>1;
    if((latest!==issue.compact_comment_id||control)&&!request.compactDeferredReason) contextReason('COMPACT_DEFERRED_REASON','compactDeferredReason','DECISION/HANDOFF 선행 COMPACT 생략 사유 필수');
    if(request.compactDeferredReason) metadata.compactDeferredReason=request.compactDeferredReason;
  }
  let target:IssueRow|undefined;
  if(e.TYPE==='HANDOFF') {
    await requireOwner(tx,p,issue.owner_alias_id);target=await resolveIssueRef(tx,p,issue.repo_id,e['REPLY-IN']);
    if(!target.is_open) throw new CoreError(409,'ISSUE_CLOSED');
    if(target.owner_alias_id!==recipients.get(e.TO)&&!(target.repo_id===issue.repo_id&&target.number===issue.number)) contextReason('HANDOFF_OWNER','envelope.TO','HANDOFF TO는 대상 이슈 OWNER여야 함');
  }
  if(e.TYPE==='COMPACT') {
    await requireOwner(tx,p,issue.owner_alias_id);
    if(author.id!==issue.owner_alias_id) throw new CoreError(403,'COMPACT_OWNER_REQUIRED');
    const marker=/^## ===== COMPACT #(\d+) through (\d+) =====$/.exec(splitlines(request.body)[1].trim());
    if(!marker||Number(marker[1])!==issue.number) contextReason('COMPACT_ISSUE','body','COMPACT 마커 이슈 번호 불일치');
    packet=(await tx.client.query(`SELECT * FROM ${tx.table('compact_packet')} WHERE token_hash=$1 AND owner_id=$2 AND repo_id=$3 AND issue_number=$4`,[sha256(request.compactPacketToken!),p.ownerId,issue.repo_id,issue.number])).rows[0];
    if(!packet) throw new CoreError(410,'COMPACT_PACKET_EXPIRED');
    if(new Date(packet.expires_at as string).getTime()<=tx.now.getTime()) throw new CoreError(410,'COMPACT_PACKET_EXPIRED');
    const history=await commentsFor(tx,issue.repo_id,issue.number);const last=history.at(-1)?.id??'0';
    if(packet.previous_compact_id!==issue.compact_comment_id||packet.through_id!==last||packet.snapshot_revision!==issue.revision||packet.through_id!==e.SEEN) throw new CoreError(409,'COMPACT_STALE');
    if(issue.compact_comment_id&&!refs(e.RE).includes(issue.compact_comment_id)) contextReason('COMPACT_PREVIOUS','envelope.RE','COMPACT RE에 이전 COMPACT id 필수');
    const tail=history.filter(c=>!issue.compact_comment_id||BigInt(c.id)>BigInt(issue.compact_comment_id));
    const samples=request.sampledIds!;
    if(samples.some(id=>!tail.some(c=>c.id===id))||samples.length<Math.min(3,tail.length)) contextReason('COMPACT_SAMPLES','sampledIds','COMPACT 표본은 원문 구간에서 3건(3건 미만이면 전부) 필수');
    await aliasByName(tx,p.ownerId,request.compactedBy!);
    Object.assign(metadata,{compactPacketId:packet.id,packetHash:packet.packet_hash,...(packet.previous_compact_id?{previousCompactId:packet.previous_compact_id}:{}),throughId:packet.through_id,snapshotRevision:packet.snapshot_revision,sampledIds:samples,compactedBy:request.compactedBy});
  }
  return {request,envelope:e,actor,authorId:author.id,metadata,...(packet?{packet}:{}),...(target?{target}:{})};
}

/** Store immutable comment and all safety indexes synchronously, before asynchronous delivery reactions. */
export async function postComment(tx:EventTransaction,p:CorePrincipal,issue:IssueRow,input:unknown,publication:CompactPublication=noCompactPublication):Promise<Record<string,unknown>> {
  const checked=await checkCommentContext(tx,p,issue,input);const {request,envelope:e,actor,authorId,metadata}=checked;
  const id=(await tx.client.query(`UPDATE ${tx.table('comment_counter')} SET last_id=last_id+1 WHERE id=1 RETURNING last_id`,[])).rows[0].last_id as string;
  const comment=(await tx.client.query<CommentRow>(`INSERT INTO ${tx.table('comment')}(id,owner_id,repo_id,issue_number,body,envelope,metadata,author_alias_id,author_session_id,posted_by_alias_id,created_at,char_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[id,p.ownerId,issue.repo_id,issue.number,request.body,e,metadata,authorId,actor.sessionId,actor.aliasId,tx.now,charCount(request.body)])).rows[0];
  for(const kind of ['RE','SUPERSEDES']) for(const ref of refs(e[kind])) await tx.client.query(`INSERT INTO ${tx.table('comment_reference')}(owner_id,comment_id,referenced_comment_id,kind,author_alias_id) VALUES($1,$2,$3,$4,$5)`,[p.ownerId,id,ref,kind,authorId]);
  if((DIRECTIVE as readonly string[]).includes(e.TYPE)) {
    const to=await aliasByName(tx,p.ownerId,e.TO);
    await tx.client.query(`INSERT INTO ${tx.table('directive')}(owner_id,comment_id,recipient_alias_id,type,ack_by) VALUES($1,$2,$3,$4,$5)`,[p.ownerId,id,to.id,e.TYPE,e['ACK-BY']]);
    await tx.client.query(`INSERT INTO ${tx.table('directive_recipient')}(owner_id,comment_id,alias_id,via) VALUES($1,$2,$3,'to')`,[p.ownerId,id,to.id]);
    const aliases=(await tx.client.query(`SELECT id,name FROM ${tx.table('alias')} WHERE owner_id=$1 AND status='active' ORDER BY id`,[p.ownerId])).rows;
    for(const a of aliases) if(a.id!==to.id&&new RegExp(`@${a.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\w가-힣-])`,'iu').test(request.body)) await tx.client.query(`INSERT INTO ${tx.table('directive_recipient')}(owner_id,comment_id,alias_id,via) VALUES($1,$2,$3,'mention') ON CONFLICT DO NOTHING`,[p.ownerId,id,a.id]);
  }
  if(e.TYPE==='ACK'&&!e.FROM.split('/')[1].startsWith('by-')&&authorId===actor.aliasId) {
    for(const ref of refs(e.RE)) {
      await tx.client.query(`UPDATE ${tx.table('directive')} SET acked_by_comment_id=COALESCE(acked_by_comment_id,$1) WHERE comment_id=$2 AND recipient_alias_id=$3`,[id,ref,authorId]);
      await tx.client.query(`UPDATE ${tx.table('directive_recipient')} SET ack_comment_id=COALESCE(ack_comment_id,$1) WHERE comment_id=$2 AND alias_id=$3`,[id,ref,authorId]);
    }
  }
  for(const ref of refs(e.SUPERSEDES)) await tx.client.query(`UPDATE ${tx.table('directive')} SET superseded_by=COALESCE(superseded_by,$1),hold_released_by=CASE WHEN type='HOLD' AND $3='DECISION' THEN COALESCE(hold_released_by,$1) ELSE hold_released_by END WHERE comment_id=$2`,[id,ref,e.TYPE]);
  if(e.TYPE==='CLAIM') await tx.client.query(`INSERT INTO ${tx.table('claim')}(owner_id,comment_id,alias_id,repo_id,issue_number,due_at) VALUES($1,$2,$3,$4,$5,$6)`,[p.ownerId,id,authorId,issue.repo_id,issue.number,e.DUE]);
  if(e.TYPE==='RELEASE') for(const ref of refs(e.RE)) await tx.client.query(`UPDATE ${tx.table('claim')} SET released_by_comment_id=COALESCE(released_by_comment_id,$1) WHERE comment_id=$2 AND alias_id=$3`,[id,ref,authorId]);
  if(e.TYPE==='HANDOFF') {const target=checked.target!,to=await aliasByName(tx,p.ownerId,e.TO);await tx.client.query(`INSERT INTO ${tx.table('handoff')}(owner_id,comment_id,source_repo_id,source_issue_number,target_repo_id,target_issue_number,recipient_alias_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[p.ownerId,id,issue.repo_id,issue.number,target.repo_id,target.number,to.id]);}
  const event=tx.fact('issus.comment.posted',issueChannel(issue.repo_id,issue.number),{ownerId:p.ownerId,repoId:issue.repo_id,issueNumber:issue.number,revision:issue.revision,commentId:id,body:request.body,envelope:e as unknown as CommentEnvelope,metadata:metadata as CommentMetadata,charCount:charCount(request.body),author:{...actor,aliasId:authorId,alias:e.FROM.split('/')[0]},validity:'v2'},`comment:${id}`);
  let revision=issue.revision;
  if(e.TYPE==='COMPACT') {
    await publication(tx,{issue,comment,packet:checked.packet!,metadata:metadata as unknown as CompactCommentMetadata});
    const body=rewriteBody(issue,{compact:id},tx.now);revision++;
    await tx.client.query(`UPDATE ${tx.table('issue')} SET body=$3,compact_comment_id=$4,revision=revision+1,updated_at=$5 WHERE repo_id=$1 AND number=$2`,[issue.repo_id,issue.number,body,id,tx.now]);
    const covered=(await commentsFor(tx,issue.repo_id,issue.number)).filter(c=>BigInt(c.id)<BigInt(id)&&(!issue.compact_comment_id||BigInt(c.id)>BigInt(issue.compact_comment_id)));
    tx.fact('issus.compact.posted',issueChannel(issue.repo_id,issue.number),{ownerId:p.ownerId,repoId:issue.repo_id,issueNumber:issue.number,revision,compactId:id,...(issue.compact_comment_id?{previousCompactId:issue.compact_comment_id}:{}),throughId:e.SEEN,packetHash:metadata.packetHash as string,bodyRevision:revision,metadata:metadata as unknown as CompactCommentMetadata,count:covered.length,chars:covered.reduce((sum,c)=>sum+c.char_count,0)},`compact:${id}`);
  }
  return {commentId:id,eventId:event.eventId,revision,posted:true};
}
