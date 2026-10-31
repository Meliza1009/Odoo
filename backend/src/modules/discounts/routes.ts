import { Router } from 'express';
import { z } from 'zod';
import { pool, query, withTransaction, type DbClient } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { todayIso } from '../../lib/dates.js';
import { badRequest, notFound } from '../../lib/errors.js';
import {
  booleanQuery,
  idParamSchema,
  idSchema,
  moneySchema,
  nameSchema,
  optionalDateSchema,
  paged,
  paginate,
  paginationSchema,
} from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';
import type { DiscountRule } from '../billing/calculate.js';

const discountInput = z
  .object({
    name: nameSchema,
    discountType: z.enum(['fixed_amount', 'percentage'], { error: 'Type must be fixed_amount or percentage' }),
    value: moneySchema.refine((v) => v > 0, 'Discount value must be greater than 0'),
    minPurchase: moneySchema.default(0),
    minQuantity: z.coerce.number().int().min(0, 'Minimum quantity cannot be negative').max(100000).default(0),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    usageLimit: z.coerce.number().int().min(1, 'Usage limit must be at least 1').max(1_000_000).nullable().optional(),
    scope: z.enum(['subscription', 'product']).default('subscription'),
    productIds: z.array(idSchema).max(200).default([]),
    subscriptionIds: z.array(idSchema).max(1000).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.discountType === 'percentage' && d.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage discount cannot exceed 100%' });
    if (d.startDate && d.endDate && d.endDate < d.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date' });
    if (d.scope === 'product' && d.productIds.length === 0) ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'Choose at least one product' });
  });

type DiscountInput = z.infer<typeof discountInput>;

export interface DiscountRow {
  id: number;
  name: string;
  discountType: 'fixed_amount' | 'percentage';
  value: number;
  minPurchase: number;
  minQuantity: number;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number | null;
  usageCount: number;
  scope: 'subscription' | 'product';
  isActive: boolean;
  state: 'active' | 'scheduled' | 'expired' | 'exhausted' | 'inactive';
  productIds: number[];
  subscriptionIds: number[];
  createdAt: string;
}

const COLUMNS = `
  d.id, d.name, d.discount_type AS "discountType", d.value, d.min_purchase AS "minPurchase", d.min_quantity AS "minQuantity",
  d.start_date AS "startDate", d.end_date AS "endDate", d.usage_limit AS "usageLimit", d.usage_count AS "usageCount",
  d.scope, d.is_active AS "isActive", d.created_at AS "createdAt",
  COALESCE((SELECT array_agg(dp.product_id ORDER BY dp.product_id) FROM discount_products dp WHERE dp.discount_id = d.id), '{}') AS "productIds",
  COALESCE((SELECT array_agg(ds.subscription_id ORDER BY ds.subscription_id) FROM discount_subscriptions ds WHERE ds.discount_id = d.id), '{}') AS "subscriptionIds"`;

/** Human-readable state shown in the UI: why a discount is or is not currently applying. */
function withState(row: Omit<DiscountRow, 'state'>, today = todayIso()): DiscountRow {
  let state: DiscountRow['state'] = 'active';
  if (!row.isActive) state = 'inactive';
  else if (row.usageLimit !== null && row.usageCount >= row.usageLimit) state = 'exhausted';
  else if (row.endDate && row.endDate < today) state = 'expired';
  else if (row.startDate && row.startDate > today) state = 'scheduled';
  return { ...row, state };
}

async function getDiscount(id: number, client: DbClient = pool) {
  const { rows } = await query<Omit<DiscountRow, 'state'>>(`SELECT ${COLUMNS} FROM discounts d WHERE d.id = $1`, [id], client);
  if (!rows[0]) throw notFound('Discount not found');
  return withState(rows[0]);
}

/**
 * Discounts usable on an invoice dated `onDate` for a subscription: active, within dates, under the usage limit,
 * and either unrestricted or linked to this subscription. Rows are locked so usage counting stays exact.
 */
export async function eligibleDiscounts(client: DbClient, subscriptionId: number, onDate: string): Promise<DiscountRule[]> {
  const { rows } = await query<Omit<DiscountRule, 'productIds'>>(
    `SELECT d.id, d.name, d.discount_type AS "discountType", d.value, d.min_purchase AS "minPurchase",
            d.min_quantity AS "minQuantity", d.scope
       FROM discounts d
      WHERE d.is_active
        AND (d.start_date IS NULL OR d.start_date <= $2)
        AND (d.end_date IS NULL OR d.end_date >= $2)
        AND (d.usage_limit IS NULL OR d.usage_count < d.usage_limit)
        AND (NOT EXISTS (SELECT 1 FROM discount_subscriptions ds WHERE ds.discount_id = d.id)
             OR EXISTS (SELECT 1 FROM discount_subscriptions ds WHERE ds.discount_id = d.id AND ds.subscription_id = $1))
      ORDER BY d.id
      FOR UPDATE OF d`,
    [subscriptionId, onDate],
    client,
  );
  if (rows.length === 0) return [];
  const products = await query<{ discountId: number; productId: number }>(
    `SELECT discount_id AS "discountId", product_id AS "productId" FROM discount_products WHERE discount_id = ANY($1::int[])`,
    [rows.map((r) => r.id)],
    client,
  );
  return rows.map((r) => ({ ...r, productIds: products.rows.filter((p) => p.discountId === r.id).map((p) => p.productId) }));
}

async function saveLinks(client: DbClient, id: number, input: DiscountInput) {
  const productIds = input.scope === 'product' ? [...new Set(input.productIds)] : [];
  const subscriptionIds = [...new Set(input.subscriptionIds)];
  if (productIds.length) {
    const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM products WHERE id = ANY($1::int[])', [productIds], client);
    if (rows[0].n !== productIds.length) throw badRequest('One or more products do not exist');
  }
  if (subscriptionIds.length) {
    const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM subscriptions WHERE id = ANY($1::int[])', [subscriptionIds], client);
    if (rows[0].n !== subscriptionIds.length) throw badRequest('One or more subscriptions do not exist');
  }
  await query('DELETE FROM discount_products WHERE discount_id = $1', [id], client);
  await query('DELETE FROM discount_subscriptions WHERE discount_id = $1', [id], client);
  if (productIds.length) {
    await query('INSERT INTO discount_products (discount_id, product_id) SELECT $1, unnest($2::int[])', [id, productIds], client);
  }
  if (subscriptionIds.length) {
    await query('INSERT INTO discount_subscriptions (discount_id, subscription_id) SELECT $1, unnest($2::int[])', [id, subscriptionIds], client);
  }
}

const values = (d: DiscountInput) => [
  d.name,
  d.discountType,
  d.value,
  d.minPurchase,
  d.minQuantity,
  d.startDate,
  d.endDate,
  d.usageLimit ?? null,
  d.scope,
  d.isActive,
];

export const discountsRouter = Router();
// Staff can see discounts (they appear on invoices) but only admins can create or change discount rules.
discountsRouter.use(authenticate, requireInternal);

const listQuery = paginationSchema.extend({ includeInactive: booleanQuery });

discountsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const params: unknown[] = [];
  const where: string[] = [];
  if (!q.includeInactive) where.push('d.is_active');
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`d.name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, offset } = paginate(q);
  const [{ rows }, count] = await Promise.all([
    query<Omit<DiscountRow, 'state'>>(`SELECT ${COLUMNS} FROM discounts d ${whereSql} ORDER BY d.created_at DESC, d.id DESC LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM discounts d ${whereSql}`, params),
  ]);
  const today = todayIso();
  res.json(paged(rows.map((r) => withState(r, today)), count.rows[0].total, q.page, q.pageSize));
});

discountsRouter.get('/:id', async (req, res) => {
  res.json(await getDiscount(idParamSchema.parse(req.params).id));
});

discountsRouter.post('/', requireAdmin, async (req, res) => {
  const input = discountInput.parse(req.body);
  const user = currentUser(req);
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO discounts (name, discount_type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, scope, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [...values(input), user.id],
    );
    await saveLinks(client, rows[0].id, input);
    await logAudit(user.id, 'discount.created', 'discount', rows[0].id, { name: input.name }, client);
    return rows[0].id;
  });
  res.status(201).json(await getDiscount(id));
});

discountsRouter.put('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = discountInput.parse(req.body);
  await withTransaction(async (client) => {
    const current = await getDiscount(id, client);
    if (input.usageLimit && input.usageLimit < current.usageCount) {
      throw badRequest(`Usage limit cannot be lower than the ${current.usageCount} times this discount was already used`);
    }
    await client.query(
      `UPDATE discounts SET name = $2, discount_type = $3, value = $4, min_purchase = $5, min_quantity = $6, start_date = $7,
              end_date = $8, usage_limit = $9, scope = $10, is_active = $11, updated_at = now()
        WHERE id = $1`,
      [id, ...values(input)],
    );
    await saveLinks(client, id, input);
    await logAudit(currentUser(req).id, 'discount.updated', 'discount', id, { name: input.name }, client);
  });
  res.json(await getDiscount(id));
});

discountsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await getDiscount(id);
  await query('UPDATE discounts SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
  await logAudit(currentUser(req).id, 'discount.archived', 'discount', id);
  res.status(204).end();
});
