import { query, type DbClient } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';

export interface Variant {
  id: number;
  productId: number;
  attribute: string;
  value: string;
  extraPrice: number;
  finalPrice: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  name: string;
  type: string;
  salesPrice: number;
  costPrice: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variantCount?: number;
  variants?: Variant[];
}

export const PRODUCT_COLUMNS = `
  p.id, p.name, p.type, p.sales_price AS "salesPrice", p.cost_price AS "costPrice", p.notes,
  p.is_active AS "isActive", p.created_at AS "createdAt", p.updated_at AS "updatedAt"`;

export const VARIANT_COLUMNS = `
  v.id, v.product_id AS "productId", v.attribute, v.value, v.extra_price AS "extraPrice",
  (p.sales_price + v.extra_price)::numeric(12,2) AS "finalPrice", v.is_active AS "isActive"`;

export async function getVariants(productIds: number[], client?: DbClient) {
  if (productIds.length === 0) return [];
  const { rows } = await query<Variant>(
    `SELECT ${VARIANT_COLUMNS}
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.product_id = ANY($1::int[])
      ORDER BY v.attribute, v.value`,
    [productIds],
    client,
  );
  return rows;
}

export async function getProduct(id: number, client?: DbClient): Promise<Product> {
  const { rows } = await query<Product>(`SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.id = $1`, [id], client);
  if (!rows[0]) throw notFound('Product not found');
  return { ...rows[0], variants: await getVariants([id], client) };
}

export async function assertVariantBelongs(productId: number, variantId: number, client?: DbClient) {
  const { rowCount } = await query('SELECT 1 FROM product_variants WHERE id = $1 AND product_id = $2', [variantId, productId], client);
  if (!rowCount) throw notFound('Variant not found for this product');
}
