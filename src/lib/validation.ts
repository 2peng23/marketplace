import { z } from 'zod';
import { categories } from './marketplace';

export const identifierSchema = z.uuid();
export const categorySchema = z.enum(categories.map((category) => category.slug));
export const priceSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
    'Enter a price of zero or more, with up to two decimal places.',
  )
  .transform(Number);
export const listingSchema = z.object({
  requestId: identifierSchema,
  title: z.string().trim().min(1, 'Add a title.').max(120, 'Use 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .min(1, 'Describe your item.')
    .max(3000, 'Use 3,000 characters or fewer.'),
  price: priceSchema,
  category: categorySchema,
  sellerEmail: z
    .email('Enter a valid email address.')
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
});
export const messageSchema = z
  .object({
    requestId: identifierSchema,
    listingId: identifierSchema,
    buyerEmail: z
      .email('Enter a valid email address.')
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    message: z
      .string()
      .trim()
      .min(1, 'Write a message.')
      .max(2000, 'Use 2,000 characters or fewer.'),
  })
  .strict();
export function validationFields(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}
