import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { idParamSchema, idSchema, paged, paginate } from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';
import { createProductInput, listProductsQuery, productInput, variantInput } from './schemas.js';
import { assertVariantBelongs, getProduct, PRODUCT_COLUMNS, type Product } from './service.js';

export const productsRouter = Router();
productsRouter.use(authenticate, requireInternal);

productsRouter.get('/', async (req, res) => {
  const q = listProductsQuery.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (!q.includeInactive) where.push('p.is_active');
  if (q.type) {
    params.push(q.type);
    where.push(`p.type = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`p.name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, offset } = paginate(q);

  const [{ rows }, count] = await Promise.all([
    query<Product>(
      `SELECT ${PRODUCT_COLUMNS},
              (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active)::int AS "variantCount"
         FROM products p ${whereSql}
        ORDER BY p.name
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM products p ${whereSql}`, params),
  ]);
  res.json(paged(rows, count.rows[0].total, q.page, q.pageSize));
});

productsRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getProduct(id));
});

productsRouter.post('/', requireAdmin, async (req, res) => {
  const input = createProductInput.parse(req.body);
  const user = currentUser(req);
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO products (name, type, sales_price, cost_price, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.name, input.type, input.salesPrice, input.costPrice, input.notes, input.isActive],
    );
    const productId = rows[0].id;
    for (const v of input.variants) {
      await client.query(
        `INSERT INTO product_variants (product_id, attribute, value, extra_price, is_active) VALUES ($1, $2, $3, $4, $5)`,
        [productId, v.attribute, v.value, v.extraPrice, v.isActive],
      );
    }
    await logAudit(user.id, 'product.created', 'product', productId, { name: input.name }, client);
    return productId;
  });
  res.status(201).json(await getProduct(id));
});

productsRouter.put('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = productInput.parse(req.body);
  await getProduct(id);
  await query(
    `UPDATE products SET name = $2, type = $3, sales_price = $4, cost_price = $5, notes = $6, is_active = $7, updated_at = now()
      WHERE id = $1`,
    [id, input.name, input.type, input.salesPrice, input.costPrice, input.notes, input.isActive],
  );
  await logAudit(currentUser(req).id, 'product.updated', 'product', id, { name: input.name });
  res.json(await getProduct(id));
});

/** Products referenced by subscriptions cannot be deleted, so "delete" archives them. */
productsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await getProduct(id);
  await query('UPDATE products SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
  await logAudit(currentUser(req).id, 'product.archived', 'product', id);
  res.status(204).end();
});

productsRouter.post('/:id/variants', requireAdmin, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = variantInput.parse(req.body);
  await getProduct(id);
  await query(`INSERT INTO product_variants (product_id, attribute, value, extra_price, is_active) VALUES ($1, $2, $3, $4, $5)`, [
    id,
    input.attribute,
    input.value,
    input.extraPrice,
    input.isActive,
  ]);
  await logAudit(currentUser(req).id, 'product.variant_added', 'product', id, { attribute: input.attribute, value: input.value });
  res.status(201).json(await getProduct(id));
});

const variantParams = z.object({ id: idSchema, variantId: idSchema });

productsRouter.put('/:id/variants/:variantId', requireAdmin, async (req, res) => {
  const { id, variantId } = variantParams.parse(req.params);
  const input = variantInput.parse(req.body);
  await assertVariantBelongs(id, variantId);
  await query(
    `UPDATE product_variants SET attribute = $2, value = $3, extra_price = $4, is_active = $5, updated_at = now() WHERE id = $1`,
    [variantId, input.attribute, input.value, input.extraPrice, input.isActive],
  );
  res.json(await getProduct(id));
});

productsRouter.delete('/:id/variants/:variantId', requireAdmin, async (req, res) => {
  const { id, variantId } = variantParams.parse(req.params);
  await assertVariantBelongs(id, variantId);
  await query('UPDATE product_variants SET is_active = FALSE, updated_at = now() WHERE id = $1', [variantId]);
  res.json(await getProduct(id));
});
