import {useRef, useState} from 'react';
import type {IssusClient, RequestOptions} from 'issus_domain/front';
import {ClientError, OperationTimeout} from '../../entry/client/index.js';
import {composerKo} from '../../resources/composer.js';

type Options = Omit<RequestOptions,'key'|'onAccepted'>;
interface Attempt {client: IssusClient; path: string; options: Options; key: string; operationId?: string; statusUrl?: string}
/** A lost response retries the original immutable request. Definitive client errors release its key. */
export class WriteAttempt {
  pending?: Attempt;
  async run<T>(client: IssusClient, path: string, options: Options, accepted?: (id: string) => void): Promise<T> {
    const attempt = this.pending ??= {client, path, options: structuredClone(options), key: crypto.randomUUID()};
    try {
      const result = await attempt.client.write<T>(attempt.path, {...attempt.options, key: attempt.key, onAccepted: operation => {attempt.operationId = operation.operationId; attempt.statusUrl = operation.statusUrl; accepted?.(operation.operationId);}});
      this.pending = undefined;
      return result;
    } catch (error) {
      if (error instanceof ClientError && error.status >= 400 && error.status < 500) this.pending = undefined;
      if (error instanceof OperationTimeout) {attempt.operationId = error.operationId; accepted?.(error.operationId);}
      throw error;
    }
  }
}
/** All U2 writes expose accepted operation IDs and preserve uncertain request identity across retries. */
export function useWriteOperation() {
  const model = useRef(new WriteAttempt());
  const [busy, setBusy] = useState(false), [operationId, setOperationId] = useState(''), [uncertain, setUncertain] = useState(false);
  async function run<T>(client: IssusClient, path: string, options: Options): Promise<T> {
    if (busy) throw new Error(composerKo.busy);
    setBusy(true); setOperationId('');
    try {return await model.current.run<T>(client, path, options, setOperationId);}
    finally {setBusy(false); setUncertain(!!model.current.pending); if (!model.current.pending) setOperationId('');}
  }
  return {run, busy, uncertain, operationId, locked: busy || uncertain, pendingPath: model.current.pending?.path};
}
/** Pending is not successful posting. This region deliberately contains no request body or secret. */
export function OperationState({operation}: {operation: {busy: boolean; uncertain: boolean; operationId: string}}) {
  return (operation.operationId || operation.uncertain) ? <section aria-label={composerKo.pending}><p role="status">{composerKo.waiting}{operation.operationId ? `: ${operation.operationId}` : ''}</p>{operation.uncertain && <p>{composerKo.uncertain}</p>}</section> : null;
}
