import { pool, query, type DbClient } from '../db/pool.js';
import { notFound } from './errors.js';
import type { AuthUser } from '../middleware/auth.js';

/** Adds bound parameters and returns a predicate for a trusted SQL customer-id column. */
export function customerScope(user: AuthUser, customerIdColumn: string, params: unknown[]): string {
  if (user.role === 'admin') return 'TRUE';
  params.push(user.role === 'staff' ? user.id : (user.customerId ?? -1));
  const placeholder = `$${params.length}`;
  return user.role === 'staff'
    ? `EXISTS (SELECT 1 FROM customers access_customer WHERE access_customer.id = ${customerIdColumn} AND access_customer.assigned_staff_id = ${placeholder})`
    : `${customerIdColumn} = ${placeholder}`;
}

export async function assertCustomerAccess(customerId: number, user: AuthUser, client: DbClient = pool) {
  const params: unknown[] = [customerId];
  const scope = customerScope(user, 'c.id', params);
  const { rows } = await query(`SELECT c.id FROM customers c WHERE c.id = $1 AND ${scope}`, params, client);
  if (!rows[0]) throw notFound('Customer not found');
}
