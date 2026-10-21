import {useEffect, useState} from 'react';
import type {IssusClient} from 'issus_domain/front';
import {errorLines, repoPath, ClientError, createBrowserClient, type Principal} from '../../entry/client/index.js';
import {IssueContent} from '../issue/index.js';
import {useWriteOperation, OperationState} from '../../features/composer/index.js';
import {boardKo} from '../../resources/board.js';
import {ko, sessionKo} from '../../resources/index.js';
interface Discovery {number: number; state: string; via: string; evidence: unknown[]}
/** Only the authoritative registry discovery selects a board. Conflicts never fall back to arbitrary issues. */
export function Board({client, repo}: {client: IssusClient; repo: string; number?: number}) {
  const [board, setBoard] = useState<Discovery|null>(null), [errors, setErrors] = useState<string[]>([]), [status, setStatus] = useState(''), [code, setCode] = useState(0), [owner, setOwner] = useState(''), [principal, setPrincipal] = useState<Principal|null>(null), [version, setVersion] = useState(0), [registered, setRegistered] = useState<number|null>(null), [secret, setSecret] = useState('');
  const operation = useWriteOperation();
  useEffect(() => {
    const abort = new AbortController(); setErrors([]); setCode(0); setBoard(null);
    const query = new URLSearchParams(), source = new URLSearchParams(location.search); for (const key of ['issue','userBoard']) if (source.has(key)) query.set(key, source.get(key)!);
    void client.request<Discovery>(`${repoPath(repo)}/board${query.size ? '?' + query : ''}`, {signal: abort.signal}).then(({data}) => {if (!abort.signal.aborted) setBoard(data);}).catch(async error => {if (!abort.signal.aborted) {setErrors(errorLines(error)); setCode(error instanceof ClientError ? error.status : 0); if (error instanceof ClientError && error.status === 409) {try {const response = await client.request<{board_issue_id: number|null}>(repoPath(repo), {signal: abort.signal}); if (!abort.signal.aborted) setRegistered(response.data.board_issue_id);} catch {}}}});
    void client.request<Principal>('/v1/auth/me', {signal: abort.signal}).then(({data}) => {if (!abort.signal.aborted) setPrincipal(data);}).catch(() => {});
    return () => abort.abort();
  }, [client, repo, version]);
  async function ensure() {setErrors([]); try {await operation.run(secret ? createBrowserClient(secret) : client, `${repoPath(repo)}/board/ensure`, {method: 'POST', body: {boardOwner: owner}}); setStatus(boardKo.success); setVersion(value => value + 1);} catch (error) {setErrors(errorLines(error));} finally {setSecret('');}}
  return <><h1>{boardKo.title}</h1><section aria-label={boardKo.title}><p>{boardKo.coordination}</p>
    {errors.length > 0 && <div role="alert">{code === 404 ? <p>{boardKo.missing}</p> : code === 409 ? <p>{boardKo.conflict}</p> : null}{errors.map((line, index) => <p key={index}>{line}</p>)}</div>}
    {code === 409 && registered && <a href={`/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${registered}`}>{boardKo.reopen}</a>}
    {board ? <><section aria-label={boardKo.discovery}><dl><div><dt>{boardKo.via}</dt><dd>{board.via}</dd></div><div><dt>{ko.state}</dt><dd>{board.state}</dd></div></dl><pre>{JSON.stringify(board.evidence, null, 2)}</pre></section><IssueContent client={client} repo={repo} number={board.number} board heading={false}/></> : !errors.length && <p role="status" aria-busy="true">{ko.loading}</p>}
    {code === 404 && <form aria-label={boardKo.ensure} onSubmit={event => {event.preventDefault(); void ensure();}}><p>{boardKo.admin}</p>{principal?.kind !== 'bootstrap' && <><label htmlFor="board-management-token">{sessionKo.managementToken}</label><input id="board-management-token" type="password" autoComplete="off" disabled={operation.locked} value={secret} onChange={event => setSecret(event.target.value)} required={!operation.uncertain}/></>}<label htmlFor="board-owner">{boardKo.owner}</label><input id="board-owner" value={owner} disabled={operation.locked} onChange={event => setOwner(event.target.value)} required/><button type="submit" disabled={operation.busy}>{boardKo.ensure}</button></form>}
    {status && <p role="status">{status}</p>}<OperationState operation={operation}/>
  </section></>;
}
