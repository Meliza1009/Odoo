import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, closeDatabase, createUser, resetDatabase, type TestUser } from './helpers.js';

const PASSWORD = 'Portal!Pass1';

let admin: TestUser;
let staff: TestUser;
let customer: TestUser;

beforeAll(async () => {
  await resetDatabase();
  [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer')]);
});
afterAll(closeDatabase);

describe('customers', () => {
  let customerId: number;

  it('lets staff create and list customers; customers themselves are forbidden', async () => {
    const created = await api().post('/api/customers').set(staff.auth).send({
      companyName: 'Northwind Traders',
      contactName: 'Meera Iyer',
      email: 'Northwind@Example.com',
      phone: '+91 98400 33003',
      billingAddress: '45 Anna Salai, Chennai',
      taxNumber: '33KLMNO9012P1Z9',
    });
    expect(created.status).toBe(201);
    customerId = created.body.id;
    expect(created.body).toMatchObject({ companyName: 'Northwind Traders', email: 'northwind@example.com', isActive: true, activeSubscriptions: 0, outstandingBalance: 0 });

    const list = await api().get('/api/customers?q=northwind').set(staff.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: { id: number }) => c.id)).toContain(customerId);

    expect((await api().get('/api/customers').set(customer.auth)).status).toBe(403);
  });

  it('returns the customer with subscription and invoice statistics', async () => {
    const res = await api().get(`/api/customers/${customerId}`).set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toEqual([]);
    expect(res.body.stats).toEqual({ invoiceCount: 0, invoicedTotal: 0, paidTotal: 0, overdueBalance: 0 });
  });

  it('lets staff edit details but only admins change the active flag', async () => {
    const byStaff = await api().put(`/api/customers/${customerId}`).set(staff.auth).send({ companyName: 'Northwind Traders Ltd', isActive: false });
    expect(byStaff.status).toBe(200);
    expect(byStaff.body).toMatchObject({ companyName: 'Northwind Traders Ltd', isActive: true });

    const byAdmin = await api().put(`/api/customers/${customerId}`).set(admin.auth).send({ companyName: 'Northwind Traders Ltd', isActive: false });
    expect(byAdmin.body.isActive).toBe(false);
    expect((await api().get('/api/customers').set(staff.auth)).body.data.some((c: { id: number }) => c.id === customerId)).toBe(false);
    expect((await api().get('/api/customers?includeInactive=true').set(staff.auth)).body.data.some((c: { id: number }) => c.id === customerId)).toBe(true);
    await api().put(`/api/customers/${customerId}`).set(admin.auth).send({ companyName: 'Northwind Traders Ltd', isActive: true });
  });

  it('grants portal access, which the customer can then use to log in and see only their own data', async () => {
    const forbidden = await api().post(`/api/customers/${customerId}/portal-access`).set(staff.auth).send({ email: 'meera@example.com', password: PASSWORD });
    expect(forbidden.status).toBe(403);

    const granted = await api().post(`/api/customers/${customerId}/portal-access`).set(admin.auth).send({ email: 'meera@example.com', password: PASSWORD });
    expect(granted.status).toBe(201);
    expect(granted.body.userEmail).toBe('meera@example.com');

    const login = await api().post('/api/auth/login').send({ email: 'meera@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.customer.id).toBe(customerId);

    const reset = await api().post(`/api/customers/${customerId}/portal-access`).set(admin.auth).send({ email: 'meera@example.com', password: 'Chang3d!Pass' });
    expect(reset.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: 'meera@example.com', password: 'Chang3d!Pass' })).status).toBe(200);
  });

  it('deactivating a customer also locks their portal login', async () => {
    expect((await api().delete(`/api/customers/${customerId}`).set(staff.auth)).status).toBe(403);
    expect((await api().delete(`/api/customers/${customerId}`).set(admin.auth)).status).toBe(204);
    const login = await api().post('/api/auth/login').send({ email: 'meera@example.com', password: 'Chang3d!Pass' });
    expect(login.status).toBe(401);
  });
});

describe('staff accounts', () => {
  let staffId: number;

  it('is admin-only', async () => {
    expect((await api().get('/api/users').set(staff.auth)).status).toBe(403);
    expect((await api().get('/api/users').set(customer.auth)).status).toBe(403);
  });

  it('creates staff members who can log in, and lists internal users only', async () => {
    const res = await api().post('/api/users').set(admin.auth).send({ fullName: 'Sam Staff', email: 'sam@brightloop.demo', password: PASSWORD, role: 'staff' });
    expect(res.status).toBe(201);
    staffId = res.body.id;
    expect(res.body).toMatchObject({ email: 'sam@brightloop.demo', role: 'staff', isActive: true });
    expect(res.body.passwordHash).toBeUndefined();

    expect((await api().post('/api/auth/login').send({ email: 'sam@brightloop.demo', password: PASSWORD })).status).toBe(200);

    const list = await api().get('/api/users').set(admin.auth);
    expect(list.body.data.every((u: { role: string }) => u.role !== 'customer')).toBe(true);
    expect((await api().post('/api/users').set(admin.auth).send({ fullName: 'X', email: 'x@x.com', password: PASSWORD, role: 'customer' })).status).toBe(400);
  });

  it('updates role and status, resets passwords, and protects the last admin and the caller', async () => {
    const promoted = await api().put(`/api/users/${staffId}`).set(admin.auth).send({ fullName: 'Sam Staff', role: 'admin', isActive: true });
    expect(promoted.body.role).toBe('admin');

    const self = await api().put(`/api/users/${admin.id}`).set(admin.auth).send({ fullName: 'Me', role: 'staff', isActive: true });
    expect(self.status).toBe(400);

    const reset = await api().post(`/api/users/${staffId}/reset-password`).set(admin.auth).send({ password: 'Fresh!Pass99' });
    expect(reset.status).toBe(204);
    expect((await api().post('/api/auth/login').send({ email: 'sam@brightloop.demo', password: 'Fresh!Pass99' })).status).toBe(200);

    expect((await api().delete(`/api/users/${staffId}`).set(admin.auth)).status).toBe(204);
    expect((await api().post('/api/auth/login').send({ email: 'sam@brightloop.demo', password: 'Fresh!Pass99' })).status).toBe(401);

    const lastAdmin = await api().delete(`/api/users/${admin.id}`).set(admin.auth);
    expect(lastAdmin.status).toBe(400);
  });
});
