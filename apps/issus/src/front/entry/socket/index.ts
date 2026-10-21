import {ClientError, StreamClosed, type SocketFactory} from 'issus_domain/front';

/** Same-origin browser WS uses the HttpOnly cookie; P7 owns reconnect/receipt/cursor semantics. */
export const browserSocket: SocketFactory = (url, _headers, signal) => new Promise((resolve, reject) => {
  const target = new URL(url);
  if (target.host !== location.host || target.protocol !== (location.protocol === 'https:' ? 'wss:' : 'ws:')) {
    reject(new ClientError(403, 'WS_ORIGIN_FORBIDDEN')); return;
  }
  if (signal?.aborted) {reject(signal.reason); return;}
  const socket = new WebSocket(url, ['issus.v1']), queued: string[] = [];
  let opened = false, done = false, failure: unknown, bytes = 0;
  let waiting: {resolve: (value: IteratorResult<string>) => void; reject: (error: unknown) => void}|undefined;
  const finish = (error?: unknown) => {
    if (done) return;
    done = true; failure = error; signal?.removeEventListener('abort', abort);
    if (!opened) {reject(error ?? new StreamClosed(1001)); return;}
    if (waiting) {const next = waiting; waiting = undefined; if (error) next.reject(error); else next.resolve({value: undefined, done: true});}
  };
  const close = () => {finish(); socket.close(1000);};
  const abort = () => close();
  signal?.addEventListener('abort', abort, {once: true});
  socket.addEventListener('error', () => finish(new ClientError(0, 'WEBSOCKET_CONNECTION_FAILED')));
  socket.addEventListener('close', event => finish(signal?.aborted ? undefined : new StreamClosed(event.code)));
  socket.addEventListener('message', event => {
    if (done) return;
    if (typeof event.data !== 'string') {finish(new ClientError(0, 'BINARY_FRAME_FORBIDDEN')); socket.close(1008); return;}
    if (waiting) {const next = waiting; waiting = undefined; next.resolve({value: event.data, done: false});}
    else {
      bytes += new TextEncoder().encode(event.data).length;
      if (queued.length >= 256 || bytes > 1048576) {finish(new StreamClosed(1013)); socket.close(1013); return;}
      queued.push(event.data);
    }
  });
  socket.addEventListener('open', () => {
    if (done) {socket.close(1000); return;}
    opened = true;
    resolve({
      send: async text => {if (done || socket.readyState !== WebSocket.OPEN) throw new ClientError(0, 'WEBSOCKET_SEND_FAILED'); socket.send(text);},
      close,
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (queued.length) {const text = queued.shift()!; bytes -= new TextEncoder().encode(text).length; return {value: text, done: false};}
          if (done) {if (failure) throw failure; return {value: undefined, done: true};}
          return new Promise<IteratorResult<string>>((resolve, reject) => {waiting = {resolve, reject};});
        },
        return: async () => {close(); return {value: undefined, done: true};},
      }),
    });
  }, {once: true});
});
