import type pg from 'pg';
import type { z } from 'zod';
import { pool, query, withTransaction, type DbClient } from '../../db/pool.js';
import { assertCustomerAccess, customerScope } from '../../lib/customer-access.js';
import { logAudit } from '../../lib/audit.js';
import { addDays, addInterval, maxDate, nextAnchoredDate, todayIso } from '../../lib/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { billSubscriptionInTransaction } from '../billing/engine.js';
import { getPlan, type Plan } from '../plans/routes.js';
import { getTemplate } from '../quotation-templates/routes.js';
import { buildLines, saveLines, type LineInput } from './lines.js';
import type {
  createSubscriptionInput,
  fromTemplateInput,
  listSubscriptionsQuery,
  SubscriptionStatus,
  updateSubscriptionInput,
} from './schemas.js';

export const DEFAULT_QUOTATION_VALIDITY_DAYS = 30;

/** Allowed lifecycle moves: Draft -> Quotation -> Confirmed -> Active -> Closed, plus pause/resume and cancel. */
export const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: ['quotation', 'cancelled'],
  quotation: ['draft', 'confirmed', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active: ['paused', 'closed'],
  paused: ['active', 'closed'],
  cancelled: [],
  closed: [],
};

const EDITABLE: SubscriptionStatus[] = ['draft', 'quotation'];

export interface SubscriptionRow {
  id: number;
  subscriptionNumber: string;
  customerId: number;
  customerName: string;
  planId: number;
  planName: string;
  billingInterval: Plan['billingInterval'];
  templateId: number | null;
  status: SubscriptionStatus;
  startDate: string;
  expiryDate: string | null;
  nextBillingDate: string | null;
  paymentTermsDays: number;
  quotationValidUntil: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  confirmedAt: string | null;
  activatedAt: string | null;
  pausedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SUBSCRIPTION_COLUMNS = `
  s.id, s.subscription_number AS "subscriptionNumber", s.customer_id AS "customerId", c.company_name AS "customerName",
  s.plan_id AS "planId", pl.name AS "planName", pl.billing_interval AS "billingInterval", s.template_id AS "templateId",
  s.status, s.start_date AS "startDate", s.expiry_date AS "expiryDate", s.next_billing_date AS "nextBillingDate",
  s.payment_terms_days AS "paymentTermsDays", s.quotation_valid_until AS "quotationValidUntil",
  s.subtotal, s.tax_total AS "taxTotal", s.total, s.notes, s.confirmed_at AS "confirmedAt", s.activated_at AS "activatedAt",
  s.paused_at AS "pausedAt", s.closed_at AS "closedAt", s.close_reason AS "closeReason",
  s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

const FROM = `FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans pl ON pl.id = s.plan_id`;

const isInternal = (user: AuthUser) => user.role === 'admin' || user.role === 'staff';

/** Customers only ever see their own, non-draft subscriptions. */
async function assertCanView(user: AuthUser, row: SubscriptionRow, client: DbClient = pool) {
  if (isInternal(user)) {
    await assertCustomerAccess(row.customerId, user, client);
    return;
  }
  if (row.customerId !== user.customerId || row.status === 'draft') throw notFound('Subscription not found');
}

export async function listSubscriptions(user: AuthUser, q: z.infer<typeof listSubscriptionsQuery>) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  where.push(customerScope(user, 's.customer_id', params));
  if (!isInternal(user)) {
    where.push(`s.status <> 'draft'`);
  } else if (q.customerId) {
    add('s.customer_id = ?', q.customerId);
  }
  if (q.renewalsDue) {
    const today = todayIso();
    where.push("s.status IN ('active', 'paused')");
    add('s.expiry_date >= ?', today);
    add('s.expiry_date <= ?', addDays(today, 30));
  }
  if (q.status.length) add('s.status = ANY(?::text[])', q.status);
  if (q.planId) add('s.plan_id = ?', q.planId);
  if (q.closedFrom) add('s.closed_at::date >= ?', q.closedFrom);
  if (q.closedTo) add('s.closed_at::date <= ?', q.closedTo);
  if (q.q) add('(s.subscription_number ILIKE ? OR c.company_name ILIKE ?)', `%${q.q}%`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = q.pageSize;
  const offset = (q.page - 1) * q.pageSize;
  const [{ rows }, count] = await Promise.all([
    query<SubscriptionRow>(`SELECT ${SUBSCRIPTION_COLUMNS} ${FROM} ${whereSql} ORDER BY s.created_at DESC, s.id DESC LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number }>(`SELECT count(*)::int AS total ${FROM} ${whereSql}`, params),
  ]);
  return { data: rows, page: q.page, pageSize: q.pageSize, total: count.rows[0].total, totalPages: Math.max(1, Math.ceil(count.rows[0].total / q.pageSize)) };
}

async function findSubscription(id: number, client: DbClient = pool, lock = false) {
  const { rows } = await query<SubscriptionRow>(
    `SELECT ${SUBSCRIPTION_COLUMNS} ${FROM} WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`,
    [id],
    client,
  );
  if (!rows[0]) throw notFound('Subscription not found');
  return rows[0];
}

export async function getSubscription(id: number, user: AuthUser, client: DbClient = pool) {
  const row = await findSubscription(id, client);
  await assertCanView(user, row, client);
  // Sequential on purpose: `client` may be a single transaction connection, which cannot run queries in parallel.
  const lines = await query(
    `SELECT l.id, l.line_type AS "lineType", l.product_id AS "productId", l.variant_id AS "variantId", l.description,
            l.quantity, l.unit_price AS "unitPrice", l.tax_rate AS "taxRate", l.subtotal, l.tax_amount AS "taxAmount", l.total, p.type AS "productType"
       FROM subscription_lines l LEFT JOIN products p ON p.id = l.product_id WHERE l.subscription_id = $1 ORDER BY l.sort_order, l.id`,
    [id],
    client,
  );
  const plan = await getPlan(row.planId, client);
  const allowedTransitions = TRANSITIONS[row.status].filter((to) => {
    if (user.role === 'customer' && !(['active', 'paused'].includes(row.status) && (to === 'paused' || to === 'closed' || (row.status === 'paused' && to === 'active')))) return false;
    if ((to === 'paused' || (row.status === 'paused' && to === 'active')) && !plan.canPause) return false;
    if (row.status === 'paused' && to === 'active' && row.expiryDate && row.expiryDate < todayIso()) return false;
    if (to === 'closed' && (!row.expiryDate || todayIso() < row.expiryDate) && !plan.canCloseEarly) return false;
    return true;
  });
  const history = isInternal(user)
    ? await query(
        `SELECT a.id, a.action, a.details, a.created_at AS "createdAt", u.full_name AS "actorName"
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE a.entity_type = 'subscription' AND a.entity_id = $1
          ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
        [String(id)],
        client,
      )
    : { rows: [] };
  return {
    ...row,
    plan: {
      id: plan.id,
      name: plan.name,
      billingInterval: plan.billingInterval,
      price: plan.price,
      minQuantity: plan.minQuantity,
      autoCloseOnExpiry: plan.autoCloseOnExpiry,
      canCloseEarly: plan.canCloseEarly,
      canPause: plan.canPause,
      canRenew: plan.canRenew,
    },
    lines: lines.rows,
    history: history.rows,
    allowedTransitions,
  };
}

async function assertCustomer(client: DbClient, customerId: number) {
  const { rows } = await query<{ isActive: boolean }>('SELECT is_active AS "isActive" FROM customers WHERE id = $1', [customerId], client);
  if (!rows[0]) throw badRequest('Customer not found');
  if (!rows[0].isActive) throw badRequest('Customer is inactive');
}

function assertPlanAvailable(plan: Plan, startDate: string) {
  if (!plan.isActive) throw badRequest(`Plan "${plan.name}" is no longer offered`);
  if ((plan.startDate && startDate < plan.startDate) || (plan.endDate && startDate > plan.endDate)) {
    throw badRequest(`Plan "${plan.name}" is only available from ${plan.startDate ?? 'any date'} to ${plan.endDate ?? 'any date'}`);
  }
}

export async function createSubscription(input: z.infer<typeof createSubscriptionInput>, actor: AuthUser, templateId: number | null = null) {
  return withTransaction(async (client) => {
    await assertCustomerAccess(input.customerId, actor, client);
    await assertCustomer(client, input.customerId);
    const plan = await getPlan(input.planId, client);
    assertPlanAvailable(plan, input.startDate);
    const built = await buildLines(client, plan, input.lines as LineInput[]);
    if (input.status === 'quotation' && built.lines.length === 0) throw badRequest('Add at least one line before sending a quotation');

    const quotationValidUntil =
      input.status === 'quotation' ? (input.quotationValidUntil ?? addDays(todayIso(), DEFAULT_QUOTATION_VALIDITY_DAYS)) : input.quotationValidUntil;
    const { rows } = await client.query<{ id: number; subscriptionNumber: string }>(
      `INSERT INTO subscriptions (customer_id, plan_id, template_id, status, start_date, expiry_date, payment_terms_days,
                                  quotation_valid_until, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, subscription_number AS "subscriptionNumber"`,
      [input.customerId, input.planId, templateId, input.status, input.startDate, input.expiryDate, input.paymentTermsDays, quotationValidUntil, input.notes, actor.id],
    );
    const { id, subscriptionNumber } = rows[0];
    await saveLines(client, id, built);
    await logAudit(actor.id, 'subscription.created', 'subscription', id, { status: input.status, subscriptionNumber, templateId }, client);
    return getSubscription(id, actor, client);
  });
}

/** Builds a quotation from a template: plan, product lines, payment terms, validity and contract length. */
export async function createFromTemplate(input: z.infer<typeof fromTemplateInput>, actor: AuthUser) {
  const template = await getTemplate(input.templateId);
  if (!template.isActive) throw badRequest('This quotation template is archived');
  const plan = await getPlan(template.planId);
  const expiryDate = template.contractPeriods ? addDays(addInterval(input.startDate, plan.billingInterval, template.contractPeriods), -1) : null;
  return createSubscription(
    {
      customerId: input.customerId,
      planId: template.planId,
      startDate: input.startDate,
      expiryDate,
      paymentTermsDays: template.paymentTermsDays,
      quotationValidUntil: addDays(todayIso(), template.validityDays),
      notes: input.notes ?? template.notes,
      status: 'quotation',
      lines: template.lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        description: null,
      })),
    },
    actor,
    template.id,
  );
}

export async function updateSubscription(id: number, input: z.infer<typeof updateSubscriptionInput>, actor: AuthUser) {
  return withTransaction(async (client) => {
    const current = await findSubscription(id, client, true);
    await assertCanView(actor, current, client);
    if (!EDITABLE.includes(current.status)) throw conflict(`A ${current.status} subscription can no longer be edited`);
    await assertCustomerAccess(input.customerId, actor, client);
    await assertCustomer(client, input.customerId);
    const plan = await getPlan(input.planId, client);
    assertPlanAvailable(plan, input.startDate);
    const built = await buildLines(client, plan, input.lines as LineInput[]);
    if (current.status === 'quotation' && built.lines.length === 0) throw badRequest('A quotation needs at least one line');
    await client.query(
      `UPDATE subscriptions SET customer_id = $2, plan_id = $3, start_date = $4, expiry_date = $5, payment_terms_days = $6,
              quotation_valid_until = COALESCE($7, quotation_valid_until), notes = $8, updated_at = now()
        WHERE id = $1`,
      [id, input.customerId, input.planId, input.startDate, input.expiryDate, input.paymentTermsDays, input.quotationValidUntil, input.notes],
    );
    await saveLines(client, id, built);
    await logAudit(actor.id, 'subscription.updated', 'subscription', id, {}, client);
    return getSubscription(id, actor, client);
  });
}

async function lineCount(client: pg.PoolClient, id: number) {
  const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM subscription_lines WHERE subscription_id = $1', [id]);
  return rows[0].n;
}

/** Last day whose period can be due; paused time itself is never billed. */
function billingCutoff(status: SubscriptionStatus, expiryDate: string | null, pausedDate: string | null, today: string) {
  const through = expiryDate && expiryDate < today ? expiryDate : today;
  if (status !== 'paused') return through;
  if (!pausedDate) return null;
  const beforePause = addDays(pausedDate, -1);
  return beforePause < through ? beforePause : through;
}

async function invoiceBeforeAction(client: pg.PoolClient, sub: SubscriptionRow, today: string, actorId: number, action: string) {
  await billSubscriptionInTransaction(client, sub.id, today, { actorId, includePausedBeforePause: true });
  const { rows } = await client.query<{ next: string | null; pausedDate: string | null }>(
    'SELECT next_billing_date AS next, paused_at::date AS "pausedDate" FROM subscriptions WHERE id = $1', [sub.id],
  );
  const through = billingCutoff(sub.status, sub.expiryDate, rows[0].pausedDate, today);
  if (through && rows[0].next && rows[0].next <= through) {
    throw conflict(`Run billing to finish the overdue periods before ${action} this subscription`);
  }
  return rows[0].next;
}

/** Central state machine: validates the move, applies plan rules and side effects, and records history. */
export async function transition(id: number, to: SubscriptionStatus, actor: AuthUser, reason: string | null = null) {
  return withTransaction(async (client) => {
    const sub = await findSubscription(id, client, true);
    await assertCanView(actor, sub, client);
    const from = sub.status;
    if (actor.role === 'customer' && !(['active', 'paused'].includes(from) && (to === 'paused' || to === 'closed' || (from === 'paused' && to === 'active')))) {
      throw forbidden('Customers can only pause, resume or close their own subscriptions');
    }
    if (!TRANSITIONS[from].includes(to)) throw conflict(`Cannot change a ${from} subscription to ${to}`);
    const plan = await getPlan(sub.planId, client);
    const today = todayIso();
    const sets: string[] = ['status = $2', 'updated_at = now()'];
    const params: unknown[] = [id, to];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (to === 'quotation') {
      if ((await lineCount(client, id)) === 0) throw badRequest('Add at least one line before sending a quotation');
      if (!sub.quotationValidUntil || sub.quotationValidUntil < today) set('quotation_valid_until', addDays(today, DEFAULT_QUOTATION_VALIDITY_DAYS));
    } else if (to === 'confirmed') {
      if (sub.quotationValidUntil && sub.quotationValidUntil < today) {
        throw conflict(`This quotation expired on ${sub.quotationValidUntil}. Move it back to draft and resend it.`);
      }
      sets.push('confirmed_at = now()');
    } else if (to === 'active' && from === 'confirmed') {
      if (sub.expiryDate && sub.expiryDate < today) throw conflict('The subscription expiry date has already passed');
      sets.push('activated_at = now()');
      set('next_billing_date', sub.nextBillingDate ?? sub.startDate);
    } else if (to === 'active' && from === 'paused') {
      if (!plan.canPause) throw conflict(`Plan "${plan.name}" does not allow resuming`);
      if (sub.expiryDate && sub.expiryDate < today) throw conflict('This subscription has expired. Renew it before resuming.');
      // Preserve pre-pause arrears, then restart on the next original anchor without charging the paused cycle again.
      const next = await invoiceBeforeAction(client, sub, today, actor.id, 'resuming');
      sets.push('paused_at = NULL');
      set('next_billing_date', nextAnchoredDate(sub.startDate, addDays(maxDate(next ?? today, today), -1), plan.billingInterval));
    } else if (to === 'paused') {
      if (!plan.canPause) throw conflict(`Plan "${plan.name}" does not allow pausing`);
      sets.push('paused_at = now()');
    } else if (to === 'closed') {
      const early = !sub.expiryDate || today < sub.expiryDate;
      if (early && !plan.canCloseEarly) throw conflict(`Plan "${plan.name}" does not allow closing before the expiry date`);
      await invoiceBeforeAction(client, sub, today, actor.id, 'closing');
      sets.push('closed_at = now()', 'next_billing_date = NULL', 'paused_at = NULL');
      set('close_reason', reason ?? (early ? 'closed_early' : 'completed'));
    } else if (to === 'cancelled') {
      sets.push('closed_at = now()', 'next_billing_date = NULL');
      set('close_reason', reason ?? 'cancelled');
    }

    await client.query(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = $1`, params);
    const action = from === 'paused' && to === 'active' ? 'resumed' : to;
    await logAudit(actor.id, `subscription.${action}`, 'subscription', id, { from, to, reason }, client);
    return getSubscription(id, actor, client);
  });
}

/** Extends the expiry date by N billing periods. Also re-opens subscriptions that closed because they expired. */
export async function renew(id: number, periods: number, actor: AuthUser) {
  return withTransaction(async (client) => {
    const sub = await findSubscription(id, client, true);
    await assertCanView(actor, sub, client);
    const plan = await getPlan(sub.planId, client);
    if (!plan.canRenew) throw conflict(`Plan "${plan.name}" does not allow renewals`);
    const reopen = sub.status === 'closed' && sub.closeReason === 'expired';
    if (!['active', 'paused'].includes(sub.status) && !reopen) throw conflict(`A ${sub.status} subscription cannot be renewed`);
    if (!sub.expiryDate) throw badRequest('This subscription has no expiry date, so there is nothing to renew');

    const newExpiry = addInterval(sub.expiryDate, plan.billingInterval, periods);
    let nextBillingDate = sub.nextBillingDate;
    if (!nextBillingDate || reopen) {
      const { rows } = await client.query<{ start: string | null }>('SELECT max(billing_period_start) AS start FROM invoices WHERE subscription_id = $1', [id]);
      // A truncated final invoice still charged the full cycle price. Resume on the next original
      // anchor, not the following day, so renewal cannot charge that same cycle a second time.
      nextBillingDate = rows[0].start ? nextAnchoredDate(sub.startDate, rows[0].start, plan.billingInterval) : sub.startDate;
      if (reopen && sub.pausedAt) nextBillingDate = maxDate(nextBillingDate, nextAnchoredDate(sub.startDate, sub.expiryDate, plan.billingInterval));
      if (nextBillingDate > newExpiry) nextBillingDate = null;
    }
    if (reopen) {
      await client.query(
        `UPDATE subscriptions SET status = 'active', expiry_date = $2, closed_at = NULL, close_reason = NULL,
                next_billing_date = $3, paused_at = NULL, updated_at = now() WHERE id = $1`,
        [id, newExpiry, nextBillingDate],
      );
    } else {
      await client.query('UPDATE subscriptions SET expiry_date = $2, next_billing_date = $3, updated_at = now() WHERE id = $1', [id, newExpiry, nextBillingDate]);
    }
    await logAudit(actor.id, 'subscription.renewed', 'subscription', id, { periods, from: sub.expiryDate, to: newExpiry, reopened: reopen }, client);
    return getSubscription(id, actor, client);
  });
}

/** Closes active/paused subscriptions past their expiry date whose plan has auto-close enabled. */
export async function closeExpiredSubscriptions(today = todayIso(), actorId: number | null = null) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number; subscriptionNumber: string; status: SubscriptionStatus; expiryDate: string; pausedDate: string | null }>(
      `SELECT s.id, s.subscription_number AS "subscriptionNumber", s.status, s.expiry_date AS "expiryDate", s.paused_at::date AS "pausedDate"
         FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
        WHERE pl.auto_close_on_expiry AND s.status IN ('active', 'paused')
          AND s.expiry_date IS NOT NULL AND s.expiry_date < $1
        ORDER BY s.id FOR UPDATE OF s`,
      [today],
    );
    const closed: { id: number; subscriptionNumber: string }[] = [];
    for (const row of rows) {
      // Invoice and close under the same lock/transaction: a failed billing attempt must never discard its cursor.
      await billSubscriptionInTransaction(client, row.id, today, { actorId, includePausedBeforePause: true });
      const remaining = await client.query<{ nextBillingDate: string | null }>('SELECT next_billing_date AS "nextBillingDate" FROM subscriptions WHERE id = $1', [row.id]);
      const next = remaining.rows[0].nextBillingDate;
      // A capped catch-up run leaves the subscription open so the next job can finish its backlog.
      const throughDate = billingCutoff(row.status, row.expiryDate, row.pausedDate, today);
      if (throughDate && next && next <= throughDate) continue;
      await client.query(`UPDATE subscriptions SET status = 'closed', closed_at = now(), close_reason = 'expired',
                           next_billing_date = NULL, paused_at = CASE WHEN $2 THEN paused_at ELSE NULL END, updated_at = now() WHERE id = $1`, [row.id, row.status === 'paused']);
      await logAudit(actorId, 'subscription.auto_closed', 'subscription', row.id, { reason: 'expired', date: today }, client);
      closed.push({ id: row.id, subscriptionNumber: row.subscriptionNumber });
    }
    return closed;
  });
}

export function assertInternal(user: AuthUser) {
  if (!isInternal(user)) throw forbidden();
}
