import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { signToken, type Role } from '../src/lib/jwt.js';

export const app = createApp();
export const api = () => request(app);

/** Drops everything and re-runs all migrations. Only ever point TEST_DATABASE_URL at a throwaway database. */
export async function resetDatabase() {
  if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to reset a database whose URL does not contain "test"');
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => undefined);
}

export async function closeDatabase() {
  await pool.end();
}

let userCounter = 0;

export interface TestUser {
  id: number;
  token: string;
  auth: { Authorization: string };
  customerId: number | null;
}

/** Inserts a user directly (bypassing the auth module) and returns a signed JWT for it. */
export async function createUser(role: Role, opts: { companyName?: string } = {}): Promise<TestUser> {
  userCounter += 1;
  const email = `${role}${userCounter}-${Date.now()}@test.brightloop.demo`;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'not-a-real-hash', $2, $3) RETURNING id`,
    [email, `Test ${role} ${userCounter}`, role],
  );
  const id = rows[0].id;
  let customerId: number | null = null;
  if (role === 'customer') customerId = await createCustomer(opts.companyName ?? `Customer Co ${userCounter}`, id);
  const token = signToken(id, role);
  return { id, token, auth: { Authorization: `Bearer ${token}` }, customerId };
}

/** Creates a subscription through the API and walks it Draft -> Quotation -> Confirmed -> Active. Returns its id. */
export async function createActiveSubscription(staff: TestUser, body: Record<string, unknown>): Promise<number> {
  const created = await api().post('/api/subscriptions').set(staff.auth).send(body);
  if (created.status !== 201) throw new Error(`create subscription failed: ${JSON.stringify(created.body)}`);
  for (const status of ['quotation', 'confirmed', 'active']) {
    const res = await api().put(`/api/subscriptions/${created.body.id}/status`).set(staff.auth).send({ status });
    if (res.status !== 200) throw new Error(`transition to ${status} failed: ${JSON.stringify(res.body)}`);
  }
  return created.body.id;
}

export async function createCustomer(companyName: string, userId: number | null = null): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO customers (user_id, company_name, contact_name) VALUES ($1, $2, $2) RETURNING id`,
    [userId, companyName],
  );
  return rows[0].id;
}
