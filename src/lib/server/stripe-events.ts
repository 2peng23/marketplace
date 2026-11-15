import 'server-only';
import type Stripe from 'stripe';
import type { OrderRow } from './database.types';
import { getStripe, STRIPE_APPLICATION } from './stripe';
import { getSupabase } from './supabase';
import { refreshSellerPayments } from './seller-payments';
import { ConfigurationError, RequestError } from './errors';

export function paymentMatchesOrder(
  order: Pick<OrderRow, 'id' | 'amount_cents' | 'platform_fee_cents' | 'currency'>,
  session: Pick<
    Stripe.Checkout.Session,
    | 'livemode'
    | 'metadata'
    | 'client_reference_id'
    | 'mode'
    | 'payment_status'
    | 'amount_total'
    | 'currency'
  >,
  payment: Pick<
    Stripe.PaymentIntent,
    | 'livemode'
    | 'metadata'
    | 'status'
    | 'amount_received'
    | 'currency'
    | 'application_fee_amount'
    | 'transfer_data'
  >,
) {
  return (
    session.livemode === false &&
    payment.livemode === false &&
    session.metadata?.application === STRIPE_APPLICATION &&
    session.metadata.order_id === order.id &&
    session.client_reference_id === order.id &&
    session.mode === 'payment' &&
    session.payment_status === 'paid' &&
    session.amount_total === order.amount_cents &&
    session.currency === order.currency &&
    payment.status === 'succeeded' &&
    payment.amount_received === order.amount_cents &&
    payment.currency === order.currency &&
    payment.application_fee_amount === order.platform_fee_cents &&
    !payment.transfer_data &&
    payment.metadata.application === STRIPE_APPLICATION &&
    payment.metadata.order_id === order.id
  );
}

export function verifyStripeEvent(rawBody: string | Buffer, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_'))
    throw new ConfigurationError('The Stripe webhook is not configured.');
  if (!signature) throw new RequestError('Missing webhook signature.', 400);
  try {
    return getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new RequestError('Invalid webhook signature.', 400);
  }
}

export async function handleStripeEvent(event: Stripe.Event) {
  if (event.livemode) throw new RequestError('Only sandbox events are accepted.', 400);
  const database = getSupabase();
  if (event.type === 'account.updated') {
    const account = event.data.object;
    const { data: seller, error } = await database
      .from('sellers')
      .select('*')
      .eq('stripe_account_id', account.id)
      .maybeSingle();
    if (error) throw new Error('Could not look up the webhook seller.');
    if (!seller) return; // Shared sandbox: another candidate owns this account.
    await refreshSellerPayments(seller);
    return;
  }
  if (
    ![
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.expired',
    ].includes(event.type)
  )
    return;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.application !== STRIPE_APPLICATION || !session.metadata.order_id) return;
  const { data: order, error } = await database
    .from('orders')
    .select('*')
    .eq('id', session.metadata.order_id)
    .maybeSingle();
  if (error) {
    if (error.code === '22P02') return;
    throw new Error('Could not look up the webhook order.');
  }
  if (!order || event.account !== order.stripe_account_id) return;
  if (order.stripe_session_id && order.stripe_session_id !== session.id)
    throw new RequestError('Checkout does not match this order.', 400);
  if (event.type === 'checkout.session.expired') {
    if (session.status !== 'expired' || !order.stripe_session_id) return;
    const released = await database.rpc('release_order', {
      order_identifier: order.id,
      terminal_status: 'expired',
      event_identifier: event.id,
      event_name: event.type,
    });
    if (released.error) throw new Error('Could not release the expired checkout.');
    return;
  }
  if (session.payment_status !== 'paid') return;
  const paymentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentId) throw new RequestError('A paid Checkout Session has no payment.', 400);
  const payment = await getStripe().paymentIntents.retrieve(
    paymentId,
    {},
    { stripeAccount: order.stripe_account_id },
  );
  if (!paymentMatchesOrder(order, session, payment))
    throw new RequestError('Payment details do not match this order.', 400);
  if (!order.stripe_session_id) {
    const attached = await database
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id)
      .is('stripe_session_id', null);
    if (attached.error) throw new Error('Could not recover the paid checkout.');
  }
  const confirmed = await database.rpc('confirm_order', {
    order_identifier: order.id,
    session_identifier: session.id,
    payment_identifier: paymentId,
    event_identifier: event.id,
    event_name: event.type,
  });
  if (confirmed.error) throw new Error('Could not commit the paid order.');
}
