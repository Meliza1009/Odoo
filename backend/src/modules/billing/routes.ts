import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { todayIso } from '../../lib/dates.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { dateSchema, idParamSchema, paged, paginate, paginationSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireInternal } from '../../middleware/auth.js';
import { billSubscription, runBilling } from './engine.js';

const runInput = z
  .object({
    runDate: dateSchema.optional(),
    autoConfirm: z.boolean().default(false),
  })
  .default({ autoConfirm: false });

export const billingRouter = Router();
billingRouter.use(authenticate, requireInternal);

/** Billing day: generate invoices for every subscription that is due. */
billingRouter.post('/run', async (req, res) => {
  const input = runInput.parse(req.body ?? {});
  const runDate = input.runDate ?? todayIso();
  if (runDate > todayIso()) throw badRequest('Billing cannot be run for a future date');
  res.status(201).json(await runBilling(runDate, { autoConfirm: input.autoConfirm, actorId: currentUser(req).id }));
});

billingRouter.get('/runs', async (req, res) => {
  const q = paginationSchema.parse(req.query);
  const { limit, offset } = paginate(q);
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT r.id, r.run_date AS "runDate", r.status, r.subscriptions_checked AS "subscriptionsChecked",
              r.invoices_created AS "invoicesCreated", r.periods_skipped AS "periodsSkipped", r.errors,
              r.started_at AS "startedAt", r.finished_at AS "finishedAt", u.full_name AS "triggeredBy"
         FROM billing_runs r LEFT JOIN users u ON u.id = r.triggered_by
        ORDER BY r.started_at DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`,
    ),
    query<{ total: number }>('SELECT count(*)::int AS total FROM billing_runs'),
  ]);
  res.json(paged(rows, count.rows[0].total, q.page, q.pageSize));
});

/** Generate the due invoice(s) for a single subscription right away. */
billingRouter.post('/subscriptions/:id/generate', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { autoConfirm } = runInput.parse(req.body ?? {});
  const { rows } = await query<{ status: string; nextBillingDate: string | null }>(
    'SELECT status, next_billing_date AS "nextBillingDate" FROM subscriptions WHERE id = $1',
    [id],
  );
  if (!rows[0]) throw badRequest('Subscription not found');
  if (rows[0].status !== 'active') throw conflict(`Only active subscriptions can be invoiced (this one is ${rows[0].status})`);
  if (!rows[0].nextBillingDate || rows[0].nextBillingDate > todayIso()) {
    throw conflict(rows[0].nextBillingDate ? `Nothing is due yet. The next billing date is ${rows[0].nextBillingDate}.` : 'This subscription has no further billing periods');
  }
  const result = await billSubscription(id, todayIso(), { autoConfirm, actorId: currentUser(req).id });
  res.status(201).json(result);
});
