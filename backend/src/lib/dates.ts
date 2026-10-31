export type BillingInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

const pad = (n: number) => String(n).padStart(2, '0');
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function parse(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

/** Today's date in the server's local timezone, as 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso);
  return fromUtc(new Date(Date.UTC(y, m, d + days)));
}

function addMonths(iso: string, months: number): string {
  const { y, m, d } = parse(iso);
  const lastDayOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  // Clamp: 31 Jan + 1 month = 28/29 Feb
  return fromUtc(new Date(Date.UTC(y, m + months, Math.min(d, lastDayOfTarget))));
}

/** Moves a date forward by `count` billing intervals. */
export function addInterval(iso: string, interval: BillingInterval, count = 1): string {
  switch (interval) {
    case 'daily':
      return addDays(iso, count);
    case 'weekly':
      return addDays(iso, 7 * count);
    case 'monthly':
      return addMonths(iso, count);
    case 'yearly':
      return addMonths(iso, 12 * count);
  }
}

export const maxDate = (a: string, b: string) => (a > b ? a : b);

function daysBetween(from: string, to: string) {
  const a = parse(from);
  const b = parse(to);
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86_400_000);
}

/**
 * The first billing date strictly after `current` on the schedule anchored at `anchor` (the subscription start).
 * Anchoring avoids month-end drift: a subscription started on 31 Aug bills on 30 Sep and then 31 Oct, not 30 Oct.
 */
export function nextAnchoredDate(anchor: string, current: string, interval: BillingInterval): string {
  if (interval === 'daily' || interval === 'weekly') {
    const step = interval === 'daily' ? 1 : 7;
    const periods = Math.floor(daysBetween(anchor, current) / step) + 1;
    return addDays(anchor, Math.max(periods, 0) * step);
  }
  const step = interval === 'monthly' ? 1 : 12;
  const a = parse(anchor);
  const c = parse(current);
  let months = Math.floor(((c.y - a.y) * 12 + (c.m - a.m)) / step) * step;
  let candidate = addMonths(anchor, months);
  while (candidate <= current) {
    months += step;
    candidate = addMonths(anchor, months);
  }
  return candidate;
}
