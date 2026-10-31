import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, addInterval, todayIso } from '../src/lib/dates.js';
import { runBilling } from '../src/modules/billing/engine.js';
import { assignCustomers, api, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let productId: number;
let odooVariantId: number;
let monthlyPlanId: number;

const today = todayIso();

const subscription = (overrides: Record<string, unknown> = {}) =>
  createActiveSubscription(staff, {
    customerId: customer.customerId,
    planId: monthlyPlanId,
    startDate: today,
    paymentTermsDays: 15,
    lines: [{ productId, variantId: odooVariantId, quantity: 2 }],
    ...overrides,
  });

const invoicesFor = async (subscriptionId: number) =>
  (
    await pool.query(
      `SELECT id, status, billing_period_start AS "periodStart", billing_period_end AS "periodEnd", invoice_date AS "invoiceDate",
              due_date AS "dueDate", subtotal, tax_total AS "taxTotal", grand_total AS "grandTotal", customer_name AS "customerName"
         FROM invoices WHERE subscription_id = $1 ORDER BY billing_period_start`,
      [subscriptionId],
    )
  ).rows;

const nextBillingDate = async (id: number) =>
  (await pool.query<{ d: string | null }>('SELECT next_billing_date AS d FROM subscriptions WHERE id = $1', [id])).rows[0].d;

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer', { companyName: 'Green Leaf Store' })]);
  await assignCustomers(staff, customer.customerId!);
  const product = await api()
    .post('/api/products')
    .set(admin.auth)
    .send({ name: 'Business Software', type: 'software', salesPrice: 2000, variants: [{ attribute: 'Brand', value: 'Odoo', extraPrice: 560 }] });
  productId = product.body.id;
  odooVariantId = product.body.variants[0].id;
  monthlyPlanId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Business Monthly', billingInterval: 'monthly', price: 500 })).body.id;
  await api().post('/api/tax-rules').set(admin.auth).send({ name: 'GST', rate: 18 });
});
afterAll(closeDatabase);

describe('billing run', () => {
  it('creates one invoice per due subscription with customer details, lines, taxes and totals pre-filled', async () => {
    const id = await subscription();
    const res = await api().post('/api/billing/run').set(admin.auth).send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ runDate: today, subscriptionsChecked: 1, invoicesCreated: 1, periodsSkipped: 0, errors: [] });

    const [invoice] = await invoicesFor(id);
    // plan 500 + 2 x 2560 = 5620, GST 18% = 1011.60
    expect(invoice).toMatchObject({
      status: 'draft',
      periodStart: today,
      periodEnd: addDays(addInterval(today, 'monthly'), -1),
      invoiceDate: today,
      dueDate: addDays(today, 15),
      subtotal: 5620,
      taxTotal: 1011.6,
      grandTotal: 6631.6,
      customerName: 'Green Leaf Store',
    });
    const lines = await pool.query('SELECT description, quantity, unit_price AS "unitPrice", tax_rate AS "taxRate" FROM invoice_lines WHERE invoice_id = $1 ORDER BY sort_order', [invoice.id]);
    expect(lines.rows).toEqual([
      { description: 'Business Monthly plan (monthly)', quantity: 1, unitPrice: 500, taxRate: 18 },
      { description: 'Business Software (Brand: Odoo)', quantity: 2, unitPrice: 2560, taxRate: 18 },
    ]);
    expect(await nextBillingDate(id)).toBe(addInterval(today, 'monthly'));
  });

  it('is idempotent: running again the same day bills nothing', async () => {
    const before = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invoices')).rows[0].n;
    const res = await api().post('/api/billing/run').set(admin.auth).send({});
    expect(res.body).toMatchObject({ subscriptionsChecked: 0, invoicesCreated: 0 });
    expect((await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invoices')).rows[0].n).toBe(before);
  });

  it('catches up every missed period without gaps', async () => {
    const start = addInterval(today, 'monthly', -2);
    const id = await subscription({ startDate: start });
    const result = await runBilling(today);
    expect(result.invoicesCreated).toBe(3);

    const invoices = await invoicesFor(id);
    expect(invoices.map((i) => i.periodStart)).toEqual([start, addInterval(start, 'monthly', 1), addInterval(start, 'monthly', 2)]);
    for (let i = 1; i < invoices.length; i += 1) {
      expect(addDays(invoices[i - 1].periodEnd, 1)).toBe(invoices[i].periodStart);
    }
    expect(await nextBillingDate(id)).toBe(addInterval(start, 'monthly', 3));
  });

  it('never bills the same period twice, even if the billing date is rewound', async () => {
    const id = await subscription();
    await runBilling(today);
    const [invoice] = await invoicesFor(id);

    await pool.query('UPDATE subscriptions SET next_billing_date = $2 WHERE id = $1', [id, today]);
    const rerun = await runBilling(today);
    expect(rerun).toMatchObject({ invoicesCreated: 0, periodsSkipped: 1 });
    expect(await invoicesFor(id)).toHaveLength(1);
    expect(await nextBillingDate(id)).toBe(addInterval(today, 'monthly'));

    await expect(
      pool.query(
        `INSERT INTO invoices (subscription_id, customer_id, billing_period_start, billing_period_end, invoice_date, due_date, customer_name)
         VALUES ($1, $2, $3, $4, $3, $3, 'dup')`,
        [id, customer.customerId, invoice.periodStart, invoice.periodEnd],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('does not bill paused, cancelled, closed or not-yet-active subscriptions', async () => {
    const paused = await subscription();
    await api().post(`/api/subscriptions/${paused}/pause`).set(staff.auth).send({});
    const closed = await subscription();
    await api().post(`/api/subscriptions/${closed}/close`).set(staff.auth).send({});
    const quote = await api()
      .post('/api/subscriptions')
      .set(staff.auth)
      .send({ customerId: customer.customerId, planId: monthlyPlanId, startDate: today, status: 'quotation', lines: [{ productId, quantity: 1 }] });

    await runBilling(today);
    expect(await invoicesFor(paused)).toHaveLength(0);
    expect(await invoicesFor(closed)).toHaveLength(0);
    expect(await invoicesFor(quote.body.id)).toHaveLength(0);
  });

  it('stops at the expiry date: the last period is cut short and billing ends', async () => {
    const start = addInterval(today, 'monthly', -1);
    const expiry = addDays(today, 10);
    const id = await subscription({ startDate: start, expiryDate: expiry });
    await runBilling(today);
    const invoices = await invoicesFor(id);
    expect(invoices).toHaveLength(2);
    expect(invoices[1].periodEnd).toBe(addDays(addInterval(today, 'monthly'), -1) < expiry ? addDays(addInterval(today, 'monthly'), -1) : expiry);
    expect(await nextBillingDate(id)).toBeNull();
  });

  it('can confirm invoices automatically and records every run', async () => {
    const id = await subscription();
    const res = await api().post('/api/billing/run').set(admin.auth).send({ autoConfirm: true });
    expect(res.body.invoicesCreated).toBe(1);
    expect((await invoicesFor(id))[0].status).toBe('confirmed');

    const runs = await api().get('/api/billing/runs').set(admin.auth);
    expect(runs.body.total).toBeGreaterThanOrEqual(3);
    expect(runs.body.data[0]).toMatchObject({ status: 'completed', invoicesCreated: 1 });
  });

  it('rejects billing for a future date and blocks customers', async () => {
    expect((await api().post('/api/billing/run').set(admin.auth).send({ runDate: addDays(today, 1) })).status).toBe(400);
    expect((await api().post('/api/billing/run').set(customer.auth).send({})).status).toBe(403);
  });
});

describe('generate invoice for one subscription', () => {
  it('bills a single due subscription and refuses when nothing is due', async () => {
    const id = await subscription();
    const res = await api().post(`/api/billing/subscriptions/${id}/generate`).set(staff.auth).send({});
    expect(res.status).toBe(201);
    expect(res.body.invoiceIds).toHaveLength(1);

    const again = await api().post(`/api/billing/subscriptions/${id}/generate`).set(staff.auth).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/next billing date/);
  });

  it('refuses inactive subscriptions', async () => {
    const quote = await api()
      .post('/api/subscriptions')
      .set(staff.auth)
      .send({ customerId: customer.customerId, planId: monthlyPlanId, startDate: today, lines: [{ productId, quantity: 1 }] });
    const res = await api().post(`/api/billing/subscriptions/${quote.body.id}/generate`).set(staff.auth).send({});
    expect(res.status).toBe(409);
  });
});

describe('automatic confirmation', () => {
  it('settles zero-total invoices when billing auto-confirms them', async () => {
    const id = await subscription();
    await pool.query('UPDATE subscription_lines SET unit_price = 0 WHERE subscription_id = $1', [id]);
    await runBilling(today, { autoConfirm: true });
    const [invoice] = await invoicesFor(id);
    expect(invoice).toMatchObject({ status: 'paid', grandTotal: 0 });
    const timestamps = await pool.query('SELECT confirmed_at, paid_at FROM invoices WHERE id = $1', [invoice.id]);
    expect(timestamps.rows[0].confirmed_at).toBeTruthy();
    expect(timestamps.rows[0].paid_at).toBeTruthy();
  });
});
