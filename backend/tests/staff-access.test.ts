import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { runBilling } from '../src/modules/billing/engine.js';
import { api, assignCustomers, closeDatabase, createActiveSubscription, createCustomer, createUser, resetDatabase, type TestUser } from './helpers.js';

let admin: TestUser;
let staffA: TestUser;
let staffB: TestUser;
let customerA: TestUser;
let customerB: TestUser;
let unassignedCustomer: number;
let planId: number;
let activeA: number;
let activeB: number;
let draftA: number;
let draftB: number;
let invoiceA: number;
let invoiceB: number;
const today = todayIso();

beforeAll(async () => {
  await resetDatabase();
  [admin, staffA, staffB, customerA, customerB] = await Promise.all([
    createUser('admin'), createUser('staff'), createUser('staff'), createUser('customer'), createUser('customer'),
  ]);
  await assignCustomers(staffA, customerA.customerId!);
  await assignCustomers(staffB, customerB.customerId!);
  unassignedCustomer = await createCustomer('Unassigned');
  const plan = await api().post('/api/plans').set(admin.auth).send({ name: 'Monthly', billingInterval: 'monthly', price: 100 });
  planId = plan.body.id;
  const body = (customerId: number) => ({ customerId, planId, startDate: today, expiryDate: addDays(today, 10), lines: [] });
  activeA = await createActiveSubscription(staffA, body(customerA.customerId!));
  activeB = await createActiveSubscription(staffB, body(customerB.customerId!));
  const ownDraft = await api().post('/api/subscriptions').set(staffA.auth).send(body(customerA.customerId!));
  expect(ownDraft.status).toBe(201);
  draftA = ownDraft.body.id;
  const draft = await api().post('/api/subscriptions').set(staffB.auth).send(body(customerB.customerId!));
  expect(draft.status).toBe(201);
  draftB = draft.body.id;
  await runBilling(today, { autoConfirm: true });
  const invoices = await pool.query<{id: number; subscription_id: number}>('SELECT id, subscription_id FROM invoices');
  invoiceA = invoices.rows.find((i) => i.subscription_id === activeA)!.id;
  invoiceB = invoices.rows.find((i) => i.subscription_id === activeB)!.id;
  await pool.query('UPDATE invoices SET invoice_date = $1, due_date = $2 WHERE id IN ($3, $4)', [addDays(today, -2), addDays(today, -1), invoiceA, invoiceB]);
  const payment = await api().post(`/api/invoices/${invoiceB}/payments`).set(staffB.auth).send({amount: 10, paymentMethod: 'cash', paymentDate: today});
  expect(payment.status).toBe(201);
});
afterAll(closeDatabase);

describe('staff customer portfolios', () => {
  it('scopes customer, subscription, invoice, payment lists and lookups, even with another customer filter', async () => {
    const customers = await api().get('/api/customers?includeInactive=true').set(staffA.auth);
    expect(customers.body.data.map((c: {id: number}) => c.id)).toEqual([customerA.customerId]);
    expect(customers.body.data[0]).toMatchObject({assignedStaffId: staffA.id});
    const lookups = await api().get('/api/subscriptions/lookups').set(staffA.auth);
    expect(lookups.body.customers.map((c: {id: number}) => c.id)).toEqual([customerA.customerId]);
    for (const path of ['subscriptions', 'invoices', 'payments']) {
      const mine = await api().get(`/api/${path}`).set(staffA.auth);
      expect(mine.status).toBe(200);
      expect(mine.body.data.every((r: {customerId: number}) => r.customerId === customerA.customerId)).toBe(true);
      const other = await api().get(`/api/${path}?customerId=${customerB.customerId}`).set(staffA.auth);
      expect(other.status).toBe(200);
      expect(other.body.total).toBe(0);
    }
    expect((await api().get('/api/payments').set(staffA.auth)).body.total).toBe(0);
    expect((await api().get('/api/customers').set(admin.auth)).body.total).toBe(3);
  });

  it('denies cross-customer reads, printing, edits, lifecycle actions and payments', async () => {
    for (const path of [`customers/${customerB.customerId}`, `customers/${unassignedCustomer}`, `subscriptions/${activeB}`, `invoices/${invoiceB}`, `invoices/${invoiceB}/print`, `invoices/${invoiceB}/payments`]) {
      expect((await api().get(`/api/${path}`).set(staffA.auth)).status, path).toBe(404);
    }
    expect((await api().put(`/api/customers/${customerB.customerId}`).set(staffA.auth).send({companyName: 'Taken'})).status).toBe(404);
    const body = {customerId: customerB.customerId, planId, startDate: today, lines: []};
    expect((await api().post('/api/subscriptions').set(staffA.auth).send(body)).status).toBe(404);
    expect((await api().put(`/api/subscriptions/${draftB}`).set(staffA.auth).send(body)).status).toBe(404);
    expect((await api().put(`/api/subscriptions/${draftA}`).set(staffA.auth).send(body)).status).toBe(404);
    expect((await api().get(`/api/subscriptions/${draftA}`).set(staffA.auth)).body.customerId).toBe(customerA.customerId);
    expect((await api().put(`/api/subscriptions/${draftB}/status`).set(staffA.auth).send({status: 'quotation'})).status).toBe(404);
    for (const action of ['pause', 'resume', 'renew', 'close', 'cancel']) {
      expect((await api().post(`/api/subscriptions/${activeB}/${action}`).set(staffA.auth).send({})).status, action).toBe(404);
    }
    for (const action of ['confirm', 'cancel', 'send']) {
      expect((await api().post(`/api/invoices/${invoiceB}/${action}`).set(staffA.auth).send({})).status, action).toBe(404);
    }
    const payment = {amount: 1, paymentMethod: 'cash', paymentDate: today};
    expect((await api().post(`/api/invoices/${invoiceB}/payments`).set(staffA.auth).send(payment)).status).toBe(404);
    expect((await api().post('/api/payments').set(staffA.auth).send({...payment, invoiceId: invoiceB})).status).toBe(404);
    expect((await api().post(`/api/billing/subscriptions/${activeB}/generate`).set(staffA.auth).send({})).status).toBe(404);
  });

  it('provides operational counts and matching renewal details without finance fields', async () => {
    const dashboard = await api().get('/api/reports/workspace').set(staffA.auth);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body).toEqual({assignedCustomers: 1, activeSubscriptions: 1, openQuotations: 1, upcomingRenewals: 1, overdueInvoices: 1});
    const renewals = await api().get('/api/subscriptions?renewalsDue=true').set(staffA.auth);
    expect(renewals.body.total).toBe(dashboard.body.upcomingRenewals);
    expect(renewals.body.data.map((s: {id: number}) => s.id)).toEqual([activeA]);
    expect((await api().get('/api/reports/workspace').set(customerA.auth)).status).toBe(403);
    for (const path of ['summary', 'revenue', 'overdue', 'subscriptions']) {
      expect((await api().get(`/api/reports/${path}`).set(staffA.auth)).status, path).toBe(403);
    }
    expect((await api().post('/api/billing/run').set(staffA.auth).send({})).status).toBe(403);
    expect((await api().get('/api/billing/runs').set(staffA.auth)).status).toBe(403);
    expect((await api().post('/api/subscriptions/close-expired').set(staffA.auth)).status).toBe(403);
  });

  it('only admins create and reassign customers and assignments take effect immediately', async () => {
    expect((await api().post('/api/customers').set(staffA.auth).send({companyName: 'No'})).status).toBe(403);
    expect((await api().put(`/api/customers/${customerA.customerId}`).set(staffA.auth).send({companyName: 'No', assignedStaffId: staffB.id})).status).toBe(403);
    expect((await api().post('/api/customers').set(admin.auth).send({companyName: 'Invalid assignment', assignedStaffId: admin.id})).status).toBe(400);
    const reassigned = await api().put(`/api/customers/${customerA.customerId}`).set(admin.auth).send({companyName: 'Reassigned', assignedStaffId: staffB.id});
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.assignedStaffId).toBe(staffB.id);
    expect((await api().get(`/api/subscriptions/${activeA}`).set(staffA.auth)).status).toBe(404);
    expect((await api().get(`/api/invoices/${invoiceA}`).set(staffA.auth)).status).toBe(404);
    expect((await api().get(`/api/subscriptions/${activeA}`).set(staffB.auth)).status).toBe(200);
    const unassign = await api().put(`/api/customers/${customerA.customerId}`).set(admin.auth).send({companyName: 'Unassigned now', assignedStaffId: null});
    expect(unassign.status).toBe(200);
    expect((await api().get(`/api/customers/${customerA.customerId}`).set(staffB.auth)).status).toBe(404);
    expect((await api().get(`/api/invoices/${invoiceA}`).set(customerA.auth)).status).toBe(200);
  });
});
