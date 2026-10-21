import {repoPath, type IssueSummary} from '../../entry/client/index.js';
import {ko, feedbackKo} from '../../resources/index.js';

export const workStates = ['queued','running','blocked','hold','done','failed','cancelled','pending-user'] as const;
export interface IssueFilters {state: string; workState: string; owner: string; alias: string; q: string; sort: string}
/** URL state remains shareable while unsupported fields never reach the server. */
export function readFilters(search: string): IssueFilters {
  const p = new URLSearchParams(search);
  return {state: ['open','closed','all'].includes(p.get('state') ?? '') ? p.get('state')! : 'open', workState: workStates.includes(p.get('workState') as typeof workStates[number]) ? p.get('workState')! : '', owner: p.get('owner') ?? '', alias: p.get('alias') ?? '', q: p.get('q') ?? '', sort: ['number-desc','number-asc','title-asc','updated'].includes(p.get('sort') ?? '') ? p.get('sort')! : 'number-desc'};
}
/** Filtering follows complete server pagination and combines state/search with AND. */
export function filterIssues(items: readonly IssueSummary[], filters: IssueFilters): IssueSummary[] {
  const q = filters.q.toLocaleLowerCase('ko').replace(/^#/, '');
  return items.filter(item => (!filters.workState || item.state === filters.workState) && (!q || item.title.toLocaleLowerCase('ko').includes(q) || String(item.number).includes(q))).sort((a,b) => filters.sort === 'updated' ? 0 : filters.sort === 'number-asc' ? a.number - b.number : filters.sort === 'title-asc' ? a.title.localeCompare(b.title, 'ko') || a.number - b.number : b.number - a.number);
}
/** Q2 contract confirmed by core REPORT6314466185; workState stays local. */
export function issueListPath(repo: string, filters: IssueFilters, advanced = true): string {
  const query = new URLSearchParams({state: filters.state});
  if (advanced) {
    for (const key of ['owner','alias','q'] as const) if (filters[key]) query.set(key, filters[key]);
    query.set('sort', filters.sort === 'updated' ? 'updated' : 'number'); query.set('order', ['updated','number-desc'].includes(filters.sort) ? 'desc' : 'asc');
  }
  return `${repoPath(repo)}/issues?${query}`;
}
/** Preserve unrelated URL keys and expose all active supported conditions. */
export function filterSearch(search: string, filters: IssueFilters): string {
  const params = new URLSearchParams(search);
  for (const [key,value] of Object.entries(filters)) {if (value) params.set(key, value); else params.delete(key);}
  return params.toString();
}
/** Q2 controls are explicitly unavailable until the server handoff is verified. */
export function IssueFilterForm({filters, onChange, onRefresh, advanced = true}: {filters: IssueFilters; onChange: (next: IssueFilters) => void; onRefresh: () => void; advanced?: boolean}) {
  const change = (key: keyof IssueFilters, value: string) => onChange({...filters, [key]: value});
  return <form aria-label={feedbackKo.filters} onSubmit={event => {event.preventDefault(); onRefresh();}}><div className="filters-grid">
    <div><label htmlFor="issue-filter">{ko.filter}</label><select id="issue-filter" value={filters.state} onChange={event => change('state', event.target.value)}>{Object.entries(ko.statusFilter).map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></div>
    <div><label htmlFor="work-state">{feedbackKo.workState}</label><select id="work-state" value={filters.workState} onChange={event => change('workState', event.target.value)}><option value="">{ko.any}</option>{workStates.map(state => <option key={state}>{state}</option>)}</select></div>
    <div><label htmlFor="owner-alias">{feedbackKo.ownerAlias}</label><input id="owner-alias" value={filters.owner} onChange={event => change('owner', event.target.value)} disabled={!advanced} aria-describedby="q2-reason"/></div>
    <div><label htmlFor="participant-alias">{feedbackKo.participant}</label><input id="participant-alias" value={filters.alias} onChange={event => change('alias', event.target.value)} disabled={!advanced} aria-describedby="q2-reason"/></div>
    <div><label htmlFor="issue-search">{feedbackKo.search}</label><input id="issue-search" type="search" value={filters.q} onChange={event => change('q', event.target.value)}/></div>
    <div><label htmlFor="issue-sort">{feedbackKo.sort}</label><select id="issue-sort" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="number-desc">{feedbackKo.numberDesc}</option><option value="number-asc">{feedbackKo.numberAsc}</option><option value="title-asc">{feedbackKo.titleAsc}</option><option value="updated" disabled={!advanced}>{feedbackKo.updated}</option></select></div>
  </div><p id="q2-reason">{advanced ? feedbackKo.q2Ready : feedbackKo.q2}</p><button type="submit">{ko.refresh}</button></form>;
}
