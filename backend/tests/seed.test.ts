import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { seed } from '../src/db/seed.js';
import { DEMO_PASSWORD, DEMO_USERS } from '../src/db/seeds/users.js';
import { todayIso } from '../src/lib/dates.js';
import { api, closeDatabase, resetDatabase } from './helpers.js';

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe('seed', () => {
  it('creates demo logins, the catalogue, billing rules and demo invoices, and is safe to run twice', async () => {
    await seed(() => undefined);
    const invoicesAfterFirstRun = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invoices')).rows[0].n;
    await seed(() => undefined);

    const counts = await pool.query(
      `SELECT (SELECT count(*) FROM users)::int AS users,
              (SELECT count(*) FROM customers)::int AS customers,
              (SELECT count(*) FROM products)::int AS products,
              (SELECT count(*) FROM product_variants)::int AS variants,
              (SELECT count(*) FROM plans)::int AS plans,
              (SELECT count(*) FROM quotation_templates)::int AS templates,
              (SELECT count(*) FROM quotation_template_lines)::int AS lines,
              (SELECT count(*) FROM tax_rules)::int AS "taxRules",
              (SELECT count(*) FROM discounts)::int AS discounts,
              (SELECT count(*) FROM invoices)::int AS invoices`,
    );
    expect(counts.rows[0]).toEqual({
      users: 5,
      customers: 3,
      products: 3,
      variants: 3,
      plans: 3,
      templates: 2,
      lines: 4,
      taxRules: 2,
      discounts: 2,
      invoices: invoicesAfterFirstRun,
    });
    expect(invoicesAfterFirstRun).toBeGreaterThan(0);

    const odoo = await pool.query<{ price: number }>(
      `SELECT p.sales_price + v.extra_price AS price
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE p.name = 'Business Software' AND v.value = 'Odoo'`,
    );
    expect(odoo.rows[0].price).toBe(2560);
  });

  it('lets every demo account log in with the shared demo password', async () => {
    for (const demo of DEMO_USERS) {
      const res = await api().post('/api/auth/login').send({ email: demo.email, password: DEMO_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email: demo.email, role: demo.role });
    }
    const customer = await api().post('/api/auth/login').send({ email: 'greenleaf@example.com', password: DEMO_PASSWORD });
    expect(customer.status).toBe(200);
    expect(customer.body.user.role).toBe('customer');
    expect(customer.body.user.customer.companyName).toBe('Green Leaf Store');
  });

  it('gives the demo customers a paid, an outstanding and an overdue history', async () => {
    const byCustomer = await pool.query<{ company: string; invoices: number; due: number; paid: number; overdue: number }>(
      `SELECT c.company_name AS company, count(i.id)::int AS invoices, COALESCE(sum(i.amount_due), 0) AS due,
              COALESCE(sum(i.amount_paid), 0) AS paid,
              count(i.id) FILTER (WHERE i.status = 'confirmed' AND i.due_date < $1 AND i.amount_due > 0)::int AS overdue
         FROM customers c LEFT JOIN invoices i ON i.customer_id = c.id
        GROUP BY c.id, c.company_name ORDER BY c.id`,
      [todayIso()],
    );
    const [paid, outstanding, overdue] = byCustomer.rows;
    expect(paid.invoices).toBeGreaterThan(0);
    expect(paid.due).toBe(0);
    expect(outstanding.due).toBeGreaterThan(0);
    expect(outstanding.paid).toBeGreaterThan(0);
    expect(overdue.overdue).toBeGreaterThan(0);
    expect(overdue.paid).toBe(0);
  });
});
