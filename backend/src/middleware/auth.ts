import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken, type Role } from '../lib/jwt.js';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  customerId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let userId: number;
  try {
    userId = Number(verifyToken(header.slice(7)).sub);
  } catch {
    throw unauthorized('Session expired or invalid, please log in again');
  }

  // Load the user on every request so deactivation and role changes take effect immediately.
  const { rows } = await query<AuthUser & { isActive: boolean }>(
    `SELECT u.id, u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive", c.id AS "customerId"
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.isActive) throw unauthorized('Account not found or disabled');

  req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role, customerId: user.customerId };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Admin and staff: the internal team. */
export const requireInternal = requireRole('admin', 'staff');
export const requireAdmin = requireRole('admin');

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
