import type { z } from 'zod';
import { pool, query, withTransaction, type DbClient } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { todayIso } from '../../lib/dates.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { toPaise } from '../../lib/money.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { listInvoicesQuery, paymentInput } from './schemas.js';

export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled';

export interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  subscriptionId: number;
  subscriptionNumber: string;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  billingAddress: string | null;
  taxNumber: string | null;
  status: InvoiceStatus;
  isOverdue: boolean;
  daysOverdue: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  confirmedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface InvoiceLineRow {
  id: number;
  lineType: 'plan' | 'product';
  productId: number | null;
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface InvoiceDiscountRow {
  discountId: number;
  name: string;
  amount: number;
}

/** Overdue = confirmed, past its due date and still owing money. `$1` must be today's date. */
export const OVERDUE_SQL = `(i.status = 'confirmed' AND i.due_date < $1::date AND i.amount_due > 0)`;

export const INVOICE_COLUMNS = `
  i.id, i.invoice_number AS "invoiceNumber", i.subscription_id AS "subscriptionId", s.subscription_number AS "subscriptionNumber",
  i.customer_id AS "customerId", i.customer_name AS "customerName", i.customer_email AS "customerEmail",
  i.billing_address AS "billingAddress", i.tax_number AS "taxNumber", i.status,
  ${OVERDUE_SQL} AS "isOverdue",
  CASE WHEN ${OVERDUE_SQL} THEN ($1::date - i.due_date) ELSE 0 END AS "daysOverdue",
  i.billing_period_start AS "billingPeriodStart", i.billing_period_end AS "billingPeriodEnd", i.invoice_date AS "invoiceDate",
  i.due_date AS "dueDate", i.subtotal, i.discount_total AS "discountTotal", i.tax_total AS "taxTotal", i.grand_total AS "grandTotal",
  i.amount_paid AS "amountPaid", i.amount_due AS "amountDue", i.confirmed_at AS "confirmedAt", i.sent_at AS "sentAt",
  i.paid_at AS "paidAt", i.cancelled_at AS "cancelledAt", i.created_at AS "createdAt"`;

const FROM = 'FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id';

const isInternal = (user: AuthUser) => user.role === 'admin' || user.role === 'staff';

export async function listInvoices(user: AuthUser, q: z.infer<typeof listInvoicesQuery>) {
  const params: unknown[] = [todayIso()];
  const where: string[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (!isInternal(user)) {
    add('i.customer_id = ?', user.customerId ?? -1);
    where.push(`i.status <> 'draft'`);
  } else if (q.customerId) {
    add('i.customer_id = ?', q.customerId);
  }
  if (q.status === 'overdue') where.push(OVERDUE_SQL);
  else if (q.status === 'outstanding') where.push(`i.status = 'confirmed' AND i.amount_due > 0`);
  else if (q.status) add('i.status = ?', q.status);
  if (q.subscriptionId) add('i.subscription_id = ?', q.subscriptionId);
  if (q.planId) add('s.plan_id = ?', q.planId);
  if (q.dateFrom) add('i.invoice_date >= ?', q.dateFrom);
  if (q.dateTo) add('i.invoice_date <= ?', q.dateTo);
  if (q.q) add('(i.invoice_number ILIKE ? OR i.customer_name ILIKE ? OR s.subscription_number ILIKE ?)', `%${q.q}%`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = q.pageSize;
  const offset = (q.page - 1) * q.pageSize;
  const [{ rows }, totals] = await Promise.all([
    query<InvoiceRow>(`SELECT ${INVOICE_COLUMNS} ${FROM} ${whereSql} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number; grandTotal: number; amountDue: number }>(
      `SELECT count(*)::int AS total, COALESCE(sum(i.grand_total), 0) AS "grandTotal", COALESCE(sum(i.amount_due), 0) AS "amountDue"
         ${FROM} ${whereSql} ${where.length ? 'AND' : 'WHERE'} $1::date IS NOT NULL`,
      params,
    ),
  ]);
  const { total, grandTotal, amountDue } = totals.rows[0];
  return { data: rows, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), summary: { grandTotal, amountDue } };
}

async function findInvoice(id: number, client: DbClient = pool, lock = false) {
  const { rows } = await query<InvoiceRow>(`SELECT ${INVOICE_COLUMNS} ${FROM} WHERE i.id = $2 ${lock ? 'FOR UPDATE OF i' : ''}`, [todayIso(), id], client);
  if (!rows[0]) throw notFound('Invoice not found');
  return rows[0];
}

function assertCanView(user: AuthUser, invoice: InvoiceRow) {
  if (isInternal(user)) return;
  if (invoice.customerId !== user.customerId || invoice.status === 'draft') throw notFound('Invoice not found');
}

export async function getInvoice(id: number, user: AuthUser, client: DbClient = pool) {
  const invoice = await findInvoice(id, client);
  assertCanView(user, invoice);
  const lines = await query<InvoiceLineRow>(
    `SELECT id, line_type AS "lineType", product_id AS "productId", variant_id AS "variantId", description, quantity,
            unit_price AS "unitPrice", subtotal, discount_amount AS "discountAmount", tax_rate AS "taxRate", tax_amount AS "taxAmount", total
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY sort_order, id`,
    [id],
    client,
  );
  const discounts = await query<InvoiceDiscountRow>(
    `SELECT discount_id AS "discountId", name, amount FROM invoice_discounts WHERE invoice_id = $1 ORDER BY discount_id`,
    [id],
    client,
  );
  const payments = await listInvoicePayments(id, client);
  return { ...invoice, lines: lines.rows, discounts: discounts.rows, payments };
}

export async function listInvoicePayments(invoiceId: number, client: DbClient = pool) {
  const { rows } = await query(
    `SELECT p.id, p.invoice_id AS "invoiceId", p.payment_method AS "paymentMethod", p.amount, p.payment_date AS "paymentDate",
            p.reference_number AS "referenceNumber", p.note, u.full_name AS "recordedBy", p.created_at AS "createdAt"
       FROM payments p LEFT JOIN users u ON u.id = p.recorded_by
      WHERE p.invoice_id = $1 ORDER BY p.payment_date, p.id`,
    [invoiceId],
    client,
  );
  return rows;
}

export async function confirmInvoice(id: number, actor: AuthUser) {
  return withTransaction(async (client) => {
    const invoice = await findInvoice(id, client, true);
    if (invoice.status !== 'draft') throw conflict(`Only draft invoices can be confirmed (this one is ${invoice.status})`);
    // A fully discounted invoice has nothing to collect, so it is settled immediately.
    const status = invoice.grandTotal === 0 ? 'paid' : 'confirmed';
    await client.query(
      `UPDATE invoices SET status = $2, confirmed_at = now(), paid_at = ${status === 'paid' ? 'now()' : 'NULL'}, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    await logAudit(actor.id, 'invoice.confirmed', 'invoice', id, {}, client);
    return getInvoice(id, actor, client);
  });
}

/** Cancels an unpaid invoice and gives back the discount uses it consumed. */
export async function cancelInvoice(id: number, actor: AuthUser, reason: string | null) {
  return withTransaction(async (client) => {
    const invoice = await findInvoice(id, client, true);
    if (!['draft', 'confirmed'].includes(invoice.status)) throw conflict(`A ${invoice.status} invoice cannot be cancelled`);
    if (invoice.amountPaid > 0) throw conflict('This invoice has payments recorded against it and cannot be cancelled');
    await client.query(`UPDATE invoices SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`, [id]);
    await client.query(
      `UPDATE discounts d SET usage_count = GREATEST(d.usage_count - 1, 0), updated_at = now()
         FROM invoice_discounts idc WHERE idc.invoice_id = $1 AND idc.discount_id = d.id`,
      [id],
    );
    await logAudit(actor.id, 'invoice.cancelled', 'invoice', id, { reason }, client);
    return getInvoice(id, actor, client);
  });
}

export async function sendInvoice(id: number, actor: AuthUser) {
  const invoice = await getInvoice(id, actor);
  if (!['confirmed', 'paid'].includes(invoice.status)) throw conflict('Confirm the invoice before sending it');
  if (!invoice.customerEmail) throw badRequest('This customer has no email address on file');
  const lines = invoice.lines.map((l) => `  - ${l.description} x${l.quantity}: ${l.total.toFixed(2)}`);
  await sendMail({
    to: invoice.customerEmail,
    subject: `Invoice ${invoice.invoiceNumber} from Brightloop`,
    text: [
      `Hello ${invoice.customerName},`,
      '',
      `Invoice ${invoice.invoiceNumber} for ${invoice.billingPeriodStart} to ${invoice.billingPeriodEnd}`,
      ...lines,
      '',
      `Total: INR ${invoice.grandTotal.toFixed(2)}`,
      `Amount due: INR ${invoice.amountDue.toFixed(2)} by ${invoice.dueDate}`,
    ].join('\n'),
  });
  await query('UPDATE invoices SET sent_at = now(), updated_at = now() WHERE id = $1', [id]);
  await logAudit(actor.id, 'invoice.sent', 'invoice', id, { to: invoice.customerEmail });
  return getInvoice(id, actor);
}

/** Records a payment. Rejects payments on unconfirmed/cancelled/paid invoices and any overpayment; marks the invoice paid when settled. */
export async function recordPayment(invoiceId: number, input: z.infer<typeof paymentInput>, actor: AuthUser) {
  return withTransaction(async (client) => {
    const invoice = await findInvoice(invoiceId, client, true);
    if (invoice.status === 'draft') throw conflict('Confirm the invoice before recording a payment');
    if (invoice.status === 'cancelled') throw conflict('Payments cannot be recorded on a cancelled invoice');
    if (invoice.status === 'paid') throw conflict('This invoice is already fully paid');
    if (toPaise(input.amount) > toPaise(invoice.amountDue)) {
      throw badRequest(`Payment of ${input.amount.toFixed(2)} exceeds the amount due of ${invoice.amountDue.toFixed(2)}`);
    }
    if (input.paymentDate > todayIso()) throw badRequest('Payment date cannot be in the future');

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO payments (invoice_id, customer_id, payment_method, amount, payment_date, reference_number, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [invoiceId, invoice.customerId, input.paymentMethod, input.amount, input.paymentDate, input.referenceNumber, input.note, actor.id],
    );
    const fullyPaid = toPaise(input.amount) === toPaise(invoice.amountDue);
    await client.query(
      `UPDATE invoices SET amount_paid = amount_paid + $2, status = $3, paid_at = ${fullyPaid ? 'now()' : 'paid_at'}, updated_at = now() WHERE id = $1`,
      [invoiceId, input.amount, fullyPaid ? 'paid' : 'confirmed'],
    );
    await logAudit(actor.id, 'payment.recorded', 'invoice', invoiceId, { paymentId: rows[0].id, amount: input.amount, method: input.paymentMethod }, client);
    return { paymentId: rows[0].id, invoice: await getInvoice(invoiceId, actor, client) };
  });
}
