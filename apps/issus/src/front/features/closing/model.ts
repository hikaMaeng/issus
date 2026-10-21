/** Only explicit server blocker id arrays become references. Booleans/reasons are not invented ids. */
export function blockerReferences(details?: Record<string,unknown>): {kind: string; id: string}[] {
  return Object.entries(details ?? {}).flatMap(([kind, value]) => (Array.isArray(value) ? value : ['finalReport','compact'].includes(kind) ? [value] : []).filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)).map(id => ({kind, id})));
}
