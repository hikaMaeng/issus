import {parseDomainServerFrame} from '../../../common/protocol/runtime/index.js';
import type {DomainServerFrame} from '../../../common/protocol/subscription/index.js';
import {compareSequence} from '../cursor/index.js';

export class FrameError extends Error {
  constructor(readonly code: string) { super(code); this.name='FrameError'; }
}

/** One strict P3 protocol decoder for both WebSocket and SSE. */
export function decodeFrame(text: string): DomainServerFrame {
  let raw:unknown;
  try { raw=JSON.parse(text); } catch { throw new FrameError('INVALID_FRAME_JSON'); }
  const frame=parseDomainServerFrame(raw);
  if(!frame) throw new FrameError('INVALID_SERVER_FRAME');
  return frame;
}

/** SSE chunk parser, including CRLF split across chunks, multiline data, and heartbeat comments. */
export class SseFrameParser {
  private buffer='';
  private data:string[]=[];
  private dataChars=0;
  private event='';
  private id='';
  private readonly decoder=new TextDecoder('utf-8',{fatal:true});

  push(chunk: Uint8Array | string, final=false): DomainServerFrame[] {
    this.buffer+=typeof chunk==='string'?chunk:this.decoder.decode(chunk,{stream:!final});
    const frames:DomainServerFrame[]=[];
    while(true) {
      const m=/[\r\n]/u.exec(this.buffer);
      if(!m) break;
      const i=m.index;
      if(this.buffer[i]==='\r' && i===this.buffer.length-1 && !final) break;
      const line=this.buffer.slice(0,i), width=this.buffer[i]==='\r'&&this.buffer[i+1]==='\n'?2:1;
      this.buffer=this.buffer.slice(i+width);
      this.line(line,frames);
    }
    if(final && this.buffer) {this.line(this.buffer,frames);this.buffer='';}
    if(this.buffer.length>1048576 || this.data.reduce((n,s)=>n+s.length,0)>1048576) throw new FrameError('FRAME_TOO_LARGE');
    return frames;
  }

  private line(line:string,frames:DomainServerFrame[]):void {
    if(!line) {
      if(this.data.length && (!this.event||this.event==='frame')) {
        const frame=decodeFrame(this.data.join('\n'));
        if(this.id && 'cursor' in frame && frame.cursor && this.id!==frame.cursor) throw new FrameError('SSE_CURSOR_MISMATCH');
        frames.push(frame);
      }
      this.data=[];this.dataChars=0;this.event='';this.id='';return;
    }
    if(line.startsWith(':')) return;
    const at=line.indexOf(':'), key=at<0?line:line.slice(0,at), value=at<0?'':line.slice(at+1).replace(/^ /u,'');
    if(key==='data') {this.dataChars+=value.length;if(this.dataChars>1048576) throw new FrameError('FRAME_TOO_LARGE');this.data.push(value);}
    else if(key==='event') this.event=value;
    else if(key==='id') this.id=value;
  }
}

/** In-memory replay dedupe plus per-stream ordering; sequences across streams are unrelated. */
export class StreamModel {
  private readonly seen=new Set<string>();
  private readonly sequences=new Map<string,string>();

  /** An expired cursor starts a fresh snapshot; keep event id dedupe but reset its replay ordering boundary. */
  resetOrdering():void {this.sequences.clear();}

  accept(frame: DomainServerFrame): boolean {
    if(frame.type!=='event') return true;
    const event=frame.event;
    if(this.seen.has(event.eventId)) return false;
    const previous=this.sequences.get(event.streamId);
    if(previous && compareSequence(event.sequence,previous)<=0) throw new FrameError('STREAM_SEQUENCE_REGRESSION');
    this.seen.add(event.eventId);this.sequences.set(event.streamId,event.sequence);
    if(this.seen.size>4096) this.seen.delete(this.seen.values().next().value!);
    return true;
  }
}
