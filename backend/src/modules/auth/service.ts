import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import { pool, query, type DbClient } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import type { Role } from '../../lib/jwt.js';

export interface CustomerProfile {
  id: number;
  userId: number | null;
  assignedStaffId: number | null;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  taxNumber: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  customer: CustomerProfile | null;
}

export const USER_COLUMNS = `u.id, u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive", u.created_at AS "createdAt"`;

export const CUSTOMER_COLUMNS = `
  c.id, c.user_id AS "userId", c.assigned_staff_id AS "assignedStaffId", c.company_name AS "companyName", c.contact_name AS "contactName", c.email, c.phone,
  c.billing_address AS "billingAddress", c.tax_number AS "taxNumber", c.is_active AS "isActive", c.created_at AS "createdAt"`;

/** The signed-in user as the frontend sees it: account fields plus the linked customer record for portal users. */
export async function getUserProfile(id: number, client: DbClient = pool): Promise<UserProfile> {
  const { rows } = await query<Omit<UserProfile, 'customer'>>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id], client);
  if (!rows[0]) throw notFound('User not found');
  const customer = await query<CustomerProfile>(`SELECT ${CUSTOMER_COLUMNS} FROM customers c WHERE c.user_id = $1`, [id], client);
  return { ...rows[0], customer: customer.rows[0] ?? null };
}

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Reset tokens are random secrets: only their SHA-256 hash is stored, so a database leak cannot be used to reset passwords. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const generateToken = () => randomBytes(32).toString('hex');
