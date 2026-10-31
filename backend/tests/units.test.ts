import { describe, expect, it } from 'vitest';
import { addDays, addInterval, maxDate, nextAnchoredDate } from '../src/lib/dates.js';
import { lineAmounts, sumAmounts } from '../src/lib/money.js';

describe('money', () => {
  it('computes line subtotal, tax and total without float drift', () => {
    expect(lineAmounts(3, 0.1, 0)).toEqual({ subtotal: 0.3, taxAmount: 0, total: 0.3 });
    expect(lineAmounts(10, 2560, 18)).toEqual({ subtotal: 25600, taxAmount: 4608, total: 30208 });
    expect(lineAmounts(1, 99.99, 18)).toEqual({ subtotal: 99.99, taxAmount: 18, total: 117.99 });
  });

  it('sums lines in paise', () => {
    const total = sumAmounts([lineAmounts(1, 0.1, 0), lineAmounts(1, 0.2, 0)]);
    expect(total.total).toBe(0.3);
  });
});

describe('dates', () => {
  it('adds billing intervals', () => {
    expect(addInterval('2026-01-15', 'daily')).toBe('2026-01-16');
    expect(addInterval('2026-01-15', 'weekly', 2)).toBe('2026-01-29');
    expect(addInterval('2026-01-15', 'monthly')).toBe('2026-02-15');
    expect(addInterval('2026-01-15', 'yearly')).toBe('2027-01-15');
  });

  it('clamps month ends', () => {
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addInterval('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(addInterval('2028-02-29', 'yearly')).toBe('2029-02-28');
  });

  it('anchors billing dates to the start date so month ends do not drift', () => {
    expect(nextAnchoredDate('2026-08-31', '2026-08-31', 'monthly')).toBe('2026-09-30');
    expect(nextAnchoredDate('2026-08-31', '2026-09-30', 'monthly')).toBe('2026-10-31');
    expect(nextAnchoredDate('2026-01-31', '2026-02-28', 'monthly')).toBe('2026-03-31');
    expect(nextAnchoredDate('2028-02-29', '2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(nextAnchoredDate('2028-02-29', '2029-02-28', 'yearly')).toBe('2030-02-28');
    expect(nextAnchoredDate('2026-01-01', '2026-01-01', 'weekly')).toBe('2026-01-08');
    expect(nextAnchoredDate('2026-01-01', '2026-01-03', 'daily')).toBe('2026-01-04');
    // Resumed mid-cycle: the next date snaps back onto the original schedule
    expect(nextAnchoredDate('2026-01-15', '2026-03-10', 'monthly')).toBe('2026-03-15');
    expect(nextAnchoredDate('2026-01-15', '2026-03-20', 'monthly')).toBe('2026-04-15');
    expect(nextAnchoredDate('2026-01-15', '2026-05-01', 'yearly')).toBe('2027-01-15');
  });

  it('handles day arithmetic across years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(maxDate('2026-01-02', '2026-01-10')).toBe('2026-01-10');
  });
});
