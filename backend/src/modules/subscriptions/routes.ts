import { Router } from 'express';
import { query } from '../../db/pool.js';
import { customerScope } from '../../lib/customer-access.js';
import { idParamSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin, requireInternal } from '../../middleware/auth.js';
import {
  createSubscriptionInput,
  fromTemplateInput,
  listSubscriptionsQuery,
  reasonInput,
  renewInput,
  statusInput,
  updateSubscriptionInput,
} from './schemas.js';
import {
  closeExpiredSubscriptions,
  createFromTemplate,
  createSubscription,
  getSubscription,
  listSubscriptions,
  renew,
  transition,
  updateSubscription,
} from './service.js';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(authenticate);

/** Dropdown data for the quotation/subscription forms. */
subscriptionsRouter.get('/lookups', requireInternal, async (req, res) => {
  const params: unknown[] = [];
  const scope = customerScope(currentUser(req), 'c.id', params);
  const [customers, plans, products, variants, templates] = await Promise.all([
    query(`SELECT c.id, c.company_name AS "companyName" FROM customers c WHERE c.is_active AND ${scope} ORDER BY c.company_name LIMIT 1000`, params),
    query(
      `SELECT id, name, billing_interval AS "billingInterval", price, min_quantity AS "minQuantity",
              start_date AS "startDate", end_date AS "endDate"
         FROM plans WHERE is_active ORDER BY name`,
    ),
    query(`SELECT id, name, type, sales_price AS "salesPrice" FROM products WHERE is_active ORDER BY name`),
    query(
      `SELECT v.id, v.product_id AS "productId", v.attribute, v.value, v.extra_price AS "extraPrice"
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.is_active AND p.is_active ORDER BY v.attribute, v.value`,
    ),
    query(`SELECT id, name, plan_id AS "planId", validity_days AS "validityDays" FROM quotation_templates WHERE is_active ORDER BY name`),
  ]);
  res.json({
    customers: customers.rows,
    plans: plans.rows,
    products: products.rows.map((p) => ({ ...p, variants: variants.rows.filter((v) => v.productId === p.id) })),
    templates: templates.rows,
  });
});

subscriptionsRouter.post('/close-expired', requireAdmin, async (req, res) => {
  const closed = await closeExpiredSubscriptions(undefined, currentUser(req).id);
  res.json({ closed: closed.length, subscriptions: closed });
});

subscriptionsRouter.get('/', async (req, res) => {
  res.json(await listSubscriptions(currentUser(req), listSubscriptionsQuery.parse(req.query)));
});

subscriptionsRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getSubscription(id, currentUser(req)));
});

subscriptionsRouter.post('/', requireInternal, async (req, res) => {
  res.status(201).json(await createSubscription(createSubscriptionInput.parse(req.body), currentUser(req)));
});

subscriptionsRouter.post('/from-template', requireInternal, async (req, res) => {
  res.status(201).json(await createFromTemplate(fromTemplateInput.parse(req.body), currentUser(req)));
});

subscriptionsRouter.put('/:id', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await updateSubscription(id, updateSubscriptionInput.parse(req.body), currentUser(req)));
});

subscriptionsRouter.put('/:id/status', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { status, reason } = statusInput.parse(req.body);
  res.json(await transition(id, status, currentUser(req), reason));
});

subscriptionsRouter.post('/:id/pause', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await transition(id, 'paused', currentUser(req), reasonInput.parse(req.body ?? {}).reason));
});

subscriptionsRouter.post('/:id/resume', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await transition(id, 'active', currentUser(req)));
});

subscriptionsRouter.post('/:id/renew', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await renew(id, renewInput.parse(req.body ?? {}).periods, currentUser(req)));
});

subscriptionsRouter.post('/:id/close', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await transition(id, 'closed', currentUser(req), reasonInput.parse(req.body ?? {}).reason));
});

subscriptionsRouter.post('/:id/cancel', requireInternal, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await transition(id, 'cancelled', currentUser(req), reasonInput.parse(req.body ?? {}).reason));
});
