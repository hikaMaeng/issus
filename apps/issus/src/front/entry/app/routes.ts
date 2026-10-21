export type AppRoute =
  | {page: 'repos'|'sessions'|'login'|'not-found'; repo?: undefined}
  | {page: 'inbox'; repo?: string}
  | {page: 'roster'; owner: string; repo?: string}
  | {page: 'issues'|'board'|'issue-create'; repo: string}
  | {page: 'issue'|'issue-edit'|'compact'; repo: string; number: number};

/** Decode once; malformed and ambiguous URLs render a safe not-found surface. */
export function resolveAppRoute(pathname: string, search = ''): AppRoute {
  const repo = new URLSearchParams(search).get('repo') ?? undefined;
  if (pathname === '/' || pathname === '/repos') return {page: 'repos'};
  if (pathname === '/sessions') return {page: 'sessions'};
  if (pathname === '/login') return {page: 'login'};
  if (pathname === '/inbox') return {page: 'inbox', repo};
  try {
    const roster = /^\/owners\/([^/]+)\/aliases\/?$/.exec(pathname);
    if (roster) return {page: 'roster', owner: decodeURIComponent(roster[1]), repo};
    const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/(board|issues)(?:\/(new|[1-9]\d*)(?:\/(edit|compact))?)?)?\/?$/.exec(pathname);
    if (!match) return {page: 'not-found'};
    const scopedRepo = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
    if (match[3] === 'board') return match[4] ? {page: 'not-found'} : {page: 'board', repo: scopedRepo};
    if (match[4] === 'new') return match[5] ? {page: 'not-found'} : {page: 'issue-create', repo: scopedRepo};
    if (!match[4]) return {page: 'issues', repo: scopedRepo};
    const number = Number(match[4]);
    if (!Number.isSafeInteger(number)) return {page: 'not-found'};
    return {page: match[5] === 'edit' ? 'issue-edit' : match[5] === 'compact' ? 'compact' : 'issue', repo: scopedRepo, number};
  } catch {return {page: 'not-found'};}
}
