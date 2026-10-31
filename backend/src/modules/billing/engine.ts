import type pg from 'pg';
import { pool, withTransaction } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { addDays, nextAnchoredDate, todayIso, type BillingInterval } from '../../lib/dates.js';
import { notFound } from '../../lib/errors.js';
import { eligibleDiscounts } from '../discounts/routes.js';
import { activeTaxRules } from '../taxes/routes.js';
import { calculateInvoice, type CalcLine, type TaxRule } from './calculate.js';

/** Safety valve for very old daily subscriptions: a single run never creates more than this many periods per subscription. */
export const MAX_PERIODS_PER_RUN = 400;

interface DueSubscription {
  id: number;
  subscriptionNumber: string;
  customerId: number;
  status: string;
  pausedDate: string | null;
  startDate: string;
  expiryDate: string | null;
  nextBillingDate: string | null;
  paymentTermsDays: number;
  billingInterval: BillingInterval;
  customerName: string;
  customerEmail: string | null;
  billingAddress: string | null;
  taxNumber: string | null;
  region: string | null;
}

interface SubscriptionLine extends CalcLine {
  id: number;
  variantId: number | null;
  description: string;
}

export interface SubscriptionBillingResult {
  subscriptionId: number;
  invoiceIds: number[];
  periodsSkipped: number;
}

export interface BillingRunResult {
  runId: number;
  runDate: string;
  subscriptionsChecked: number;
  invoicesCreated: number;
  periodsSkipped: number;
  invoiceIds: number[];
  errors: { subscriptionId: number; error: string }[];
}

export interface BillingOptions {
  autoConfirm?: boolean;
  runId?: number | null;
  actorId?: number | null;
  /** Auto-expiry catch-up only: bill active days before a current pause, never the paused interval. */
  includePausedBeforePause?: boolean;
}

async function loadSubscription(client: pg.PoolClient, id: number) {
  const { rows } = await client.query<DueSubscription>(
    `SELECT s.id, s.subscription_number AS "subscriptionNumber", s.customer_id AS "customerId", s.status,
            s.start_date AS "startDate", s.expiry_date AS "expiryDate", s.next_billing_date AS "nextBillingDate",
            s.payment_terms_days AS "paymentTermsDays", s.paused_at::date AS "pausedDate", pl.billing_interval AS "billingInterval",
            c.company_name AS "customerName", COALESCE(c.email, u.email) AS "customerEmail",
            c.billing_address AS "billingAddress", c.tax_number AS "taxNumber", c.region
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = c.user_id
      WHERE s.id = $1
      FOR UPDATE OF s`,
    [id],
  );
  return rows[0];
}

async function loadLines(client: pg.PoolClient, subscriptionId: number) {
  const { rows } = await client.query<SubscriptionLine>(
    `SELECT l.id, l.line_type AS "lineType", l.product_id AS "productId", p.type AS "productType", l.variant_id AS "variantId",
            l.description, l.quantity, l.unit_price AS "unitPrice", l.tax_rate AS "fallbackTaxRate"
       FROM subscription_lines l LEFT JOIN products p ON p.id = l.product_id
      WHERE l.subscription_id = $1
      ORDER BY l.sort_order, l.id`,
    [subscriptionId],
  );
  return rows;
}

/** Creates the invoice for one billing period. Returns null when that period was already billed. */
async function createPeriodInvoice(
  client: pg.PoolClient,
  sub: DueSubscription,
  lines: SubscriptionLine[],
  taxRules: TaxRule[],
  periodStart: string,
  periodEnd: string,
  invoiceDate: string,
  opts: BillingOptions,
) {
  // Discount validity is judged on the period being billed, so a discount stops as soon as it expires.
  const discounts = await eligibleDiscounts(client, sub.id, periodStart);
  const calc = calculateInvoice(lines, discounts, taxRules, sub.region);
  const status = calc.grandTotal === 0 ? 'paid' : opts.autoConfirm ? 'confirmed' : 'draft';

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO invoices (subscription_id, customer_id, billing_run_id, status, billing_period_start, billing_period_end,
                           invoice_date, due_date, customer_name, customer_email, billing_address, tax_number,
                           subtotal, discount_total, tax_total, grand_total, confirmed_at, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, ${status !== 'draft' ? 'now()' : 'NULL'}, ${status === 'paid' ? 'now()' : 'NULL'})
     ON CONFLICT ON CONSTRAINT uq_invoices_subscription_period DO NOTHING
     RETURNING id`,
    [
      sub.id,
      sub.customerId,
      opts.runId ?? null,
      status,
      periodStart,
      periodEnd,
      invoiceDate,
      addDays(invoiceDate, sub.paymentTermsDays),
      sub.customerName,
      sub.customerEmail,
      sub.billingAddress,
      sub.taxNumber,
      calc.subtotal,
      calc.discountTotal,
      calc.taxTotal,
      calc.grandTotal,
    ],
  );
  const invoiceId = inserted.rows[0]?.id;
  if (!invoiceId) return null;

  for (const [i, line] of lines.entries()) {
    const c = calc.lines[i];
    await client.query(
      `INSERT INTO invoice_lines (invoice_id, subscription_line_id, line_type, product_id, variant_id, description, quantity,
                                  unit_price, subtotal, discount_amount, tax_rate, tax_amount, total, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [invoiceId, line.id, line.lineType, line.productId, line.variantId, line.description, line.quantity, line.unitPrice, c.subtotal, c.discountAmount, c.taxRate, c.taxAmount, c.total, i],
    );
  }
  for (const d of calc.appliedDiscounts) {
    await client.query('INSERT INTO invoice_discounts (invoice_id, discount_id, name, amount) VALUES ($1, $2, $3, $4)', [invoiceId, d.discountId, d.name, d.amount]);
    await client.query('UPDATE discounts SET usage_count = usage_count + 1, updated_at = now() WHERE id = $1', [d.discountId]);
  }
  await logAudit(opts.actorId, 'invoice.generated', 'invoice', invoiceId, { subscriptionId: sub.id, periodStart, periodEnd, status }, client);
  return invoiceId;
}

/**
 * Bills every due period of one active subscription (catching up missed periods) inside one transaction.
 * Safe to call repeatedly: the UNIQUE(subscription_id, period_start, period_end) constraint means a period is never billed twice,
 * and next_billing_date only moves forward once a period is billed, so no period is skipped.
 */
export async function billSubscriptionInTransaction(client: pg.PoolClient, subscriptionId: number, runDate = todayIso(), opts: BillingOptions = {}, taxRules?: TaxRule[]): Promise<SubscriptionBillingResult> {
  const sub = await loadSubscription(client, subscriptionId);
  if (!sub) throw notFound('Subscription not found');
  const result: SubscriptionBillingResult = { subscriptionId, invoiceIds: [], periodsSkipped: 0 };
  const pausedThrough = sub.status === 'paused' && opts.includePausedBeforePause && sub.pausedDate ? addDays(sub.pausedDate, -1) : null;
  if ((sub.status !== 'active' && !pausedThrough) || !sub.nextBillingDate) return result;
  const throughDate = pausedThrough && pausedThrough < runDate ? pausedThrough : runDate;

  const rules = taxRules ?? (await activeTaxRules(client));
  const lines = await loadLines(client, sub.id);
  const billed = await client.query<{ start: string; end: string }>(
    'SELECT billing_period_start AS start, billing_period_end AS end FROM invoices WHERE subscription_id = $1 ORDER BY billing_period_start, billing_period_end DESC',
    [sub.id],
  );
  // Every invoice carries the full recurring price, including an expiry-truncated final cycle.
  // Treat that original cycle as billed so renewal/retries cannot charge its remainder again.
  const billedCycles = billed.rows.map((period) => {
    const cycleEnd = addDays(nextAnchoredDate(sub.startDate, period.start, sub.billingInterval), -1);
    return { start: period.start, end: period.end > cycleEnd ? period.end : cycleEnd };
  });
  let next: string | null = sub.nextBillingDate;

  for (let i = 0; next && next <= throughDate && i < MAX_PERIODS_PER_RUN; i += 1) {
    if (sub.expiryDate && next > sub.expiryDate) {
      next = null;
      break;
    }
    // A rewound cursor must skip an already charged cycle, even when renewal would now calculate
    // a longer end date for an older expiry-truncated invoice.
    const covered = billedCycles.find((period) => period.start <= next! && period.end >= next!);
    if (covered) {
      result.periodsSkipped += 1;
      next = addDays(covered.end, 1);
      continue;
    }
    const periodStart: string = next;
    const nextStart = nextAnchoredDate(sub.startDate, periodStart, sub.billingInterval);
    let periodEnd = addDays(nextStart, -1);
    if (sub.expiryDate && periodEnd > sub.expiryDate) periodEnd = sub.expiryDate;
    if (pausedThrough && periodEnd > pausedThrough) periodEnd = pausedThrough;
    const upcoming = billed.rows.find((period) => period.start > periodStart && period.start <= periodEnd);
    if (upcoming) periodEnd = addDays(upcoming.start, -1);

    const invoiceId = await createPeriodInvoice(client, sub, lines, rules, periodStart, periodEnd, runDate, opts);
    if (invoiceId) result.invoiceIds.push(invoiceId);
    else result.periodsSkipped += 1;

    next = addDays(periodEnd, 1);
  }
  if (next && sub.expiryDate && next > sub.expiryDate) next = null;

  await client.query('UPDATE subscriptions SET next_billing_date = $2, updated_at = now() WHERE id = $1', [sub.id, next]);
  return result;
}

export async function billSubscription(subscriptionId: number, runDate = todayIso(), opts: BillingOptions = {}, taxRules?: TaxRule[]) {
  return withTransaction((client) => billSubscriptionInTransaction(client, subscriptionId, runDate, opts, taxRules));
}

/** Bills due active periods and pre-pause arrears. Paused intervals stay unbilled; one failure never stops the run. */
export async function runBilling(runDate = todayIso(), opts: Omit<BillingOptions, 'runId'> = {}): Promise<BillingRunResult> {
  const run = await pool.query<{ id: number }>('INSERT INTO billing_runs (run_date, triggered_by) VALUES ($1, $2) RETURNING id', [runDate, opts.actorId ?? null]);
  const runId = run.rows[0].id;
  const result: BillingRunResult = { runId, runDate, subscriptionsChecked: 0, invoicesCreated: 0, periodsSkipped: 0, invoiceIds: [], errors: [] };

  try {
    const due = await pool.query<{ id: number }>(
      `SELECT id FROM subscriptions
        WHERE next_billing_date IS NOT NULL AND next_billing_date <= $1
          AND (status = 'active' OR (status = 'paused' AND paused_at IS NOT NULL AND next_billing_date < paused_at::date))
        ORDER BY id`,
      [runDate],
    );
    const taxRules = await activeTaxRules();
    for (const { id } of due.rows) {
      result.subscriptionsChecked += 1;
      try {
        const billed = await billSubscription(id, runDate, { ...opts, runId, includePausedBeforePause: true }, taxRules);
        result.invoiceIds.push(...billed.invoiceIds);
        result.periodsSkipped += billed.periodsSkipped;
      } catch (error) {
        result.errors.push({ subscriptionId: id, error: (error as Error).message });
      }
    }
    result.invoicesCreated = result.invoiceIds.length;
    await pool.query(
      `UPDATE billing_runs SET status = 'completed', subscriptions_checked = $2, invoices_created = $3, periods_skipped = $4,
              errors = $5, finished_at = now() WHERE id = $1`,
      [runId, result.subscriptionsChecked, result.invoicesCreated, result.periodsSkipped, JSON.stringify(result.errors)],
    );
    return result;
  } catch (error) {
    await pool.query(`UPDATE billing_runs SET status = 'failed', errors = $2, finished_at = now() WHERE id = $1`, [
      runId,
      JSON.stringify([{ error: (error as Error).message }]),
    ]);
    throw error;
  }
}
