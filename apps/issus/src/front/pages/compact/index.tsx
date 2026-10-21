import type {IssusClient} from 'issus_domain/front';
import {CompactAssistant} from '../../features/compact-assistant/index.js';
import {compactKo} from '../../resources/compact.js';

/** AppShell owns the sole main landmark; the assistant owns only the summary workflow. */
export function Compact({client,repo,number}: {client:IssusClient;repo:string;number:number}) {
  return <><h1>{compactKo.title}</h1><a href={`/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${number}`}>{compactKo.source}</a><CompactAssistant client={client} repo={repo} number={number}/></>;
}
