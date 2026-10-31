import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, withTransaction } from '../../db/pool.js';
import { logAudit } from '../../lib/audit.js';
import { badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { signToken, type Role } from '../../lib/jwt.js';
import { sendMail } from '../../lib/mailer.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { emailSchema, nameSchema, optionalText, passwordSchema } from '../../lib/validation.js';
import { authenticate, currentUser } from '../../middleware/auth.js';
import { generateToken, getUserProfile, hashPassword, hashToken, verifyPassword } from './service.js';

const registerInput = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  companyName: optionalText(200),
  phone: optionalText(40),
});

const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

const forgotInput = z.object({ email: emailSchema });

const resetInput = z.object({
  token: z.string().trim().min(32, 'Invalid reset token').max(256),
  password: passwordSchema,
});

const profileInput = z.object({
  fullName: nameSchema,
  companyName: optionalText(200),
  contactName: optionalText(120),
  phone: optionalText(40),
  billingAddress: optionalText(500),
  taxNumber: optionalText(60),
});

const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
  })
  .refine((p) => p.currentPassword !== p.newPassword, { message: 'New password must differ from the current one', path: ['newPassword'] });

interface Credentials {
  id: number;
  role: Role;
  passwordHash: string;
  isActive: boolean;
}

async function session(userId: number, role: Role) {
  return { token: signToken(userId, role), user: await getUserProfile(userId) };
}

const loginLimiter = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  keyFor: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  message: 'Too many login attempts. Try again in 15 minutes.',
});
const forgotLimiter = rateLimit({
  max: 5,
  windowMs: 15 * 60 * 1000,
  keyFor: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  message: 'Too many reset requests for this email. Try again in 15 minutes.',
});
const resetLimiter = rateLimit({ max: 20, windowMs: 15 * 60 * 1000 });

export const authRouter = Router();

/** Self-service sign-up creates a customer account (portal user) and its customer record in one go. */
authRouter.post('/register', async (req, res) => {
  const input = registerInput.parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const userId = await withTransaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
    if (existing.rowCount) throw conflict('An account with this email already exists');
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'customer') RETURNING id`,
      [input.email, passwordHash, input.fullName],
    );
    const id = rows[0].id;
    // Staff may already have created this customer (e.g. from a quotation); claim it instead of creating a duplicate.
    const unlinked = await client.query<{ id: number }>(
      `UPDATE customers SET user_id = $1, contact_name = COALESCE(contact_name, $2), phone = COALESCE(phone, $3), updated_at = now()
        WHERE email = $4 AND user_id IS NULL AND is_active RETURNING id`,
      [id, input.fullName, input.phone, input.email],
    );
    if (!unlinked.rowCount) {
      await client.query(
        `INSERT INTO customers (user_id, company_name, contact_name, email, phone) VALUES ($1, $2, $3, $4, $5)`,
        [id, input.companyName ?? input.fullName, input.fullName, input.email, input.phone],
      );
    }
    await logAudit(id, 'user.registered', 'user', id, { email: input.email, linkedCustomer: !!unlinked.rowCount }, client);
    return id;
  });
  res.status(201).json(await session(userId, 'customer'));
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginInput.parse(req.body);
  const { rows } = await query<Credentials>(
    `SELECT u.id, u.role, u.password_hash AS "passwordHash",
            (u.is_active AND COALESCE(c.is_active, TRUE)) AS "isActive"
       FROM users u LEFT JOIN customers c ON c.user_id = u.id WHERE u.email = $1`,
    [input.email],
  );
  const user = rows[0];
  // Same message for unknown email and wrong password so the endpoint cannot be used to enumerate accounts.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw unauthorized('This account has been deactivated. Contact Brightloop support.');
  await logAudit(user.id, 'user.logged_in', 'user', user.id);
  res.json(await session(user.id, user.role));
});

/** Tokens are stateless, so logout only records the event; the client discards the token. */
authRouter.post('/logout', authenticate, async (req, res) => {
  await logAudit(currentUser(req).id, 'user.logged_out', 'user', currentUser(req).id);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ user: await getUserProfile(currentUser(req).id) });
});

authRouter.put('/me', authenticate, async (req, res) => {
  const input = profileInput.parse(req.body);
  const user = currentUser(req);
  await withTransaction(async (client) => {
    await client.query('UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1', [user.id, input.fullName]);
    if (user.customerId) {
      await client.query(
        `UPDATE customers SET company_name = COALESCE($2, company_name), contact_name = $3, phone = $4, billing_address = $5,
                tax_number = $6, updated_at = now() WHERE id = $1`,
        [user.customerId, input.companyName, input.contactName ?? input.fullName, input.phone, input.billingAddress, input.taxNumber],
      );
    }
    await logAudit(user.id, 'user.profile_updated', 'user', user.id, {}, client);
  });
  res.json({ user: await getUserProfile(user.id) });
});

authRouter.put('/me/password', authenticate, async (req, res) => {
  const input = changePasswordInput.parse(req.body);
  const user = currentUser(req);
  const { rows } = await query<{ passwordHash: string }>('SELECT password_hash AS "passwordHash" FROM users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(input.currentPassword, rows[0].passwordHash))) throw badRequest('Current password is incorrect');
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [user.id, await hashPassword(input.newPassword)]);
  await logAudit(user.id, 'user.password_changed', 'user', user.id);
  res.status(204).end();
});

/** Always answers 202 so the response does not reveal whether an email is registered. */
authRouter.post('/forgot-password', forgotLimiter, async (req, res) => {
  const { email } = forgotInput.parse(req.body);
  const { rows } = await query<{ id: number; fullName: string }>(
    `SELECT id, full_name AS "fullName" FROM users WHERE email = $1 AND is_active`,
    [email],
  );
  if (rows[0]) {
    const token = generateToken();
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [rows[0].id, hashToken(token), String(config.passwordResetTtlMinutes)],
    );
    const link = `${config.frontendUrls[0]}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Reset your Brightloop password',
      text: [
        `Hello ${rows[0].fullName},`,
        '',
        `Use the link below to choose a new password. It expires in ${config.passwordResetTtlMinutes} minutes.`,
        link,
        '',
        'If you did not ask for a reset, you can ignore this email.',
      ].join('\n'),
    });
    await logAudit(rows[0].id, 'user.password_reset_requested', 'user', rows[0].id);
  }
  res.status(202).json({ message: 'If that email is registered, a reset link has been sent.' });
});

authRouter.post('/reset-password', resetLimiter, async (req, res) => {
  const input = resetInput.parse(req.body);
  const userId = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number; userId: number }>(
      `SELECT id, user_id AS "userId" FROM password_reset_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [hashToken(input.token)],
    );
    if (!rows[0]) throw badRequest('This reset link is invalid or has expired. Request a new one.');
    await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [rows[0].userId, await hashPassword(input.password)]);
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [rows[0].userId]);
    await logAudit(rows[0].userId, 'user.password_reset', 'user', rows[0].userId, {}, client);
    return rows[0].userId;
  });
  const { rows } = await query<{ role: Role }>('SELECT role FROM users WHERE id = $1', [userId]);
  res.json(await session(userId, rows[0].role));
});
