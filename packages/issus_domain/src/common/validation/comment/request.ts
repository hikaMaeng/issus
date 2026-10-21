import type {CommentPostRequest} from '../../protocol/comment/index.js';
import type {ValidationReason} from '../../protocol/envelope/index.js';
import {charCount,strip} from '../constants/index.js';
import {aliasOk} from '../alias/index.js';
import {parseEnvelope} from './index.js';
export const COMMENT_REQUEST_KEYS=['body','compactPacketToken','sampledIds','compactedBy','compactDeferredReason'] as const;
export type CommentRequestResult={ok:true;value:CommentPostRequest}|{ok:false;reasons:ValidationReason[]};
/** Design §6.3 shape/conditional rules only. Packet scope, sample membership and alias existence need a server snapshot. */
export function parseCommentRequest(input:unknown):CommentRequestResult {
  const reasons:ValidationReason[]=[];
  const add=(code:string,path:string,message:string):void=>{reasons.push({code,path,message});};
  if (!input || typeof input!=='object' || Array.isArray(input)) return {ok:false,reasons:[{code:'INVALID_SHAPE',path:'request',message:'댓글 요청은 객체여야 함'}]};
  const obj=input as Record<string,unknown>;
  for (const k of Object.keys(obj)) if (!(COMMENT_REQUEST_KEYS as readonly string[]).includes(k)) add('UNKNOWN_KEY',k,`허용하지 않는 요청 키 ${k}`);
  if (typeof obj.body!=='string') add('INVALID_SHAPE','body','body string 필수');
  const body=typeof obj.body==='string' ? obj.body : '';
  const t=parseEnvelope(body.split(/\r\n|\r|\n/u)[0]??'').TYPE;
  if (t==='COMPACT') {
    if (typeof obj.compactPacketToken!=='string' || !obj.compactPacketToken) add('COMPACT_METADATA','compactPacketToken','COMPACT compactPacketToken 필수');
    if (!Array.isArray(obj.sampledIds) || obj.sampledIds.some(v=>typeof v!=='string'||!/^\d+$/u.test(v)) || new Set(obj.sampledIds).size!==obj.sampledIds.length) add('COMPACT_METADATA','sampledIds','sampledIds는 중복 없는 숫자 id 배열');
    if (typeof obj.compactedBy!=='string'||!aliasOk(obj.compactedBy)) add('COMPACT_METADATA','compactedBy','COMPACT compactedBy 별칭 필수');
    else if (strip(body).split(/\r\n|\r|\n/u).at(-1)!==`compacted-by:${obj.compactedBy}`) add('COMPACT_METADATA','compactedBy','compacted-by footer와 compactedBy 불일치');
  } else for (const k of ['compactPacketToken','sampledIds','compactedBy']) if (k in obj) add('METADATA_FORBIDDEN',k,`${k}는 COMPACT에만 허용`);
  if ('compactDeferredReason' in obj) {
    if (t!=='DECISION' && t!=='HANDOFF') add('METADATA_FORBIDDEN','compactDeferredReason','compactDeferredReason은 DECISION/HANDOFF에만 허용');
    if (typeof obj.compactDeferredReason!=='string'||!strip(obj.compactDeferredReason)||charCount(obj.compactDeferredReason)>500) add('INVALID_SHAPE','compactDeferredReason','compactDeferredReason은 공백 아닌 1–500자');
  }
  return reasons.length ? {ok:false,reasons} : {ok:true,value:obj as unknown as CommentPostRequest};
}
