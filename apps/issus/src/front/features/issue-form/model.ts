import {parseIssueBodyEnvelope} from 'issus_domain/common';
import {protocolTime} from '../composer/index.js';

export interface BodyDraft {fields: Record<string,string>; text: string}
export const bodyKeys = ['STATE','OWNER','UPDATED','REPLY-IN','COMPACT','BOARD'] as const;
/** Parsing is an editing aid; invalid raw bodies are still sent unchanged to canonical validation. */
export function parseBodyDraft(body: string): BodyDraft {
  const at = body.indexOf('\n'), line = at < 0 ? body : body.slice(0, at);
  const fields: Record<string,string> = {};
  for (const token of line.split(/\s+/)) {const colon = token.indexOf(':'); if (colon > 0) fields[token.slice(0, colon)] = token.slice(colon + 1);}
  return {fields, text: at < 0 ? '' : body.slice(at + 1)};
}
/** Form application preserves protected edit pointers and never creates initial managed pointers. */
export function bodyFromFields(draft: BodyDraft, previous?: string): string {
  const fields = {...draft.fields}, before = previous ? parseBodyDraft(previous).fields : {};
  for (const key of ['REPLY-IN','COMPACT']) {if (previous && before[key]) fields[key] = before[key]; else delete fields[key];}
  if (previous) fields.OWNER = before.OWNER;
  return bodyKeys.filter(key => fields[key]).map(key => `${key}:${fields[key]}`).join(' ') + '\n' + draft.text;
}
/** Default header is valid syntax without guessing registry identity or managed pointers. */
export function initialBody(alias: string, now = new Date()): string {
  return `STATE:running OWNER:${alias} UPDATED:${protocolTime(now)}\nGOAL: \nSCOPE: \nNON-SCOPE: \nNEXT: `;
}
/** Expose the reused canonical parser for preview without introducing a second validator. */
export const bodyEnvelope = (body: string) => parseIssueBodyEnvelope(body).envelope ?? {};

export interface EditBase {body: string; revision: number; etag: string}
/** A conflict is inert until explicit merge: retain both the draft and original If-Match. */
export class EditSession {
  latest?: EditBase;
  needsCheck = false;
  constructor(public base: EditBase, public draft = base.body) {}
  conflict(latest: EditBase): void {this.latest = latest;}
  merge(): void {if (this.latest) {this.base = this.latest; this.latest = undefined; this.needsCheck = true;}}
}
