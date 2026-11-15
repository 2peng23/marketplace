import { z } from 'zod';
import { identifierSchema } from './validation';

export const PLATFORM_FEE_BASIS_POINTS = 1000;
export const PAYMENT_CURRENCY = 'usd';
export const MINIMUM_CHECKOUT_CENTS = 50;
export const MAXIMUM_CHECKOUT_CENTS = 99_999_999;

export function priceInCents(price: string | number) {
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(String(price));
  if (!match) throw new Error('Invalid USD price.');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}

export function platformFeeCents(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAXIMUM_CHECKOUT_CENTS)
    throw new Error('Invalid payment amount.');
  // Round half a cent up; all intermediate values remain safe integers.
  return Math.floor((amount * PLATFORM_FEE_BASIS_POINTS + 5000) / 10_000);
}

export const sellerEmailSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
  })
  .strict();
export const sellerConnectSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('onboard'), country: z.string().regex(/^[A-Z]{2}$/) }).strict(),
  z.object({ action: z.literal('refresh') }).strict(),
  z.object({ action: z.literal('dashboard') }).strict(),
]);
export const checkoutSchema = z
  .object({ listingId: identifierSchema, requestId: identifierSchema })
  .strict();
export const checkoutCreatedSchema = z.object({
  url: z
    .url()
    .refine(
      (value) =>
        new URL(value).protocol === 'https:' && new URL(value).hostname === 'checkout.stripe.com',
    ),
  orderId: identifierSchema,
});
export const actionDoneSchema = z.object({ saved: z.literal(true) });
const hostedStripeUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    (url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))
  );
}, 'The Stripe link could not be verified.');
export const stripeLinkSchema = z.object({ url: hostedStripeUrlSchema });
export const sellerSummarySchema = z.object({
  email: z.string(),
  connected: z.boolean(),
  country: z.string().nullable(),
  paymentStatus: z.string(),
});
export type SellerSummary = z.infer<typeof sellerSummarySchema>;

export const publicOrderSchema = z.object({
  id: identifierSchema,
  listingId: identifierSchema,
  title: z.string(),
  amountCents: z.number().int(),
  currency: z.literal('usd'),
  status: z.enum(['creating', 'pending', 'paid', 'expired', 'cancelled', 'failed']),
  paidAt: z.string().nullable(),
});
export type PublicOrder = z.infer<typeof publicOrderSchema>;
