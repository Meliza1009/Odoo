import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { api, assignCustomers, closeDatabase, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let otherCustomer: TestUser;
let planId: number;
let otherPlanId: number;
let closedTodayId: number;
let cancelledYesterdayId: number;
let foreignClosedId: number;
const today = todayIso();
const yesterday = addDays(today, -1);

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer, otherCustomer] = await Promise.all([
    createUser('admin'), createUser('staff'), createUser('customer'), createUser('customer'),
  ]);
  await assignCustomers(staff, customer.customerId!);
  const plans = await pool.query<{ id: number }>(
    `INSERT INTO plans (name, billing_interval, price) VALUES ('Report monthly', 'monthly', 100), ('Report yearly', 'yearly', 500) RETURNING id`,
  );
  [planId, otherPlanId] = plans.rows.map((p) => p.id);
  const subscription = async (who: TestUser, plan: number, status = 'active', closedAt: string | null = null) => (
    await pool.query<{ id: number }>(
      `INSERT INTO subscriptions (customer_id, plan_id, status, start_date, closed_at) VALUES ($1, $2, $3, $4, $5::date + interval '12 hours') RETURNING id`,
      [who.customerId, plan, status, addDays(today, -10), closedAt],
    )
  ).rows[0].id;
  const own = await subscription(customer, planId);
  const ownOtherPlan = await subscription(customer, otherPlanId);
  const foreign = await subscription(otherCustomer, planId);
  closedTodayId = await subscription(customer, planId, 'closed', today);
  cancelledYesterdayId = await subscription(customer, planId, 'cancelled', yesterday);
  foreignClosedId = await subscription(otherCustomer, planId, 'closed', today);
  await subscription(customer, planId, 'closed', addDays(today, 1));

  const invoice = async (subId: number, who: TestUser, status: string, amount: number) => (
    await pool.query<{ id: number }>(
      `INSERT INTO invoices (subscription_id, customer_id, status, billing_period_start, billing_period_end, invoice_date, due_date, customer_name, grand_total, amount_paid)
       VALUES ($1, $2, $3, $4::date, $4::date, $5::date, $5::date, 'Report account', $6, $7) RETURNING id`,
      [subId, who.customerId, status, addDays(today, amount), today, amount, status === 'paid' ? amount : 0],
    )
  ).rows[0].id;
  await invoice(own, customer, 'confirmed', 100);
  const ownPaid = await invoice(own, customer, 'paid', 200);
  await invoice(own, customer, 'draft', 300);
  await invoice(own, customer, 'cancelled', 400);
  const ownOtherPaid = await invoice(ownOtherPlan, customer, 'paid', 500);
  const foreignConfirmed = await invoice(foreign, otherCustomer, 'confirmed', 600);
  const foreignPaid = await invoice(foreign, otherCustomer, 'paid', 700);
  await pool.query(`INSERT INTO payments (invoice_id, customer_id, payment_method, amount, payment_date) VALUES
    ($1, $5, 'cash', 200, $7), ($2, $5, 'cash', 500, $7),
    ($3, $6, 'cash', 100, $7), ($4, $6, 'cash', 700, $7)`,
  [ownPaid, ownOtherPaid, foreignConfirmed, foreignPaid, customer.customerId, otherCustomer.customerId, today]);
});
afterAll(closeDatabase);

describe('report drill-down filters', () => {
  it('lists confirmed and paid invoices for issued status, excluding draft/cancelled and respecting ownership', async () => {
    const path = `/api/invoices?status=issued&planId=${planId}&dateFrom=${today}&dateTo=${today}`;
    const all = await api().get(path).set(admin.auth);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 4, summary: { grandTotal: 1600 } });
    expect(new Set(all.body.data.map((i: { status: string }) => i.status))).toEqual(new Set(['confirmed', 'paid']));
    for (const user of [staff, customer]) {
      const own = await api().get(`${path}&customerId=${otherCustomer.customerId}`).set(user.auth);
      expect(own.body).toMatchObject({ total: user === staff ? 0 : 2 });
      const scoped = await api().get(path).set(user.auth);
      expect(scoped.body).toMatchObject({ total: 2, summary: { grandTotal: 300 } });
      expect(scoped.body.data.every((i: { customerId: number }) => i.customerId === customer.customerId)).toBe(true);
    }
  });

  it('filters payment rows and their total by the invoice subscription plan without widening access', async () => {
    const path = `/api/payments?planId=${planId}&dateFrom=${today}&dateTo=${today}`;
    const all = await api().get(path).set(admin.auth);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 3, summary: { amount: 1000 } });
    for (const user of [staff, customer]) {
      const own = await api().get(path).set(user.auth);
      expect(own.status).toBe(200);
      expect(own.body).toMatchObject({ total: 1, summary: { amount: 200 } });
      const otherPlan = await api().get(`/api/payments?planId=${otherPlanId}`).set(user.auth);
      expect(otherPlan.body).toMatchObject({ total: 1, summary: { amount: 500 } });
      const absent = await api().get('/api/payments?planId=999999').set(user.auth);
      expect(absent.body).toMatchObject({ total: 0, summary: { amount: 0 } });
    }
  });

  it('filters subscription closure dates inclusively and retains status/customer restrictions', async () => {
    const path = `/api/subscriptions?status=closed,cancelled&closedFrom=${today}&closedTo=${today}`;
    const all = await api().get(path).set(admin.auth);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.data.map((s: { id: number }) => s.id).sort()).toEqual([closedTodayId, foreignClosedId].sort());
    for (const user of [staff, customer]) {
      const own = await api().get(path).set(user.auth);
      expect(own.body.total).toBe(1);
      expect(own.body.data[0].id).toBe(closedTodayId);
      const period = await api().get(`/api/subscriptions?status=closed,cancelled&closedFrom=${yesterday}&closedTo=${today}`).set(user.auth);
      expect(period.body.total).toBe(2);
      expect(period.body.data.map((s: { id: number }) => s.id).sort()).toEqual([closedTodayId, cancelledYesterdayId].sort());
    }
    const untilYesterday = await api().get(`/api/subscriptions?closedTo=${yesterday}`).set(customer.auth);
    expect(untilYesterday.body.total).toBe(1);
    expect(untilYesterday.body.data[0].id).toBe(cancelledYesterdayId);
  });

  it('rejects malformed dates, reversed closure ranges and invalid plan ids', async () => {
    expect((await api().get(`/api/subscriptions?closedFrom=${today}&closedTo=${yesterday}`).set(admin.auth)).status).toBe(400);
    expect((await api().get('/api/subscriptions?closedFrom=invalid').set(admin.auth)).status).toBe(400);
    expect((await api().get('/api/subscriptions?closedTo=2026-02-30').set(admin.auth)).status).toBe(400);
    expect((await api().get('/api/payments?planId=invalid').set(admin.auth)).status).toBe(400);
    expect((await api().get('/api/payments?planId=0').set(admin.auth)).status).toBe(400);
  });
});
