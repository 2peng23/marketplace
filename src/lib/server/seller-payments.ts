import 'server-only';
import type { SellerSummary } from '@/lib/payments';
import type { SellerRow } from './database.types';
import { getSupabase } from './supabase';
import {
  getStripe,
  applicationOrigin,
  STRIPE_APPLICATION,
  STRIPE_CONNECT_API_VERSION,
} from './stripe';
import { RequestError } from './errors';

export function sellerSummary(seller: SellerRow): SellerSummary {
  return {
    email: seller.email,
    connected: Boolean(seller.stripe_account_id),
    country: seller.stripe_country,
    paymentStatus: seller.stripe_payment_status,
  };
}

export async function refreshSellerPayments(seller: SellerRow) {
  if (!seller.stripe_account_id) return seller;
  const account = await getStripe().v2.core.accounts.retrieve(seller.stripe_account_id, {
    include: ['configuration.merchant'],
  });
  const status = account.configuration?.merchant?.capabilities?.card_payments?.status || 'inactive';
  const { data, error } = await getSupabase()
    .from('sellers')
    .update({ stripe_payment_status: status, updated_at: new Date().toISOString() })
    .eq('id', seller.id)
    .select('*')
    .single();
  if (error) throw new RequestError('Seller payment status could not be saved.', 503);
  return data;
}

export async function sellerCountryOptions() {
  const stripe = getStripe();
  const [platform, specifications] = await Promise.all([
    stripe.accounts.retrieve(null),
    stripe.countrySpecs.list({ limit: 100 }),
  ]);
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return {
    defaultCountry: platform.country || 'EE',
    countries: specifications.data
      .map((specification) => ({
        code: specification.id,
        label: names.of(specification.id) || specification.id,
      }))
      .sort((first, second) => first.label.localeCompare(second.label)),
  };
}

export async function startSellerOnboarding(seller: SellerRow, country: string) {
  const stripe = getStripe();
  if (!seller.stripe_account_id) {
    await getSupabase()
      .from('sellers')
      .update({ stripe_country: country })
      .eq('id', seller.id)
      .is('stripe_country', null);
    const stored = await getSupabase().from('sellers').select('*').eq('id', seller.id).single();
    if (stored.error) throw new RequestError('Seller setup could not be saved.', 503);
    seller = stored.data;
    if (!seller.stripe_account_id) {
      const account = await stripe.v2.core.accounts.create(
        {
          contact_email: seller.email,
          display_name: 'Marketplace seller',
          dashboard: 'express',
          identity: { country: seller.stripe_country! },
          defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
          metadata: { application: STRIPE_APPLICATION, seller_id: seller.id },
        },
        {
          apiVersion: STRIPE_CONNECT_API_VERSION,
          idempotencyKey: `${STRIPE_APPLICATION}:managed-risk-express:${seller.id}:${seller.stripe_country}`,
        },
      );
      const saved = await getSupabase()
        .from('sellers')
        .update({
          stripe_account_id: account.id,
          stripe_payment_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', seller.id)
        .select('*')
        .single();
      if (saved.error)
        throw new RequestError(
          'Stripe created your account, but setup could not be saved. Retry to recover the same account.',
          503,
        );
      seller = saved.data;
    }
  }
  const origin = applicationOrigin();
  if (!origin.startsWith('https://'))
    throw new RequestError('Stripe onboarding needs the secure deployed Marketplace URL.', 409);
  const link = await stripe.v2.core.accountLinks.create({
    account: seller.stripe_account_id!,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        return_url: `${origin}/seller?stripe=return`,
        refresh_url: `${origin}/seller?stripe=refresh`,
        collection_options: { fields: 'eventually_due' },
      },
    },
  });
  return link.url;
}

export async function sellerDashboard(seller: SellerRow) {
  if (!seller.stripe_account_id) throw new RequestError('Connect your Stripe account first.', 409);
  const link = await getStripe().accounts.createLoginLink(seller.stripe_account_id);
  return link.url;
}

export async function sellerListings(seller: SellerRow) {
  const { data, error } = await getSupabase()
    .from('listings')
    .select('id,title,price,seller_id,sale_status')
    .eq('seller_email', seller.email)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new RequestError('Your seller listings could not be loaded.', 503);
  return (data || []).map((listing) => ({
    id: listing.id,
    title: listing.title,
    price: listing.price,
    owned: listing.seller_id === seller.id,
    sold: listing.sale_status === 'sold',
  }));
}

export async function listingCanAcceptPayments(listingId: string) {
  const { data: listing } = await getSupabase()
    .from('listings')
    .select('seller_id')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing?.seller_id) return false;
  const { data: seller } = await getSupabase()
    .from('sellers')
    .select('stripe_payment_status')
    .eq('id', listing.seller_id)
    .maybeSingle();
  return seller?.stripe_payment_status === 'active';
}
