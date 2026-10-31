import { z } from 'zod';

export const PASSWORD_RULES_MESSAGE =
  'Password must be at least 9 characters and include an uppercase letter, a lowercase letter and a special character';

export const passwordSchema = z
  .string()
  .min(9, PASSWORD_RULES_MESSAGE)
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, PASSWORD_RULES_MESSAGE)
  .regex(/[a-z]/, PASSWORD_RULES_MESSAGE)
  .regex(/[^A-Za-z0-9]/, PASSWORD_RULES_MESSAGE);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const nameSchema = z.string().trim().min(1, 'Required').max(120);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

export function paginate({ page, pageSize }: { page: number; pageSize: number }) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function paged<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
