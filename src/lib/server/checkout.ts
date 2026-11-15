import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type Stripe from 'stripe';
import { platformFeeCents, PAYMENT_CURRENCY, type PublicOrder } from '@/lib/payments';
import type { OrderRow } from './database.types';
import { getSupabase } from './supabase';
import { RequestError } from './errors';
import { getStripe, applicationOrigin, STRIPE_APPLICATION, checkoutConfigured } from './stripe';
import { refreshSellerPayments } from './seller-payments';

const buyerCookie = 'marketplace.buyer';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function publicOrder(order: OrderRow): PublicOrder {
  return {
    id: order.id,
    listingId: order.listing_id,
    title: order.title,
    amountCents: order.amount_cents,
    currency: order.currency,
    status: order.status,
    paidAt: order.paid_at,
  };
}

export async function findBuyerOrder(identifier: string) {
  const token = (await cookies()).get(buyerCookie)?.value;
  if (!token) throw new RequestError('This order is not available in this browser.', 404);
  const { data, error } = await getSupabase()
    .from('orders')
    .select('*')
    .eq('id', identifier)
    .eq('buyer_token_hash', hashToken(token))
    .maybeSingle();
  if (error) throw new RequestError('Your order could not be loaded. Please try again.', 503);
  if (!data) throw new RequestError('This order is not available in this browser.', 404);
  return data;
}

export async function buyerCheckoutForListing(listingId: string) {
  const token = (await cookies()).get(buyerCookie)?.value;
  if (!token) return null;
  const { data } = await getSupabase()
    .from('orders')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_token_hash', hashToken(token))
    .in('status', ['creating', 'pending'])
    .maybeSingle();
  return data?.id || null;
}

async function releaseOrder(order: OrderRow, status: 'expired' | 'cancelled' | 'failed') {
  const { error } = await getSupabase().rpc('release_order', {
    order_identifier: order.id,
    terminal_status: status,
  });
  if (error)
    throw new RequestError('The checkout reservation could not be updated. Please try again.', 503);
}

async function saveCheckoutSession(order: OrderRow, session: Stripe.Checkout.Session) {
  const { error } = await getSupabase()
    .from('orders')
    .update({
      stripe_session_id: session.id,
      status: 'pending',
      expires_at: new Date(session.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .in('status', ['creating', 'pending']);
  if (error)
    throw new RequestError(
      'Checkout was created but could not be saved. Retry to recover the same checkout.',
      503,
    );
}

async function retrieveOrderSession(order: OrderRow) {
  if (!order.stripe_session_id) return null;
  return getStripe().checkout.sessions.retrieve(
    order.stripe_session_id,
    {},
    { stripeAccount: order.stripe_account_id },
  );
}

async function recoverExpiredCreation(order: OrderRow) {
  // An interrupted create might have succeeded at Stripe. Search this app's own
  // connected account before releasing inventory; never guess from a local timeout.
  const sessions = getStripe().checkout.sessions.list(
    { created: { gte: Math.floor(new Date(order.created_at).valueOf() / 1000) - 5 }, limit: 100 },
    { stripeAccount: order.stripe_account_id },
  );
  let inspected = 0;
  for await (const session of sessions) {
    if (
      session.metadata?.application === STRIPE_APPLICATION &&
      session.metadata.order_id === order.id
    ) {
      await saveCheckoutSession(order, session);
      return session;
    }
    if (++inspected >= 1000)
      throw new RequestError('Checkout recovery is still pending. Please try again later.', 503);
  }
  if (Date.now() < new Date(order.expires_at).valueOf() + 120_000)
    throw new RequestError('Checkout recovery is still pending. Please try again shortly.', 409);
  await releaseOrder(order, 'expired');
  return null;
}

export async function reconcileListingReservation(listingId: string) {
  const { data: listing, error } = await getSupabase()
    .from('listings')
    .select('reserved_order_id')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw new RequestError('This item could not be checked.', 503);
  if (!listing?.reserved_order_id) return;
  const { data: order } = await getSupabase()
    .from('orders')
    .select('*')
    .eq('id', listing.reserved_order_id)
    .single();
  if (!order || !['creating', 'pending'].includes(order.status)) return;
  const session = order.stripe_session_id
    ? await retrieveOrderSession(order)
    : Date.now() >= new Date(order.expires_at).valueOf()
      ? await recoverExpiredCreation(order)
      : null;
  if (session?.status === 'expired') await releaseOrder(order, 'expired');
}

async function createOrderSession(order: OrderRow) {
  if (
    order.currency !== PAYMENT_CURRENCY ||
    order.platform_fee_cents !== platformFeeCents(order.amount_cents)
  )
    throw new RequestError(
      'This order’s payment configuration needs to be checked. Please try again later.',
      503,
    );
  const stripe = getStripe();
  if (order.stripe_session_id) return retrieveOrderSession(order);
  const expiry = Math.floor(new Date(order.expires_at).valueOf() / 1000);
  if (expiry - Math.floor(Date.now() / 1000) < 30 * 60) {
    // Preserve the original idempotent payload while recovering a slow first attempt.
    const recovered = await recoverExpiredCreation(order);
    if (recovered) return recovered;
    throw new RequestError('This checkout expired. Start a new purchase.', 409);
  }
  const origin = applicationOrigin();
  const metadata = {
    application: STRIPE_APPLICATION,
    order_id: order.id,
    listing_id: order.listing_id,
  };
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        allowed_payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: order.currency,
              unit_amount: order.amount_cents,
              product_data: { name: order.title },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: { application_fee_amount: order.platform_fee_cents, metadata },
        client_reference_id: order.id,
        metadata,
        success_url: `${origin}/checkout/${order.id}`,
        cancel_url: `${origin}/checkout/${order.id}?cancelled=1`,
        expires_at: expiry,
      },
      {
        stripeAccount: order.stripe_account_id,
        idempotencyKey: `${STRIPE_APPLICATION}:checkout:${order.id}`,
      },
    );
    await saveCheckoutSession(order, session);
    return session;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      error.type === 'StripeInvalidRequestError' &&
      !('code' in error && error.code === 'idempotency_key_in_use')
    )
      await releaseOrder(order, 'failed');
    throw error;
  }
}

export async function startCheckout(listingId: string, requestId: string) {
  if (!checkoutConfigured())
    throw new RequestError('Online payments are being connected. Please try again shortly.', 503);
  const database = getSupabase();
  await reconcileListingReservation(listingId);
  const { data: listing } = await database
    .from('listings')
    .select('seller_id')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing?.seller_id)
    throw new RequestError('This seller has not enabled online payments.', 409);
  const { data: seller } = await database
    .from('sellers')
    .select('*')
    .eq('id', listing.seller_id)
    .single();
  if (!seller || (await refreshSellerPayments(seller)).stripe_payment_status !== 'active')
    throw new RequestError(
      'This seller is not ready to accept payments. You can still send a message.',
      409,
    );
  const cookieStore = await cookies();
  const token = cookieStore.get(buyerCookie)?.value || randomBytes(32).toString('base64url');
  const reserved = await database.rpc('reserve_order', {
    listing_identifier: listingId,
    order_identifier: requestId,
    buyer_hash: hashToken(token),
  });
  if (reserved.error) {
    const status =
      reserved.error.code === '42501' ? 403 : reserved.error.code === 'P0002' ? 404 : 409;
    throw new RequestError(
      status === 404
        ? 'This listing could not be found.'
        : 'This item is sold, reserved, or unavailable for checkout.',
      status,
    );
  }
  const order = reserved.data;
  cookieStore.set(buyerCookie, token, {
    httpOnly: true,
    secure: applicationOrigin().startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
  if (order.status === 'paid') throw new RequestError('This item has already been sold.', 409);
  if (!['creating', 'pending'].includes(order.status))
    throw new RequestError('This checkout ended. Start a new purchase.', 409);
  const session = await createOrderSession(order);
  if (!session || session.status !== 'open' || !session.url) {
    if (session?.status === 'expired') await releaseOrder(order, 'expired');
    throw new RequestError(
      'This checkout has ended or its payment is being confirmed. Check your order.',
      409,
    );
  }
  return { url: session.url, orderId: order.id };
}

export async function cancelBuyerOrder(identifier: string) {
  let order = await findBuyerOrder(identifier);
  if (!['creating', 'pending'].includes(order.status)) return publicOrder(order);
  const session = await createOrderSession(order);
  if (!session) return publicOrder(await findBuyerOrder(identifier));
  if (session.status === 'complete') return publicOrder(order);
  if (session.status === 'open') {
    try {
      await getStripe().checkout.sessions.expire(
        session.id,
        {},
        { stripeAccount: order.stripe_account_id },
      );
    } catch (error) {
      const current = await retrieveOrderSession({ ...order, stripe_session_id: session.id });
      if (current?.status === 'complete') return publicOrder(await findBuyerOrder(identifier));
      if (current?.status !== 'expired') throw error;
    }
  }
  await releaseOrder(order, 'cancelled');
  order = await findBuyerOrder(identifier);
  return publicOrder(order);
}

export async function resumeBuyerOrder(identifier: string) {
  const order = await findBuyerOrder(identifier);
  if (!['creating', 'pending'].includes(order.status))
    throw new RequestError('This checkout has already ended.', 409);
  const session = await createOrderSession(order);
  if (session?.status !== 'open' || !session.url)
    throw new RequestError('This checkout is no longer open.', 409);
  return { url: session.url };
}

export async function buyerCheckoutIsOpen(order: OrderRow) {
  if (order.status === 'creating') return true;
  if (order.status !== 'pending') return false;
  return (await retrieveOrderSession(order))?.status === 'open';
}
