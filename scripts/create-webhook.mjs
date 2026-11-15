import Stripe from 'stripe';
import { readFile, writeFile, rename } from 'node:fs/promises';

async function configureWebhook() {
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || ''))
    throw new Error('Configure the supplied sandbox secret key first.');
  const origin = new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '');
  if (origin.protocol !== 'https:') throw new Error('Use the public HTTPS production URL.');
  const url = new URL('/api/stripe/webhook', origin).href;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  if (process.env.STRIPE_WEBHOOK_ENDPOINT_ID && process.env.STRIPE_WEBHOOK_SECRET) {
    const existing = await stripe.webhookEndpoints.retrieve(process.env.STRIPE_WEBHOOK_ENDPOINT_ID);
    if (
      existing.url !== url ||
      !existing.metadata ||
      existing.metadata.application !== 'marketplace-pi-sage'
    )
      throw new Error('The configured endpoint does not belong to this Marketplace URL.');
    console.log('The existing Marketplace Connect webhook is configured.');
  } else {
    const endpoint = await stripe.webhookEndpoints.create({
      url,
      connect: true,
      api_version: Stripe.API_VERSION,
      enabled_events: [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.expired',
        'account.updated',
      ],
      metadata: {
        application: 'marketplace-pi-sage',
        project: process.env.SUPABASE_PROJECT_REF || 'marketplace',
      },
      description: 'Marketplace sandbox direct charges and seller onboarding',
    });
    if (!endpoint.secret) throw new Error('Stripe did not return a signing secret.');
    const path = new URL('../.env.local', import.meta.url);
    const existing = await readFile(path, 'utf8');
    const retained = existing
      .split('\n')
      .filter((line) => !/^\s*(STRIPE_WEBHOOK_SECRET|STRIPE_WEBHOOK_ENDPOINT_ID)\s*=/.test(line))
      .join('\n')
      .trimEnd();
    const temporary = new URL('../.env.local.webhook-setup', import.meta.url);
    await writeFile(
      temporary,
      `${retained}\nSTRIPE_WEBHOOK_SECRET=${endpoint.secret}\nSTRIPE_WEBHOOK_ENDPOINT_ID=${endpoint.id}\n`,
      { mode: 0o600 },
    );
    await rename(temporary, path);
    console.log('Created the Marketplace Connect endpoint and saved its signing secret privately.');
  }
}

try {
  await configureWebhook();
} catch (error) {
  if (error instanceof Stripe.errors.StripeError) {
    console.error(
      error.message.includes('maximum of 16')
        ? 'The shared sandbox has reached its webhook limit. Ask its owner to free a slot; other candidates’ endpoints were left unchanged.'
        : `Stripe webhook setup failed: ${error.type} (${error.code || 'provider_error'}).`,
    );
  } else console.error(error instanceof Error ? error.message : 'Webhook setup failed.');
  process.exitCode = 1;
}
