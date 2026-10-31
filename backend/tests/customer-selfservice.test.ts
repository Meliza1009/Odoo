import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, assignCustomers, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';
import { pool } from '../src/db/pool.js';
import { todayIso } from '../src/lib/dates.js';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;
let other: TestUser;
let planId: number;
beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer, other] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer'), createUser('customer')]);
  await assignCustomers(staff, customer.customerId!, other.customerId!);
  const plan = await api().post('/api/plans').set(admin.auth).send({ name: 'Self service monthly', billingInterval: 'monthly', price: 100, canPause: true, canRenew: true, canCloseEarly: true });
  planId = plan.body.id;
});
afterAll(closeDatabase);
const subscription = (who = customer, plan = planId) => createActiveSubscription(staff, { customerId: who.customerId, planId: plan, startDate: todayIso(), expiryDate: '2030-12-31', lines: [] });

describe('customer subscription self service', () => {
  it('lets the owner pause and resume their active subscription', async () => {
    const id = await subscription();
    const paused = await api().post(`/api/subscriptions/${id}/pause`).set(customer.auth).send({ reason: 'Vacation' });
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe('paused');
    const resumed = await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth);
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe('active');
  });
  it('does not let customer resume activate an unactivated order', async () => {
    const created = await api().post('/api/subscriptions').set(staff.auth).send({ customerId: customer.customerId, planId, startDate: todayIso(), lines: [] });
    const id = created.body.id;
    for (const status of ['quotation', 'confirmed']) expect((await api().put(`/api/subscriptions/${id}/status`).set(staff.auth).send({ status })).status).toBe(200);
    expect((await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth)).status).toBe(403);
  });

  it('enforces customer ownership for every self-service action', async () => {
    const id = await subscription(other);
    for (const action of ['pause', 'resume', 'renew', 'close']) {
      expect((await api().post(`/api/subscriptions/${id}/${action}`).set(customer.auth).send({ periods: 1 })).status).toBe(404);
    }
    expect((await api().post(`/api/subscriptions/${id}/pause`)).status).toBe(401);
  });

  it('lets an owner renew and close while keeping sales and billing actions internal', async () => {
    const id = await subscription();
    const renewed = await api().post(`/api/subscriptions/${id}/renew`).set(customer.auth).send({ periods: 1 });
    expect(renewed.status).toBe(200);
    expect(renewed.body.expiryDate).toBe('2031-01-31');
    expect((await api().put(`/api/subscriptions/${id}/status`).set(customer.auth).send({ status: 'closed' })).status).toBe(403);
    expect((await api().post(`/api/subscriptions/${id}/cancel`).set(customer.auth)).status).toBe(403);
    expect((await api().post(`/api/billing/subscriptions/${id}/generate`).set(customer.auth)).status).toBe(403);
    const closed = await api().post(`/api/subscriptions/${id}/close`).set(customer.auth).send({ reason: 'No longer needed' });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
  });

  it('enforces plan flags on pause, resume, renewal, and early closure through the API', async () => {
    const plan = await api().post('/api/plans').set(admin.auth).send({ name: 'Restricted plan', billingInterval: 'monthly', price: 10, canPause: false, canRenew: false, canCloseEarly: false });
    const id = await subscription(customer, plan.body.id);
    for (const action of ['pause', 'renew', 'close']) {
      expect((await api().post(`/api/subscriptions/${id}/${action}`).set(customer.auth).send({ periods: 1 })).status).toBe(409);
    }
    await pool.query("UPDATE subscriptions SET status='paused', paused_at=now() WHERE id=$1", [id]);
    expect((await api().post(`/api/subscriptions/${id}/resume`).set(customer.auth)).status).toBe(409);
  });

});
