import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, closeDatabase, createCustomer, createUser, resetDatabase, type TestUser } from './helpers.js';

const SUBSCRIPTIONS = 5000;
const BUDGET_MS = 1000;

let staff: TestUser;

/** Loads thousands of subscriptions, invoices and payments directly with SQL, then times the dashboard endpoints. */
beforeAll(async () => {
  await resetDatabase();
  staff = await createUser('staff');
  const customers = await Promise.all(Array.from({ length: 50 }, (_, i) => createCustomer(`Bulk Customer ${i + 1}`)));
  const plan = await pool.query<{ id: number }>(`INSERT INTO plans (name, billing_interval, price) VALUES ('Bulk Monthly', 'monthly', 999) RETURNING id`);

  await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, status, start_date, next_billing_date, expiry_date, subtotal, tax_total, total)
     SELECT ($1::int[])[1 + g % array_length($1::int[], 1)], $2,
            CASE WHEN g % 10 = 0 THEN 'paused' WHEN g % 25 = 0 THEN 'closed' ELSE 'active' END,
            current_date - (g % 300), current_date + (g % 28), current_date + (g % 400), 1000, 180, 1180
       FROM generate_series(1, $3) g`,
    [customers, plan.rows[0].id, SUBSCRIPTIONS],
  );
  await pool.query(
    `INSERT INTO invoices (subscription_id, customer_id, status, billing_period_start, billing_period_end, invoice_date, due_date,
                           customer_name, subtotal, tax_total, grand_total, amount_paid)
     SELECT s.id, s.customer_id, CASE WHEN s.id % 3 = 0 THEN 'paid' ELSE 'confirmed' END,
            current_date - 30 - m * 30, current_date - 1 - m * 30, current_date - 30 - m * 30, current_date - 15 - m * 30,
            'Bulk', 1000, 180, 1180, CASE WHEN s.id % 3 = 0 THEN 1180 ELSE 0 END
       FROM subscriptions s CROSS JOIN generate_series(0, 2) m`,
  );
  await pool.query(
    `INSERT INTO payments (invoice_id, customer_id, payment_method, amount, payment_date)
     SELECT i.id, i.customer_id, (ARRAY['cash', 'bank_transfer', 'card', 'upi'])[1 + i.id % 4], i.grand_total, i.invoice_date + 3
       FROM invoices i WHERE i.status = 'paid'`,
  );
  await pool.query('ANALYZE');
}, 60000);
afterAll(closeDatabase);

describe(`dashboard performance with ${SUBSCRIPTIONS} subscriptions and ${SUBSCRIPTIONS * 3} invoices`, () => {
  const endpoints = [
    '/api/reports/summary?dateFrom=2000-01-01',
    '/api/reports/revenue',
    '/api/reports/overdue',
    '/api/reports/subscriptions',
    '/api/invoices?status=overdue',
    '/api/subscriptions?status=active',
    '/api/payments',
  ];

  for (const url of endpoints) {
    it(`${url} responds in under ${BUDGET_MS}ms`, async () => {
      const started = performance.now();
      const res = await api().get(url).set(staff.auth);
      const elapsed = performance.now() - started;
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(BUDGET_MS);
    });
  }

  it('summary numbers reflect the bulk data', async () => {
    const res = await api().get('/api/reports/summary?dateFrom=2000-01-01').set(staff.auth);
    expect(res.body.activeSubscriptions).toBeGreaterThan(4000);
    expect(res.body.overdueCount).toBeGreaterThan(5000);
    expect(res.body.revenueCollected).toBeGreaterThan(0);
  });
});
