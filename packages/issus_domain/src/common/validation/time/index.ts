import { ISO } from '../constants/index.js';
/** issue_post.py:54–62; calendar validation does not accept JS Date's overflow normalization. */
export function isoOk(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const n = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?([+-])(\d{2}):?(\d{2})$/.exec(value);
  if (!n) return false;
  const [y,mo,d,h,mi,s,oh,om] = [n[1],n[2],n[3],n[4],n[5],n[6] ?? '0',n[8],n[9]].map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  // datetime.fromisoformat normalizes offset minutes; only total offset must be <24h.
  return y >= 1 && y <= 9999 && mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo-1] && h <= 23 && mi <= 59 && s <= 59 && oh * 60 + om < 1440;
}
export const iso_ok = isoOk;
