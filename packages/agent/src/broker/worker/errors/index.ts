/** Only an explicitly classified domain rejection becomes a terminal result. */
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "DomainError"; }
}
