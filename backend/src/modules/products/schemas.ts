import { z } from 'zod';
import { booleanQuery, moneySchema, nameSchema, optionalText, paginationSchema } from '../../lib/validation.js';

export const PRODUCT_TYPES = ['software', 'service', 'addon', 'goods'] as const;

export const variantInput = z.object({
  attribute: z.string().trim().min(1, 'Attribute is required').max(60),
  value: z.string().trim().min(1, 'Value is required').max(80),
  extraPrice: moneySchema.default(0),
  isActive: z.boolean().default(true),
});

export const productInput = z.object({
  name: nameSchema,
  type: z.enum(PRODUCT_TYPES, { error: `Type must be one of: ${PRODUCT_TYPES.join(', ')}` }),
  salesPrice: moneySchema,
  costPrice: moneySchema.default(0),
  notes: optionalText(2000),
  isActive: z.boolean().default(true),
});

export const createProductInput = productInput.extend({
  variants: z.array(variantInput).max(50).default([]),
});

export const listProductsQuery = paginationSchema.extend({
  type: z.enum(PRODUCT_TYPES).optional(),
  includeInactive: booleanQuery,
});
