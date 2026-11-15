import Link from 'next/link';
import { currentSeller } from '@/lib/server/seller-session';
import {
  refreshSellerPayments,
  sellerSummary,
  sellerCountryOptions,
  sellerListings,
} from '@/lib/server/seller-payments';
import { SellerAccess } from '@/components/seller-access';
import { SellerPayments } from '@/components/seller-payments';
import { checkoutConfigured, stripeConfigured } from '@/lib/server/stripe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seller payments' };
export default async function SellerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  let seller = await currentSeller();
  let initialError = '';
  let countries: { defaultCountry: string; countries: { code: string; label: string }[] } = {
    defaultCountry: '',
    countries: [],
  };
  if (seller && stripeConfigured()) {
    try {
      [seller, countries] = await Promise.all([
        refreshSellerPayments(seller),
        sellerCountryOptions(),
      ]);
    } catch {
      initialError = 'Stripe status could not be refreshed. Try checking again shortly.';
    }
  }
  const listings = seller ? await sellerListings(seller) : [];
  return (
    <main id="main-content" className="page-container payment-page">
      <Link className="payment-back-link" href="/my-listings">
        Back to My listings
      </Link>
      <header className="payment-page-heading">
        <h1>Seller payments</h1>
        <p>Connect Stripe to sell items directly from Marketplace.</p>
      </header>
      {!stripeConfigured() ? (
        <section className="payment-panel">
          <h2>Payments are being connected</h2>
          <p>You can continue browsing, listing items, and messaging sellers.</p>
        </section>
      ) : seller ? (
        <SellerPayments
          seller={sellerSummary(seller)}
          listings={listings}
          countryOptions={countries}
          checkoutAvailable={checkoutConfigured()}
          initialError={initialError}
          expiredLink={parameters.stripe === 'refresh'}
        />
      ) : (
        <SellerAccess />
      )}
    </main>
  );
}
