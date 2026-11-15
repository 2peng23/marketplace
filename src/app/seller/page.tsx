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
  const setupStep = !seller
    ? 0
    : seller.stripe_payment_status !== 'active'
      ? 1
      : listings.some((listing) => listing.owned)
        ? 3
        : 2;
  return (
    <main id="main-content" className="page-container payment-page">
      <Link className="payment-back-link" href="/my-listings">
        Back to My listings
      </Link>
      <header className="payment-page-heading">
        <div>
          <h1>Seller payments</h1>
          <p>Set up card payments and manage the listings you sell online.</p>
        </div>
        <span className="sandbox-label">Sandbox</span>
      </header>
      {stripeConfigured() && (
        <ol className="seller-setup-progress" aria-label="Seller payment setup">
          {['Verify email', 'Connect Stripe', 'Link listings'].map((step, index) => (
            <li
              key={step}
              className={
                index < setupStep ? 'is-complete' : index === setupStep ? 'is-current' : ''
              }
              aria-current={index === setupStep ? 'step' : undefined}
            >
              <span className="setup-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>{step}</span>
              <span className="sr-only">
                {index < setupStep
                  ? 'Completed'
                  : index === setupStep
                    ? 'Current step'
                    : 'Not started'}
              </span>
            </li>
          ))}
        </ol>
      )}
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
