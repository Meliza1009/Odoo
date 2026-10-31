import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { api, closeDatabase, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customerA: TestUser;
let customerB: TestUser;
let activePlanId: number;
let activeProductId: number;
let nextSubscriptionId: number;
let issuedInvoiceId: number;
let paidDiscountInvoiceId: number;
const today = todayIso();

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customerA, customerB] = await Promise.all([
    createUser('admin'), createUser('staff'), createUser('customer'), createUser('customer'),
  ]);
  const plan = await pool.query<{ id: number }>(
    `INSERT INTO plans (name, billing_interval, price, description) VALUES ('Available monthly', 'monthly', 100, 'Current plan') RETURNING id`,
  );
  activePlanId = plan.rows[0].id;
  await pool.query(`INSERT INTO plans (name, billing_interval, price, start_date, end_date, is_active) VALUES
    ('Future plan', 'monthly', 100, $1, NULL, TRUE),
    ('Expired plan', 'monthly', 100, NULL, $2, TRUE),
    ('Inactive plan', 'monthly', 100, NULL, NULL, FALSE)`, [addDays(today, 1), addDays(today, -1)]);
  activeProductId = (await pool.query<{ id: number }>(
    `INSERT INTO products (name, type, sales_price, cost_price, notes) VALUES ('Available product', 'software', 200, 73, 'Internal supplier note') RETURNING id`,
  )).rows[0].id;
  const inactiveProductId = (await pool.query<{ id: number }>(
    `INSERT INTO products (name, type, sales_price, is_active) VALUES ('Hidden product', 'service', 100, FALSE) RETURNING id`,
  )).rows[0].id;
  await pool.query(`INSERT INTO product_variants (product_id, attribute, value, extra_price, is_active) VALUES
    ($1, 'Brand', 'Visible', 25, TRUE), ($1, 'Brand', 'Hidden', 50, FALSE), ($2, 'Brand', 'Hidden parent', 10, TRUE)`, [activeProductId, inactiveProductId]);

  // More than one list page proves dashboard aggregates do not depend on its recent rows.
  const subscriptions = await pool.query<{ id: number }>(
    `INSERT INTO subscriptions (customer_id, plan_id, status, start_date, next_billing_date, total)
     SELECT $1, $2, 'active', $3::date, $3::date + n - 1, 100 FROM generate_series(1, 105) n RETURNING id`,
    [customerA.customerId, activePlanId, today],
  );
  nextSubscriptionId = subscriptions.rows[0].id;
  const quote = (await pool.query<{ id: number }>(
    `INSERT INTO subscriptions (customer_id, plan_id, status, start_date, total) VALUES ($1, $2, 'quotation', $3, 100) RETURNING id`,
    [customerA.customerId, activePlanId, today],
  )).rows[0].id;
  await pool.query(`INSERT INTO subscriptions (customer_id, plan_id, status, start_date) VALUES ($1, $2, 'draft', $3)`, [customerA.customerId, activePlanId, today]);
  const foreignSubscriptionId = (await pool.query<{ id: number }>(
    `INSERT INTO subscriptions (customer_id, plan_id, status, start_date) VALUES ($1, $2, 'active', $3) RETURNING id`,
    [customerB.customerId, activePlanId, today],
  )).rows[0].id;
  const paid = await pool.query<{ id: number }>(
    `INSERT INTO invoices (subscription_id, customer_id, status, billing_period_start, billing_period_end, invoice_date, due_date, customer_name, grand_total, amount_paid)
     SELECT id, customer_id, 'paid', $2::date, $2::date, $2::date, $2::date, 'Own account', 100, 100
     FROM subscriptions WHERE customer_id = $1 AND status = 'active' RETURNING id`, [customerA.customerId, today],
  );
  paidDiscountInvoiceId = paid.rows[0].id;
  const invoice = async (status: string, subscriptionId: number, customerId: number | null, period: string) => (
    await pool.query<{ id: number }>(
      `INSERT INTO invoices (subscription_id, customer_id, status, billing_period_start, billing_period_end, invoice_date, due_date, customer_name, grand_total)
       VALUES ($1, $2, $3, $4, $4, $5, $6, 'Account invoice', 100) RETURNING id`,
      [subscriptionId, customerId, status, period, addDays(today, -10), addDays(today, -1)],
    )
  ).rows[0].id;
  issuedInvoiceId = await invoice('confirmed', quote, customerA.customerId, today);
  const draft = await invoice('draft', quote, customerA.customerId, addDays(today, 1));
  const cancelled = await invoice('cancelled', quote, customerA.customerId, addDays(today, 2));
  const foreign = await invoice('confirmed', foreignSubscriptionId, customerB.customerId, today);
  const discountId = (await pool.query<{ id: number }>(
    `INSERT INTO discounts (name, discount_type, value) VALUES ('Current renamed offer', 'fixed_amount', 10) RETURNING id`,
  )).rows[0].id;
  await pool.query(`INSERT INTO invoice_discounts (invoice_id, discount_id, name, amount) VALUES
    ($1, $6, 'Original issued offer', 10), ($2, $6, 'Original paid offer', 20),
    ($3, $6, 'Draft savings', 30), ($4, $6, 'Cancelled savings', 40), ($5, $6, 'Other customer savings', 50)`,
  [issuedInvoiceId, paidDiscountInvoiceId, draft, cancelled, foreign, discountId]);
});
afterAll(closeDatabase);

describe('customer portal', () => {
  it('requires a customer login for catalog, summary and discounts', async () => {
    for (const route of ['catalog', 'summary', 'discounts']) {
      expect((await api().get(`/api/portal/${route}`)).status).toBe(401);
      expect((await api().get(`/api/portal/${route}`).set(admin.auth)).status).toBe(403);
      expect((await api().get(`/api/portal/${route}`).set(staff.auth)).status).toBe(403);
    }
  });

  it('offers only available plans, active products and active variants without internal catalog data', async () => {
    const res = await api().get('/api/portal/catalog').set(customerA.auth);
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0]).toMatchObject({ id: activePlanId, name: 'Available monthly', price: 100 });
    expect(res.body.products).toEqual([{
      id: activeProductId, name: 'Available product', type: 'software', salesPrice: 200,
      variants: [{ id: expect.any(Number), attribute: 'Brand', value: 'Visible', extraPrice: 25, finalPrice: 225 }],
    }]);
    expect(JSON.stringify(res.body)).not.toContain('Internal supplier note');
    expect(res.body.products[0]).not.toHaveProperty('costPrice');
    expect(res.body.products[0]).not.toHaveProperty('notes');
  });

  it('aggregates the entire account and isolates other customers regardless of page limits', async () => {
    const res = await api().get('/api/portal/summary').set(customerA.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeSubscriptions: 105, openQuotations: 1, nextBillingDate: today, nextBillingSubscriptionId: nextSubscriptionId,
      outstandingCount: 1, outstandingBalance: 100, overdueCount: 1, overdueBalance: 100, paidInvoices: 105,
    });
    const other = await api().get('/api/portal/summary').set(customerB.auth);
    expect(other.body).toMatchObject({ activeSubscriptions: 1, paidInvoices: 0, openQuotations: 0, nextBillingDate: null });
    expect(other.body.nextBillingSubscriptionId).toBeNull();
  });

  it('shows historical discounts only on this customer issued invoices with full paginated totals', async () => {
    const res = await api().get('/api/portal/discounts?pageSize=1').set(customerA.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, totalPages: 2, page: 1, pageSize: 1, summary: { totalSavings: 30, invoiceCount: 2 } });
    expect(res.body.data).toHaveLength(1);
    const all = await api().get('/api/portal/discounts').set(customerA.auth);
    expect(all.body.data.map((d: { invoiceId: number }) => d.invoiceId).sort()).toEqual([issuedInvoiceId, paidDiscountInvoiceId].sort());
    expect(all.body.data.map((d: { name: string }) => d.name).sort()).toEqual(['Original issued offer', 'Original paid offer']);
    const other = await api().get('/api/portal/discounts').set(customerB.auth);
    expect(other.body).toMatchObject({ total: 1, summary: { totalSavings: 50, invoiceCount: 1 } });
    expect(other.body.data[0].name).toBe('Other customer savings');
  });

  it('searches issued savings and validates pagination', async () => {
    const res = await api().get('/api/portal/discounts?q=paid%20offer').set(customerA.auth);
    expect(res.body).toMatchObject({ total: 1, summary: { totalSavings: 20, invoiceCount: 1 } });
    expect(res.body.data[0].invoiceId).toBe(paidDiscountInvoiceId);
    expect((await api().get('/api/portal/discounts?pageSize=101').set(customerA.auth)).status).toBe(400);
  });
});
