import type { z } from 'zod';
import { withTransaction } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { assertCustomerAccess } from '../../lib/customer-access.js';
import { addDays, todayIso } from '../../lib/dates.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { lineAmounts, sumAmounts } from '../../lib/money.js';
import { billSubscriptionInTransaction } from '../billing/engine.js';
import { getPlan } from '../plans/routes.js';
import type { AuthUser } from '../../middleware/auth.js';
import { loadCatalog, type BuiltLine } from './lines.js';
import type { updateAddonsInput } from './schemas.js';
import { assertInternal, getSubscription } from './service.js';

interface StoredLine extends BuiltLine { id: number; productType: string | null }
const key = (line: {productId: number | null; variantId?: number | null}) => `${line.productId}:${line.variantId ?? ''}`;

/** Changes only add-ons. Base contract prices and invoice snapshots stay fixed. */
export async function updateAddons(id: number, input: z.infer<typeof updateAddonsInput>, actor: AuthUser) {
  assertInternal(actor);
  return withTransaction(async (client) => {
    const { rows: subscriptions } = await client.query<{ customerId: number; planId: number; status: string; pausedDate: string | null }>(
      'SELECT customer_id AS "customerId", plan_id AS "planId", status, paused_at::date AS "pausedDate" FROM subscriptions WHERE id=$1 FOR UPDATE', [id],
    );
    const sub = subscriptions[0];
    if (!sub) throw notFound('Subscription not found');
    await assertCustomerAccess(sub.customerId, actor, client);
    if (!['active', 'paused'].includes(sub.status)) throw conflict('Add-ons can only be changed on active or paused subscriptions');
    const plan = await getPlan(sub.planId, client);
    const { rows } = await client.query<StoredLine>(
      `SELECT l.id, l.line_type AS "lineType", l.product_id AS "productId", l.variant_id AS "variantId", p.type AS "productType",
              l.description, l.quantity, l.unit_price AS "unitPrice", l.tax_rate AS "taxRate", l.sort_order AS "sortOrder",
              l.subtotal, l.tax_amount AS "taxAmount", l.total
         FROM subscription_lines l LEFT JOIN products p ON p.id=l.product_id
        WHERE l.subscription_id=$1 ORDER BY l.sort_order, l.id`, [id],
    );
    const base = rows.filter((l) => l.productType !== 'addon');
    const previous = rows.filter((l) => l.productType === 'addon');
    if (base.filter((l) => l.lineType === 'product').length + input.lines.length > 50) throw badRequest('A subscription can have at most 50 product lines');
    const products = await client.query<{ id: number; type: string }>('SELECT id, type FROM products WHERE id=ANY($1::int[])', [input.lines.map((l) => l.productId)]);
    if (input.lines.some((l) => !products.rows.some((p) => p.id === l.productId && p.type === 'addon'))) throw badRequest('Only add-on products can be changed here');
    const remaining = [...previous];
    const desired: (BuiltLine & { id?: number })[] = [];
    for (const line of input.lines) {
      const found = remaining.findIndex((l) => key(l) === key(line));
      if (found >= 0) {
        const old = remaining.splice(found, 1)[0];
        desired.push({ ...old, quantity: line.quantity, ...lineAmounts(line.quantity, old.unitPrice, old.taxRate) });
      } else {
        const [priced] = await loadCatalog(client, [line]);
        desired.push({ lineType: 'product', productId: line.productId, variantId: line.variantId ?? null, description: priced.label,
          quantity: line.quantity, unitPrice: priced.listPrice, taxRate: 0, sortOrder: 0, ...lineAmounts(line.quantity, priced.listPrice, 0) });
      }
    }
    const lines = [...base, ...desired];
    const quantity = lines.filter((l) => l.lineType === 'product').reduce((sum, l) => sum + l.quantity, 0);
    if (plan.minQuantity > 1 && quantity < plan.minQuantity) throw badRequest(`Plan "${plan.name}" requires a minimum quantity of ${plan.minQuantity}`);
    if (!lines.length) throw badRequest('A subscription must have at least one line');
    // Flush the old contract first so editing today cannot reprice earlier unbilled periods.
    await billSubscriptionInTransaction(client, id, todayIso(), { actorId: actor.id, includePausedBeforePause: true });
    const cursor = await client.query<{ next: string | null }>('SELECT next_billing_date AS next FROM subscriptions WHERE id=$1', [id]);
    const through = sub.status === 'paused' && sub.pausedDate ? (addDays(sub.pausedDate, -1) < todayIso() ? addDays(sub.pausedDate, -1) : todayIso()) : todayIso();
    if (cursor.rows[0].next && cursor.rows[0].next <= through) throw conflict('Run billing to clear the overdue periods before changing add-ons');
    await client.query('DELETE FROM subscription_lines WHERE subscription_id=$1 AND id=ANY($2::int[])', [id, remaining.map((l) => l.id)]);
    const firstSort = Math.max(0, ...base.map((l) => l.sortOrder)) + 1;
    for (const [index, line] of desired.entries()) {
      if (line.id) {
        await client.query('UPDATE subscription_lines SET quantity=$2, subtotal=$3, tax_amount=$4, total=$5, sort_order=$6 WHERE id=$1',
          [line.id, line.quantity, line.subtotal, line.taxAmount, line.total, firstSort + index]);
      } else {
        await client.query(`INSERT INTO subscription_lines (subscription_id,line_type,product_id,variant_id,description,quantity,unit_price,tax_rate,subtotal,tax_amount,total,sort_order)
          VALUES ($1,'product',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id,line.productId,line.variantId,line.description,line.quantity,line.unitPrice,line.taxRate,line.subtotal,line.taxAmount,line.total,firstSort + index]);
      }
    }
    const totals = sumAmounts(lines);
    await client.query('UPDATE subscriptions SET subtotal=$2,tax_total=$3,total=$4,updated_at=now() WHERE id=$1', [id,totals.subtotal,totals.taxAmount,totals.total]);
    await logAudit(actor.id, 'subscription.addons_updated', 'subscription', id, { before: previous.map((l) => ({productId:l.productId,variantId:l.variantId,quantity:l.quantity})), after:input.lines }, client);
    return getSubscription(id, actor, client);
  });
}
