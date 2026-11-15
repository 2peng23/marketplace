import { z } from 'zod';
import { categories, MAX_SAVED_LISTINGS } from './marketplace';

export const identifierSchema = z.uuid();
export const categorySchema = z.enum(
  categories.map((category) => category.slug),
  {
    error: 'Choose a category.',
  },
);
export const priceSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
    'Enter a price of zero or more, with up to two decimal places.',
  )
  .transform(Number);
const emailAddressSchema = z
  .string()
  .trim()
  .pipe(z.email('Enter a valid email address.').max(254, 'Use 254 characters or fewer.'))
  .transform((value) => value.toLowerCase());

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
  sellerEmail: emailAddressSchema,
});
export const messageSchema = z
  .object({
    requestId: identifierSchema,
    listingId: identifierSchema,
    buyerEmail: emailAddressSchema,
    message: z
      .string()
      .trim()
      .min(1, 'Write a message.')
      .max(2000, 'Use 2,000 characters or fewer.'),
  })
  .strict();
export function validationFields(error: z.ZodError) {
  return Object.fromEntries(
    error.issues
      .filter((issue) => typeof issue.path[0] === 'string')
      .map((issue) => [String(issue.path[0]), issue.message]),
  );
}

export const feedParametersSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  category: z.union([categorySchema, z.literal('')]).default(''),
  q: z.string().trim().max(100).default(''),
});

export type ListingInput = z.output<typeof listingSchema>;
export type MessageInput = z.output<typeof messageSchema>;
export const browserListingsSchema = z
  .object({ identifiers: z.array(identifierSchema).max(MAX_SAVED_LISTINGS) })
  .strict();
export const listingCreatedSchema = z.object({ id: identifierSchema });
export const messageSentSchema = z.object({
  saved: z.literal(true),
  emailSent: z.boolean(),
  emailError: z.string().optional(),
});
export const listingFeedSchema = z.object({
  items: z.array(
    z.object({
      id: identifierSchema,
      title: z.string(),
      description: z.string(),
      price: z.number().nonnegative(),
      category: categorySchema,
      seller_email: z.string(),
      image_path: z.string(),
      created_at: z.string(),
      sale_status: z.enum(['available', 'reserved', 'sold']).default('available'),
      imageUrl: z.url(),
    }),
  ),
  count: z.number().int().nonnegative(),
  nextPage: z.number().int().positive().nullable(),
});
