import { Router } from 'express';
import { z } from 'zod';
import { pool, query, withTransaction, type DbClient } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { todayIso } from '../../lib/dates.js';
import { conflict, notFound } from '../../lib/errors.js';
import { booleanQuery, emailSchema, idParamSchema, nameSchema, optionalText, paged, paginate, paginationSchema, passwordSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';
import { CUSTOMER_COLUMNS, hashPassword, type CustomerProfile } from '../auth/service.js';

const customerInput = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  contactName: optionalText(120),
  email: z
    .union([emailSchema, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  phone: optionalText(40),
  billingAddress: optionalText(500),
  taxNumber: optionalText(60),
  isActive: z.boolean().default(true),
});

const portalAccessInput = z.object({
  fullName: nameSchema.optional(),
  email: emailSchema,
  password: passwordSchema,
});

const listQuery = paginationSchema.extend({ includeInactive: booleanQuery });

export interface CustomerRow extends CustomerProfile {
  userEmail: string | null;
  activeSubscriptions: number;
  outstandingBalance: number;
}

const LIST_COLUMNS = `${CUSTOMER_COLUMNS}, u.email AS "userEmail",
  (SELECT count(*) FROM subscriptions s WHERE s.customer_id = c.id AND s.status = 'active')::int AS "activeSubscriptions",
  COALESCE((SELECT sum(i.amount_due) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'confirmed'), 0) AS "outstandingBalance"`;

const FROM = 'FROM customers c LEFT JOIN users u ON u.id = c.user_id';

async function getCustomer(id: number, client: DbClient = pool): Promise<CustomerRow> {
  const { rows } = await query<CustomerRow>(`SELECT ${LIST_COLUMNS} ${FROM} WHERE c.id = $1`, [id], client);
  if (!rows[0]) throw notFound('Customer not found');
  return rows[0];
}

const values = (c: z.infer<typeof customerInput>) => [c.companyName, c.contactName, c.email, c.phone, c.billingAddress, c.taxNumber, c.isActive];

export const customersRouter = Router();
customersRouter.use(authenticate, requireInternal);

customersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (!q.includeInactive) where.push('c.is_active');
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`(c.company_name ILIKE $${params.length} OR c.contact_name ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, offset } = paginate(q);
  const [{ rows }, count] = await Promise.all([
    query<CustomerRow>(`SELECT ${LIST_COLUMNS} ${FROM} ${whereSql} ORDER BY c.company_name LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM customers c ${whereSql}`, params),
  ]);
  res.json(paged(rows, count.rows[0].total, q.page, q.pageSize));
});

/** Customer record plus the figures staff need when talking to them: subscriptions, invoices and balances. */
customersRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const customer = await getCustomer(id);
  const [subscriptions, invoices] = await Promise.all([
    query(
      `SELECT s.id, s.subscription_number AS "subscriptionNumber", pl.name AS "planName", s.status, s.start_date AS "startDate",
              s.expiry_date AS "expiryDate", s.next_billing_date AS "nextBillingDate", s.total
         FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
        WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 20`,
      [id],
    ),
    query<{ invoiceCount: number; invoicedTotal: number; paidTotal: number; overdueBalance: number }>(
      `SELECT count(*) FILTER (WHERE i.status <> 'cancelled')::int AS "invoiceCount",
              COALESCE(sum(i.grand_total) FILTER (WHERE i.status IN ('confirmed', 'paid')), 0) AS "invoicedTotal",
              COALESCE(sum(i.amount_paid), 0) AS "paidTotal",
              COALESCE(sum(i.amount_due) FILTER (WHERE i.status = 'confirmed' AND i.due_date < $2::date), 0) AS "overdueBalance"
         FROM invoices i WHERE i.customer_id = $1`,
      [id, todayIso()],
    ),
  ]);
  res.json({ ...customer, subscriptions: subscriptions.rows, stats: invoices.rows[0] });
});

customersRouter.post('/', async (req, res) => {
  const input = customerInput.parse(req.body);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO customers (company_name, contact_name, email, phone, billing_address, tax_number, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    values(input),
  );
  await logAudit(currentUser(req).id, 'customer.created', 'customer', rows[0].id, { companyName: input.companyName });
  res.status(201).json(await getCustomer(rows[0].id));
});

customersRouter.put('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = customerInput.parse(req.body);
  const current = await getCustomer(id);
  // Only admins may deactivate or reactivate accounts; staff edits keep the current flag.
  const isActive = currentUser(req).role === 'admin' ? input.isActive : current.isActive;
  await query(
    `UPDATE customers SET company_name = $2, contact_name = $3, email = $4, phone = $5, billing_address = $6, tax_number = $7,
            is_active = $8, updated_at = now() WHERE id = $1`,
    [id, ...values({ ...input, isActive })],
  );
  await logAudit(currentUser(req).id, 'customer.updated', 'customer', id, { companyName: input.companyName });
  res.json(await getCustomer(id));
});

/** Deactivates the customer and locks their portal login. History (subscriptions, invoices) is kept. */
customersRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const customer = await getCustomer(id);
  await withTransaction(async (client) => {
    await client.query('UPDATE customers SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
    if (customer.userId) await client.query('UPDATE users SET is_active = FALSE, updated_at = now() WHERE id = $1', [customer.userId]);
    await logAudit(currentUser(req).id, 'customer.deactivated', 'customer', id, {}, client);
  });
  res.status(204).end();
});

/** Gives an existing customer a portal login (or resets it) without them having to self-register. */
customersRouter.post('/:id/portal-access', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = portalAccessInput.parse(req.body);
  const customer = await getCustomer(id);
  const passwordHash = await hashPassword(input.password);
  await withTransaction(async (client) => {
    if (customer.userId) {
      await client.query(`UPDATE users SET password_hash = $2, is_active = TRUE, updated_at = now() WHERE id = $1`, [customer.userId, passwordHash]);
    } else {
      const taken = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
      if (taken.rowCount) throw conflict('An account with this email already exists');
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'customer') RETURNING id`,
        [input.email, passwordHash, input.fullName ?? customer.contactName ?? customer.companyName],
      );
      await client.query('UPDATE customers SET user_id = $2, email = COALESCE(email, $3), updated_at = now() WHERE id = $1', [id, rows[0].id, input.email]);
    }
    await logAudit(currentUser(req).id, 'customer.portal_access_granted', 'customer', id, { reset: !!customer.userId }, client);
  });
  res.status(customer.userId ? 200 : 201).json(await getCustomer(id));
});
