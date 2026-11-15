'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';
import {
  actionDoneSchema,
  sellerSummarySchema,
  stripeLinkSchema,
  type SellerSummary,
} from '@/lib/payments';
import { formatPrice } from '@/lib/marketplace';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type SellerListing = { id: string; title: string; price: number; owned: boolean; sold: boolean };
export function SellerPayments({
  seller,
  listings,
  countryOptions,
  initialError,
  expiredLink,
  checkoutAvailable,
}: {
  seller: SellerSummary;
  listings: SellerListing[];
  countryOptions: { defaultCountry: string; countries: { code: string; label: string }[] };
  initialError?: string;
  expiredLink: boolean;
  checkoutAvailable: boolean;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(seller.country || countryOptions.defaultCountry);
  const [pending, setPending] = useState('');
  const [error, setError] = useState(initialError || '');
  const ready = seller.paymentStatus === 'active';

  async function runAction(action: string, operation: () => Promise<void>) {
    setPending(action);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This step could not be completed.');
    } finally {
      setPending('');
    }
  }
  async function stripeAction(action: 'onboard' | 'dashboard') {
    const result = await requestJson('/api/seller/stripe', stripeLinkSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'onboard' ? { action, country } : { action }),
    });
    window.location.assign(result.url);
  }
  return (
    <div className="seller-payments-layout">
      <section className="payment-panel" aria-labelledby="stripe-setup-title">
        <div className="seller-panel-heading">
          <h2 id="stripe-setup-title">
            {ready
              ? checkoutAvailable
                ? 'Payments ready'
                : 'Stripe connected'
              : seller.connected
                ? 'Finish seller setup'
                : 'Connect with Stripe'}
          </h2>
          <span className="sandbox-label">Sandbox</span>
        </div>
        <p className="seller-verified-email">{seller.email}</p>
        <p>
          {ready
            ? checkoutAvailable
              ? 'Your linked listings can accept card payments.'
              : 'Your Stripe account is ready. Marketplace is finishing payment setup.'
            : 'Complete Stripe’s hosted setup to accept payments for your listings.'}
        </p>
        <p className="payment-fee-note">
          Marketplace keeps a 10% platform fee. Stripe processing fees apply separately. No real
          money moves in this sandbox.
        </p>
        {expiredLink && (
          <p role="status" className="payment-notice">
            Your setup link expired. Continue below to open a new one.
          </p>
        )}
        {!seller.connected && (
          <div className="field seller-country-field">
            <Label htmlFor="seller-country">Seller country</Label>
            <select
              id="seller-country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={Boolean(pending)}
            >
              <option value="" disabled>
                Choose a country
              </option>
              {countryOptions.countries.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-help">
              Choose the country you’ll use for Stripe’s test onboarding.
            </p>
          </div>
        )}
        <div className="payment-actions">
          <Button
            disabled={Boolean(pending) || (!seller.connected && !country)}
            onClick={() => void runAction('onboard', () => stripeAction('onboard'))}
          >
            {pending === 'onboard'
              ? 'Opening Stripe…'
              : ready
                ? 'Update Stripe details'
                : seller.connected
                  ? 'Continue setup'
                  : 'Connect with Stripe'}
          </Button>
          {seller.connected && (
            <>
              <Button
                variant="outline"
                disabled={Boolean(pending)}
                onClick={() =>
                  void runAction('refresh', async () => {
                    await requestJson('/api/seller/stripe', sellerSummarySchema, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'refresh' }),
                    });
                    router.refresh();
                  })
                }
              >
                {pending === 'refresh' ? 'Checking…' : 'Check status'}
              </Button>
              <Button
                variant="link"
                disabled={Boolean(pending)}
                onClick={() => void runAction('dashboard', () => stripeAction('dashboard'))}
              >
                Open Stripe dashboard
              </Button>
            </>
          )}
        </div>
        {error && (
          <p className="payment-error" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="link"
          className="seller-signout"
          disabled={Boolean(pending)}
          onClick={() =>
            void runAction('signout', async () => {
              await requestJson('/api/seller/session', actionDoneSchema, { method: 'DELETE' });
              router.refresh();
            })
          }
        >
          Sign out of seller access
        </Button>
      </section>
      <section className="payment-panel" aria-labelledby="seller-items-title">
        <h2 id="seller-items-title">Your listings</h2>
        <p>
          Link the listings you want to sell online. Your verified email must match the listing.
        </p>
        {listings.length ? (
          <ul className="seller-listings">
            {listings.map((listing) => (
              <li key={listing.id}>
                <div>
                  <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
                  <span>{formatPrice(listing.price)}</span>
                </div>
                {listing.sold ? (
                  <span className="seller-listing-state">Sold</span>
                ) : listing.owned ? (
                  <span className="seller-listing-state">Linked</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void runAction(listing.id, async () => {
                        await requestJson('/api/seller/listings', actionDoneSchema, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ listingId: listing.id }),
                        });
                        router.refresh();
                      })
                    }
                  >
                    {pending === listing.id ? 'Linking…' : 'Link listing'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="seller-empty">Create a listing with this email to sell your first item.</p>
        )}
        <Button asChild variant="outline">
          <Link href="/create">Create listing</Link>
        </Button>
      </section>
    </div>
  );
}
