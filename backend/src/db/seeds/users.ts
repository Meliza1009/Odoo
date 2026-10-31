import type pg from 'pg';
import { hashPassword } from '../../modules/auth/service.js';

/** Demo logins. Shared password so judges can switch roles quickly; change these before any real deployment. */
export const DEMO_PASSWORD = 'Brightloop@2026';

export const DEMO_USERS = [
  { email: 'admin@brightloop.demo', fullName: 'Asha Admin', role: 'admin' },
  { email: 'staff@brightloop.demo', fullName: 'Sam Staff', role: 'staff' },
] as const;

export const DEMO_CUSTOMERS = [
  { email: 'greenleaf@example.com', fullName: 'Priya Nair', companyName: 'Green Leaf Store', phone: '+91 98450 11001', billingAddress: '12 MG Road, Bengaluru 560001', taxNumber: '29ABCDE1234F1Z5' },
  { email: 'apex@example.com', fullName: 'Rahul Mehta', companyName: 'Apex Manufacturing', phone: '+91 98200 22002', billingAddress: 'Plot 7, MIDC, Pune 411019', taxNumber: '27FGHIJ5678K1Z2' },
  { email: 'northwind@example.com', fullName: 'Meera Iyer', companyName: 'Northwind Traders', phone: '+91 98400 33003', billingAddress: '45 Anna Salai, Chennai 600002', taxNumber: '33KLMNO9012P1Z9' },
] as const;

/** Admin, staff and three portal customers (the billing demo builds invoices on top of these). Idempotent. */
export async function seedUsers(client: pg.PoolClient) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const upsertUser = async (email: string, fullName: string, role: string) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET updated_at = users.updated_at RETURNING id`,
      [email, passwordHash, fullName, role],
    );
    return rows[0].id;
  };

  for (const u of DEMO_USERS) await upsertUser(u.email, u.fullName, u.role);
  const demoStaff = await client.query<{id: number}>("SELECT id FROM users WHERE email = 'staff@brightloop.demo' AND role = 'staff' AND is_active");

  for (const c of DEMO_CUSTOMERS) {
    const userId = await upsertUser(c.email, c.fullName, 'customer');
    const existing = await client.query('SELECT 1 FROM customers WHERE user_id = $1 OR lower(company_name) = lower($2)', [userId, c.companyName]);
    if (existing.rowCount) continue;
    await client.query(
      `INSERT INTO customers (user_id, company_name, contact_name, email, phone, billing_address, tax_number, assigned_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, c.companyName, c.fullName, c.email, c.phone, c.billingAddress, c.taxNumber, demoStaff.rows[0]?.id ?? null],
    );
  }
}
