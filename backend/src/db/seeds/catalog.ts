import type pg from 'pg';

/** Demo products (with the Odoo brand variant), plans and quotation templates. Idempotent. */
export async function seedCatalog(client: pg.PoolClient) {
  const products = [
    { name: 'Business Software', type: 'software', salesPrice: 2000, costPrice: 600, notes: 'Core subscription software licence, priced per seat.' },
    { name: 'Analytics Add-on', type: 'addon', salesPrice: 750, costPrice: 150, notes: 'Dashboards and exports, switch on or off at any time.' },
    { name: 'Support Package', type: 'service', salesPrice: 1500, costPrice: 900, notes: 'Priority email and phone support.' },
  ];
  const productIds: Record<string, number> = {};
  for (const p of products) {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO products (name, type, sales_price, cost_price, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lower(name)) DO UPDATE SET updated_at = products.updated_at
       RETURNING id`,
      [p.name, p.type, p.salesPrice, p.costPrice, p.notes],
    );
    productIds[p.name] = rows[0].id;
  }

  const variants = [
    { product: 'Business Software', attribute: 'Brand', value: 'Odoo', extraPrice: 560 },
    { product: 'Business Software', attribute: 'Brand', value: 'Standard', extraPrice: 0 },
    { product: 'Support Package', attribute: 'Hours', value: '24x7', extraPrice: 1000 },
  ];
  for (const v of variants) {
    await client.query(
      `INSERT INTO product_variants (product_id, attribute, value, extra_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, lower(attribute), lower(value)) DO NOTHING`,
      [productIds[v.product], v.attribute, v.value, v.extraPrice],
    );
  }

  const plans = [
    { name: 'Starter Monthly', interval: 'monthly', price: 499, min: 1, autoClose: false, closeEarly: true, pause: true, renew: true },
    { name: 'Business Monthly', interval: 'monthly', price: 1499, min: 5, autoClose: false, closeEarly: true, pause: true, renew: true },
    { name: 'Enterprise Yearly', interval: 'yearly', price: 14999, min: 10, autoClose: true, closeEarly: false, pause: false, renew: true },
  ];
  const planIds: Record<string, number> = {};
  for (const p of plans) {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO plans (name, billing_interval, price, min_quantity, auto_close_on_expiry, can_close_early, can_pause, can_renew)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (lower(name)) DO UPDATE SET updated_at = plans.updated_at
       RETURNING id`,
      [p.name, p.interval, p.price, p.min, p.autoClose, p.closeEarly, p.pause, p.renew],
    );
    planIds[p.name] = rows[0].id;
  }

  const { rows: odoo } = await client.query<{ id: number }>(
    `SELECT id FROM product_variants WHERE product_id = $1 AND value = 'Odoo'`,
    [productIds['Business Software']],
  );
  const templates = [
    {
      name: 'Enterprise Annual Bundle',
      plan: 'Enterprise Yearly',
      validityDays: 15,
      periods: 1,
      lines: [
        { product: 'Business Software', variantId: odoo[0]?.id ?? null, quantity: 10 },
        { product: 'Support Package', variantId: null, quantity: 1 },
      ],
    },
    {
      name: 'Small Business Starter',
      plan: 'Business Monthly',
      validityDays: 30,
      periods: 12,
      lines: [
        { product: 'Business Software', variantId: null, quantity: 5 },
        { product: 'Analytics Add-on', variantId: null, quantity: 1 },
      ],
    },
  ];
  for (const t of templates) {
    const existing = await client.query('SELECT 1 FROM quotation_templates WHERE lower(name) = lower($1)', [t.name]);
    if (existing.rowCount) continue;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO quotation_templates (name, plan_id, validity_days, contract_periods) VALUES ($1, $2, $3, $4) RETURNING id`,
      [t.name, planIds[t.plan], t.validityDays, t.periods],
    );
    for (const [index, l] of t.lines.entries()) {
      await client.query(
        `INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, sort_order) VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, productIds[l.product], l.variantId, l.quantity, index],
      );
    }
  }
}
