import { z } from 'zod';
import { dateSchema, idSchema, moneySchema, optionalText, paginationSchema } from '../../lib/validation.js';

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'other'] as const;

export const listInvoicesQuery = paginationSchema.extend({
  status: z.enum(['draft', 'confirmed', 'paid', 'cancelled', 'overdue', 'outstanding', 'issued']).optional(),
  customerId: idSchema.optional(),
  subscriptionId: idSchema.optional(),
  planId: idSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const paymentInput = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS, { error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` }),
  amount: moneySchema.refine((v) => v > 0, 'Payment amount must be greater than 0'),
  paymentDate: dateSchema,
  referenceNumber: optionalText(100),
  note: optionalText(1000),
});

export const listPaymentsQuery = paginationSchema.extend({
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  customerId: idSchema.optional(),
  invoiceId: idSchema.optional(),
  planId: idSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const reasonInput = z.object({ reason: optionalText(500) }).default({ reason: null });
