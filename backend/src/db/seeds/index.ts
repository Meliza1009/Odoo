import type pg from 'pg';
import { seedBillingDemo, seedBillingRules } from './billing.js';
import { seedCatalog } from './catalog.js';
import { seedUsers } from './users.js';

export type Seed =
  | { name: string; standalone?: false; run: (client: pg.PoolClient) => Promise<void> }
  | { name: string; standalone: true; run: () => Promise<void> };

// Order matters: users/customers -> catalog -> subscriptions -> invoices/payments.
export const seeds: Seed[] = [
  { name: 'users (admin, staff, portal customers)', run: seedUsers },
  { name: 'catalog (products, variants, plans, quotation templates)', run: seedCatalog },
  { name: 'billing rules (tax rules, discounts)', run: seedBillingRules },
  { name: 'billing demo (subscriptions, invoices, payments)', standalone: true, run: seedBillingDemo },
];
