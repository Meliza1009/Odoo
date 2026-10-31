import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool.js';
import { billSubscription, runBilling } from '../src/modules/billing/engine.js';
import { closeExpiredSubscriptions } from '../src/modules/subscriptions/service.js';
import { api, assignCustomers, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let planId: number;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  await resetDatabase();
  [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer')]);
  await assignCustomers(staff, customer.customerId!);
  planId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Expiry Monthly', billingInterval: 'monthly', price: 100, autoCloseOnExpiry: true })).body.id;
});
afterAll(async () => { vi.useRealTimers(); await closeDatabase(); });

async function expiredSubscription(startDate = '2026-08-31', expiryDate = '2026-10-15', customPlan = planId) {
  const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId: customPlan, startDate, expiryDate: '2027-12-31', lines: [] });
  await pool.query('UPDATE subscriptions SET expiry_date = $2 WHERE id = $1', [id, expiryDate]);
  return id;
}

async function periods(id: number) {
  return (await pool.query('SELECT billing_period_start AS start, billing_period_end AS end FROM invoices WHERE subscription_id = $1 ORDER BY billing_period_start', [id])).rows;
}

describe('expiry billing', () => {
  it('invoices all due periods through the expiry date before closing, without duplicate invoices on a repeat run', async () => {
    const id = await expiredSubscription();
    expect((await closeExpiredSubscriptions('2026-10-31')).map((s) => s.id)).toContain(id);
    expect(await periods(id)).toEqual([
      { start: '2026-08-31', end: '2026-09-29' },
      { start: '2026-09-30', end: '2026-10-15' },
    ]);
    expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body).toMatchObject({ status: 'closed', closeReason: 'expired', nextBillingDate: null });
    expect(await closeExpiredSubscriptions('2026-10-31')).toEqual([]);
    expect(await periods(id)).toHaveLength(2);
  });
});

describe('renewal billing', () => {
  it('restores stopped billing on the original monthly anchor without charging a second full price for a truncated cycle', async () => {
    const id = await expiredSubscription();
    await billSubscription(id, '2026-10-15');
    const invoiceId = (await pool.query('SELECT id FROM invoices WHERE subscription_id = $1 ORDER BY billing_period_start DESC LIMIT 1', [id])).rows[0].id;
    expect((await api().post(`/api/invoices/${invoiceId}/confirm`).set(staff.auth)).status).toBe(200);
    const issuedBeforeRenewal = (await api().get(`/api/invoices/${invoiceId}`).set(staff.auth)).body;
    expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body.nextBillingDate).toBeNull();
    const renewed = await api().post(`/api/subscriptions/${id}/renew`).set(staff.auth).send({ periods: 1 });
    expect(renewed.status).toBe(200);
    expect(renewed.body).toMatchObject({ expiryDate: '2026-11-15', nextBillingDate: '2026-10-31' });
    await billSubscription(id, '2026-10-31');
    expect(await periods(id)).toEqual([
      { start: '2026-08-31', end: '2026-09-29' },
      { start: '2026-09-30', end: '2026-10-15' },
      { start: '2026-10-31', end: '2026-11-15' },
    ]);
    expect((await billSubscription(id, '2026-10-31')).invoiceIds).toEqual([]);
    expect((await api().get(`/api/invoices/${invoiceId}`).set(staff.auth)).body).toEqual(issuedBeforeRenewal);
  });
});

it('does not overlap existing truncated invoices when an old billing cursor is retried after renewal', async () => {
  const id = await expiredSubscription();
  await billSubscription(id, '2026-10-15');
  await api().post(`/api/subscriptions/${id}/renew`).set(staff.auth).send({ periods: 1 });
  await pool.query('UPDATE subscriptions SET next_billing_date = $2 WHERE id = $1', [id, '2026-08-31']);
  await billSubscription(id, '2026-10-31');
  expect(await periods(id)).toEqual([
    { start: '2026-08-31', end: '2026-09-29' },
    { start: '2026-09-30', end: '2026-10-15' },
    { start: '2026-10-31', end: '2026-11-15' },
  ]);
});

it('bills only the active time before a pause when expiring, and never back-bills that pause after renewal', async () => {
  const id = await expiredSubscription();
  await pool.query("UPDATE subscriptions SET status = 'paused', paused_at = '2026-09-20T08:00:00Z' WHERE id = $1", [id]);
  await closeExpiredSubscriptions('2026-10-31');
  expect(await periods(id)).toEqual([{ start: '2026-08-31', end: '2026-09-19' }]);
  const renewed = await api().post(`/api/subscriptions/${id}/renew`).set(staff.auth).send({ periods: 1 });
  expect(renewed.body).toMatchObject({ status: 'active', nextBillingDate: '2026-10-31', pausedAt: null });
  await billSubscription(id, '2026-10-31');
  expect(await periods(id)).toEqual([
    { start: '2026-08-31', end: '2026-09-19' },
    { start: '2026-10-31', end: '2026-11-15' },
  ]);
});

it('keeps capped catch-up subscriptions open until every due day is invoiced', async () => {
  const dailyPlan = (await api().post('/api/plans').set(admin.auth).send({ name: 'Expiry Daily', billingInterval: 'daily', price: 1, autoCloseOnExpiry: true })).body.id;
  const id = await expiredSubscription('2025-09-01', '2026-10-06', dailyPlan);
  expect((await closeExpiredSubscriptions('2026-10-31')).map((s) => s.id)).not.toContain(id);
  expect(await periods(id)).toHaveLength(400);
  expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body).toMatchObject({ status: 'active', nextBillingDate: '2026-10-06' });
  expect((await closeExpiredSubscriptions('2026-10-31')).map((s) => s.id)).toContain(id);
  const billed = await periods(id);
  expect(billed).toHaveLength(401);
  expect(billed[0]).toEqual({ start: '2025-09-01', end: '2025-09-01' });
  expect(billed[400]).toEqual({ start: '2026-10-06', end: '2026-10-06' });
});

it('rolls back invoice generation and keeps the due cursor when a billing write fails during expiry', async () => {
  const id = await expiredSubscription();
  await pool.query(`CREATE FUNCTION reject_expiry_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.subscription_id = ${id} THEN RAISE EXCEPTION 'injected expiry billing failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_expiry_invoice BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION reject_expiry_invoice()`);
  try {
    await expect(closeExpiredSubscriptions('2026-10-31')).rejects.toThrow('injected expiry billing failure');
    expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body).toMatchObject({ status: 'active', nextBillingDate: '2026-08-31' });
    expect(await periods(id)).toEqual([]);
  } finally {
    await pool.query('DROP TRIGGER reject_expiry_invoice ON invoices; DROP FUNCTION reject_expiry_invoice()');
  }
  await closeExpiredSubscriptions('2026-10-31');
  expect(await periods(id)).toHaveLength(2);
});

it('invoices unbilled periods before a customer can manually close an expired subscription', async () => {
  const id = await expiredSubscription();
  const closed = await api().post(`/api/subscriptions/${id}/close`).set(customer.auth).send({});
  expect(closed.status).toBe(200);
  expect(closed.body).toMatchObject({ status: 'closed', nextBillingDate: null });
  expect(await periods(id)).toEqual([
    { start: '2026-08-31', end: '2026-09-29' },
    { start: '2026-09-30', end: '2026-10-15' },
  ]);
});

it('catches up active days before a pause before resuming, without invoicing the paused interval', async () => {
  const id = await expiredSubscription('2026-08-01', '2026-12-31');
  await pool.query("UPDATE subscriptions SET status = 'paused', paused_at = '2026-09-15T08:00:00Z' WHERE id = $1", [id]);
  const resumed = await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth).send({});
  expect(resumed.status).toBe(200);
  expect(resumed.body).toMatchObject({ status: 'active', nextBillingDate: '2026-11-01', pausedAt: null });
  expect(await periods(id)).toEqual([
    { start: '2026-08-01', end: '2026-08-31' },
    { start: '2026-09-01', end: '2026-09-14' },
  ]);
});

it('lets an admin billing run catch up pre-pause debt while leaving the pause interval unbilled', async () => {
  const id = await expiredSubscription('2026-08-01', '2026-12-31');
  await pool.query("UPDATE subscriptions SET status = 'paused', paused_at = '2026-09-15T08:00:00Z' WHERE id = $1", [id]);
  await runBilling('2026-10-31');
  expect(await periods(id)).toEqual([
    { start: '2026-08-01', end: '2026-08-31' },
    { start: '2026-09-01', end: '2026-09-14' },
  ]);
  expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body).toMatchObject({ status: 'paused', nextBillingDate: '2026-09-15' });
  await runBilling('2026-10-31');
  expect(await periods(id)).toHaveLength(2);
});

it('keeps a capped resume atomic and lets an admin drain the pre-pause backlog before retrying', async () => {
  const dailyPlan = (await api().post('/api/plans').set(admin.auth).send({ name: 'Paused Daily Backlog', billingInterval: 'daily', price: 1, autoCloseOnExpiry: true })).body.id;
  const id = await expiredSubscription('2025-09-01', '2026-12-31', dailyPlan);
  await pool.query("UPDATE subscriptions SET status = 'paused', paused_at = '2026-10-07T08:00:00Z' WHERE id = $1", [id]);
  const rejected = await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth).send({});
  expect(rejected.status).toBe(409);
  expect(rejected.body.error).toMatch(/Run billing/);
  expect(await periods(id)).toEqual([]);
  expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body).toMatchObject({ status: 'paused', nextBillingDate: '2025-09-01' });
  await runBilling('2026-10-31');
  expect(await periods(id)).toHaveLength(400);
  const resumed = await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth).send({});
  expect(resumed.status).toBe(200);
  expect(resumed.body).toMatchObject({ status: 'active', nextBillingDate: '2026-10-31' });
  const billed = await periods(id);
  expect(billed).toHaveLength(401);
  expect(billed[400]).toEqual({ start: '2026-10-06', end: '2026-10-06' });
});

it('requires renewal before resuming an expired subscription and does not bill or change state on rejection', async () => {
  const id = await expiredSubscription('2026-08-01', '2026-10-15');
  await pool.query("UPDATE subscriptions SET status = 'paused', paused_at = '2026-09-15T08:00:00Z' WHERE id = $1", [id]);
  const resumed = await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth).send({});
  expect(resumed.status).toBe(409);
  expect(resumed.body.error).toMatch(/expired|expiry/i);
  const detail = (await api().get(`/api/subscriptions/${id}`).set(customer.auth)).body;
  expect(detail).toMatchObject({ status: 'paused', nextBillingDate: '2026-08-01' });
  expect(detail.allowedTransitions).not.toContain('active');
  expect(await periods(id)).toEqual([]);
});
