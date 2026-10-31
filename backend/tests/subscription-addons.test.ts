import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, assignCustomers, closeDatabase, createActiveSubscription, createUser, resetDatabase, type TestUser } from './helpers.js';
import { billSubscription } from '../src/modules/billing/engine.js';
import { todayIso } from '../src/lib/dates.js';
let admin: TestUser, staff: TestUser, customer: TestUser, otherStaff: TestUser;
let planId: number, baseId: number, addonId: number;
beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer, otherStaff] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer'), createUser('staff')]);
  await assignCustomers(staff, customer.customerId!);
  planId = (await api().post('/api/plans').set(admin.auth).send({ name: 'Add-on plan', billingInterval: 'monthly', price: 100 })).body.id;
  baseId = (await api().post('/api/products').set(admin.auth).send({ name: 'Base software', type: 'software', salesPrice: 500 })).body.id;
  addonId = (await api().post('/api/products').set(admin.auth).send({ name: 'Storage add-on', type: 'addon', salesPrice: 50 })).body.id;
});
afterAll(closeDatabase);
const active = () => createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: todayIso(), lines: [{ productId: baseId, quantity: 1, unitPrice: 450 }] });

describe('active subscription add-ons', () => {
  it('adds an add-on for future invoices and keeps the existing base contract and issued invoice intact', async () => {
    const id = await active();
    const billed = await api().post(`/api/billing/subscriptions/${id}/generate`).set(staff.auth).send({ autoConfirm: true });
    const invoiceId = billed.body.invoiceIds[0];
    const before = (await api().get(`/api/invoices/${invoiceId}`).set(staff.auth)).body;
    const updated = await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, quantity: 2 }] });
    expect(updated.status).toBe(200);
    expect(updated.body.lines.map((l: {unitPrice: number; quantity: number}) => [l.unitPrice, l.quantity])).toEqual([[100, 1], [450, 1], [50, 2]]);
    expect(updated.body.total).toBe(650);
    expect((await api().get(`/api/invoices/${invoiceId}`).set(staff.auth)).body).toEqual(before);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE subscription_id=$1', [id])).rows[0].n).toBe(1);
  });
  it('bills already-due periods at the old price before saving add-ons and uses new totals next cycle', async () => {
    const id = await active();
    const result = await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, quantity: 3 }] });
    expect(result.status).toBe(200);
    let invoices = await pool.query('SELECT grand_total AS total FROM invoices WHERE subscription_id=$1 ORDER BY id', [id]);
    expect(invoices.rows).toEqual([{ total: 550 }]);
    await billSubscription(id, result.body.nextBillingDate);
    invoices = await pool.query('SELECT grand_total AS total FROM invoices WHERE subscription_id=$1 ORDER BY id', [id]);
    expect(invoices.rows).toEqual([{ total: 550 }, { total: 700 }]);
    const removed = await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [] });
    expect(removed.status).toBe(200);
    expect(removed.body.total).toBe(550);
    expect(removed.body.lines.every((l: {productId:number}) => l.productId !== addonId)).toBe(true);
  });

  it('rejects price and base-product edits, unauthorized users, and unsupported states', async () => {
    const id = await active();
    expect((await api().put(`/api/subscriptions/${id}/add-ons`).set(customer.auth).send({ lines: [] })).status).toBe(403);
    expect((await api().put(`/api/subscriptions/${id}/add-ons`).set(otherStaff.auth).send({ lines: [] })).status).toBe(404);
    expect((await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: baseId, quantity: 1 }] })).status).toBe(400);
    expect((await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, quantity: 1, unitPrice: 0 }] })).status).toBe(400);
    const draft = await api().post('/api/subscriptions').set(staff.auth).send({ customerId: customer.customerId, planId, startDate: todayIso(), lines: [] });
    expect((await api().put(`/api/subscriptions/${draft.body.id}/add-ons`).set(staff.auth).send({ lines: [] })).status).toBe(409);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE subscription_id=$1', [id])).rows[0].n).toBe(0);
  });

  it('preserves agreed add-on prices and base line identities while changing quantity on paused subscriptions', async () => {
    const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: todayIso(), lines: [{ productId: baseId, quantity: 1 }, { productId: addonId, quantity: 1, unitPrice: 40 }] });
    const before = (await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body;
    await api().post(`/api/subscriptions/${id}/pause`).set(staff.auth);
    const updated = await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, quantity: 4 }] });
    expect(updated.status).toBe(200);
    expect(updated.body.lines.find((l: {productId:number}) => l.productId === baseId).id).toBe(before.lines.find((l: {productId:number}) => l.productId === baseId).id);
    expect(updated.body.lines.find((l: {productId:number}) => l.productId === addonId)).toMatchObject({ quantity: 4, unitPrice: 40 });
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE subscription_id=$1', [id])).rows[0].n).toBe(0);
  });

  it('settles pre-pause debt at the old price before changing a paused subscription', async () => {
    const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId, startDate: '2026-08-01', lines: [{ productId: baseId, quantity: 1, unitPrice: 450 }] });
    await pool.query("UPDATE subscriptions SET status='paused', paused_at='2026-09-15', expiry_date='2026-10-15' WHERE id=$1", [id]);
    const changed = await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, quantity: 2 }] });
    expect(changed.status).toBe(200);
    const invoices = await pool.query('SELECT billing_period_start AS start, billing_period_end AS finish, grand_total AS total FROM invoices WHERE subscription_id=$1 ORDER BY billing_period_start', [id]);
    expect(invoices.rows).toEqual([
      { start: '2026-08-01', finish: '2026-08-31', total: 550 },
      { start: '2026-09-01', finish: '2026-09-14', total: 550 },
    ]);
  });

  it('serializes repeated add-on updates without duplicate old invoices or duplicate add-on lines', async () => {
    const id = await active();
    const send = () => api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, quantity: 1 }] });
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE subscription_id=$1', [id])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM subscription_lines WHERE subscription_id=$1 AND product_id=$2', [id, addonId])).rows[0].n).toBe(1);
  });

  it('enforces minimum quantity and rejects invalid variant references without changing the contract', async () => {
    const plan = (await api().post('/api/plans').set(admin.auth).send({ name: 'Minimum plan', billingInterval: 'monthly', price: 100, minQuantity: 3 })).body.id;
    const id = await createActiveSubscription(staff, { customerId: customer.customerId, planId: plan, startDate: todayIso(), lines: [{ productId: baseId, quantity: 1 }, { productId: addonId, quantity: 2 }] });
    expect((await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [] })).status).toBe(400);
    expect((await api().put(`/api/subscriptions/${id}/add-ons`).set(staff.auth).send({ lines: [{ productId: addonId, variantId: 999999, quantity: 2 }] })).status).toBe(400);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM invoices WHERE subscription_id=$1', [id])).rows[0].n).toBe(0);
    expect((await api().get(`/api/subscriptions/${id}`).set(staff.auth)).body.total).toBe(700);
  });

});
