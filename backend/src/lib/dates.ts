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
