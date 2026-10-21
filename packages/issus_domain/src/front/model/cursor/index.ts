/** Pull and stream cursors are intentionally separate; received never implies processed. */
export interface ClientCursors {
  paginationCursor?: string | null;
  refreshCursor?: string | null;
  processedCursor?: string | null;
  transportCursor?: string | null;
}

export interface ClientScope {
  server: string;
  owner: string;
  alias: string;
  sid: string;
  repos: {repo: string; issues: number[]; boards: number[]}[];
  me: string[];
  sinceCompact: boolean;
}

/** Stable serialized identity. Tokens are never part of scope or persisted cursor data. */
export function scopeKey(scope: ClientScope): string {
  const unique = <T extends string | number>(values: T[]): T[] => [...new Set(values)].sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b),'en'));
  return JSON.stringify({
    server: scope.server.replace(/\/+$/u,''), owner: scope.owner.toLowerCase(),
    alias: scope.alias.toLowerCase(), sid: scope.sid,
    repos: scope.repos.map(r=>({repo:r.repo,issues:unique(r.issues),boards:unique(r.boards)})).sort((a,b)=>a.repo.localeCompare(b.repo,'en')),
    me: unique(scope.me.map(m=>m.toLowerCase())), sinceCompact: scope.sinceCompact
  });
}

/** Decimal comparison without Number conversion, including values beyond 2^53. */
export const compareSequence = (a: string, b: string): number => BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;
