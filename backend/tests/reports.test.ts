import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { runBilling } from '../src/modules/billing/engine.js';
import { assignCustomers, api, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customerA: TestUser;
let customerB: TestUser;
let monthlyPlanId: number;
let yearlyPlanId: number;

const today = todayIso();
const range = `dateFrom=${addDays(today, -60)}&dateTo=${today}`;

/**
 * Dataset (no taxes, product price 1000):
 *   A1 monthly 1000 active  -> invoice 1000 paid in full by cash
 *   A2 yearly 12000 active  -> invoice 12000, 2000 paid by bank transfer
 *   A3 monthly 1000 paused  -> invoice 1000 unpaid and overdue by 5 days
 *   B1 monthly 1000 active  -> invoice 1000 unpaid, not yet due
 */
beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customerA, customerB] = await Promise.all([
    createUser('admin'),
    createUser('staff'),
    createUser('customer', { companyName: 'Green Leaf Store' }),
    createUser('customer', { companyName: 'Northwind Traders' }),
  ]);
  await assignCustomers(staff, customerA.customerId!, customerB.customerId!);
  const productId = (await api().post('/api/products').set(admin.auth).send({ name: 'Licence', type: 'software', salesPrice: 1000 })).body.id;
  monthlyPlanId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Monthly', billingInterval: 'monthly', price: 0 })).body.id;
  yearlyPlanId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Yearly', billingInterval: 'yearly', price: 0 })).body.id;

  const sub = (who: TestUser, planId: number, quantity: number) =>
    createActiveSubscription(staff, { customerId: who.customerId, planId, startDate: today, paymentTermsDays: 15, lines: [{ productId, quantity }] });
  const a1 = await sub(customerA, monthlyPlanId, 1);
  const a2 = await sub(customerA, yearlyPlanId, 12);
  const a3 = await sub(customerA, monthlyPlanId, 1);
  await sub(customerB, monthlyPlanId, 1);
  await runBilling(today, { autoConfirm: true });
  await api().post(`/api/subscriptions/${a3}/pause`).set(staff.auth).send({});

  const invoiceOf = async (subscriptionId: number) =>
    (await pool.query<{ id: number }>('SELECT id FROM invoices WHERE subscription_id = $1', [subscriptionId])).rows[0].id;
  const payment = (invoiceId: number, amount: number, paymentMethod: string) =>
    api().post(`/api/invoices/${invoiceId}/payments`).set(staff.auth).send({ amount, paymentMethod, paymentDate: today });
  await payment(await invoiceOf(a1), 1000, 'cash');
  await payment(await invoiceOf(a2), 2000, 'bank_transfer');
  await pool.query('UPDATE invoices SET invoice_date = $2, due_date = $3 WHERE id = $1', [await invoiceOf(a3), addDays(today, -20), addDays(today, -5)]);
});
afterAll(closeDatabase);

describe('finance summary', () => {
  it('reports subscriptions, MRR/ARR, revenue collected, outstanding and overdue balances', async () => {
    const res = await api().get(`/api/reports/summary?${range}`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      activeSubscriptions: 3,
      pausedSubscriptions: 1,
      mrr: 3000,
      arr: 36000,
      invoicedTotal: 15000,
      invoiceCount: 4,
      outstandingBalance: 12000,
      outstandingCount: 3,
      overdueCount: 1,
      overdueBalance: 1000,
      revenueCollected: 3000,
      paymentCount: 2,
      paidInvoices: 1,
    });
  });

  it('filters by customer, plan and payment method', async () => {
    const byCustomer = await api().get(`/api/reports/summary?${range}&customerId=${customerB.customerId}`).set(admin.auth);
    expect(byCustomer.body).toMatchObject({ activeSubscriptions: 1, mrr: 1000, outstandingBalance: 1000, revenueCollected: 0, overdueCount: 0 });

    const byPlan = await api().get(`/api/reports/summary?${range}&planId=${yearlyPlanId}`).set(admin.auth);
    expect(byPlan.body).toMatchObject({ activeSubscriptions: 1, mrr: 1000, revenueCollected: 2000, outstandingBalance: 10000 });

    const cash = await api().get(`/api/reports/summary?${range}&paymentMethod=cash`).set(admin.auth);
    expect(cash.body.revenueCollected).toBe(1000);
  });

  it('defaults to the current month and validates the range', async () => {
    const res = await api().get('/api/reports/summary').set(admin.auth);
    expect(res.body.range).toEqual({ dateFrom: `${today.slice(0, 7)}-01`, dateTo: today });
    expect((await api().get(`/api/reports/summary?dateFrom=${today}&dateTo=${addDays(today, -1)}`).set(admin.auth)).status).toBe(400);
  });
});

describe('revenue, overdue and subscription reports', () => {
  it('breaks revenue down by month, plan and payment method', async () => {
    const res = await api().get(`/api/reports/revenue?${range}`).set(admin.auth);
    expect(res.status).toBe(200);
    const sum = (key: 'invoiced' | 'collected') => res.body.byMonth.reduce((s: number, m: Record<string, number>) => s + m[key], 0);
    expect(sum('invoiced')).toBe(15000);
    expect(sum('collected')).toBe(3000);
    expect(res.body.byMonth.at(-1).period).toBe(today.slice(0, 7));
    expect(res.body.byMethod).toEqual([
      { paymentMethod: 'bank_transfer', amount: 2000, count: 1 },
      { paymentMethod: 'cash', amount: 1000, count: 1 },
    ]);
    expect(res.body.byPlan.map((p: { planName: string; collected: number }) => [p.planName, p.collected])).toEqual([
      ['Yearly', 2000],
      ['Monthly', 1000],
    ]);
  });

  it('lists overdue invoices with days overdue', async () => {
    const res = await api().get('/api/reports/overdue').set(admin.auth);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ customerName: 'Green Leaf Store', amountDue: 1000, daysOverdue: 5, isOverdue: true });
    expect(res.body.summary.amountDue).toBe(1000);
  });

  it('counts subscriptions by status and plan', async () => {
    const res = await api().get('/api/reports/subscriptions').set(admin.auth);
    expect(res.body.byStatus).toEqual([
      { status: 'active', count: 3 },
      { status: 'paused', count: 1 },
    ]);
    expect(res.body.byPlan).toEqual([
      { planId: monthlyPlanId, planName: 'Monthly', billingInterval: 'monthly', active: 2, total: 3, mrr: 2000 },
      { planId: yearlyPlanId, planName: 'Yearly', billingInterval: 'yearly', active: 1, total: 1, mrr: 1000 },
    ]);
    const paused = await api().get('/api/reports/subscriptions?subscriptionStatus=paused').set(admin.auth);
    expect(paused.body.byStatus).toEqual([{ status: 'paused', count: 1 }]);
  });

  it('is only available to the internal team', async () => {
    expect((await api().get('/api/reports/summary').set(admin.auth)).status).toBe(200);
    expect((await api().get('/api/reports/summary').set(customerA.auth)).status).toBe(403);
  });
});
