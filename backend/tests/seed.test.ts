import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { seed } from '../src/db/seed.js';
import { closeDatabase, resetDatabase } from './helpers.js';

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe('seed', () => {
  it('creates the demo catalogue and is safe to run twice', async () => {
    await seed(() => undefined);
    await seed(() => undefined);

    const counts = await pool.query<{ products: number; variants: number; plans: number; templates: number; lines: number }>(
      `SELECT (SELECT count(*) FROM products)::int AS products,
              (SELECT count(*) FROM product_variants)::int AS variants,
              (SELECT count(*) FROM plans)::int AS plans,
              (SELECT count(*) FROM quotation_templates)::int AS templates,
              (SELECT count(*) FROM quotation_template_lines)::int AS lines`,
    );
    expect(counts.rows[0]).toEqual({ products: 3, variants: 3, plans: 3, templates: 2, lines: 4 });

    const odoo = await pool.query<{ price: number }>(
      `SELECT p.sales_price + v.extra_price AS price
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE p.name = 'Business Software' AND v.value = 'Odoo'`,
    );
    expect(odoo.rows[0].price).toBe(2560);
  });
});
