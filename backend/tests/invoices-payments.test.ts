import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { outbox } from '../src/lib/mailer.js';
import { runBilling } from '../src/modules/billing/engine.js';
import { api, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let otherCustomer: TestUser;
let productId: number;
let planId: number;

const today = todayIso();

/** Creates an active subscription for `who` and bills it; returns the new invoice id (total 1180 incl. 18% GST). */
async function newInvoice(who: TestUser = customer, autoConfirm = false) {
  const subscriptionId = await createActiveSubscription(staff, { customerId: who.customerId, planId, startDate: today, lines: [{ productId, quantity: 1 }] });
  await runBilling(today, { autoConfirm });
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM invoices WHERE subscription_id = $1', [subscriptionId]);
  return rows[0].id;
}

const pay = (invoiceId: number, body: Record<string, unknown>, who: TestUser = staff) =>
  api()
    .post(`/api/invoices/${invoiceId}/payments`)
    .set(who.auth)
    .send({ paymentMethod: 'bank_transfer', paymentDate: today, ...body });

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer, otherCustomer] = await Promise.all([
    createUser('admin'),
    createUser('staff'),
    createUser('customer', { companyName: 'Green Leaf Store' }),
    createUser('customer', { companyName: 'Northwind Traders' }),
  ]);
  productId = (await api().post('/api/products').set(admin.auth).send({ name: 'Analytics Add-on', type: 'addon', salesPrice: 1000 })).body.id;
  planId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Monthly', billingInterval: 'monthly', price: 0 })).body.id;
  await api().post('/api/tax-rules').set(admin.auth).send({ name: 'GST', rate: 18 });
});
afterAll(closeDatabase);

describe('invoice workflow', () => {
  it('shows invoice details with lines and moves Draft -> Confirmed', async () => {
    const id = await newInvoice();
    const detail = await api().get(`/api/invoices/${id}`).set(staff.auth);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ status: 'draft', grandTotal: 1180, amountPaid: 0, amountDue: 1180, isOverdue: false, customerName: 'Green Leaf Store' });
    expect(detail.body.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(detail.body.lines).toHaveLength(1);

    const confirmed = await api().post(`/api/invoices/${id}/confirm`).set(staff.auth);
    expect(confirmed.body).toMatchObject({ status: 'confirmed' });
    expect(confirmed.body.confirmedAt).toBeTruthy();
    expect((await api().post(`/api/invoices/${id}/confirm`).set(staff.auth)).status).toBe(409);
  });

  it('cancels unpaid invoices but not ones with payments', async () => {
    const draft = await newInvoice();
    expect((await api().post(`/api/invoices/${draft}/cancel`).set(staff.auth).send({})).body.status).toBe('cancelled');
    expect((await api().post(`/api/invoices/${draft}/cancel`).set(staff.auth).send({})).status).toBe(409);

    const partlyPaid = await newInvoice(customer, true);
    await pay(partlyPaid, { amount: 100 });
    const res = await api().post(`/api/invoices/${partlyPaid}/cancel`).set(staff.auth).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/payments recorded/);
  });

  it('sends confirmed invoices by email', async () => {
    const draft = await newInvoice();
    expect((await api().post(`/api/invoices/${draft}/send`).set(staff.auth)).status).toBe(409);

    await pool.query('UPDATE customers SET email = $2 WHERE id = $1', [customer.customerId, 'billing@greenleaf.demo']);
    const id = await newInvoice(customer, true);
    const res = await api().post(`/api/invoices/${id}/send`).set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.body.sentAt).toBeTruthy();
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe('billing@greenleaf.demo');
    expect(mail.subject).toContain(res.body.invoiceNumber);
    expect(mail.text).toContain('1180.00');
  });

  it('prints and downloads invoices as HTML', async () => {
    const id = await newInvoice(customer, true);
    const print = await api().get(`/api/invoices/${id}/print`).set(staff.auth);
    expect(print.status).toBe(200);
    expect(print.headers['content-type']).toMatch(/text\/html/);
    expect(print.text).toContain('Green Leaf Store');
    expect(print.text).toContain('₹1,180.00');

    const download = await api().get(`/api/invoices/${id}/print?download=1`).set(staff.auth);
    expect(download.headers['content-disposition']).toMatch(/attachment; filename="INV-\d{6}\.html"/);
  });
});

describe('payments', () => {
  it('records partial and final payments and marks the invoice paid', async () => {
    const id = await newInvoice();
    const onDraft = await pay(id, { amount: 100 });
    expect(onDraft.status).toBe(409);
    await api().post(`/api/invoices/${id}/confirm`).set(staff.auth);

    const partial = await pay(id, { amount: 500, paymentMethod: 'cash', referenceNumber: 'R-1', note: 'Paid at counter' });
    expect(partial.status).toBe(201);
    expect(partial.body.invoice).toMatchObject({ status: 'confirmed', amountPaid: 500, amountDue: 680 });

    const over = await pay(id, { amount: 680.01 });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/exceeds the amount due/);

    const final = await pay(id, { amount: 680, paymentMethod: 'upi' });
    expect(final.body.invoice).toMatchObject({ status: 'paid', amountPaid: 1180, amountDue: 0 });
    expect(final.body.invoice.paidAt).toBeTruthy();
    expect(final.body.invoice.payments).toHaveLength(2);
    expect(final.body.invoice.payments[0]).toMatchObject({ paymentMethod: 'cash', amount: 500, referenceNumber: 'R-1', note: 'Paid at counter' });

    expect((await pay(id, { amount: 1 })).status).toBe(409);
  });

  it('validates payment fields', async () => {
    const id = await newInvoice(customer, true);
    expect((await pay(id, { amount: 0 })).status).toBe(400);
    expect((await pay(id, { amount: -5 })).status).toBe(400);
    expect((await pay(id, { amount: 10, paymentMethod: 'bitcoin' })).status).toBe(400);
    expect((await pay(id, { amount: 10, paymentDate: 'yesterday' })).status).toBe(400);
    expect((await pay(id, { amount: 10, paymentDate: addDays(today, 3) })).status).toBe(400);
  });

  it('cannot overpay even at the database level', async () => {
    const id = await newInvoice(customer, true);
    await expect(pool.query('UPDATE invoices SET amount_paid = grand_total + 1 WHERE id = $1', [id])).rejects.toMatchObject({ code: '23514' });
  });

  it('also accepts payments through POST /api/payments and lists them with filters', async () => {
    const id = await newInvoice(customer, true);
    const res = await api().post('/api/payments').set(staff.auth).send({ invoiceId: id, amount: 1180, paymentMethod: 'card', paymentDate: today });
    expect(res.status).toBe(201);
    expect(res.body.invoice.status).toBe('paid');

    const cards = await api().get('/api/payments?paymentMethod=card').set(staff.auth);
    expect(cards.body.data.every((p: { paymentMethod: string }) => p.paymentMethod === 'card')).toBe(true);
    expect(cards.body.summary.amount).toBe(1180);
  });

  it('only internal users can record payments', async () => {
    const id = await newInvoice(customer, true);
    expect((await pay(id, { amount: 10 }, customer)).status).toBe(403);
  });
});

describe('paid vs outstanding vs overdue', () => {
  it('flags confirmed, unpaid invoices past their due date as overdue', async () => {
    const id = await newInvoice(customer, true);
    await pool.query('UPDATE invoices SET invoice_date = $2, due_date = $3 WHERE id = $1', [id, addDays(today, -20), addDays(today, -5)]);

    const detail = await api().get(`/api/invoices/${id}`).set(staff.auth);
    expect(detail.body).toMatchObject({ isOverdue: true, daysOverdue: 5 });

    const overdue = await api().get('/api/invoices?status=overdue&pageSize=100').set(staff.auth);
    expect(overdue.body.data.map((i: { id: number }) => i.id)).toContain(id);
    expect(overdue.body.data.every((i: { isOverdue: boolean }) => i.isOverdue)).toBe(true);

    await pay(id, { amount: 1180 });
    const after = await api().get('/api/invoices?status=overdue&pageSize=100').set(staff.auth);
    expect(after.body.data.map((i: { id: number }) => i.id)).not.toContain(id);
  });

  it('filters outstanding and paid invoices and returns totals', async () => {
    const outstanding = await api().get('/api/invoices?status=outstanding&pageSize=100').set(staff.auth);
    expect(outstanding.body.data.every((i: { status: string; amountDue: number }) => i.status === 'confirmed' && i.amountDue > 0)).toBe(true);
    expect(outstanding.body.summary.amountDue).toBe(outstanding.body.data.reduce((s: number, i: { amountDue: number }) => s + i.amountDue, 0));

    const paid = await api().get('/api/invoices?status=paid').set(staff.auth);
    expect(paid.body.data.every((i: { status: string }) => i.status === 'paid')).toBe(true);

    const search = await api().get(`/api/invoices?q=${encodeURIComponent('Green Leaf')}`).set(staff.auth);
    expect(search.body.total).toBeGreaterThan(0);
  });
});

describe('customer access', () => {
  it('customers see only their own non-draft invoices and payments', async () => {
    const mineConfirmed = await newInvoice(customer, true);
    const mineDraft = await newInvoice(customer);
    const theirs = await newInvoice(otherCustomer, true);

    const list = await api().get('/api/invoices?pageSize=100').set(customer.auth);
    expect(list.body.data.every((i: { customerId: number; status: string }) => i.customerId === customer.customerId && i.status !== 'draft')).toBe(true);
    expect(list.body.data.map((i: { id: number }) => i.id)).toContain(mineConfirmed);

    expect((await api().get(`/api/invoices/${mineDraft}`).set(customer.auth)).status).toBe(404);
    expect((await api().get(`/api/invoices/${theirs}`).set(customer.auth)).status).toBe(404);
    expect((await api().get(`/api/invoices/${theirs}/print`).set(customer.auth)).status).toBe(404);
    expect((await api().get(`/api/invoices/${mineConfirmed}/print`).set(customer.auth)).status).toBe(200);
    expect((await api().post(`/api/invoices/${mineConfirmed}/confirm`).set(customer.auth)).status).toBe(403);

    await pay(theirs, { amount: 50 });
    const payments = await api().get('/api/payments?pageSize=100').set(customer.auth);
    expect(payments.body.data.every((p: { customerId: number }) => p.customerId === customer.customerId)).toBe(true);
  });
});
