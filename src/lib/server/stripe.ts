import 'server-only';
import Stripe from 'stripe';
import { ConfigurationError, RequestError } from './errors';
import { errorResponse } from './http';

export const STRIPE_APPLICATION = 'marketplace-pi-sage';
export const STRIPE_API_VERSION = '2026-10-28.endive';
// Stripe-managed risk with the Express Dashboard currently requires this documented preview.
export const STRIPE_CONNECT_API_VERSION = '2026-10-28.preview';

export function stripeConfigured() {
  return /^(sk|rk)_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || '');
}

export function checkoutConfigured() {
  return stripeConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'));
}

export function getStripe() {
  if (!stripeConfigured())
    throw new ConfigurationError('Stripe sandbox payments are not configured.');
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'Marketplace', version: '1.0.0' },
  });
}

export function applicationOrigin() {
  const value = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new ConfigurationError('The application URL is missing.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  )
    throw new ConfigurationError('Use a secure application URL.');
  return url.origin;
}

export function assertBrowserOrigin(request: Request) {
  const origin = request.headers.get('origin');
  let source: URL;
  try {
    source = new URL(origin || '');
  } catch {
    throw new RequestError('This request could not be accepted.', 403);
  }
  const host = request.headers.get('host') || new URL(request.url).host;
  if (
    source.origin !== origin ||
    source.host !== host ||
    !['http:', 'https:'].includes(source.protocol)
  )
    throw new RequestError('This request could not be accepted.', 403);
}

export function paymentErrorResponse(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    console.error('Stripe request failed:', error.type, error.code || 'unknown');
    return errorResponse(
      new RequestError(
        'Stripe could not complete this step. Please try again, or check your seller setup.',
        502,
      ),
    );
  }
  return errorResponse(error);
}
