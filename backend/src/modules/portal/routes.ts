import { Router } from 'express';
import { query } from '../../db/pool.js';
import { forbidden } from '../../lib/errors.js';
import { paged, paginate, paginationSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireRole } from '../../middleware/auth.js';

/** Customer-facing data is projected explicitly so catalog costs and internal notes stay private. */
export const portalRoutes = Router();
portalRoutes.use(authenticate, requireRole('customer'));
portalRoutes.use((req, _res, next) => {
  if (currentUser(req).customerId === null) throw forbidden('No customer account is linked to this user');
  next();
});

portalRoutes.get('/catalog', async (_req, res) => {
  const [plans, products, variants] = await Promise.all([
    query(`SELECT id, name, description, billing_interval AS "billingInterval", price,
                  min_quantity AS "minQuantity", end_date AS "endDate"
             FROM plans WHERE is_active
              AND (start_date IS NULL OR start_date <= CURRENT_DATE)
              AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            ORDER BY price, name`),
    query(`SELECT id, name, type, sales_price AS "salesPrice" FROM products WHERE is_active ORDER BY name`),
    query(`SELECT v.id, v.product_id AS "productId", v.attribute, v.value,
                  v.extra_price AS "extraPrice", p.sales_price + v.extra_price AS "finalPrice"
             FROM product_variants v JOIN products p ON p.id = v.product_id
            WHERE v.is_active AND p.is_active ORDER BY v.attribute, v.value`),
  ]);
  const byProduct = new Map<number, Record<string, unknown>[]>();
  for (const { productId, ...variant } of variants.rows) {
    const values = byProduct.get(productId) ?? [];
    values.push(variant);
    byProduct.set(productId, values);
  }
  res.json({ plans: plans.rows, products: products.rows.map((p) => ({ ...p, variants: byProduct.get(p.id) ?? [] })) });
});

/** Counts and balances cover the entire account, independently of paginated recent lists. */
portalRoutes.get('/summary', async (req, res) => {
  const customerId = currentUser(req).customerId;
  const [subscriptions, invoices, next] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE status = 'active') AS "activeSubscriptions",
                  COUNT(*) FILTER (WHERE status = 'quotation') AS "openQuotations"
             FROM subscriptions WHERE customer_id = $1`, [customerId]),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'confirmed' AND amount_due > 0) AS "outstandingCount",
                  COALESCE(SUM(amount_due) FILTER (WHERE status = 'confirmed' AND amount_due > 0), 0) AS "outstandingBalance",
                  COUNT(*) FILTER (WHERE status = 'confirmed' AND amount_due > 0 AND due_date < CURRENT_DATE) AS "overdueCount",
                  COALESCE(SUM(amount_due) FILTER (WHERE status = 'confirmed' AND amount_due > 0 AND due_date < CURRENT_DATE), 0) AS "overdueBalance",
                  COUNT(*) FILTER (WHERE status = 'paid') AS "paidInvoices"
             FROM invoices WHERE customer_id = $1`, [customerId]),
    query(`SELECT id AS "nextBillingSubscriptionId", next_billing_date AS "nextBillingDate"
             FROM subscriptions WHERE customer_id = $1 AND status = 'active' AND next_billing_date IS NOT NULL
            ORDER BY next_billing_date, id LIMIT 1`, [customerId]),
  ]);
  res.json({ ...subscriptions.rows[0], ...invoices.rows[0], nextBillingDate: null, nextBillingSubscriptionId: null, ...next.rows[0] });
});

/** These are savings already applied to issued invoices, not discounts merely available to use. */
portalRoutes.get('/discounts', async (req, res) => {
  const { page, pageSize, q } = paginationSchema.parse(req.query);
  const { limit, offset } = paginate({ page, pageSize });
  const params: unknown[] = [currentUser(req).customerId];
  let where = `i.customer_id = $1 AND i.status IN ('confirmed', 'paid')`;
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (d.name ILIKE $2 OR i.invoice_number ILIKE $2 OR s.subscription_number ILIKE $2)`;
  }
  const from = `FROM invoice_discounts d JOIN invoices i ON i.id = d.invoice_id
                 JOIN subscriptions s ON s.id = i.subscription_id WHERE ${where}`;
  const [rows, totals] = await Promise.all([
    query(`SELECT i.id AS "invoiceId", i.invoice_number AS "invoiceNumber", s.id AS "subscriptionId",
                  s.subscription_number AS "subscriptionNumber", d.discount_id AS "discountId", d.name, d.amount,
                  i.invoice_date AS "invoiceDate" ${from}
            ORDER BY i.invoice_date DESC, i.id DESC, d.discount_id LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) AS total, COALESCE(SUM(d.amount), 0) AS "totalSavings", COUNT(DISTINCT i.id) AS "invoiceCount" ${from}`, params),
  ]);
  const { total, totalSavings, invoiceCount } = totals.rows[0];
  res.json({ ...paged(rows.rows, total, page, pageSize), summary: { totalSavings, invoiceCount } });
});
