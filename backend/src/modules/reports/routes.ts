import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { addDays, todayIso } from '../../lib/dates.js';
import { badRequest } from '../../lib/errors.js';
import { dateSchema, idSchema, paged, paginate, paginationSchema } from '../../lib/validation.js';
import { authenticate, requireInternal } from '../../middleware/auth.js';
import { PAYMENT_METHODS } from '../invoices/schemas.js';
import { INVOICE_COLUMNS, OVERDUE_SQL } from '../invoices/service.js';
import { SUBSCRIPTION_STATUSES } from '../subscriptions/schemas.js';

/** Converts a subscription's per-period total into a monthly amount, for MRR. */
const MONTHLY_SQL = `
  CASE pl.billing_interval
    WHEN 'daily' THEN s.total * 365 / 12
    WHEN 'weekly' THEN s.total * 52 / 12
    WHEN 'monthly' THEN s.total
    WHEN 'yearly' THEN s.total / 12
  END`;

const filtersSchema = z
  .object({
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    customerId: idSchema.optional(),
    planId: idSchema.optional(),
    subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
    invoiceStatus: z.enum(['draft', 'confirmed', 'paid', 'cancelled']).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  })
  .transform((f) => {
    const today = todayIso();
    // Default range: the current calendar month to date.
    const dateTo = f.dateTo ?? today;
    const dateFrom = f.dateFrom ?? `${dateTo.slice(0, 7)}-01`;
    if (dateFrom > dateTo) throw badRequest('dateFrom must be on or before dateTo');
    return { ...f, dateFrom, dateTo, today };
  });

type Filters = z.infer<typeof filtersSchema>;

/** Builds a WHERE clause from customer/plan filters for queries joining subscriptions `s`. Params start after `offset`. */
function scope(f: Filters, offset: number, alias = 's') {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.customerId) {
    params.push(f.customerId);
    where.push(`${alias}.customer_id = $${offset + params.length}`);
  }
  if (f.planId) {
    params.push(f.planId);
    where.push(`${alias}.plan_id = $${offset + params.length}`);
  }
  return { sql: where.map((w) => ` AND ${w}`).join(''), params };
}

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export const reportsRouter = Router();
reportsRouter.use(authenticate, requireInternal);

/** One-glance finance summary: subscriptions, MRR/ARR, revenue collected, outstanding and overdue balances. */
reportsRouter.get('/summary', async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const sScope = scope(f, 3);
  const subs = await query<Record<string, number>>(
    `SELECT count(*) FILTER (WHERE s.status = 'active')::int AS "activeSubscriptions",
            count(*) FILTER (WHERE s.status = 'paused')::int AS "pausedSubscriptions",
            count(*) FILTER (WHERE s.status IN ('draft', 'quotation'))::int AS "openQuotations",
            count(*) FILTER (WHERE s.status IN ('cancelled', 'closed') AND s.closed_at::date BETWEEN $1 AND $2)::int AS "cancelledSubscriptions",
            count(*) FILTER (WHERE s.status IN ('active', 'paused') AND s.expiry_date BETWEEN $3::date AND $3::date + 30)::int AS "upcomingRenewals",
            COALESCE(sum(${MONTHLY_SQL}) FILTER (WHERE s.status = 'active'), 0) AS mrr
       FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
      WHERE TRUE ${sScope.sql}`,
    [f.dateFrom, f.dateTo, f.today, ...sScope.params],
  );

  const iScope = scope(f, 3);
  const invoices = await query<Record<string, number>>(
    `SELECT COALESCE(sum(i.grand_total) FILTER (WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN $1 AND $2), 0) AS "invoicedTotal",
            count(*) FILTER (WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN $1 AND $2)::int AS "invoiceCount",
            COALESCE(sum(i.amount_due) FILTER (WHERE i.status = 'confirmed'), 0) AS "outstandingBalance",
            count(*) FILTER (WHERE i.status = 'confirmed' AND i.amount_due > 0)::int AS "outstandingCount",
            count(*) FILTER (WHERE ${OVERDUE_SQL.replaceAll('$1', '$3')})::int AS "overdueCount",
            COALESCE(sum(i.amount_due) FILTER (WHERE ${OVERDUE_SQL.replaceAll('$1', '$3')}), 0) AS "overdueBalance",
            count(*) FILTER (WHERE i.status = 'draft')::int AS "draftInvoices",
            count(*) FILTER (WHERE i.status = 'paid' AND i.paid_at::date BETWEEN $1 AND $2)::int AS "paidInvoices"
       FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
      WHERE TRUE ${iScope.sql}`,
    [f.dateFrom, f.dateTo, f.today, ...iScope.params],
  );

  const pScope = scope(f, 2);
  const methodFilter = f.paymentMethod ? ` AND p.payment_method = $${2 + pScope.params.length + 1}` : '';
  const payments = await query<{ revenueCollected: number; paymentCount: number }>(
    `SELECT COALESCE(sum(p.amount), 0) AS "revenueCollected", count(*)::int AS "paymentCount"
       FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
      WHERE p.payment_date BETWEEN $1 AND $2 ${pScope.sql}${methodFilter}`,
    [f.dateFrom, f.dateTo, ...pScope.params, ...(f.paymentMethod ? [f.paymentMethod] : [])],
  );

  const mrr = round2(subs.rows[0].mrr);
  res.json({
    range: { dateFrom: f.dateFrom, dateTo: f.dateTo },
    ...subs.rows[0],
    mrr,
    arr: round2(mrr * 12),
    ...invoices.rows[0],
    ...payments.rows[0],
  });
});

/** Revenue over time (invoiced vs collected per month), revenue by plan and payments by method. */
reportsRouter.get('/revenue', async (req, res) => {
  const parsed = filtersSchema.parse(req.query);
  // Default to the last 12 months when no range is given.
  const f = req.query.dateFrom ? parsed : { ...parsed, dateFrom: `${addDays(parsed.dateTo, -365).slice(0, 7)}-01` };
  const sScope = scope(f, 2);
  const methodParam = f.paymentMethod ? `$${2 + sScope.params.length + 1}` : null;
  const params = [f.dateFrom, f.dateTo, ...sScope.params, ...(f.paymentMethod ? [f.paymentMethod] : [])];
  const methodSql = methodParam ? ` AND p.payment_method = ${methodParam}` : '';

  const [byMonth, byPlan, byMethod] = await Promise.all([
    query(
      `WITH months AS (
         SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS month
       ),
       invoiced AS (
         SELECT date_trunc('month', i.invoice_date)::date AS month, sum(i.grand_total) AS amount
           FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
          WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN $1 AND $2 ${sScope.sql}
          GROUP BY 1
       ),
       collected AS (
         SELECT date_trunc('month', p.payment_date)::date AS month, sum(p.amount) AS amount
           FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
          WHERE p.payment_date BETWEEN $1 AND $2 ${sScope.sql}${methodSql}
          GROUP BY 1
       )
       SELECT to_char(m.month, 'YYYY-MM') AS period, COALESCE(inv.amount, 0) AS invoiced, COALESCE(col.amount, 0) AS collected
         FROM months m LEFT JOIN invoiced inv ON inv.month = m.month LEFT JOIN collected col ON col.month = m.month
        ORDER BY m.month`,
      params,
    ),
    query(
      `SELECT pl.id AS "planId", pl.name AS "planName", COALESCE(sum(p.amount), 0) AS collected, count(DISTINCT s.id)::int AS subscriptions
         FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN subscriptions s ON s.id = i.subscription_id JOIN plans pl ON pl.id = s.plan_id
        WHERE p.payment_date BETWEEN $1 AND $2 ${sScope.sql}${methodSql}
        GROUP BY pl.id, pl.name ORDER BY collected DESC`,
      params,
    ),
    query(
      `SELECT p.payment_method AS "paymentMethod", COALESCE(sum(p.amount), 0) AS amount, count(*)::int AS count
         FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
        WHERE p.payment_date BETWEEN $1 AND $2 ${sScope.sql}${methodSql}
        GROUP BY p.payment_method ORDER BY amount DESC`,
      params,
    ),
  ]);
  res.json({ range: { dateFrom: f.dateFrom, dateTo: f.dateTo }, byMonth: byMonth.rows, byPlan: byPlan.rows, byMethod: byMethod.rows });
});

/** Overdue invoices, most overdue first, so they can be chased. */
reportsRouter.get('/overdue', async (req, res) => {
  const q = paginationSchema.extend({ customerId: idSchema.optional(), planId: idSchema.optional() }).parse(req.query);
  const params: unknown[] = [todayIso()];
  let extra = '';
  if (q.customerId) {
    params.push(q.customerId);
    extra += ` AND i.customer_id = $${params.length}`;
  }
  if (q.planId) {
    params.push(q.planId);
    extra += ` AND s.plan_id = $${params.length}`;
  }
  const { limit, offset } = paginate(q);
  const from = `FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id WHERE ${OVERDUE_SQL}${extra}`;
  const [{ rows }, totals] = await Promise.all([
    query(`SELECT ${INVOICE_COLUMNS} ${from} ORDER BY i.due_date, i.id LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number; amountDue: number }>(`SELECT count(*)::int AS total, COALESCE(sum(i.amount_due), 0) AS "amountDue" ${from}`, params),
  ]);
  res.json({ ...paged(rows, totals.rows[0].total, q.page, q.pageSize), summary: { amountDue: totals.rows[0].amountDue } });
});

/** Subscription counts by status and active subscriptions / MRR by plan. */
reportsRouter.get('/subscriptions', async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const sScope = scope(f, 0);
  const statusFilter = f.subscriptionStatus ? ` AND s.status = $${sScope.params.length + 1}` : '';
  const params = [...sScope.params, ...(f.subscriptionStatus ? [f.subscriptionStatus] : [])];
  const [byStatus, byPlan] = await Promise.all([
    query(
      `SELECT s.status, count(*)::int AS count FROM subscriptions s WHERE TRUE ${sScope.sql}${statusFilter} GROUP BY s.status ORDER BY s.status`,
      params,
    ),
    query(
      `SELECT pl.id AS "planId", pl.name AS "planName", pl.billing_interval AS "billingInterval",
              count(*) FILTER (WHERE s.status = 'active')::int AS active,
              count(*)::int AS total,
              round(COALESCE(sum(${MONTHLY_SQL}) FILTER (WHERE s.status = 'active'), 0), 2) AS mrr
         FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
        WHERE TRUE ${sScope.sql}${statusFilter}
        GROUP BY pl.id, pl.name, pl.billing_interval ORDER BY mrr DESC, pl.name`,
      params,
    ),
  ]);
  res.json({ byStatus: byStatus.rows, byPlan: byPlan.rows });
});
