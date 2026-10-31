import type pg from 'pg';
import { addDays, addInterval, todayIso } from '../../lib/dates.js';
import { billSubscription } from '../../modules/billing/engine.js';
import { getPlan } from '../../modules/plans/routes.js';
import { buildLines, saveLines } from '../../modules/subscriptions/lines.js';
import { pool, withTransaction } from '../pool.js';

/** Demo tax rules and discount rules. Idempotent (matched by name). */
export async function seedBillingRules(client: pg.PoolClient) {
  const taxRules = [
    { name: 'GST 18%', rate: 18, appliesTo: 'all', productType: null },
    { name: 'GST 12% (goods)', rate: 12, appliesTo: 'product_type', productType: 'goods' },
  ];
  for (const t of taxRules) {
    const exists = await client.query('SELECT 1 FROM tax_rules WHERE name = $1', [t.name]);
    if (exists.rowCount) continue;
    await client.query('INSERT INTO tax_rules (name, rate, applies_to, product_type) VALUES ($1, $2, $3, $4)', [t.name, t.rate, t.appliesTo, t.productType]);
  }

  const today = todayIso();
  const software = await client.query<{ id: number }>(`SELECT id FROM products WHERE lower(name) = 'business software'`);
  const discounts = [
    {
      name: 'Volume seats 10%',
      discountType: 'percentage',
      value: 10,
      minQuantity: 10,
      minPurchase: 0,
      usageLimit: 50,
      scope: 'product',
      endDate: addDays(today, 180),
      productIds: software.rows.map((r) => r.id),
    },
    { name: 'Welcome offer ₹500', discountType: 'fixed_amount', value: 500, minQuantity: 0, minPurchase: 2000, usageLimit: 100, scope: 'subscription', endDate: addDays(today, 60), productIds: [] },
  ];
  for (const d of discounts) {
    if (d.scope === 'product' && d.productIds.length === 0) continue;
    const exists = await client.query('SELECT 1 FROM discounts WHERE name = $1', [d.name]);
    if (exists.rowCount) continue;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO discounts (name, discount_type, value, min_quantity, min_purchase, usage_limit, scope, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [d.name, d.discountType, d.value, d.minQuantity, d.minPurchase, d.usageLimit, d.scope, today, d.endDate],
    );
    for (const productId of d.productIds) {
      await client.query('INSERT INTO discount_products (discount_id, product_id) VALUES ($1, $2)', [rows[0].id, productId]);
    }
  }
}

async function payInvoice(invoiceId: number, amount: number, method: string, date: string) {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ customerId: number; amountDue: number }>(
      'SELECT customer_id AS "customerId", amount_due AS "amountDue" FROM invoices WHERE id = $1 FOR UPDATE',
      [invoiceId],
    );
    const paid = Math.min(amount, rows[0].amountDue);
    if (paid <= 0) return;
    await client.query(
      `INSERT INTO payments (invoice_id, customer_id, payment_method, amount, payment_date, reference_number, note)
       VALUES ($1, $2, $3, $4, $5, $6, 'Demo payment')`,
      [invoiceId, rows[0].customerId, method, paid, date, `DEMO-${invoiceId}`],
    );
    const fullyPaid = Math.round(paid * 100) === Math.round(rows[0].amountDue * 100);
    await client.query(
      `UPDATE invoices SET amount_paid = amount_paid + $2, status = $3, paid_at = ${fullyPaid ? 'now()' : 'NULL'} WHERE id = $1`,
      [invoiceId, paid, fullyPaid ? 'paid' : 'confirmed'],
    );
  });
}

/**
 * Demo subscriptions with a paid, an outstanding and an overdue customer, so the dashboard has data during judging.
 * Runs only when customers exist and no invoices have been created yet.
 */
export async function seedBillingDemo() {
  const invoices = await pool.query('SELECT 1 FROM invoices LIMIT 1');
  if (invoices.rowCount) return;
  const customers = await pool.query<{ id: number }>('SELECT id FROM customers WHERE is_active ORDER BY id LIMIT 3');
  const planRow = await pool.query<{ id: number }>(`SELECT id FROM plans WHERE lower(name) = 'business monthly'`);
  const products = await pool.query<{ id: number; name: string }>(`SELECT id, name FROM products WHERE lower(name) IN ('business software', 'analytics add-on')`);
  if (!customers.rowCount || !planRow.rowCount || products.rowCount !== 2) return;

  const plan = await getPlan(planRow.rows[0].id);
  const productId = (name: string) => products.rows.find((p) => p.name.toLowerCase() === name)!.id;
  const today = todayIso();
  const start = addInterval(today, 'monthly', -2);
  const scenarios = ['paid', 'outstanding', 'overdue'] as const;

  for (const [index, customer] of customers.rows.entries()) {
    const scenario = scenarios[index];
    const subscriptionId = await withTransaction(async (client) => {
      const built = await buildLines(client, plan, [
        { productId: productId('business software'), quantity: 5 },
        { productId: productId('analytics add-on'), quantity: 1 },
      ]);
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO subscriptions (customer_id, plan_id, status, start_date, next_billing_date, payment_terms_days,
                                    confirmed_at, activated_at, notes)
         VALUES ($1, $2, 'active', $3, $3, 15, now(), now(), 'Demo subscription') RETURNING id`,
        [customer.id, plan.id, start],
      );
      await saveLines(client, rows[0].id, built);
      return rows[0].id;
    });

    // The overdue customer was billed a month ago and never paid, so their invoices are past due.
    const runDate = scenario === 'overdue' ? addDays(today, -30) : today;
    const billed = await billSubscription(subscriptionId, runDate, { autoConfirm: true });
    const ids = billed.invoiceIds;
    if (scenario === 'paid') {
      for (const id of ids) await payInvoice(id, Number.MAX_SAFE_INTEGER, 'bank_transfer', today);
    } else if (scenario === 'outstanding') {
      for (const id of ids.slice(0, -1)) await payInvoice(id, Number.MAX_SAFE_INTEGER, 'card', today);
      const last = await pool.query<{ grandTotal: number }>('SELECT grand_total AS "grandTotal" FROM invoices WHERE id = $1', [ids.at(-1)]);
      if (ids.length) await payInvoice(ids.at(-1)!, Math.round(last.rows[0].grandTotal * 50) / 100, 'upi', today);
    }
  }
}
