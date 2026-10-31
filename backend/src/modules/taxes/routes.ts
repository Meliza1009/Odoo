import { Router } from 'express';
import { z } from 'zod';
import { query, type DbClient } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { booleanQuery, idParamSchema, idSchema, nameSchema, percentSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';
import type { TaxRule } from '../billing/calculate.js';
import { PRODUCT_TYPES } from '../products/schemas.js';

const taxRuleInput = z
  .object({
    name: nameSchema,
    rate: percentSchema,
    appliesTo: z.enum(['all', 'product_type', 'product']).default('all'),
    productType: z.enum(PRODUCT_TYPES).nullable().optional(),
    productId: idSchema.nullable().optional(),
    region: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    isActive: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (r.appliesTo === 'product_type' && !r.productType) ctx.addIssue({ code: 'custom', path: ['productType'], message: 'Choose a product type' });
    if (r.appliesTo === 'product' && !r.productId) ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a product' });
  })
  .transform((r) => ({
    ...r,
    productType: r.appliesTo === 'product_type' ? (r.productType ?? null) : null,
    productId: r.appliesTo === 'product' ? (r.productId ?? null) : null,
  }));

export interface TaxRuleRow extends TaxRule {
  productName: string | null;
  isActive: boolean;
  createdAt: string;
}

const COLUMNS = `
  t.id, t.name, t.rate, t.applies_to AS "appliesTo", t.product_type AS "productType", t.product_id AS "productId",
  p.name AS "productName", t.region, t.is_active AS "isActive", t.created_at AS "createdAt"`;

export async function activeTaxRules(client?: DbClient): Promise<TaxRule[]> {
  const { rows } = await query<TaxRule>(
    `SELECT id, name, rate, applies_to AS "appliesTo", product_type AS "productType", product_id AS "productId", region
       FROM tax_rules WHERE is_active ORDER BY id`,
    [],
    client,
  );
  return rows;
}

async function getTaxRule(id: number) {
  const { rows } = await query<TaxRuleRow>(`SELECT ${COLUMNS} FROM tax_rules t LEFT JOIN products p ON p.id = t.product_id WHERE t.id = $1`, [id]);
  if (!rows[0]) throw notFound('Tax rule not found');
  return rows[0];
}

async function assertProduct(productId: number | null) {
  if (productId === null) return;
  const { rowCount } = await query('SELECT 1 FROM products WHERE id = $1', [productId]);
  if (!rowCount) throw badRequest('Product not found');
}

export const taxRulesRouter = Router();
taxRulesRouter.use(authenticate, requireInternal);

taxRulesRouter.get('/', async (req, res) => {
  const { includeInactive } = z.object({ includeInactive: booleanQuery }).parse(req.query);
  const { rows } = await query<TaxRuleRow>(
    `SELECT ${COLUMNS} FROM tax_rules t LEFT JOIN products p ON p.id = t.product_id
      ${includeInactive ? '' : 'WHERE t.is_active'}
      ORDER BY t.is_active DESC, t.applies_to, t.name`,
  );
  res.json({ data: rows });
});

taxRulesRouter.get('/:id', async (req, res) => {
  res.json(await getTaxRule(idParamSchema.parse(req.params).id));
});

taxRulesRouter.post('/', requireAdmin, async (req, res) => {
  const input = taxRuleInput.parse(req.body);
  await assertProduct(input.productId);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO tax_rules (name, rate, applies_to, product_type, product_id, region, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.name, input.rate, input.appliesTo, input.productType, input.productId, input.region, input.isActive],
  );
  await logAudit(currentUser(req).id, 'tax_rule.created', 'tax_rule', rows[0].id, { name: input.name, rate: input.rate });
  res.status(201).json(await getTaxRule(rows[0].id));
});

taxRulesRouter.put('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = taxRuleInput.parse(req.body);
  await getTaxRule(id);
  await assertProduct(input.productId);
  await query(
    `UPDATE tax_rules SET name = $2, rate = $3, applies_to = $4, product_type = $5, product_id = $6, region = $7,
            is_active = $8, updated_at = now() WHERE id = $1`,
    [id, input.name, input.rate, input.appliesTo, input.productType, input.productId, input.region, input.isActive],
  );
  await logAudit(currentUser(req).id, 'tax_rule.updated', 'tax_rule', id, { name: input.name, rate: input.rate });
  res.json(await getTaxRule(id));
});

taxRulesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await getTaxRule(id);
  await query('UPDATE tax_rules SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
  await logAudit(currentUser(req).id, 'tax_rule.archived', 'tax_rule', id);
  res.status(204).end();
});
