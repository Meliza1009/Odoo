import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, addInterval, todayIso } from '../src/lib/dates.js';
import { runBilling } from '../src/modules/billing/engine.js';
import { api, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let softwareId: number;
let supportId: number;
let planId: number;

const today = todayIso();

const subscription = (overrides: Record<string, unknown> = {}) =>
  createActiveSubscription(staff, {
    customerId: customer.customerId,
    planId,
    startDate: today,
    lines: [
      { productId: softwareId, quantity: 10 },
      { productId: supportId, quantity: 1 },
    ],
    ...overrides,
  });

const invoicesFor = async (subscriptionId: number) =>
  (
    await pool.query(
      `SELECT i.id, i.billing_period_start AS "periodStart", i.subtotal, i.discount_total AS "discountTotal", i.tax_total AS "taxTotal",
              i.grand_total AS "grandTotal",
              COALESCE((SELECT json_agg(json_build_object('name', d.name, 'amount', d.amount)) FROM invoice_discounts d WHERE d.invoice_id = i.id), '[]') AS discounts
         FROM invoices i WHERE i.subscription_id = $1 ORDER BY i.billing_period_start`,
      [subscriptionId],
    )
  ).rows;

const createDiscount = async (body: Record<string, unknown>) => {
  const res = await api().post('/api/discounts').set(admin.auth).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
};

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer')]);
  softwareId = (await api().post('/api/products').set(admin.auth).send({ name: 'Business Software', type: 'software', salesPrice: 2000 })).body.id;
  supportId = (await api().post('/api/products').set(admin.auth).send({ name: 'Support Package', type: 'service', salesPrice: 1500 })).body.id;
  planId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Seats Monthly', billingInterval: 'monthly', price: 0 })).body.id;
});
afterAll(closeDatabase);

describe('tax rules', () => {
  afterEach(async () => {
    await pool.query('UPDATE tax_rules SET is_active = FALSE');
    await pool.query('UPDATE customers SET region = NULL');
  });

  it('only admins can manage tax rules; staff can read them', async () => {
    const res = await api().post('/api/tax-rules').set(admin.auth).send({ name: 'GST', rate: 18 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'GST', rate: 18, appliesTo: 'all', isActive: true });
    expect((await api().get('/api/tax-rules').set(staff.auth)).body.data).toHaveLength(1);
    expect((await api().post('/api/tax-rules').set(staff.auth).send({ name: 'X', rate: 5 })).status).toBe(403);
    expect((await api().get('/api/tax-rules').set(customer.auth)).status).toBe(403);
  });

  it('validates rates and rule targets', async () => {
    expect((await api().post('/api/tax-rules').set(admin.auth).send({ name: 'Bad', rate: 150 })).status).toBe(400);
    expect((await api().post('/api/tax-rules').set(admin.auth).send({ name: 'Bad', rate: -1 })).status).toBe(400);
    expect((await api().post('/api/tax-rules').set(admin.auth).send({ name: 'Bad', rate: 5, appliesTo: 'product_type' })).status).toBe(400);
    expect((await api().post('/api/tax-rules').set(admin.auth).send({ name: 'Bad', rate: 5, appliesTo: 'product', productId: 99999 })).status).toBe(400);
  });

  it('applies the most specific rule automatically when billing', async () => {
    await api().post('/api/tax-rules').set(admin.auth).send({ name: 'GST', rate: 18 });
    await api().post('/api/tax-rules').set(admin.auth).send({ name: 'Services GST', rate: 5, appliesTo: 'product_type', productType: 'service' });
    const id = await subscription();
    await runBilling(today);
    const [invoice] = await invoicesFor(id);
    // software 20000 x 18% = 3600, support 1500 x 5% = 75
    expect(invoice).toMatchObject({ subtotal: 21500, taxTotal: 3675, grandTotal: 25175 });
  });

  it('applies regional rules only to customers in that region', async () => {
    await api().post('/api/tax-rules').set(admin.auth).send({ name: 'IGST', rate: 18 });
    await api().post('/api/tax-rules').set(admin.auth).send({ name: 'CGST', rate: 6, region: 'KA' });
    await api().post('/api/tax-rules').set(admin.auth).send({ name: 'SGST', rate: 6, region: 'KA' });
    await pool.query('UPDATE customers SET region = $2 WHERE id = $1', [customer.customerId, 'KA']);
    const id = await subscription({ lines: [{ productId: softwareId, quantity: 1 }] });
    await runBilling(today);
    expect((await invoicesFor(id))[0].taxTotal).toBe(240);
  });

  it('falls back to the tax rate on the subscription line when no rule exists', async () => {
    const id = await subscription({ lines: [{ productId: softwareId, quantity: 1, taxRate: 12 }] });
    await runBilling(today);
    expect((await invoicesFor(id))[0].taxTotal).toBe(240);
  });
});

describe('discount rules', () => {
  afterEach(async () => {
    await pool.query('UPDATE discounts SET is_active = FALSE');
  });

  it('only admins can create discounts; staff can view them', async () => {
    const created = await createDiscount({ name: 'Ten off', discountType: 'percentage', value: 10 });
    expect(created).toMatchObject({ name: 'Ten off', discountType: 'percentage', value: 10, usageCount: 0, state: 'active', scope: 'subscription' });
    expect((await api().post('/api/discounts').set(staff.auth).send({ name: 'X', discountType: 'percentage', value: 5 })).status).toBe(403);
    expect((await api().put(`/api/discounts/${created.id}`).set(staff.auth).send({ name: 'X', discountType: 'percentage', value: 5 })).status).toBe(403);
    expect((await api().get('/api/discounts').set(staff.auth)).status).toBe(200);
    expect((await api().get('/api/discounts').set(customer.auth)).status).toBe(403);
  });

  it('validates discount values, dates, limits and scope', async () => {
    const post = (body: Record<string, unknown>) => api().post('/api/discounts').set(admin.auth).send({ name: 'Bad', discountType: 'percentage', value: 10, ...body });
    expect((await post({ value: 150 })).status).toBe(400);
    expect((await post({ value: 0 })).status).toBe(400);
    expect((await post({ discountType: 'bogo' })).status).toBe(400);
    expect((await post({ startDate: '2026-05-01', endDate: '2026-04-01' })).status).toBe(400);
    expect((await post({ usageLimit: 0 })).status).toBe(400);
    expect((await post({ scope: 'product', productIds: [] })).status).toBe(400);
    expect((await post({ scope: 'product', productIds: [99999] })).status).toBe(400);
  });

  it('applies automatically to the next invoice and counts the use', async () => {
    const discount = await createDiscount({ name: 'Ten off', discountType: 'percentage', value: 10 });
    const id = await subscription();
    await runBilling(today);
    const [invoice] = await invoicesFor(id);
    expect(invoice).toMatchObject({ subtotal: 21500, discountTotal: 2150, grandTotal: 19350, discounts: [{ name: 'Ten off', amount: 2150 }] });
    expect((await api().get(`/api/discounts/${discount.id}`).set(admin.auth)).body.usageCount).toBe(1);
  });

  it('stops once the usage limit is reached', async () => {
    const discount = await createDiscount({ name: 'First invoice only', discountType: 'fixed_amount', value: 1000, usageLimit: 1 });
    const id = await subscription({ startDate: addInterval(today, 'monthly', -2) });
    await runBilling(today);
    const invoices = await invoicesFor(id);
    expect(invoices.map((i) => i.discountTotal)).toEqual([1000, 0, 0]);
    expect((await api().get(`/api/discounts/${discount.id}`).set(admin.auth)).body).toMatchObject({ usageCount: 1, state: 'exhausted' });
  });

  it('stops when it expires and does not apply before it starts', async () => {
    const start = addInterval(today, 'monthly', -2);
    await createDiscount({ name: 'Launch promo', discountType: 'percentage', value: 20, endDate: addDays(addInterval(start, 'monthly', 1), -1) });
    await createDiscount({ name: 'Future promo', discountType: 'percentage', value: 50, startDate: addDays(today, 5) });
    const id = await subscription({ startDate: start });
    await runBilling(today);
    const invoices = await invoicesFor(id);
    expect(invoices.map((i) => i.discountTotal)).toEqual([4300, 0, 0]);
  });

  it('applies product discounts only to those products and only above the quantity threshold', async () => {
    await createDiscount({ name: 'Seat volume', discountType: 'percentage', value: 10, scope: 'product', productIds: [softwareId], minQuantity: 10 });
    const big = await subscription();
    const small = await subscription({ lines: [{ productId: softwareId, quantity: 9 }] });
    await runBilling(today);
    expect((await invoicesFor(big))[0]).toMatchObject({ discountTotal: 2000, grandTotal: 19500 });
    expect((await invoicesFor(small))[0].discountTotal).toBe(0);
  });

  it('respects the minimum purchase amount', async () => {
    await createDiscount({ name: 'Big spender', discountType: 'fixed_amount', value: 500, minPurchase: 5000 });
    const big = await subscription();
    const small = await subscription({ lines: [{ productId: supportId, quantity: 1 }] });
    await runBilling(today);
    expect((await invoicesFor(big))[0].discountTotal).toBe(500);
    expect((await invoicesFor(small))[0].discountTotal).toBe(0);
  });

  it('can be limited to specific subscriptions', async () => {
    const vip = await subscription();
    const regular = await subscription();
    await createDiscount({ name: 'VIP', discountType: 'fixed_amount', value: 300, subscriptionIds: [vip] });
    await runBilling(today);
    expect((await invoicesFor(vip))[0].discountTotal).toBe(300);
    expect((await invoicesFor(regular))[0].discountTotal).toBe(0);
  });

  it('gives the use back when the invoice is cancelled', async () => {
    const discount = await createDiscount({ name: 'Once', discountType: 'percentage', value: 5, usageLimit: 1 });
    const id = await subscription();
    await runBilling(today);
    const [invoice] = await invoicesFor(id);
    expect((await api().get(`/api/discounts/${discount.id}`).set(admin.auth)).body.usageCount).toBe(1);
    expect((await api().post(`/api/invoices/${invoice.id}/cancel`).set(staff.auth).send({})).status).toBe(200);
    expect((await api().get(`/api/discounts/${discount.id}`).set(admin.auth)).body).toMatchObject({ usageCount: 0, state: 'active' });
  });

  it('refuses to lower the usage limit below what was already used', async () => {
    const discount = await createDiscount({ name: 'Twice', discountType: 'percentage', value: 5, usageLimit: 5 });
    await pool.query('UPDATE discounts SET usage_count = 3 WHERE id = $1', [discount.id]);
    const res = await api().put(`/api/discounts/${discount.id}`).set(admin.auth).send({ name: 'Twice', discountType: 'percentage', value: 5, usageLimit: 2 });
    expect(res.status).toBe(400);
  });
});
