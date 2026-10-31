import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addDays, todayIso } from '../src/lib/dates.js';
import { api, closeDatabase, createUser, resetDatabase, type TestUser } from './helpers.js';

let planId: number;
const today = todayIso();

beforeAll(async () => {
  await resetDatabase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO plans (name, billing_interval, price) VALUES ('Notification plan', 'monthly', 100) RETURNING id`,
  );
  planId = rows[0].id;
});
afterAll(closeDatabase);

interface Item { id: string; type: string; href: string; readAt: string | null }

async function scenario() {
  const [staff, otherStaff, customer, otherCustomer] = await Promise.all([
    createUser('staff'), createUser('staff'), createUser('customer'), createUser('customer'),
  ]);
  await pool.query('UPDATE customers SET assigned_staff_id = $2 WHERE id = $1', [customer.customerId, staff.id]);
  await pool.query('UPDATE customers SET assigned_staff_id = $2 WHERE id = $1', [otherCustomer.customerId, otherStaff.id]);
  const subscription = async (who: TestUser, status: string, expiry: string | null = null) => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO subscriptions (customer_id, plan_id, status, start_date, expiry_date, quotation_valid_until)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [who.customerId, planId, status, addDays(today, -30), expiry, status === 'quotation' ? addDays(today, 4) : null],
    );
    return rows[0].id;
  };
  const invoice = async (who: TestUser, due: string, status = 'confirmed') => {
    const subId = await subscription(who, 'active');
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO invoices (subscription_id, customer_id, status, billing_period_start, billing_period_end,
                             invoice_date, due_date, customer_name, subtotal, grand_total)
       VALUES ($1, $2, $3, $4, $4, $5, $6, 'Notification customer', 100, 100) RETURNING id`,
      [subId, who.customerId, status, today, addDays(today, -10), due],
    );
    return rows[0].id;
  };
  const overdueId = await invoice(customer, addDays(today, -2));
  await invoice(customer, addDays(today, 3));
  await invoice(customer, addDays(today, 20)); // Outside reminder window.
  await invoice(customer, today, 'draft');
  await invoice(customer, today, 'cancelled');
  const renewalId = await subscription(customer, 'paused', addDays(today, 10));
  const quotationId = await subscription(customer, 'quotation');
  await subscription(customer, 'draft');
  await subscription(customer, 'closed', addDays(today, 5));
  await invoice(otherCustomer, addDays(today, -1));
  await subscription(otherCustomer, 'quotation');
  return { staff, otherStaff, customer, otherCustomer, overdueId, renewalId, quotationId };
}

const inbox = (who: TestUser) => api().get('/api/notifications').set(who.auth);
const markRead = (who: TestUser, id: string) => api().put(`/api/notifications/${encodeURIComponent(id)}/read`).set(who.auth);

describe('role-scoped notifications', () => {
  it('shows only relevant reminders for the customer and assigned staff, with role-specific detail links', async () => {
    const s = await scenario();
    const customer = await inbox(s.customer);
    expect(customer.status).toBe(200);
    expect(customer.body.total).toBe(4);
    expect(customer.body.unreadCount).toBe(4);
    expect(customer.body.data.map((n: Item) => n.type).sort()).toEqual(['due', 'overdue', 'quotation', 'renewal']);
    expect(customer.body.data.every((n: Item) => n.href.startsWith('/portal/'))).toBe(true);
    expect(customer.body.data.find((n: Item) => n.type === 'renewal').href).toBe(`/portal/subscriptions/${s.renewalId}`);
    const staff = await inbox(s.staff);
    expect(staff.body.data.map((n: Item) => n.id).sort()).toEqual(customer.body.data.map((n: Item) => n.id).sort());
    expect(staff.body.data.every((n: Item) => n.href.startsWith('/app/'))).toBe(true);
    const other = await inbox(s.otherStaff);
    expect(other.body.total).toBe(2);
    expect(other.body.data.some((n: Item) => customer.body.data.some((c: Item) => c.id === n.id))).toBe(false);
  });

  it('persists individual and bulk reads only for the requesting user', async () => {
    const s = await scenario();
    const first = (await inbox(s.customer)).body.data[0] as Item;
    expect((await markRead(s.customer, first.id)).status).toBe(204);
    expect((await markRead(s.customer, first.id)).status).toBe(204);
    const refreshed = await inbox(s.customer);
    expect(refreshed.body.unreadCount).toBe(3);
    expect(refreshed.body.data.find((n: Item) => n.id === first.id).readAt).toBeTruthy();
    expect((await inbox(s.staff)).body.unreadCount).toBe(4);
    expect((await api().put('/api/notifications/read-all').set(s.staff.auth)).status).toBe(204);
    expect((await inbox(s.staff)).body.unreadCount).toBe(0);
    expect((await inbox(s.customer)).body.unreadCount).toBe(3);
  });

  it('rechecks ownership on read writes and after staff reassignment', async () => {
    const s = await scenario();
    const first = (await inbox(s.customer)).body.data[0] as Item;
    expect((await markRead(s.otherCustomer, first.id)).status).toBe(404);
    expect((await markRead(s.otherStaff, first.id)).status).toBe(404);
    await pool.query('UPDATE customers SET assigned_staff_id = $2 WHERE id = $1', [s.customer.customerId, s.otherStaff.id]);
    expect((await inbox(s.staff)).body.total).toBe(0);
    expect((await markRead(s.staff, first.id)).status).toBe(404);
    expect((await inbox(s.otherStaff)).body.total).toBe(6);
    expect((await markRead(s.otherStaff, first.id)).status).toBe(204);
    expect((await inbox(s.customer)).body.unreadCount).toBe(4);
  });

  it('drops resolved invoice reminders and requires an authenticated session', async () => {
    const s = await scenario();
    await pool.query("UPDATE invoices SET status = 'paid', amount_paid = grand_total WHERE id = $1", [s.overdueId]);
    expect((await inbox(s.customer)).body.data.some((n: Item) => n.type === 'overdue')).toBe(false);
    expect((await api().get('/api/notifications')).status).toBe(401);
    expect((await api().put('/api/notifications/read-all')).status).toBe(401);
  });
});
