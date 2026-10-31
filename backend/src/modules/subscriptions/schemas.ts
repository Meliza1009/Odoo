import { z } from 'zod';
import {
  dateSchema,
  idSchema,
  moneySchema,
  optionalDateSchema,
  optionalText,
  paginationSchema,
  percentSchema,
} from '../../lib/validation.js';

export const SUBSCRIPTION_STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'cancelled', 'closed'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const lineInput = z.object({
  productId: idSchema,
  variantId: idSchema.nullable().optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100000),
  unitPrice: moneySchema.nullable().optional(),
  taxRate: percentSchema.default(0),
  description: optionalText(200),
});

const baseSubscription = z.object({
  customerId: idSchema,
  planId: idSchema,
  startDate: dateSchema,
  expiryDate: optionalDateSchema,
  paymentTermsDays: z.coerce.number().int().min(0, 'Payment terms cannot be negative').max(365).default(30),
  quotationValidUntil: optionalDateSchema,
  notes: optionalText(2000),
  lines: z.array(lineInput).max(50).default([]),
});

const expiryAfterStart = <T extends { startDate: string; expiryDate: string | null }>(s: T) => !s.expiryDate || s.expiryDate >= s.startDate;
const expiryMessage = { message: 'Expiry date must be on or after the start date', path: ['expiryDate'] };

export const createSubscriptionInput = baseSubscription
  .extend({ status: z.enum(['draft', 'quotation']).default('draft') })
  .refine(expiryAfterStart, expiryMessage);

export const updateSubscriptionInput = baseSubscription.refine(expiryAfterStart, expiryMessage);

export const fromTemplateInput = z.object({
  templateId: idSchema,
  customerId: idSchema,
  startDate: dateSchema,
  notes: optionalText(2000),
});

export const statusInput = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES, { error: 'Unknown status' }),
  reason: optionalText(500),
});

export const reasonInput = z.object({ reason: optionalText(500) }).default({ reason: null });

export const renewInput = z
  .object({ periods: z.coerce.number().int().min(1, 'Renew for at least 1 period').max(120).default(1) })
  .default({ periods: 1 });

export const listSubscriptionsQuery = paginationSchema.extend({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : []))
    .pipe(z.array(z.enum(SUBSCRIPTION_STATUSES))),
  customerId: idSchema.optional(),
  planId: idSchema.optional(),
});
