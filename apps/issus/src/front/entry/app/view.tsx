import type {IssusClient} from 'issus_domain/front';
import type {Principal} from '../client/index.js';
import {Repos} from '../../pages/repos/index.js';
import {Issues} from '../../pages/issues/index.js';
import {Issue} from '../../pages/issue/index.js';
import {IssueCreate} from '../../pages/issue-create/index.js';
import {IssueEdit} from '../../pages/issue-edit/index.js';
import {Board} from '../../pages/board/index.js';
import {Compact} from '../../pages/compact/index.js';
import {Inbox} from '../../pages/inbox/index.js';
import {Login} from '../../pages/login/index.js';
import {Sessions} from '../../pages/sessions/index.js';
import {Roster} from '../../pages/roster/index.js';
import {ko} from '../../resources/index.js';
import type {AppRoute} from './routes.js';

/** Production and route tests share the same public component assembly. */
export function appRouteView(route: AppRoute, client: IssusClient, principal: Principal|null, connected: (value: Principal) => void) {
  if (route.page === 'sessions') return <Sessions client={client} principal={principal} onConnected={connected}/>;
  if (!principal || route.page === 'login') return <Login/>;
  switch (route.page) {
    case 'repos': return <Repos client={client}/>;
    case 'issues': return <Issues client={client} repo={route.repo}/>;
    case 'issue': return <Issue client={client} repo={route.repo} number={route.number}/>;
    case 'issue-create': return <IssueCreate client={client} repo={route.repo}/>;
    case 'issue-edit': return <IssueEdit client={client} repo={route.repo} number={route.number}/>;
    case 'board': return <Board client={client} repo={route.repo}/>;
    case 'compact': return <Compact client={client} repo={route.repo} number={route.number}/>;
    case 'inbox': return <Inbox client={client} principal={principal}/>;
    case 'roster': return <Roster client={client} principal={principal} owner={route.owner}/>;
    default: return <><h1>{ko.notFound}</h1><p role="alert">{ko.notFound}</p></>;
  }
}
