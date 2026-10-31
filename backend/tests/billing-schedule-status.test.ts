import { afterAll, beforeAll, expect, it } from 'vitest';
import { api, closeDatabase, createUser, resetDatabase, type TestUser } from './helpers.js';
let admin: TestUser, staff: TestUser, customer: TestUser;
beforeAll(async () => { await resetDatabase(); [admin, staff, customer] = await Promise.all([createUser('admin'), createUser('staff'), createUser('customer')]); });
afterAll(closeDatabase);
it('exposes schedule configuration and checkpoint only to admins', async () => {
  const result = await api().get('/api/billing/schedule').set(admin.auth);
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ enabled: false, intervalMs: 3600000, autoConfirm: false, lastSuccessAt: null });
  expect((await api().get('/api/billing/schedule').set(staff.auth)).status).toBe(403);
  expect((await api().get('/api/billing/schedule').set(customer.auth)).status).toBe(403);
  expect((await api().get('/api/billing/schedule')).status).toBe(401);
});
