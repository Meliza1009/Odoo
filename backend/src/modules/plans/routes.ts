import { Router } from 'express';
import { z } from 'zod';
import { query, type DbClient } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import type { BillingInterval } from '../../lib/dates.js';
import {
  booleanQuery,
  dateSchema,
  idParamSchema,
  moneySchema,
  nameSchema,
  optionalDateSchema,
  optionalText,
  paged,
  paginate,
  paginationSchema,
} from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';

export const BILLING_INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'] as const;

export interface Plan {
  id: number;
  name: string;
  description: string | null;
  billingInterval: BillingInterval;
  price: number;
  minQuantity: number;
  startDate: string | null;
  endDate: string | null;
  autoCloseOnExpiry: boolean;
  canCloseEarly: boolean;
  canPause: boolean;
  canRenew: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PLAN_COLUMNS = `
  pl.id, pl.name, pl.description, pl.billing_interval AS "billingInterval", pl.price, pl.min_quantity AS "minQuantity",
  pl.start_date AS "startDate", pl.end_date AS "endDate", pl.auto_close_on_expiry AS "autoCloseOnExpiry",
  pl.can_close_early AS "canCloseEarly", pl.can_pause AS "canPause", pl.can_renew AS "canRenew",
  pl.is_active AS "isActive", pl.created_at AS "createdAt", pl.updated_at AS "updatedAt"`;

export async function getPlan(id: number, client?: DbClient): Promise<Plan> {
  const { rows } = await query<Plan>(`SELECT ${PLAN_COLUMNS} FROM plans pl WHERE pl.id = $1`, [id], client);
  if (!rows[0]) throw notFound('Plan not found');
  return rows[0];
}

const planInput = z
  .object({
    name: nameSchema,
    description: optionalText(1000),
    billingInterval: z.enum(BILLING_INTERVALS, { error: 'Billing interval must be daily, weekly, monthly or yearly' }),
    price: moneySchema,
    minQuantity: z.coerce.number().int().min(1, 'Minimum quantity must be at least 1').max(100000).default(1),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    autoCloseOnExpiry: z.boolean().default(false),
    canCloseEarly: z.boolean().default(true),
    canPause: z.boolean().default(true),
    canRenew: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

const listPlansQuery = paginationSchema.extend({
  includeInactive: booleanQuery,
  billingInterval: z.enum(BILLING_INTERVALS).optional(),
  availableOn: dateSchema.optional(),
});

export const plansRouter = Router();
plansRouter.use(authenticate, requireInternal);

plansRouter.get('/', async (req, res) => {
  const q = listPlansQuery.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (!q.includeInactive) where.push('pl.is_active');
  if (q.billingInterval) {
    params.push(q.billingInterval);
    where.push(`pl.billing_interval = $${params.length}`);
  }
  if (q.availableOn) {
    params.push(q.availableOn);
    where.push(`(pl.start_date IS NULL OR pl.start_date <= $${params.length}) AND (pl.end_date IS NULL OR pl.end_date >= $${params.length})`);
  }
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`pl.name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, offset } = paginate(q);
  const [{ rows }, count] = await Promise.all([
    query<Plan>(`SELECT ${PLAN_COLUMNS} FROM plans pl ${whereSql} ORDER BY pl.price, pl.name LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM plans pl ${whereSql}`, params),
  ]);
  res.json(paged(rows, count.rows[0].total, q.page, q.pageSize));
});

plansRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getPlan(id));
});

const planValues = (p: z.infer<typeof planInput>) => [
  p.name,
  p.description,
  p.billingInterval,
  p.price,
  p.minQuantity,
  p.startDate,
  p.endDate,
  p.autoCloseOnExpiry,
  p.canCloseEarly,
  p.canPause,
  p.canRenew,
  p.isActive,
];

plansRouter.post('/', requireAdmin, async (req, res) => {
  const input = planInput.parse(req.body);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO plans (name, description, billing_interval, price, min_quantity, start_date, end_date,
                        auto_close_on_expiry, can_close_early, can_pause, can_renew, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    planValues(input),
  );
  await logAudit(currentUser(req).id, 'plan.created', 'plan', rows[0].id, { name: input.name });
  res.status(201).json(await getPlan(rows[0].id));
});

plansRouter.put('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = planInput.parse(req.body);
  await getPlan(id);
  await query(
    `UPDATE plans SET name = $2, description = $3, billing_interval = $4, price = $5, min_quantity = $6, start_date = $7,
            end_date = $8, auto_close_on_expiry = $9, can_close_early = $10, can_pause = $11, can_renew = $12,
            is_active = $13, updated_at = now()
      WHERE id = $1`,
    [id, ...planValues(input)],
  );
  await logAudit(currentUser(req).id, 'plan.updated', 'plan', id, { name: input.name });
  res.json(await getPlan(id));
});

plansRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await getPlan(id);
  await query('UPDATE plans SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
  await logAudit(currentUser(req).id, 'plan.archived', 'plan', id);
  res.status(204).end();
});
