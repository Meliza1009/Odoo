import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, addInterval, todayIso } from '../src/lib/dates.js';
import { assignCustomers, api, closeDatabase, createCustomer, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customerUser: TestUser;
let otherCustomerUser: TestUser;
let customerId: number;
let productId: number;
let odooVariantId: number;
let flexiblePlanId: number;
let strictPlanId: number;
let seatPlanId: number;
let templateId: number;

const today = todayIso();

async function createPlan(body: Record<string, unknown>) {
  const res = await api().post('/api/plans').set(admin.auth).send(body);
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function newSubscription(overrides: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/subscriptions')
    .set(staff.auth)
    .send({
      customerId,
      planId: flexiblePlanId,
      startDate: today,
      expiryDate: addDays(today, 90),
      paymentTermsDays: 15,
      lines: [{ productId, variantId: odooVariantId, quantity: 2, taxRate: 18 }],
      ...overrides,
    });
  return res;
}

/** Walks a subscription from draft to active. */
async function activeSubscription(overrides: Record<string, unknown> = {}) {
  const created = await newSubscription(overrides);
  expect(created.status).toBe(201);
  const id = created.body.id as number;
  for (const status of ['quotation', 'confirmed', 'active']) {
    const res = await api().put(`/api/subscriptions/${id}/status`).set(staff.auth).send({ status });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
  return id;
}

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customerUser, otherCustomerUser] = await Promise.all([
    createUser('admin'),
    createUser('staff'),
    createUser('customer', { companyName: 'Green Leaf Store' }),
    createUser('customer', { companyName: 'Northwind Traders' }),
  ]);
  await assignCustomers(staff, customerUser.customerId!, otherCustomerUser.customerId!);
  customerId = customerUser.customerId!;

  const product = await api()
    .post('/api/products')
    .set(admin.auth)
    .send({ name: 'Business Software', type: 'software', salesPrice: 2000, variants: [{ attribute: 'Brand', value: 'Odoo', extraPrice: 560 }] });
  productId = product.body.id;
  odooVariantId = product.body.variants[0].id;

  flexiblePlanId = await createPlan({ name: 'Business Monthly', billingInterval: 'monthly', price: 500 });
  strictPlanId = await createPlan({
    name: 'Enterprise Yearly',
    billingInterval: 'yearly',
    price: 0,
    autoCloseOnExpiry: true,
    canCloseEarly: false,
    canPause: false,
    canRenew: false,
  });
  seatPlanId = await createPlan({ name: 'Team Seats', billingInterval: 'monthly', price: 0, minQuantity: 5 });

  const template = await api()
    .post('/api/quotation-templates')
    .set(admin.auth)
    .send({
      name: 'Annual bundle',
      planId: strictPlanId,
      validityDays: 10,
      paymentTermsDays: 45,
      contractPeriods: 1,
      lines: [{ productId, variantId: odooVariantId, quantity: 3 }],
    });
  templateId = template.body.id;
});
afterAll(closeDatabase);

describe('creating subscriptions', () => {
  it('numbers subscriptions uniquely and prices lines from product + variant with taxes', async () => {
    const res = await newSubscription();
    expect(res.status).toBe(201);
    expect(res.body.subscriptionNumber).toMatch(/^SUB-\d{5}$/);
    expect(res.body).toMatchObject({ status: 'draft', customerId, planId: flexiblePlanId, paymentTermsDays: 15, customerName: 'Green Leaf Store' });

    const [planLine, productLine] = res.body.lines;
    expect(planLine).toMatchObject({ lineType: 'plan', quantity: 1, unitPrice: 500, total: 500 });
    expect(productLine).toMatchObject({
      lineType: 'product',
      description: 'Business Software (Brand: Odoo)',
      quantity: 2,
      unitPrice: 2560,
      taxRate: 18,
      subtotal: 5120,
      taxAmount: 921.6,
      total: 6041.6,
    });
    expect(res.body).toMatchObject({ subtotal: 5620, taxTotal: 921.6, total: 6541.6 });

    const second = await newSubscription();
    expect(second.body.subscriptionNumber).not.toBe(res.body.subscriptionNumber);
  });

  it('allows a manual unit price override', async () => {
    const res = await newSubscription({ lines: [{ productId, quantity: 1, unitPrice: 1800 }] });
    expect(res.body.lines[1]).toMatchObject({ unitPrice: 1800, total: 1800 });
  });

  it('enforces the plan minimum quantity', async () => {
    const tooFew = await newSubscription({ planId: seatPlanId, lines: [{ productId, quantity: 3 }] });
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.error).toMatch(/minimum quantity of 5/);
    const enough = await newSubscription({ planId: seatPlanId, lines: [{ productId, quantity: 5 }] });
    expect(enough.status).toBe(201);
  });

  it('validates dates, quantities, customers and plan availability', async () => {
    expect((await newSubscription({ expiryDate: addDays(today, -1) })).status).toBe(400);
    expect((await newSubscription({ lines: [{ productId, quantity: 0 }] })).status).toBe(400);
    expect((await newSubscription({ lines: [{ productId, quantity: 1, taxRate: 150 }] })).status).toBe(400);
    expect((await newSubscription({ customerId: 99999 })).status).toBe(404);

    const limited = await createPlan({ name: 'Old Promo', billingInterval: 'monthly', price: 1, startDate: '2020-01-01', endDate: '2020-12-31' });
    const res = await newSubscription({ planId: limited });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only available/);
  });

  it('cannot send an empty quotation', async () => {
    const res = await newSubscription({ planId: seatPlanId, lines: [], status: 'quotation' });
    expect(res.status).toBe(400);
  });

  it('is restricted to internal users', async () => {
    const res = await api().post('/api/subscriptions').set(customerUser.auth).send({ customerId, planId: flexiblePlanId, startDate: today });
    expect(res.status).toBe(403);
  });
});

describe('quotation from template', () => {
  it('copies plan, lines, payment terms, validity and contract length', async () => {
    const res = await api().post('/api/subscriptions/from-template').set(staff.auth).send({ templateId, customerId, startDate: today });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'quotation',
      planId: strictPlanId,
      templateId,
      paymentTermsDays: 45,
      quotationValidUntil: addDays(today, 10),
      expiryDate: addDays(addInterval(today, 'yearly', 1), -1),
    });
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0]).toMatchObject({ quantity: 3, unitPrice: 2560, total: 7680 });
  });
});

describe('lifecycle state machine', () => {
  it('moves Draft -> Quotation -> Confirmed -> Active -> Closed and records history', async () => {
    const created = await newSubscription();
    const id = created.body.id;

    const quotation = await api().put(`/api/subscriptions/${id}/status`).set(staff.auth).send({ status: 'quotation' });
    expect(quotation.body.status).toBe('quotation');
    expect(quotation.body.quotationValidUntil).toBe(addDays(today, 30));

    const confirmed = await api().put(`/api/subscriptions/${id}/status`).set(staff.auth).send({ status: 'confirmed' });
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.confirmedAt).toBeTruthy();

    const active = await api().put(`/api/subscriptions/${id}/status`).set(staff.auth).send({ status: 'active' });
    expect(active.body).toMatchObject({ status: 'active', nextBillingDate: today });
    expect(active.body.allowedTransitions).toEqual(['paused', 'closed']);

    const closed = await api().post(`/api/subscriptions/${id}/close`).set(staff.auth).send({ reason: 'Customer churned' });
    expect(closed.body).toMatchObject({ status: 'closed', closeReason: 'Customer churned', nextBillingDate: null });

    const actions = closed.body.history.map((h: { action: string }) => h.action);
    expect(actions).toEqual(
      expect.arrayContaining(['subscription.created', 'subscription.quotation', 'subscription.confirmed', 'subscription.active', 'subscription.closed']),
    );
  });

  it('rejects invalid transitions', async () => {
    const created = await newSubscription();
    const skip = await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'active' });
    expect(skip.status).toBe(409);
    expect(skip.body.error).toMatch(/Cannot change a draft subscription to active/);

    const unknown = await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'archived' });
    expect(unknown.status).toBe(400);
  });

  it('only allows editing draft and quotation subscriptions', async () => {
    const draft = await newSubscription();
    const edit = await api()
      .put(`/api/subscriptions/${draft.body.id}`)
      .set(staff.auth)
      .send({ customerId, planId: flexiblePlanId, startDate: today, lines: [{ productId, quantity: 4 }] });
    expect(edit.status).toBe(200);
    expect(edit.body.lines[1]).toMatchObject({ quantity: 4, unitPrice: 2000 });
    expect(edit.body.total).toBe(8500);

    const activeId = await activeSubscription();
    const locked = await api().put(`/api/subscriptions/${activeId}`).set(staff.auth).send({ customerId, planId: flexiblePlanId, startDate: today, lines: [] });
    expect(locked.status).toBe(409);
  });

  it('refuses to confirm an expired quotation until it is resent', async () => {
    const created = await newSubscription({ status: 'quotation' });
    await pool.query('UPDATE subscriptions SET quotation_valid_until = $2 WHERE id = $1', [created.body.id, addDays(today, -1)]);
    const confirm = await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'confirmed' });
    expect(confirm.status).toBe(409);
    expect(confirm.body.error).toMatch(/expired/);

    await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'draft' });
    const resent = await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'quotation' });
    expect(resent.body.quotationValidUntil).toBe(addDays(today, 30));
    expect((await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'confirmed' })).status).toBe(200);
  });

  it('cancels quotations', async () => {
    const created = await newSubscription({ status: 'quotation' });
    const res = await api().post(`/api/subscriptions/${created.body.id}/cancel`).set(staff.auth).send({});
    expect(res.body).toMatchObject({ status: 'cancelled', closeReason: 'cancelled' });
    expect((await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status: 'quotation' })).status).toBe(409);
  });
});

describe('pause, resume, renew and close early', () => {
  it('pauses and resumes; billing restarts from today', async () => {
    const id = await activeSubscription({ startDate: addDays(today, -40), expiryDate: addDays(today, 200) });
    const paused = await api().post(`/api/subscriptions/${id}/pause`).set(staff.auth).send({});
    expect(paused.body.status).toBe('paused');
    expect(paused.body.pausedAt).toBeTruthy();

    const resumed = await api().post(`/api/subscriptions/${id}/resume`).set(staff.auth).send({});
    expect(resumed.body).toMatchObject({ status: 'active', pausedAt: null, nextBillingDate: today });
    expect(resumed.body.history[0].action).toBe('subscription.resumed');
  });

  it('respects plans that forbid pausing, closing early or renewing', async () => {
    const id = await activeSubscription({ planId: strictPlanId, expiryDate: addDays(today, 365) });
    const pause = await api().post(`/api/subscriptions/${id}/pause`).set(staff.auth).send({});
    expect(pause.status).toBe(409);
    expect(pause.body.error).toMatch(/does not allow pausing/);

    const close = await api().post(`/api/subscriptions/${id}/close`).set(staff.auth).send({});
    expect(close.status).toBe(409);
    expect(close.body.error).toMatch(/before the expiry date/);

    const renew = await api().post(`/api/subscriptions/${id}/renew`).set(staff.auth).send({});
    expect(renew.status).toBe(409);
  });

  it('closes early when the plan allows it', async () => {
    const id = await activeSubscription();
    const res = await api().post(`/api/subscriptions/${id}/close`).set(staff.auth).send({});
    expect(res.body).toMatchObject({ status: 'closed', closeReason: 'closed_early' });
  });

  it('renews by extending the expiry date by N billing periods', async () => {
    const expiry = addDays(today, 30);
    const id = await activeSubscription({ expiryDate: expiry });
    const res = await api().post(`/api/subscriptions/${id}/renew`).set(staff.auth).send({ periods: 3 });
    expect(res.status).toBe(200);
    expect(res.body.expiryDate).toBe(addInterval(expiry, 'monthly', 3));

    const openEnded = await activeSubscription({ expiryDate: null });
    expect((await api().post(`/api/subscriptions/${openEnded}/renew`).set(staff.auth).send({})).status).toBe(400);
  });

  it('auto-closes expired subscriptions on auto-close plans, and renewal re-opens them', async () => {
    const autoPlan = await createPlan({ name: 'Auto Monthly', billingInterval: 'monthly', price: 100, autoCloseOnExpiry: true });
    const manualId = await activeSubscription({ startDate: addDays(today, -60), expiryDate: addDays(today, 10) });
    const autoId = await activeSubscription({ planId: autoPlan, startDate: addDays(today, -60), expiryDate: addDays(today, 10) });
    await pool.query('UPDATE subscriptions SET expiry_date = $2 WHERE id = ANY($1::int[])', [[manualId, autoId], addDays(today, -1)]);

    const run = await api().post('/api/subscriptions/close-expired').set(admin.auth);
    expect(run.status).toBe(200);
    expect(run.body.subscriptions.map((s: { id: number }) => s.id)).toEqual([autoId]);

    const auto = await api().get(`/api/subscriptions/${autoId}`).set(staff.auth);
    expect(auto.body).toMatchObject({ status: 'closed', closeReason: 'expired', nextBillingDate: null });
    expect((await api().get(`/api/subscriptions/${manualId}`).set(staff.auth)).body.status).toBe('active');

    const renewed = await api().post(`/api/subscriptions/${autoId}/renew`).set(staff.auth).send({ periods: 1 });
    expect(renewed.body).toMatchObject({ status: 'active', closeReason: null, nextBillingDate: today, expiryDate: addInterval(addDays(today, -1), 'monthly', 1) });
  });
});

describe('listing and customer access', () => {
  it('filters by status, plan and search text', async () => {
    const active = await api().get('/api/subscriptions?status=active&pageSize=100').set(staff.auth);
    expect(active.body.data.length).toBeGreaterThan(0);
    expect(active.body.data.every((s: { status: string }) => s.status === 'active')).toBe(true);

    const quotes = await api().get('/api/subscriptions?status=draft,quotation&pageSize=100').set(staff.auth);
    expect(quotes.body.data.every((s: { status: string }) => ['draft', 'quotation'].includes(s.status))).toBe(true);

    const byPlan = await api().get(`/api/subscriptions?planId=${strictPlanId}`).set(staff.auth);
    expect(byPlan.body.data.every((s: { planId: number }) => s.planId === strictPlanId)).toBe(true);

    const first = active.body.data[0];
    const search = await api().get(`/api/subscriptions?q=${first.subscriptionNumber}`).set(staff.auth);
    expect(search.body.data).toHaveLength(1);
  });

  it('shows customers only their own non-draft subscriptions, without internal history', async () => {
    const otherCustomerSub = await newSubscription({ customerId: otherCustomerUser.customerId, status: 'quotation' });
    const draft = await newSubscription();

    const mine = await api().get('/api/subscriptions?pageSize=100').set(customerUser.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(mine.body.data.every((s: { customerId: number; status: string }) => s.customerId === customerId && s.status !== 'draft')).toBe(true);

    expect((await api().get(`/api/subscriptions/${otherCustomerSub.body.id}`).set(customerUser.auth)).status).toBe(404);
    expect((await api().get(`/api/subscriptions/${draft.body.id}`).set(customerUser.auth)).status).toBe(404);

    const own = mine.body.data[0];
    const detail = await api().get(`/api/subscriptions/${own.id}`).set(customerUser.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.history).toEqual([]);

    expect((await api().post(`/api/subscriptions/${own.id}/cancel`).set(customerUser.auth)).status).toBe(403);
  });

  it('returns lookups for the subscription forms to internal users only', async () => {
    const res = await api().get('/api/subscriptions/lookups').set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBeGreaterThanOrEqual(2);
    expect(res.body.products[0].variants[0]).toMatchObject({ value: 'Odoo', extraPrice: 560 });
    expect(res.body.templates).toHaveLength(1);
    expect((await api().get('/api/subscriptions/lookups').set(customerUser.auth)).status).toBe(403);
  });

  it('supports customers created without a portal login', async () => {
    const companyId = await createCustomer('Apex Manufacturing', null, staff.id);
    const res = await newSubscription({ customerId: companyId });
    expect(res.status).toBe(201);
    expect(res.body.customerName).toBe('Apex Manufacturing');
  });
});
