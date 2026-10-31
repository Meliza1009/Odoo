import type pg from 'pg';
import { seedCatalog } from './catalog.js';

export interface Seed {
  name: string;
  run: (client: pg.PoolClient) => Promise<void>;
}

// Order matters: users/customers -> catalog -> subscriptions -> invoices/payments.
export const seeds: Seed[] = [{ name: 'catalog (products, variants, plans, quotation templates)', run: seedCatalog }];
