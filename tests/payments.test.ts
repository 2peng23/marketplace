import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {
  priceInCents,
  platformFeeCents,
  checkoutSchema,
  sellerConnectSchema,
  stripeLinkSchema,
} from '../src/lib/payments';
import { paymentMatchesOrder, verifyStripeEvent } from '../src/lib/server/stripe-events';
import { assertBrowserOrigin } from '../src/lib/server/stripe';

test('USD conversion is exact and the 10% fee uses half-up cent rounding', () => {
  assert.equal(priceInCents('19.99'), 1999);
  assert.equal(priceInCents('0.10'), 10);
  assert.equal(priceInCents(100), 10000);
  assert.equal(platformFeeCents(10000), 1000);
  assert.equal(platformFeeCents(1999), 200);
  assert.equal(platformFeeCents(55), 6);
  for (const invalid of ['-1', '1.005', '1e3', '00.50', 'NaN'])
    assert.throws(() => priceInCents(invalid));
  assert.throws(() => platformFeeCents(1.1));
});

test('browser writes honor the public Host behind Next.js and reject other origins', () => {
  assert.doesNotThrow(() =>
    assertBrowserOrigin(
      new Request('http://localhost:3002/api/checkout', {
        headers: { host: '127.0.0.1:3002', origin: 'http://127.0.0.1:3002' },
      }),
    ),
  );
  assert.throws(() =>
    assertBrowserOrigin(
      new Request('https://marketplace.example/api/checkout', {
        headers: { host: 'marketplace.example', origin: 'https://attacker.example' },
      }),
    ),
  );
  assert.throws(() => assertBrowserOrigin(new Request('https://marketplace.example/api/checkout')));
});

test('checkout and Connect inputs reject caller-supplied financial values and accounts', () => {
  const input = {
    listingId: '00000000-0000-4000-8000-000000000001',
    requestId: '00000000-0000-4000-8000-000000000002',
  };
  assert.ok(checkoutSchema.safeParse(input).success);
  assert.equal(checkoutSchema.safeParse({ ...input, amount: 1 }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...input, destination: 'acct_other' }).success, false);
  assert.equal(
    sellerConnectSchema.safeParse({ action: 'onboard', country: 'EE', accountId: 'acct_other' })
      .success,
    false,
  );
  assert.equal(
    stripeLinkSchema.safeParse({ url: 'https://stripe.com.attacker.example/checkout' }).success,
    false,
  );
  assert.equal(stripeLinkSchema.safeParse({ url: 'javascript:alert(1)' }).success, false);
  assert.ok(
    stripeLinkSchema.safeParse({ url: 'https://connect.stripe.com/setup/example' }).success,
  );
});

test('webhook signatures require the exact body and reject replay beyond tolerance', () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_signaturefixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_signature_fixture';
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = JSON.stringify({
      id: 'evt_fixture',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    assert.equal(verifyStripeEvent(body, signature).id, 'evt_fixture');
    assert.equal(verifyStripeEvent(Buffer.from(body), signature).id, 'evt_fixture');
    assert.throws(() => verifyStripeEvent(body + ' ', signature));
    assert.throws(() => verifyStripeEvent(body, null));
    const oldSignature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    assert.throws(() => verifyStripeEvent(body, oldSignature));
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});

test('a paid session must match the stored order, amount, currency and fee', () => {
  const order: Parameters<typeof paymentMatchesOrder>[0] = {
    id: 'order-fixture',
    amount_cents: 1999,
    platform_fee_cents: 200,
    currency: 'usd',
  };
  const metadata = { application: 'marketplace-pi-sage', order_id: order.id };
  const session: Parameters<typeof paymentMatchesOrder>[1] = {
    livemode: false,
    metadata,
    client_reference_id: order.id,
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 1999,
    currency: 'usd',
  };
  const payment: Parameters<typeof paymentMatchesOrder>[2] = {
    livemode: false,
    metadata,
    status: 'succeeded',
    amount_received: 1999,
    currency: 'usd',
    application_fee_amount: 200,
    transfer_data: null,
  };
  assert.ok(paymentMatchesOrder(order, session, payment));
  assert.equal(
    paymentMatchesOrder(order, { ...session, payment_status: 'unpaid' }, payment),
    false,
  );
  assert.equal(paymentMatchesOrder(order, { ...session, amount_total: 1 }, payment), false);
  assert.equal(paymentMatchesOrder(order, session, { ...payment, currency: 'eur' }), false);
  assert.equal(
    paymentMatchesOrder(order, session, { ...payment, application_fee_amount: 1 }),
    false,
  );
  assert.equal(paymentMatchesOrder(order, session, { ...payment, status: 'processing' }), false);
  assert.equal(paymentMatchesOrder(order, { ...session, livemode: true }, payment), false);
});
