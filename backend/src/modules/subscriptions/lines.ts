import type pg from 'pg';
import { badRequest } from '../../lib/errors.js';
import { lineAmounts, sumAmounts, type LineAmounts } from '../../lib/money.js';
import type { Plan } from '../plans/routes.js';

export interface LineInput {
  productId: number;
  variantId?: number | null;
  quantity: number;
  unitPrice?: number | null;
  taxRate?: number;
  description?: string | null;
}

export interface BuiltLine extends LineAmounts {
  lineType: 'plan' | 'product';
  productId: number | null;
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  sortOrder: number;
}

interface ProductRow {
  id: number;
  name: string;
  salesPrice: number;
  isActive: boolean;
}

interface VariantRow {
  id: number;
  productId: number;
  attribute: string;
  value: string;
  extraPrice: number;
  isActive: boolean;
}

/** Validates product/variant references and loads catalogue prices for a set of line inputs. */
export async function loadCatalog(client: pg.PoolClient | pg.Pool, inputs: LineInput[]) {
  const productIds = [...new Set(inputs.map((l) => l.productId))];
  const variantIds = [...new Set(inputs.map((l) => l.variantId).filter((v): v is number => !!v))];
  const products = await client.query<ProductRow>(
    `SELECT id, name, sales_price AS "salesPrice", is_active AS "isActive" FROM products WHERE id = ANY($1::int[])`,
    [productIds],
  );
  const variants = await client.query<VariantRow>(
    `SELECT id, product_id AS "productId", attribute, value, extra_price AS "extraPrice", is_active AS "isActive"
       FROM product_variants WHERE id = ANY($1::int[])`,
    [variantIds],
  );
  const productMap = new Map(products.rows.map((p) => [p.id, p]));
  const variantMap = new Map(variants.rows.map((v) => [v.id, v]));

  return inputs.map((input) => {
    const product = productMap.get(input.productId);
    if (!product || !product.isActive) throw badRequest(`Product #${input.productId} is not available`);
    const variant = input.variantId ? variantMap.get(input.variantId) : undefined;
    if (input.variantId && (!variant || variant.productId !== product.id || !variant.isActive)) {
      throw badRequest(`Variant #${input.variantId} is not available for ${product.name}`);
    }
    const listPrice = Math.round((product.salesPrice + (variant?.extraPrice ?? 0)) * 100) / 100;
    const label = `${product.name}${variant ? ` (${variant.attribute}: ${variant.value})` : ''}`;
    return { input, product, variant, listPrice, label };
  });
}

/**
 * Prices subscription lines: product price + variant extra (unless overridden), taxes and totals.
 * A 'plan' line carrying the plan's recurring fee is added first when the plan has a price.
 */
export async function buildLines(client: pg.PoolClient | pg.Pool, plan: Plan, inputs: LineInput[]) {
  const priced = await loadCatalog(client, inputs);

  const productQuantity = inputs.reduce((sum, l) => sum + l.quantity, 0);
  if (plan.minQuantity > 1 && productQuantity < plan.minQuantity) {
    throw badRequest(`Plan "${plan.name}" requires a minimum quantity of ${plan.minQuantity} (currently ${productQuantity})`);
  }

  const lines: BuiltLine[] = [];
  if (plan.price > 0) {
    lines.push({
      lineType: 'plan',
      productId: null,
      variantId: null,
      description: `${plan.name} plan (${plan.billingInterval})`,
      quantity: 1,
      unitPrice: plan.price,
      taxRate: 0,
      sortOrder: 0,
      ...lineAmounts(1, plan.price, 0),
    });
  }
  priced.forEach(({ input, product, variant, listPrice, label }, index) => {
    const unitPrice = input.unitPrice ?? listPrice;
    const taxRate = input.taxRate ?? 0;
    lines.push({
      lineType: 'product',
      productId: product.id,
      variantId: variant?.id ?? null,
      description: input.description?.trim() || label,
      quantity: input.quantity,
      unitPrice,
      taxRate,
      sortOrder: index + 1,
      ...lineAmounts(input.quantity, unitPrice, taxRate),
    });
  });
  return { lines, totals: sumAmounts(lines) };
}

/** Replaces all lines of a subscription and stores the recalculated totals. */
export async function saveLines(client: pg.PoolClient, subscriptionId: number, built: Awaited<ReturnType<typeof buildLines>>) {
  await client.query('DELETE FROM subscription_lines WHERE subscription_id = $1', [subscriptionId]);
  for (const l of built.lines) {
    await client.query(
      `INSERT INTO subscription_lines (subscription_id, line_type, product_id, variant_id, description, quantity, unit_price,
                                       tax_rate, subtotal, tax_amount, total, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [subscriptionId, l.lineType, l.productId, l.variantId, l.description, l.quantity, l.unitPrice, l.taxRate, l.subtotal, l.taxAmount, l.total, l.sortOrder],
    );
  }
  await client.query('UPDATE subscriptions SET subtotal = $2, tax_total = $3, total = $4, updated_at = now() WHERE id = $1', [
    subscriptionId,
    built.totals.subtotal,
    built.totals.taxAmount,
    built.totals.total,
  ]);
}
