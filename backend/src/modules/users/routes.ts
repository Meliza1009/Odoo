import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { booleanQuery, emailSchema, idParamSchema, nameSchema, paged, paginate, paginationSchema, passwordSchema } from '../../lib/validation.js';
import { authenticate, currentUser, requireAdmin } from '../../middleware/auth.js';
import { hashPassword, USER_COLUMNS, type UserProfile } from '../auth/service.js';

const INTERNAL_ROLES = ['admin', 'staff'] as const;

const createInput = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(INTERNAL_ROLES, { error: 'Role must be admin or staff' }),
});

const updateInput = z.object({
  fullName: nameSchema,
  role: z.enum(INTERNAL_ROLES, { error: 'Role must be admin or staff' }),
  isActive: z.boolean().default(true),
});

const passwordInput = z.object({ password: passwordSchema });

const listQuery = paginationSchema.extend({
  role: z.enum(INTERNAL_ROLES).optional(),
  includeInactive: booleanQuery,
});

type StaffUser = Omit<UserProfile, 'customer'>;

async function getStaffUser(id: number): Promise<StaffUser> {
  const { rows } = await query<StaffUser>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1 AND u.role IN ('admin', 'staff')`, [id]);
  if (!rows[0]) throw notFound('Staff member not found');
  return rows[0];
}

/** The system must always keep at least one active admin who can manage everyone else. */
async function assertNotLastAdmin(id: number) {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active AND id <> $1`, [id]);
  if (rows[0].n === 0) throw badRequest('Cannot remove the last active admin');
}

/** Staff accounts (admin and staff roles). Customers are managed through /api/customers. */
export const usersRouter = Router();
usersRouter.use(authenticate, requireAdmin);

usersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where = [`u.role IN ('admin', 'staff')`];
  const params: unknown[] = [];
  if (!q.includeInactive) where.push('u.is_active');
  if (q.role) {
    params.push(q.role);
    where.push(`u.role = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const { limit, offset } = paginate(q);
  const [{ rows }, count] = await Promise.all([
    query<StaffUser>(`SELECT ${USER_COLUMNS} FROM users u ${whereSql} ORDER BY u.role, u.full_name LIMIT ${limit} OFFSET ${offset}`, params),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM users u ${whereSql}`, params),
  ]);
  res.json(paged(rows, count.rows[0].total, q.page, q.pageSize));
});

usersRouter.get('/:id', async (req, res) => {
  res.json(await getStaffUser(idParamSchema.parse(req.params).id));
});

usersRouter.post('/', async (req, res) => {
  const input = createInput.parse(req.body);
  const taken = await query('SELECT 1 FROM users WHERE email = $1', [input.email]);
  if (taken.rowCount) throw conflict('An account with this email already exists');
  const { rows } = await query<{ id: number }>(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.email, await hashPassword(input.password), input.fullName, input.role],
  );
  await logAudit(currentUser(req).id, 'user.created', 'user', rows[0].id, { email: input.email, role: input.role });
  res.status(201).json(await getStaffUser(rows[0].id));
});

usersRouter.put('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateInput.parse(req.body);
  const actor = currentUser(req);
  const current = await getStaffUser(id);
  if (id === actor.id && (input.role !== 'admin' || !input.isActive)) throw badRequest('You cannot demote or deactivate your own account');
  if (current.role === 'admin' && (input.role !== 'admin' || !input.isActive)) await assertNotLastAdmin(id);
  await query('UPDATE users SET full_name = $2, role = $3, is_active = $4, updated_at = now() WHERE id = $1', [id, input.fullName, input.role, input.isActive]);
  await logAudit(actor.id, 'user.updated', 'user', id, { role: input.role, isActive: input.isActive });
  res.json(await getStaffUser(id));
});

usersRouter.post('/:id/reset-password', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { password } = passwordInput.parse(req.body);
  await getStaffUser(id);
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, await hashPassword(password)]);
  await logAudit(currentUser(req).id, 'user.password_reset_by_admin', 'user', id);
  res.status(204).end();
});

usersRouter.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const actor = currentUser(req);
  if (id === actor.id) throw badRequest('You cannot deactivate your own account');
  const current = await getStaffUser(id);
  if (current.role === 'admin') await assertNotLastAdmin(id);
  await query('UPDATE users SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);
  await logAudit(actor.id, 'user.deactivated', 'user', id);
  res.status(204).end();
});
