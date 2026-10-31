import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { customerScope } from '../../lib/customer-access.js';
import { notFound } from '../../lib/errors.js';
import { authenticate, currentUser, type AuthUser } from '../../middleware/auth.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

/** Build the same live, authorized set for listing and marking items read. */
function activeNotifications(user: AuthUser, params: unknown[]) {
  const scope = customerScope(user, 'e.customer_id', params);
  return `WITH events AS (
    SELECT (CASE WHEN i.due_date < CURRENT_DATE THEN 'overdue:' ELSE 'due:' END)
             || i.id || ':' || i.due_date AS key,
           CASE WHEN i.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due' END AS type,
           i.customer_id, 'invoices' AS resource, i.id AS resource_id,
           i.invoice_number AS reference, i.due_date AS date
      FROM invoices i
     WHERE i.status = 'confirmed' AND i.amount_due > 0
       AND i.due_date <= CURRENT_DATE + 7
    UNION ALL
    SELECT 'renewal:' || s.id || ':' || s.expiry_date, 'renewal',
           s.customer_id, 'subscriptions', s.id, s.subscription_number, s.expiry_date
      FROM subscriptions s
     WHERE s.status IN ('active', 'paused') AND s.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    UNION ALL
    SELECT 'quotation:' || s.id || ':' || COALESCE(s.quotation_valid_until::text, 'open'), 'quotation',
           s.customer_id, 'subscriptions', s.id, s.subscription_number,
           COALESCE(s.quotation_valid_until, s.created_at::date)
      FROM subscriptions s
     WHERE s.status = 'quotation'
       AND (s.quotation_valid_until IS NULL OR s.quotation_valid_until >= CURRENT_DATE)
  ), visible AS (SELECT e.* FROM events e WHERE ${scope})`;
}

interface NotificationRow {
  key: string;
  type: 'overdue' | 'due' | 'renewal' | 'quotation';
  resource: string;
  resource_id: number;
  reference: string;
  date: string;
  readAt: string | null;
  total: number;
  unreadCount: number;
}

notificationsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const params: unknown[] = [];
  const cte = activeNotifications(user, params);
  params.push(user.id);
  const { rows } = await query<NotificationRow>(`${cte}
    SELECT e.*, r.read_at AS "readAt", COUNT(*) OVER () AS total,
           COUNT(*) FILTER (WHERE r.read_at IS NULL) OVER () AS "unreadCount"
      FROM visible e
      LEFT JOIN notification_reads r ON r.notification_key = e.key AND r.user_id = $${params.length}
     ORDER BY (r.read_at IS NULL) DESC, CASE e.type WHEN 'overdue' THEN 0 ELSE 1 END,
              e.date, e.key
     LIMIT 100`, params);
  const titles = { overdue: 'Overdue invoice', due: 'Invoice due soon', renewal: 'Subscription expires soon', quotation: 'Quotation ready' };
  const base = user.role === 'customer' ? '/portal' : '/app';
  res.json({
    data: rows.map((row) => ({
      id: row.key,
      type: row.type,
      title: titles[row.type],
      message: row.type === 'quotation'
        ? `${row.reference} is ready to review.`
        : `${row.reference} ${row.type === 'renewal' ? 'expires' : row.type === 'overdue' ? 'was due' : 'is due'} on ${row.date}.`,
      date: row.date,
      href: `${base}/${row.resource}/${row.resource_id}`,
      readAt: row.readAt,
    })),
    total: rows[0]?.total ?? 0,
    unreadCount: rows[0]?.unreadCount ?? 0,
  });
});

notificationsRouter.put('/read-all', async (req, res) => {
  const user = currentUser(req);
  const params: unknown[] = [];
  const cte = activeNotifications(user, params);
  params.push(user.id);
  await query(`${cte}
    INSERT INTO notification_reads (user_id, notification_key)
      SELECT $${params.length}, key FROM visible
    ON CONFLICT (user_id, notification_key) DO NOTHING`, params);
  res.status(204).send();
});

notificationsRouter.put('/:id/read', async (req, res) => {
  const user = currentUser(req);
  const { id } = z.object({ id: z.string().min(1).max(160) }).parse(req.params);
  const params: unknown[] = [];
  const cte = activeNotifications(user, params);
  params.push(user.id, id);
  const { rows } = await query(`${cte}
    INSERT INTO notification_reads (user_id, notification_key)
      SELECT $${params.length - 1}, key FROM visible WHERE key = $${params.length}
    ON CONFLICT (user_id, notification_key) DO UPDATE SET read_at = notification_reads.read_at
    RETURNING notification_key`, params);
  if (!rows.length) throw notFound('Notification not found');
  res.status(204).send();
});
