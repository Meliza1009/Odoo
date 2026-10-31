import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { idSchema, paged } from '../../lib/validation.js';
import { authenticate, currentUser, requireInternal } from '../../middleware/auth.js';
import { listPaymentsQuery, paymentInput } from '../invoices/schemas.js';
import { recordPayment } from '../invoices/service.js';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

/** Payment history. Customers only see payments on their own invoices. */
paymentsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = listPaymentsQuery.parse(req.query);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (user.role === 'customer') add('p.customer_id = ?', user.customerId ?? -1);
  else if (q.customerId) add('p.customer_id = ?', q.customerId);
  if (q.paymentMethod) add('p.payment_method = ?', q.paymentMethod);
  if (q.invoiceId) add('p.invoice_id = ?', q.invoiceId);
  if (q.dateFrom) add('p.payment_date >= ?', q.dateFrom);
  if (q.dateTo) add('p.payment_date <= ?', q.dateTo);
  if (q.q) add('(i.invoice_number ILIKE ? OR i.customer_name ILIKE ? OR p.reference_number ILIKE ?)', `%${q.q}%`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = q.pageSize;
  const offset = (q.page - 1) * q.pageSize;
  const from = 'FROM payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN users u ON u.id = p.recorded_by';
  const [{ rows }, totals] = await Promise.all([
    query(
      `SELECT p.id, p.invoice_id AS "invoiceId", i.invoice_number AS "invoiceNumber", p.customer_id AS "customerId",
              i.customer_name AS "customerName", p.payment_method AS "paymentMethod", p.amount, p.payment_date AS "paymentDate",
              p.reference_number AS "referenceNumber", p.note, u.full_name AS "recordedBy", p.created_at AS "createdAt"
         ${from} ${whereSql}
        ORDER BY p.payment_date DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    query<{ total: number; amount: number }>(`SELECT count(*)::int AS total, COALESCE(sum(p.amount), 0) AS amount ${from} ${whereSql}`, params),
  ]);
  res.json({ ...paged(rows, totals.rows[0].total, q.page, q.pageSize), summary: { amount: totals.rows[0].amount } });
});

/** Same as POST /api/invoices/:id/payments, with the invoice id in the body. */
paymentsRouter.post('/', requireInternal, async (req, res) => {
  const { invoiceId, ...rest } = paymentInput.extend({ invoiceId: idSchema }).parse(req.body) as z.infer<typeof paymentInput> & { invoiceId: number };
  res.status(201).json(await recordPayment(invoiceId, rest, currentUser(req)));
});
