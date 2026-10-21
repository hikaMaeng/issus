import type {IssusClient} from 'issus_domain/front';
import type {Principal} from '../../entry/client/index.js';
import {SessionBanner, SessionIssueForm, RevokeSession} from '../../features/session/index.js';
import {sessionKo} from '../../resources/index.js';

/** Identity changes require a fresh cookie exchange. */
export function Sessions({client, principal, onConnected}: {client: IssusClient; principal: Principal|null; onConnected: (principal: Principal) => void}) {
  return <><h1>{sessionKo.sessions}</h1><SessionBanner principal={principal}/>{principal && <RevokeSession client={client} principal={principal}/>}<SessionIssueForm principal={principal} onConnected={onConnected}/></>;
}
