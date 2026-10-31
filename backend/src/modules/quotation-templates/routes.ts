import { Router } from 'express';
import { z } from 'zod';
import { pool, query, withTransaction, type DbClient } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import { lineAmounts, sumAmounts } from '../../lib/money.js';
import {
  booleanQuery,
  idParamSchema,
  idSchema,
  moneySchema,
  nameSchema,
  optionalText,
  paged,
  paginate,
  paginationSchema,
  percentSchema,
} from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';
import { getPlan } from '../plans/routes.js';
import { loadCatalog } from '../subscriptions/lines.js';

export const templateLineInput = z.object({
  productId: idSchema,
  variantId: idSchema.nullable().optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100000),
  unitPrice: moneySchema.nullable().optional(),
  taxRate: percentSchema.default(0),
});

const templateInput = z.object({
  name: nameSchema,
  planId: idSchema,
  validityDays: z.coerce.number().int().min(1, 'Validity must be at least 1 day').max(365),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  contractPeriods: z.coerce.number().int().min(1).max(120).nullable().optional(),
  notes: optionalText(2000),
  isActive: z.boolean().default(true),
  lines: z.array(templateLineInput).max(50).default([]),
});

export interface QuotationTemplate {
  id: number;
  name: string;
  planId: number;
  planName: string;
  billingInterval: string;
  validityDays: number;
  paymentTermsDays: number;
  contractPeriods: number | null;
  notes: string | null;
  isActive: boolean;
  lineCount?: number;
  lines?: TemplateLine[];
  estimatedTotal?: number;
}

export interface TemplateLine {
  id: number;
  productId: number;
  productName: string;
  variantId: number | null;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number | null;
  effectiveUnitPrice: number;
  taxRate: number;
}

const TEMPLATE_COLUMNS = `
  t.id, t.name, t.plan_id AS "planId", pl.name AS "planName", pl.billing_interval AS "billingInterval",
  t.validity_days AS "validityDays", t.payment_terms_days AS "paymentTermsDays", t.contract_periods AS "contractPeriods",
  t.notes, t.is_active AS "isActive"`;

export async function getTemplate(id: number, client: DbClient = pool): Promise<QuotationTemplate & { lines: TemplateLine[] }> {
  const { rows } = await query<QuotationTemplate>(
    `SELECT ${TEMPLATE_COLUMNS} FROM quotation_templates t JOIN plans pl ON pl.id = t.plan_id WHERE t.id = $1`,
    [id],
    client,
  );
  if (!rows[0]) throw notFound('Quotation template not found');
  const lines = await query<TemplateLine>(
    `SELECT l.id, l.product_id AS "productId", p.name AS "productName", l.variant_id AS "variantId",
            CASE WHEN v.id IS NULL THEN NULL ELSE v.attribute || ': ' || v.value END AS "variantLabel",
            l.quantity, l.unit_price AS "unitPrice",
            COALESCE(l.unit_price, p.sales_price + COALESCE(v.extra_price, 0))::numeric(12,2) AS "effectiveUnitPrice",
            l.tax_rate AS "taxRate"
       FROM quotation_template_lines l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN product_variants v ON v.id = l.variant_id
      WHERE l.template_id = $1
      ORDER BY l.sort_order, l.id`,
    [id],
    client,
  );
  const plan = await getPlan(rows[0].planId, client);
  const amounts = lines.rows.map((l) => lineAmounts(l.quantity, l.effectiveUnitPrice, l.taxRate));
  if (plan.price > 0) amounts.push(lineAmounts(1, plan.price, 0));
  return { ...rows[0], lines: lines.rows, estimatedTotal: sumAmounts(amounts).total };
}

async function saveTemplateLines(client: DbClient, templateId: number, lines: z.infer<typeof templateLineInput>[]) {
  await query('DELETE FROM quotation_template_lines WHERE template_id = $1', [templateId], client);
  for (const [index, l] of lines.entries()) {
    await query(
      `INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, unit_price, tax_rate, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [templateId, l.productId, l.variantId ?? null, l.quantity, l.unitPrice ?? null, l.taxRate, index],
      client,
    );
  }
}

export const quotationTemplatesRouter = Router();
quotationTemplatesRouter.use(authenticate, requireInternal);

const listQuery = paginationSchema.extend({ includeInactive: booleanQuery });

quotationTemplatesRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (!q.includeInactive) where.push('t.is_active');
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`t.name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, offset } = paginate(q);
  const [{ rows }, count] = await Promise.all([
    query<QuotationTemplate>(
      `SELECT ${TEMPLATE_COLUMNS},
              (SELECT count(*) FROM quotation_template_lines l WHERE l.template_id = t.id)::int AS "lineCount"
         FROM quotation_templates t JOIN plans pl ON pl.id = t.plan_id
         ${whereSql}
        ORDER BY t.name LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM quotation_templates t ${whereSql}`, params),
  ]);
  res.json(paged(rows, count.rows[0].total, q.page, q.pageSize));
});

quotationTemplatesRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getTemplate(id));
});

quotationTemplatesRouter.post('/', requireAdmin, async (req, res) => {
  const input = templateInput.parse(req.body);
  await getPlan(input.planId);
  await loadCatalog(pool, input.lines);
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO quotation_templates (name, plan_id, validity_days, payment_terms_days, contract_periods, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.name, input.planId, input.validityDays, input.paymentTermsDays, input.contractPeriods ?? null, input.notes, input.isActive],
    );
    await saveTemplateLines(client, rows[0].id, input.lines);
    await logAudit(currentUser(req).id, 'quotation_template.created', 'quotation_template', rows[0].id, { name: input.name }, client);
    return rows[0].id;
  });
  res.status(201).json(await getTemplate(id));
});

quotationTemplatesRouter.put('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = templateInput.parse(req.body);
  await getTemplate(id);
  await getPlan(input.planId);
  await loadCatalog(pool, input.lines);
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE quotation_templates SET name = $2, plan_id = $3, validity_days = $4, payment_terms_days = $5,
              contract_periods = $6, notes = $7, is_active = $8, updated_at = now()
        WHERE id = $1`,
      [id, input.name, input.planId, input.validityDays, input.paymentTermsDays, input.contractPeriods ?? null, input.notes, input.isActive],
    );
    await saveTemplateLines(client, id, input.lines);
    await logAudit(currentUser(req).id, 'quotation_template.updated', 'quotation_template', id, { name: input.name }, client);
  });
  res.json(await getTemplate(id));
});

quotationTemplatesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await getTemplate(id);
  await query('UPDATE quotation_templates SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
  await logAudit(currentUser(req).id, 'quotation_template.archived', 'quotation_template', id);
  res.status(204).end();
});
